package io.github.littlesurvival.antithreadarmy

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import java.io.File
import java.io.InputStream
import kotlin.coroutines.resume
import kotlinx.coroutines.*

@Composable
internal actual fun rememberBlocklistPlatform(): BlocklistPlatform {
    val context = LocalContext.current.applicationContext
    val platform = remember(context) { AndroidBlocklistPlatform(context) }
    val open =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
            platform.complete(it)
        }
    val save =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("application/json")
        ) {
            platform.complete(it)
        }
    SideEffect {
        platform.open = { open.launch(arrayOf("application/json", "text/json", "text/plain")) }
        platform.save = { save.launch("anti-threadarmy-blocklist.json") }
    }
    DisposableEffect(platform) { onDispose { platform.cancel() } }
    return platform
}

private class AndroidBlocklistPlatform(private val context: Context) : BlocklistPlatform {
    var open: () -> Unit = {}
    var save: () -> Unit = {}
    private var pending: CancellableContinuation<Uri?>? = null
    private val file = File(context.filesDir, "blocklist.json")

    fun complete(uri: Uri?) {
        pending?.takeIf { it.isActive }?.resume(uri)
        pending = null
    }

    fun cancel() {
        pending?.cancel()
        pending = null
    }

    private suspend fun pick(export: Boolean): Uri? = suspendCancellableCoroutine { continuation ->
        check(pending == null) { "檔案選擇器已開啟。" }
        pending = continuation
        continuation.invokeOnCancellation { if (pending === continuation) pending = null }
        try {
            if (export) save() else open()
        } catch (error: Exception) {
            pending = null
            continuation.resumeWith(Result.failure(error))
        }
    }

    override suspend fun read(): String? =
        withContext(Dispatchers.IO) {
            if (!file.exists() && !File(file.path + ".bak").exists()) null
            else AtomicFile(file).openRead().use { it.readBounded() }
        }

    override suspend fun write(json: String) =
        withContext(Dispatchers.IO) {
            val atomic = AtomicFile(file)
            val stream = atomic.startWrite()
            try {
                stream.write(json.toByteArray(Charsets.UTF_8))
                atomic.finishWrite(stream)
            } catch (error: Exception) {
                atomic.failWrite(stream)
                throw error
            }
        }

    override suspend fun importJson(): String? {
        val uri = pick(export = false) ?: return null
        return withContext(Dispatchers.IO) {
            val stream = context.contentResolver.openInputStream(uri) ?: error("無法讀取選取的檔案。")
            stream.use { it.readBounded() }
        }
    }

    override suspend fun exportJson(json: String): Boolean {
        val uri = pick(export = true) ?: return false
        withContext(Dispatchers.IO) {
            val stream = context.contentResolver.openOutputStream(uri, "wt") ?: error("無法寫入選取的位置。")
            stream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
        }
        return true
    }

    override fun now(): Long = System.currentTimeMillis()
}

private fun InputStream.readBounded(): String =
    bufferedReader(Charsets.UTF_8).use { reader ->
        val output = StringBuilder()
        val buffer = CharArray(8192)
        while (true) {
            val count = reader.read(buffer)
            if (count < 0) break
            require(output.length + count <= BlocklistJson.MAX_CHARS) { "JSON 檔案太大。" }
            output.append(buffer, 0, count)
        }
        output.toString()
    }
