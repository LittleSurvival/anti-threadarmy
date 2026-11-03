package io.github.littlesurvival.antithreadarmy

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val Background = Color(0xFF101010)
private val Surface = Color(0xFF181818)
private val Border = Color(0xFF2B2B2B)
private val Muted = Color(0xFF858585)

@Composable fun App() {
    var username by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<AccountResult?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val client = rememberAccountClient()
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val uriHandler = LocalUriHandler.current
    fun search() {
        if (busy) return
        val id = username.trim().removePrefix("@")
        if (!Regex("^[A-Za-z0-9._]{1,30}$").matches(id)) {
            result = null
            error = "請輸入 1–30 個英文字母、數字、底線或句點。"
            return
        }
        username = id
        keyboard?.hide()
        busy = true
        error = null
        result = null
        scope.launch {
            try { result = client.search(id) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { error = failure.message ?: "查詢失敗，請稍後再試。" }
            finally { busy = false }
        }
    }
    MaterialTheme(colorScheme = darkColorScheme(primary = Color.White, background = Background, surface = Surface, onSurface = Color(0xFFF3F3F3))) {
        CompositionLocalProvider(LocalContentColor provides Color(0xFFF3F3F3)) {
            Column(Modifier.fillMaxSize().background(Background).safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp)) {
                Row(Modifier.fillMaxWidth().padding(top = 22.dp, bottom = 54.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("@", fontSize = 32.sp)
                    Spacer(Modifier.width(12.dp))
                    Text("anti-threadarmy", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
                OutlinedTextField(
                    value = username, onValueChange = { if (it.length <= 31) username = it }, readOnly = busy,
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    placeholder = { Text("輸入 Threads ID", fontSize = 14.sp, color = Muted) },
                    leadingIcon = { Text("@", color = Muted, fontSize = 22.sp) },
                    trailingIcon = {
                        Button(onClick = { search() }, enabled = !busy && username.isNotBlank(),
                            shape = RoundedCornerShape(12.dp), contentPadding = PaddingValues(0.dp),
                            modifier = Modifier.padding(end = 8.dp).size(42.dp).semantics { contentDescription = if (busy) "查詢中" else "查詢帳號" },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF1F1F1), contentColor = Background)) {
                            if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = Muted, strokeWidth = 2.dp)
                            else Text("→", fontSize = 24.sp)
                        }
                    },
                    shape = RoundedCornerShape(18.dp),
                    colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = Color(0xFF353535), focusedBorderColor = Muted, unfocusedContainerColor = Color(0xFF1C1C1C), focusedContainerColor = Color(0xFF1C1C1C)),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { search() }),
                    isError = error != null,
                )
                Spacer(Modifier.height(24.dp))
                error?.let { message ->
                    Surface(color = Color(0xFF201919), shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Color(0xFF4A3030))) {
                        Column(Modifier.fillMaxWidth().padding(18.dp)) {
                            Text("暫時無法取得資料", color = Color(0xFFE8CECE), fontSize = 14.sp)
                            Spacer(Modifier.height(8.dp))
                            Text(message, color = Color(0xFFB99B9B), fontSize = 12.sp, lineHeight = 20.sp)
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                }
                Surface(color = Surface, shape = RoundedCornerShape(22.dp), border = BorderStroke(1.dp, Border)) {
                    val account = result
                    val profile = account?.profiles?.firstOrNull()
                    if (account == null || profile == null) {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 38.dp).semantics { contentDescription = if (busy) "查詢中" else "尚無查詢結果" }, horizontalAlignment = Alignment.CenterHorizontally) {
                            Surface(color = Color(0xFF222222), shape = CircleShape, border = BorderStroke(1.dp, Border)) { Text("@", Modifier.padding(horizontal = 17.dp, vertical = 10.dp), color = Muted, fontSize = 30.sp) }
                        }
                    } else {
                        Column(Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(24.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(profile.name, fontSize = 23.sp, fontWeight = FontWeight.SemiBold)
                                    Spacer(Modifier.height(8.dp))
                                    Text("@" + account.username, fontSize = 13.sp)
                                }
                                Box(Modifier.size(60.dp).clip(CircleShape).background(Color(0xFF292929)), contentAlignment = Alignment.Center) {
                                    Text(profile.name.take(1).uppercase(), fontSize = 25.sp, color = Muted)
                                    profile.avatarUrl?.let { AsyncImage(model = it, contentDescription = null, modifier = Modifier.fillMaxSize()) }
                                }
                            }
                            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 24.dp))
                            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                                Detail("使用者名稱", "@" + account.username)
                                Detail("資料來源", profile.platform)
                                account.contacts.forEach { Detail(if (it.type == "PHONE") "手機號碼" else if (it.type == "EMAIL") "電子郵件" else "聯絡方式", it.value) }
                            }
                            HorizontalDivider(color = Border)
                            Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("• 已取得資料", fontSize = 11.sp, color = Muted)
                                TextButton(onClick = { uriHandler.openUri("https://www.threads.com/@" + account.username) }) { Text("在 Threads 查看 ↗", fontSize = 11.sp, color = Color(0xFFD0D0D0)) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun Detail(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Muted, fontSize = 12.sp)
        Spacer(Modifier.width(16.dp))
        Text(value, fontSize = 12.sp)
    }
}
