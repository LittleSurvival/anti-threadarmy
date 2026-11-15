package io.github.littlesurvival.antithreadarmy

import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

/** Offline UI test. Replaces only the account client, never contacts Threads. */
@RunWith(AndroidJUnit4::class)
class BlocklistFlowTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()
    private lateinit var file: File
    private var original: ByteArray? = null

    @Before
    fun setUp() {
        file = File(rule.activity.filesDir, "blocklist.json")
        original = if (file.exists()) file.readBytes() else null
        file.delete()
        rule.activity.runOnUiThread {
            rule.activity.setContent {
                App(
                    object : AccountClient {
                        override suspend fun search(username: String) =
                            AccountResult(
                                username,
                                listOf(Profile("Local Example", "Threads", null)),
                                emptyList(),
                            )
                    }
                )
            }
        }
        rule.waitForIdle()
    }

    @After
    fun restore() {
        rule.waitForIdle()
        original?.let { file.writeBytes(it) } ?: file.delete()
    }

    private fun navigate(label: String) {
        rule.onNodeWithContentDescription("開啟選單").performClick()
        rule.onNodeWithText(label).performClick()
        rule.waitForIdle()
    }

    @Test
    fun addSearchCopyRemoveUndoAndRestart() {
        rule.onNode(hasSetTextAction()).performTextInput("example_local")
        rule.onNodeWithContentDescription("查詢帳號").performClick()
        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("加入封鎖名單").fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithText("加入封鎖名單").performScrollTo().performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("已加入").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("已加入").assertIsNotEnabled()
        navigate("封鎖名單")
        rule.onNodeWithText("Local Example").assertExists()
        rule.onNodeWithContentDescription("複製 example_local").performClick()
        rule.runOnIdle {
            val clipboard =
                rule.activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            assertEquals("example_local", clipboard.primaryClip?.getItemAt(0)?.text?.toString())
        }
        rule.onNode(hasSetTextAction()).performTextInput("no_match")
        rule.onNodeWithText("找不到符合的帳號").assertExists()
        rule.onNode(hasSetTextAction()).performTextReplacement("LOCAL")
        rule.onNodeWithText("Local Example").assertExists()
        rule.onNodeWithContentDescription("拖曳 example_local").assertDoesNotExist()
        rule.onNode(hasSetTextAction()).performTextClearance()
        rule.onNodeWithContentDescription("移除 example_local").performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("復原").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("尚無封鎖帳號").assertExists()
        rule.onNodeWithText("復原").performClick()
        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("Local Example").fetchSemanticsNodes().isNotEmpty()
        }
        navigate("首頁")
        rule.onNodeWithText("Local Example").assertExists()
        rule.onNodeWithText("已加入").assertExists()
        rule.activityRule.scenario.recreate()
        navigate("封鎖名單")
        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("Local Example").fetchSemanticsNodes().isNotEmpty()
        }
        assertTrue(file.readText().contains("example_local"))
    }
}
