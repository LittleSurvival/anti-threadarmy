package io.github.littlesurvival.antithreadarmy

import androidx.activity.compose.setContent
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.AnnotatedString
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ContactDetailsFlowTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun clearingInputRestoresFocusWithoutQueryingOrRemovingResults() {
        val calls = mutableListOf<String>()
        rule.activity.runOnUiThread {
            rule.activity.setContent {
                App(
                    object : AccountClient {
                        override suspend fun search(username: String): AccountResult {
                            calls.add(username)
                            return AccountResult(
                                username,
                                listOf(Profile("Example result", "Threads", null)),
                                emptyList(),
                            )
                        }
                    }
                )
            }
        }
        val input = rule.onNode(hasSetTextAction())
        rule.onNodeWithContentDescription("清除輸入").assertDoesNotExist()
        input.performTextInput("example_clear")
        rule.onNodeWithContentDescription("清除輸入").performClick()
        input
            .assert(
                SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString(""))
            )
            .assertIsFocused()
        rule.onNodeWithContentDescription("清除輸入").assertDoesNotExist()
        rule.runOnIdle { assertEquals(emptyList<String>(), calls) }
        input.performTextInput("example_user")
        rule.onNodeWithContentDescription("查詢帳號").performClick()
        rule.onNodeWithText("Example result").assertExists()
        rule.onNodeWithContentDescription("清除輸入").performClick()
        input
            .assert(
                SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString(""))
            )
            .assertIsFocused()
        rule.onNodeWithText("Example result").assertExists()
        rule.runOnIdle { assertEquals(listOf("example_user"), calls) }
    }

    @Test
    fun cardShowsDetailsFromVisibleContactFragments() {
        val maskedContacts =
            listOf(Contact("PHONE", "******0000"), Contact("EMAIL", "e***@g****.com"))
        rule.activity.runOnUiThread {
            rule.activity.setContent {
                App(
                    object : AccountClient {
                        override suspend fun search(username: String): AccountResult {
                            val contacts =
                                if (username == "example_visible")
                                    maskedContacts +
                                        listOf(
                                            Contact("PHONE", "+86 ******0000"),
                                            Contact("PHONE", "+886•••000"),
                                            Contact("PHONE", "+1 (***) ***-0000"),
                                            Contact("PHONE", "+886******0001"),
                                            Contact("EMAIL", "e***@GMAIL.COM"),
                                        )
                                else maskedContacts
                            return AccountResult(
                                username,
                                listOf(Profile("Example ${username}", "Threads", null)),
                                contacts,
                            )
                        }
                    }
                )
            }
        }

        rule.onNode(hasSetTextAction()).performTextInput("example_visible")
        rule.onNodeWithContentDescription("查詢帳號").performClick()
        rule.onNodeWithText("電話地區").assertExists()
        rule.onNodeWithText("未知／中國大陸／台灣／美國、加拿大、百慕達及部分加勒比地區").assertExists()
        rule.onNodeWithText("Gmail").performScrollTo().assertIsDisplayed()

        rule.onNode(hasSetTextAction()).performScrollTo().performTextReplacement("example_masked")
        rule.onNodeWithContentDescription("查詢帳號").performClick()
        rule.onNodeWithText("Example example_masked").assertExists()
        rule.onNodeWithText("電話地區").assertExists()
        rule.onNodeWithText("未知").assertExists()
        rule.onNodeWithText("Gmail（gmail.com）").assertExists()
        rule.onNodeWithText("電子郵件服務").assertDoesNotExist()
        rule.onNodeWithText("e***@g****.com").assertExists()
    }
}
