package io.github.littlesurvival.antithreadarmy

import androidx.compose.runtime.Composable
import kotlinx.serialization.json.*

data class Profile(val name: String, val platform: String, val avatarUrl: String?)

data class Contact(val type: String, val value: String)

data class AccountResult(
    val username: String,
    val profiles: List<Profile>,
    val contacts: List<Contact>,
)

interface AccountClient {
    suspend fun search(username: String): AccountResult
}

@Composable expect fun rememberAccountClient(): AccountClient

internal fun isThreadsInput(value: String): Boolean =
    value.length <= 2048 &&
        (Regex("^@?[A-Za-z0-9._]{1,30}$").matches(value) ||
            Regex(
                    """^(?i:https://(?:www\.)?threads\.(?:com|net))(?::443)?/(?:@[A-Za-z0-9._]{1,30}(?:/post/[A-Za-z0-9_-]+)?|share/[A-Za-z0-9_-]+)/?(?:[?#][^\s]*)?$"""
                )
                .matches(value))

internal fun queryScript(username: String): String =
    "window.__antiThreadarmyResult = null; (" +
        pageQuerySource +
        ")(" +
        JsonPrimitive(username).toString() +
        ")" +
        ".then(value => { window.__antiThreadarmyResult = JSON.stringify({ok:true,value}); })" +
        ".catch(error => { window.__antiThreadarmyResult = JSON.stringify({ok:false,error:error.message,report:error.report}); }); void 0;"

internal fun parseResult(raw: String): AccountResult {
    val envelope = Json.parseToJsonElement(raw).jsonObject
    if (envelope["ok"]?.jsonPrimitive?.boolean != true) {
        val message = envelope["error"]?.jsonPrimitive?.content ?: "查詢失敗，請稍後再試。"
        throw AccountQueryException(
            message,
            envelope["report"] as? JsonObject
                ?: errorReport(IllegalStateException(message), "page-result"),
        )
    }
    val data = envelope.getValue("value").jsonObject
    return AccountResult(
        data.getValue("username").jsonPrimitive.content,
        data.getValue("profiles").jsonArray.map { item ->
            val p = item.jsonObject
            Profile(
                p.getValue("name").jsonPrimitive.content,
                p.getValue("platform").jsonPrimitive.content,
                p["avatarUrl"]?.jsonPrimitive?.contentOrNull,
            )
        },
        data.getValue("contacts").jsonArray.map { item ->
            val c = item.jsonObject
            Contact(
                c.getValue("type").jsonPrimitive.content,
                c.getValue("value").jsonPrimitive.content,
            )
        },
    )
}
