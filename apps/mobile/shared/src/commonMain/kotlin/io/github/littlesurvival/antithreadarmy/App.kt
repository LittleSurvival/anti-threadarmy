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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

internal val Background = Color(0xFF101010)
internal val Surface = Color(0xFF181818)
internal val Border = Color(0xFF2B2B2B)
internal val Muted = Color(0xFF858585)

@Composable
fun App(accountClient: AccountClient? = null) {
    var username by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<AccountResult?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var report by remember { mutableStateOf<JsonObject?>(null) }
    var showReport by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val client = accountClient ?: rememberAccountClient()
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val inputFocus = remember { FocusRequester() }
    val uriHandler = LocalUriHandler.current
    val platform = rememberBlocklistPlatform()
    val blocklist = remember(platform) { BlocklistStore(platform) }
    val snackbar = remember { SnackbarHostState() }
    var working by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    fun notify(message: String) {
        scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            snackbar.showSnackbar(message)
        }
    }
    fun change(action: suspend () -> Unit) {
        if (working) return
        working = true
        scope.launch {
            try {
                action()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                report = errorReport(failure, "blocklist-operation")
                notify(
                    if (failure is IllegalArgumentException) failure.message ?: "資料格式無效。"
                    else "操作未完成，請確認儲存空間或檔案權限後再試。"
                )
            } finally {
                working = false
            }
        }
    }
    suspend fun loadBlocklist() {
        loadError = null
        try {
            blocklist.load()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            loadError = "無法讀取本地名單，原始檔案已保留。"
            report = errorReport(failure, "blocklist-load")
        }
    }
    LaunchedEffect(blocklist) { loadBlocklist() }
    fun search() {
        if (busy) return
        val id = username.trim()
        if (!isThreadsInput(id)) {
            result = null
            error = "請輸入有效的 Threads ID 或 Threads 連結。"
            report = errorReport(IllegalArgumentException(error), "validate-input", id)
            return
        }
        username = id
        keyboard?.hide()
        busy = true
        error = null
        report = null
        result = null
        scope.launch {
            try {
                result = client.search(id)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                error = failure.message ?: "查詢失敗，請稍後再試。"
                report = errorReport(failure, "lookup", id)
            } finally {
                busy = false
            }
        }
    }
    MaterialTheme(
        colorScheme =
            darkColorScheme(
                primary = Color.White,
                background = Background,
                surface = Surface,
                onSurface = Color(0xFFF3F3F3),
            )
    ) {
        CompositionLocalProvider(LocalContentColor provides Color(0xFFF3F3F3)) {
            if (showReport) report?.let { ErrorReportDialog(it) { showReport = false } }
            MobileFrame(
                snackbar,
                onShowError = if (report != null) ({ showReport = true }) else null,
            ) { showBlocklist ->
                if (showBlocklist)
                    BlocklistScreen(
                        store = blocklist,
                        working = working,
                        loadError = loadError,
                        onRetry = { change { loadBlocklist() } },
                        onImport = {
                            change {
                                platform.importJson()?.let { json ->
                                    val summary = blocklist.merge(json)
                                    notify("已新增 ${summary.added} 筆，略過 ${summary.duplicates} 筆重複")
                                }
                            }
                        },
                        onExport = {
                            change { if (platform.exportJson(blocklist.export())) notify("已匯出名單") }
                        },
                        onRemove = { entry ->
                            change {
                                blocklist.remove(entry.key)?.let { removed ->
                                    scope.launch {
                                        snackbar.currentSnackbarData?.dismiss()
                                        if (
                                            snackbar.showSnackbar(
                                                "已移除帳號",
                                                actionLabel = "復原",
                                                duration = SnackbarDuration.Long,
                                            ) == SnackbarResult.ActionPerformed
                                        ) {
                                            change { blocklist.restore(removed) }
                                        }
                                    }
                                }
                            }
                        },
                        onReorder = { keys -> change { blocklist.reorder(keys) } },
                        onCopied = { notify("已複製 ID") },
                    )
                else
                    Column(
                        Modifier.fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 24.dp)
                            .padding(top = 30.dp, bottom = 24.dp)
                    ) {
                        OutlinedTextField(
                            value = username,
                            onValueChange = { if (it.length <= 2048) username = it },
                            readOnly = busy,
                            modifier = Modifier.fillMaxWidth().focusRequester(inputFocus),
                            singleLine = true,
                            placeholder = {
                                Text("輸入 Threads ID 或貼上連結", fontSize = 14.sp, color = Muted)
                            },
                            leadingIcon = { Text("@", color = Muted, fontSize = 22.sp) },
                            trailingIcon = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (username.isNotEmpty()) {
                                        IconButton(
                                            onClick = {
                                                username = ""
                                                inputFocus.requestFocus()
                                                keyboard?.show()
                                            },
                                            enabled = !busy,
                                            modifier =
                                                Modifier.semantics { contentDescription = "清除輸入" },
                                        ) {
                                            Text(
                                                "×",
                                                fontSize = 24.sp,
                                                color =
                                                    if (busy) Muted.copy(alpha = 0.4f) else Muted,
                                            )
                                        }
                                    }
                                    Button(
                                        onClick = { search() },
                                        enabled = !busy && username.isNotBlank(),
                                        shape = RoundedCornerShape(12.dp),
                                        contentPadding = PaddingValues(0.dp),
                                        modifier =
                                            Modifier.padding(end = 8.dp).size(42.dp).semantics {
                                                contentDescription = if (busy) "查詢中" else "查詢帳號"
                                            },
                                        colors =
                                            ButtonDefaults.buttonColors(
                                                containerColor = Color(0xFFF1F1F1),
                                                contentColor = Background,
                                            ),
                                    ) {
                                        if (busy)
                                            CircularProgressIndicator(
                                                Modifier.size(18.dp),
                                                color = Muted,
                                                strokeWidth = 2.dp,
                                            )
                                        else Text("→", fontSize = 24.sp)
                                    }
                                }
                            },
                            shape = RoundedCornerShape(18.dp),
                            colors =
                                OutlinedTextFieldDefaults.colors(
                                    unfocusedBorderColor = Color(0xFF353535),
                                    focusedBorderColor = Muted,
                                    unfocusedContainerColor = Color(0xFF1C1C1C),
                                    focusedContainerColor = Color(0xFF1C1C1C),
                                ),
                            keyboardOptions =
                                KeyboardOptions(
                                    capitalization = KeyboardCapitalization.None,
                                    autoCorrectEnabled = false,
                                    imeAction = ImeAction.Search,
                                ),
                            keyboardActions = KeyboardActions(onSearch = { search() }),
                            isError = error != null,
                        )
                        Spacer(Modifier.height(24.dp))
                        error?.let { message ->
                            Surface(
                                color = Color(0xFF201919),
                                shape = RoundedCornerShape(16.dp),
                                border = BorderStroke(1.dp, Color(0xFF4A3030)),
                            ) {
                                Column(Modifier.fillMaxWidth().padding(18.dp)) {
                                    Text("暫時無法取得資料", color = Color(0xFFE8CECE), fontSize = 14.sp)
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        message,
                                        color = Color(0xFFB99B9B),
                                        fontSize = 12.sp,
                                        lineHeight = 20.sp,
                                    )
                                    TextButton(onClick = { showReport = true }) { Text("查看錯誤報告") }
                                }
                            }
                            Spacer(Modifier.height(14.dp))
                        }
                        Surface(
                            color = Surface,
                            shape = RoundedCornerShape(22.dp),
                            border = BorderStroke(1.dp, Border),
                        ) {
                            val account = result
                            val profile = account?.profiles?.firstOrNull()
                            if (account == null || profile == null) {
                                Column(
                                    Modifier.fillMaxWidth()
                                        .padding(horizontal = 24.dp, vertical = 38.dp)
                                        .semantics {
                                            contentDescription = if (busy) "查詢中" else "尚無查詢結果"
                                        },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Surface(
                                        color = Color(0xFF222222),
                                        shape = CircleShape,
                                        border = BorderStroke(1.dp, Border),
                                    ) {
                                        Text(
                                            "@",
                                            Modifier.padding(horizontal = 17.dp, vertical = 10.dp),
                                            color = Muted,
                                            fontSize = 30.sp,
                                        )
                                    }
                                }
                            } else {
                                Column(Modifier.fillMaxWidth()) {
                                    Row(
                                        Modifier.padding(24.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column(Modifier.weight(1f)) {
                                            Text(
                                                profile.name,
                                                fontSize = 23.sp,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            Spacer(Modifier.height(8.dp))
                                            Text("@" + account.username, fontSize = 13.sp)
                                        }
                                        Box(
                                            Modifier.size(60.dp)
                                                .clip(CircleShape)
                                                .background(Color(0xFF292929)),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text(
                                                profile.name.take(1).uppercase(),
                                                fontSize = 25.sp,
                                                color = Muted,
                                            )
                                            profile.avatarUrl?.let {
                                                AsyncImage(
                                                    model = it,
                                                    contentDescription = null,
                                                    modifier = Modifier.fillMaxSize(),
                                                )
                                            }
                                        }
                                    }
                                    HorizontalDivider(
                                        color = Border,
                                        modifier = Modifier.padding(horizontal = 24.dp),
                                    )
                                    Column(
                                        Modifier.padding(24.dp),
                                        verticalArrangement = Arrangement.spacedBy(18.dp),
                                    ) {
                                        Detail("使用者名稱", "@" + account.username)
                                        Detail("資料來源", profile.platform)
                                        account.contacts.forEach {
                                            Detail(
                                                if (it.type == "PHONE") "手機號碼"
                                                else if (it.type == "EMAIL") "電子郵件" else "聯絡方式",
                                                it.value,
                                            )
                                        }
                                    }
                                    val details =
                                        remember(account.contacts) {
                                            contactDetails(account.contacts)
                                        }
                                    if (details.isNotEmpty()) {
                                        HorizontalDivider(
                                            color = Border,
                                            modifier = Modifier.padding(horizontal = 24.dp),
                                        )
                                        Column(
                                            Modifier.padding(horizontal = 24.dp, vertical = 16.dp),
                                            verticalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            for ((label, value) in details) Detail(label, value)
                                        }
                                    }
                                    val added = blocklist.contains(account.username)
                                    OutlinedButton(
                                        onClick = {
                                            change { blocklist.add(account.username, profile.name) }
                                        },
                                        enabled = blocklist.ready && !working && !added,
                                        modifier =
                                            Modifier.fillMaxWidth()
                                                .padding(horizontal = 24.dp)
                                                .padding(bottom = 20.dp),
                                        shape = RoundedCornerShape(12.dp),
                                        border = BorderStroke(1.dp, Border),
                                        colors =
                                            ButtonDefaults.outlinedButtonColors(
                                                contentColor = Color.White,
                                                disabledContentColor = Muted,
                                            ),
                                    ) {
                                        LineIcon(if (added) Glyph.CHECK else Glyph.ADD)
                                        Spacer(Modifier.width(8.dp))
                                        Text(if (added) "已加入" else "加入封鎖名單", fontSize = 13.sp)
                                    }
                                    HorizontalDivider(color = Border)
                                    Row(
                                        Modifier.fillMaxWidth()
                                            .padding(horizontal = 24.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text("• 已取得資料", fontSize = 11.sp, color = Muted)
                                        TextButton(
                                            onClick = {
                                                uriHandler.openUri(
                                                    "https://www.threads.com/@" + account.username
                                                )
                                            }
                                        ) {
                                            Text(
                                                "在 Threads 查看 ↗",
                                                fontSize = 11.sp,
                                                color = Color(0xFFD0D0D0),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
            }
        }
    }
}

@Composable
private fun Detail(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Muted, fontSize = 12.sp)
        Spacer(Modifier.width(16.dp))
        Text(
            value,
            modifier = Modifier.weight(1f, fill = false),
            fontSize = 12.sp,
            textAlign = TextAlign.End,
        )
    }
}
