package io.github.littlesurvival.antithreadarmy

import kotlin.test.*
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*

class BlocklistTest {
    private class Disk : BlocklistPlatform {
        var contents: String? = null
        var fail = false
        var time = 100L
        var writes = 0

        override suspend fun read() = contents

        override suspend fun write(json: String) {
            delay(1)
            if (fail) error("disk unavailable")
            contents = json
            writes++
        }

        override suspend fun importJson(): String? = null

        override suspend fun exportJson(json: String) = true

        override fun now() = time++
    }

    @Test
    fun addNormalizesAndDeduplicatesWithoutChangingExistingName() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        assertTrue(store.add(" @Example_User ", " Example "))
        assertFalse(store.add("example_user", "Replacement"))
        assertTrue(store.contains("@EXAMPLE_USER"))
        assertEquals("Example", store.entries.single().name)
        assertEquals(1, disk.writes)
    }

    @Test
    fun sharedJsonContainsOnlyIdAndName() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        store.add("example_user", "範例 \"名稱\"")
        val row = Json.parseToJsonElement(store.export()).jsonArray.single().jsonObject
        assertEquals(setOf("id", "name"), row.keys)
        assertEquals("範例 \"名稱\"", row.getValue("name").jsonPrimitive.content)
        assertTrue(disk.contents!!.contains("addedAt"))
    }

    @Test
    fun importMergesInFileOrderAndCountsAllDuplicates() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        store.add("existing", "Keep")
        val result =
            store.merge(
                """[{"id":"@EXISTING","name":"Replace"},{"id":"new_b"},{"id":"new_a","name":"A"},{"id":"NEW_B"}]"""
            )
        assertEquals(ImportSummary(2, 2), result)
        assertEquals(listOf("existing", "new_b", "new_a"), store.entries.map { it.id })
        assertEquals(listOf("Keep", "", "A"), store.entries.map { it.name })
        assertEquals(store.entries[1].addedAt, store.entries[2].addedAt)
    }

    @Test
    fun invalidImportIsAllOrNothing() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        store.add("existing", "Keep")
        val before = disk.contents
        for (input in
            listOf(
                "broken",
                "{}",
                "[null]",
                """[{"id":"valid"},{"id":"bad/id"}]""",
                """[{"id":"valid","name":null}]""",
                """[{"id":123}]""",
            )) {
            assertFailsWith<IllegalArgumentException> { store.merge(input) }
            assertEquals(before, disk.contents)
            assertEquals(listOf("existing"), store.entries.map { it.id })
        }
    }

    @Test
    fun emptyArrayAndBomAreSupported() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        assertEquals(ImportSummary(0, 0), store.merge("\uFEFF[]"))
        assertEquals(0, disk.writes)
    }

    @Test
    fun removeAndUndoRestoreOriginalPositionAndTimestamp() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        store.merge("""[{"id":"first"},{"id":"middle"},{"id":"last"}]""")
        val original = store.entries
        val removed = store.remove("middle")!!
        assertEquals(listOf("first", "last"), store.entries.map { it.id })
        store.restore(removed)
        assertEquals(original, store.entries)
        store.restore(removed)
        assertEquals(original, store.entries)
    }

    @Test
    fun customOrderAndTimesSurviveRestart() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        store.add("first", "First")
        store.add("second", "Second")
        store.add("third", "Third")
        store.reorder(listOf("second", "first", "third"))
        val reopened = BlocklistStore(disk)
        reopened.load()
        assertEquals(store.entries, reopened.entries)
        assertEquals(listOf("second", "first", "third"), reopened.entries.map { it.id })
        assertFailsWith<IllegalArgumentException> {
            reopened.reorder(listOf("first", "first", "third"))
        }
        assertEquals(store.entries, reopened.entries)
    }

    @Test
    fun searchAndSortDoNotMutateCustomOrderOrExport() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        store.add("zebra", "範例")
        store.add("alpha", "ALPHA")
        val original = store.export()
        assertEquals(
            listOf("zebra"),
            visibleAccounts(store.entries, "範", BlocklistSort.CUSTOM).map { it.id },
        )
        assertEquals(
            listOf("alpha"),
            visibleAccounts(store.entries, "@ALP", BlocklistSort.CUSTOM).map { it.id },
        )
        assertEquals(
            listOf("alpha", "zebra"),
            visibleAccounts(store.entries, "", BlocklistSort.ID_ASC).map { it.id },
        )
        assertEquals(
            listOf("zebra", "alpha"),
            visibleAccounts(store.entries, "", BlocklistSort.ID_DESC).map { it.id },
        )
        assertEquals("alpha", visibleAccounts(store.entries, "", BlocklistSort.NEWEST).first().id)
        assertEquals("zebra", visibleAccounts(store.entries, "", BlocklistSort.OLDEST).first().id)
        assertEquals(original, store.export())
    }

    @Test
    fun failedDiskWritePreservesVisibleAndStoredData() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        store.add("existing", "Keep")
        val before = store.entries
        val contents = disk.contents
        disk.fail = true
        assertFails { store.add("new_entry", "New") }
        assertFails { store.remove("existing") }
        assertFails { store.merge("""[{"id":"new_entry"}]""") }
        assertEquals(before, store.entries)
        assertEquals(contents, disk.contents)
    }

    @Test
    fun damagedLocalDataIsNotReplacedWithAnEmptyList() = runTest {
        val disk = Disk()
        disk.contents = "broken"
        val store = BlocklistStore(disk)
        assertFails { store.load() }
        assertFalse(store.ready)
        assertFails { store.add("example_user", "Example") }
        assertEquals("broken", disk.contents)
        assertEquals(0, disk.writes)
    }

    @Test
    fun concurrentAddsCannotOverwriteEachOther() = runTest {
        val disk = Disk()
        val store = BlocklistStore(disk)
        store.load()
        val a = async { store.add("example_a", "A") }
        val b = async { store.add("example_b", "B") }
        a.await()
        b.await()
        assertEquals(setOf("example_a", "example_b"), store.entries.map { it.id }.toSet())
        val reopened = BlocklistStore(disk)
        reopened.load()
        assertEquals(store.entries, reopened.entries)
    }

    @Test
    fun exportedFileCanBeSharedWithoutLocalMetadata() = runTest {
        val original = BlocklistStore(Disk())
        original.load()
        original.add("example_a", "A")
        original.add("example_b", "B")
        original.reorder(listOf("example_a", "example_b"))
        val receiving = BlocklistStore(Disk().apply { time = 999L })
        receiving.load()
        receiving.merge(original.export())
        assertEquals(
            original.entries.map { it.id to it.name },
            receiving.entries.map { it.id to it.name },
        )
        assertTrue(receiving.entries.all { it.addedAt == 999L })
    }
}
