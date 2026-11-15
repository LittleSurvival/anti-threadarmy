package io.github.littlesurvival.antithreadarmy

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ContactDetailsFlowTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

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
