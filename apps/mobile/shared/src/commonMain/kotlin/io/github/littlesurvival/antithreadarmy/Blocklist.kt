package io.github.littlesurvival.antithreadarmy

import androidx.compose.runtime.*
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

internal data class BlockedAccount(val id: String, val name: String, val addedAt: Long) {
    val key: String
        get() = id.lowercase()
}

internal data class RemovedAccount(val account: BlockedAccount, val index: Int)

internal data class ImportSummary(val added: Int, val duplicates: Int)

internal enum class BlocklistSort(val label: String) {
    CUSTOM("自訂順序"),
    NEWEST("最新加入"),
    OLDEST("最早加入"),
    ID_ASC("ID A–Z"),
    ID_DESC("ID Z–A"),
}

internal interface BlocklistPlatform {
    suspend fun read(): String?

    suspend fun write(json: String)

    suspend fun importJson(): String?

    suspend fun exportJson(json: String): Boolean

    fun now(): Long
}

@Composable internal expect fun rememberBlocklistPlatform(): BlocklistPlatform

internal object BlocklistJson {
    const val MAX_CHARS = 2_000_000
    private val format = Json { prettyPrint = true }

    fun decode(text: String, now: Long, local: Boolean = false): List<BlockedAccount> {
        require(text.length <= MAX_CHARS) { "JSON 檔案太大。" }
        val array =
            try {
                Json.parseToJsonElement(text.removePrefix("\uFEFF")) as? JsonArray
            } catch (_: Exception) {
                null
            }
        require(array != null) { "請選擇包含帳號陣列的 JSON 檔案。" }
        return array.mapIndexed { index, item ->
            val row = item as? JsonObject
            val idValue = row?.get("id") as? JsonPrimitive
            val nameValue = row?.get("name")
            val id = idValue?.takeIf { it.isString }?.content?.trim()?.removePrefix("@")
            require(id != null && Regex("^[A-Za-z0-9._]{1,30}$").matches(id)) {
                "第 ${index + 1} 筆 ID 無效，未匯入任何資料。"
            }
            require(nameValue == null || nameValue is JsonPrimitive && nameValue.isString) {
                "第 ${index + 1} 筆 name 必須是文字。"
            }
            val timestamp = if (local) (row["addedAt"] as? JsonPrimitive)?.longOrNull else now
            require(timestamp != null && timestamp >= 0) { "本地名單資料無效。" }
            BlockedAccount(id, nameValue?.jsonPrimitive?.content?.trim().orEmpty(), timestamp)
        }
    }

    fun encode(entries: List<BlockedAccount>, local: Boolean = false): String =
        format.encodeToString(
            JsonArray.serializer(),
            JsonArray(
                entries.map { entry ->
                    buildJsonObject {
                        put("id", entry.id)
                        put("name", entry.name)
                        if (local) put("addedAt", entry.addedAt)
                    }
                }
            ),
        )
}

internal fun visibleAccounts(
    entries: List<BlockedAccount>,
    query: String,
    sort: BlocklistSort,
): List<BlockedAccount> {
    val term = query.trim().removePrefix("@")
    val filtered = entries.filter {
        it.id.contains(term, ignoreCase = true) || it.name.contains(term, ignoreCase = true)
    }
    return when (sort) {
        BlocklistSort.CUSTOM -> filtered
        BlocklistSort.NEWEST -> filtered.sortedByDescending { it.addedAt }
        BlocklistSort.OLDEST -> filtered.sortedBy { it.addedAt }
        BlocklistSort.ID_ASC -> filtered.sortedBy { it.key }
        BlocklistSort.ID_DESC -> filtered.sortedByDescending { it.key }
    }
}

internal class BlocklistStore(private val platform: BlocklistPlatform) {
    var entries by mutableStateOf<List<BlockedAccount>>(emptyList())
        private set

    var ready by mutableStateOf(false)
        private set

    private val mutex = Mutex()

    suspend fun load() = mutex.withLock {
        val text = platform.read()
        entries =
            if (text == null) emptyList()
            else BlocklistJson.decode(text, 0, local = true).distinctBy { it.key }
        ready = true
    }

    fun contains(id: String): Boolean = entries.any {
        it.key == id.trim().removePrefix("@").lowercase()
    }

    private suspend fun commit(updated: List<BlockedAccount>) {
        check(ready) { "名單尚未載入，請先重試。" }
        // Publish state only after the atomic disk write. Finish both even if the UI is disposed.
        withContext(NonCancellable) {
            val json = BlocklistJson.encode(updated, local = true)
            require(json.length <= BlocklistJson.MAX_CHARS) { "名單容量已達上限，請先移除部分帳號。" }
            platform.write(json)
            entries = updated
        }
    }

    suspend fun add(id: String, name: String): Boolean = mutex.withLock {
        check(ready)
        val normalized = id.trim().removePrefix("@")
        require(Regex("^[A-Za-z0-9._]{1,30}$").matches(normalized)) { "帳號 ID 無效。" }
        val candidate = BlockedAccount(normalized, name.trim(), platform.now())
        if (contains(candidate.id)) return@withLock false
        commit(listOf(candidate) + entries)
        true
    }

    suspend fun remove(key: String): RemovedAccount? = mutex.withLock {
        val index = entries.indexOfFirst { it.key == key }
        if (index < 0) return@withLock null
        val removed = RemovedAccount(entries[index], index)
        commit(entries.filterIndexed { i, _ -> i != index })
        removed
    }

    suspend fun restore(removed: RemovedAccount) = mutex.withLock {
        if (!contains(removed.account.id))
            commit(
                entries.toMutableList().apply {
                    add(removed.index.coerceIn(0, size), removed.account)
                }
            )
    }

    suspend fun reorder(keys: List<String>) = mutex.withLock {
        require(keys.size == entries.size && keys.toSet() == entries.map { it.key }.toSet()) {
            "名單已變更，請重新排列。"
        }
        val byKey = entries.associateBy { it.key }
        commit(keys.map { byKey.getValue(it) })
    }

    suspend fun merge(json: String): ImportSummary = mutex.withLock {
        check(ready)
        val imported = BlocklistJson.decode(json, platform.now())
        val known = entries.map { it.key }.toMutableSet()
        val additions = imported.filter { known.add(it.key) }
        if (additions.isNotEmpty()) commit(entries + additions)
        ImportSummary(additions.size, imported.size - additions.size)
    }

    fun export(): String {
        check(ready)
        return BlocklistJson.encode(entries)
    }
}
