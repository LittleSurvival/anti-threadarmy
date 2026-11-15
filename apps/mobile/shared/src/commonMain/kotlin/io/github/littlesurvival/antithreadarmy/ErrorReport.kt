package io.github.littlesurvival.antithreadarmy

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlin.time.Clock
import kotlinx.serialization.json.*

internal class AccountQueryException(message: String, val report: JsonObject) : Exception(message)

internal fun errorReport(failure: Throwable, stage: String, input: String? = null): JsonObject {
    if (failure is AccountQueryException) return failure.report
    return buildJsonObject {
        put("version", 1)
        put("timestamp", Clock.System.now().toString())
        put("stage", stage)
        put("name", failure::class.simpleName ?: "Error")
        put("message", failure.message ?: "操作失敗。")
        put("stack", failure.stackTraceToString())
        if (input != null) putJsonObject("context") { put("input", input) }
    }
}

@Composable
internal fun ErrorReportDialog(report: JsonObject, onClose: () -> Unit) {
    val text =
        remember(report) {
            Json { prettyPrint = true }.encodeToString(JsonObject.serializer(), report)
        }
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            Modifier.fillMaxWidth().fillMaxHeight(0.9f).padding(16.dp),
            shape = RoundedCornerShape(18.dp),
            color = Surface,
        ) {
            Column(Modifier.padding(20.dp)) {
                Text("錯誤報告", fontSize = 20.sp)
                Spacer(Modifier.height(12.dp))
                SelectionContainer(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                    Text(
                        text,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        lineHeight = 19.sp,
                    )
                }
                if (report["response"] == null)
                    Text("此階段未取得 HTTP response。", fontSize = 12.sp, color = Muted)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(
                        onClick = {
                            clipboard.setText(AnnotatedString(text))
                            copied = true
                        }
                    ) {
                        Text(if (copied) "已複製" else "複製報告")
                    }
                    TextButton(onClick = onClose) { Text("關閉") }
                }
            }
        }
    }
}
