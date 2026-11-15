package io.github.littlesurvival.antithreadarmy

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal enum class Glyph {
    MENU,
    HOME,
    LIST,
    COPY,
    REMOVE,
    DRAG,
    IMPORT,
    EXPORT,
    ADD,
    CHECK,
    SORT,
}

@Composable
internal fun LineIcon(glyph: Glyph, color: Color = LocalContentColor.current) {
    Canvas(Modifier.size(22.dp)) {
        withTransform({ scale(size.width / 24f, size.height / 24f, pivot = Offset.Zero) }) {
            fun line(x: Float, y: Float, x2: Float, y2: Float) =
                drawLine(color, Offset(x, y), Offset(x2, y2), 1.7f, StrokeCap.Round)
            when (glyph) {
                Glyph.MENU -> {
                    line(4f, 6f, 20f, 6f)
                    line(4f, 12f, 20f, 12f)
                    line(4f, 18f, 20f, 18f)
                }
                Glyph.LIST ->
                    for (y in listOf(6f, 12f, 18f)) {
                        drawCircle(color, 1f, Offset(4f, y))
                        line(9f, y, 20f, y)
                    }
                Glyph.HOME -> {
                    drawPath(
                        Path().apply {
                            moveTo(3f, 11f)
                            lineTo(12f, 4f)
                            lineTo(21f, 11f)
                            moveTo(6f, 10f)
                            lineTo(6f, 20f)
                            lineTo(18f, 20f)
                            lineTo(18f, 10f)
                        },
                        color,
                        style = Stroke(1.7f),
                    )
                }
                Glyph.COPY -> {
                    drawRoundRect(
                        color,
                        Offset(8f, 8f),
                        androidx.compose.ui.geometry.Size(12f, 13f),
                        androidx.compose.ui.geometry.CornerRadius(2f),
                        style = Stroke(1.7f),
                    )
                    line(4f, 16f, 4f, 3f)
                    line(4f, 3f, 16f, 3f)
                }
                Glyph.REMOVE -> {
                    line(5f, 7f, 19f, 7f)
                    line(9f, 3f, 15f, 3f)
                    line(7f, 7f, 8f, 21f)
                    line(8f, 21f, 16f, 21f)
                    line(16f, 21f, 17f, 7f)
                    line(12f, 11f, 12f, 17f)
                }
                Glyph.DRAG ->
                    for (x in listOf(9f, 15f)) for (y in listOf(6f, 12f, 18f)) drawCircle(
                        color,
                        1.2f,
                        Offset(x, y),
                    )
                Glyph.ADD -> {
                    line(5f, 12f, 19f, 12f)
                    line(12f, 5f, 12f, 19f)
                }
                Glyph.CHECK -> {
                    line(4f, 12f, 9f, 17f)
                    line(9f, 17f, 20f, 6f)
                }
                Glyph.SORT -> {
                    line(5f, 6f, 19f, 6f)
                    line(5f, 12f, 15f, 12f)
                    line(5f, 18f, 11f, 18f)
                }
                Glyph.IMPORT,
                Glyph.EXPORT -> {
                    val end = if (glyph == Glyph.IMPORT) 14f else 3f
                    val start = if (glyph == Glyph.IMPORT) 3f else 14f
                    val arrow = if (glyph == Glyph.IMPORT) 10f else 7f
                    line(12f, start, 12f, end)
                    line(8f, arrow, 12f, end)
                    line(16f, arrow, 12f, end)
                    line(4f, 16f, 4f, 21f)
                    line(4f, 21f, 20f, 21f)
                    line(20f, 21f, 20f, 16f)
                }
            }
        }
    }
}

@Composable
internal fun MobileFrame(
    snackbar: SnackbarHostState,
    onShowError: (() -> Unit)? = null,
    content: @Composable (Boolean) -> Unit,
) {
    var blocklist by rememberSaveable { mutableStateOf(false) }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.width(280.dp),
                drawerContainerColor = Surface,
                drawerShape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp),
            ) {
                Text(
                    "anti-threadarmy",
                    Modifier.padding(horizontal = 28.dp, vertical = 32.dp),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                listOf(false to "首頁", true to "封鎖名單").forEach { (destination, title) ->
                    NavigationDrawerItem(
                        label = { Text(title) },
                        selected = blocklist == destination,
                        icon = { LineIcon(if (destination) Glyph.LIST else Glyph.HOME) },
                        onClick = {
                            blocklist = destination
                            scope.launch { drawer.close() }
                        },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        colors =
                            NavigationDrawerItemDefaults.colors(
                                selectedContainerColor = Color(0xFF303030),
                                selectedTextColor = Color.White,
                                selectedIconColor = Color.White,
                                unselectedContainerColor = Color.Transparent,
                                unselectedTextColor = Muted,
                                unselectedIconColor = Muted,
                            ),
                    )
                }
            }
        },
    ) {
        Scaffold(
            containerColor = Background,
            contentWindowInsets = WindowInsets.safeDrawing,
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = {
                Row(
                    Modifier.fillMaxWidth()
                        .statusBarsPadding()
                        .height(72.dp)
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = { scope.launch { drawer.open() } },
                        modifier = Modifier.semantics { contentDescription = "開啟選單" },
                    ) {
                        LineIcon(Glyph.MENU)
                    }
                    Spacer(Modifier.width(10.dp))
                    Text("anti-threadarmy", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    if (onShowError != null) {
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = onShowError) { Text("錯誤報告", fontSize = 12.sp) }
                    }
                }
            },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding).imePadding()) {
                content(blocklist)
            }
        }
    }
}

@Composable
internal fun BlocklistScreen(
    store: BlocklistStore,
    working: Boolean,
    loadError: String?,
    onRetry: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onRemove: (BlockedAccount) -> Unit,
    onReorder: (List<String>) -> Unit,
    onCopied: () -> Unit,
) {
    var search by rememberSaveable { mutableStateOf("") }
    var sort by rememberSaveable { mutableStateOf(BlocklistSort.CUSTOM) }
    var menu by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    val list = rememberLazyListState()
    var dragged by remember { mutableStateOf<String?>(null) }
    var dragY by remember { mutableFloatStateOf(0f) }
    var preview by remember { mutableStateOf<List<BlockedAccount>?>(null) }
    val canDrag = sort == BlocklistSort.CUSTOM && search.isBlank() && store.ready && !working
    val entries = preview ?: visibleAccounts(store.entries, search, sort)
    val latestEntries by rememberUpdatedState(entries)
    fun moveAtPointer() {
        val key = dragged ?: return
        val info = list.layoutInfo
        val pointer =
            dragY.coerceIn(
                info.viewportStartOffset.toFloat(),
                (info.viewportEndOffset - 1).coerceAtLeast(info.viewportStartOffset).toFloat(),
            )
        val over =
            info.visibleItemsInfo.firstOrNull {
                it.key != key && pointer >= it.offset && pointer < it.offset + it.size
            } ?: return
        val current = latestEntries.toMutableList()
        val from = current.indexOfFirst { it.key == key }
        val to = current.indexOfFirst { it.key == over.key }
        if (from >= 0 && to >= 0) {
            current.add(to, current.removeAt(from))
            // Keep the viewport still when the first visible item's key moves.
            list.requestScrollToItem(list.firstVisibleItemIndex, list.firstVisibleItemScrollOffset)
            preview = current
        }
    }
    fun finishDrag(save: Boolean) {
        val order = preview?.map { it.key }
        dragged = null
        if (save && order != null && order != store.entries.map { it.key }) onReorder(order)
        else preview = null
    }
    LaunchedEffect(working, store.entries) { if (!working && dragged == null) preview = null }
    LaunchedEffect(dragged) {
        while (dragged != null) {
            val info = list.layoutInfo
            val edge = 100f
            val delta =
                when {
                    dragY < info.viewportStartOffset + edge -> -12f
                    dragY > info.viewportEndOffset - edge -> 12f
                    else -> 0f
                }
            if (delta != 0f) {
                list.scrollBy(delta)
                moveAtPointer()
            }
            delay(16)
        }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("封鎖名單", fontSize = 23.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "${store.entries.size}",
                Modifier.padding(start = 10.dp).weight(1f),
                color = Muted,
                fontSize = 13.sp,
            )
            IconButton(
                onClick = onImport,
                enabled = store.ready && !working && dragged == null,
                modifier = Modifier.semantics { contentDescription = "匯入 JSON" },
            ) {
                LineIcon(Glyph.IMPORT)
            }
            IconButton(
                onClick = onExport,
                enabled = store.ready && !working && dragged == null,
                modifier = Modifier.semantics { contentDescription = "匯出 JSON" },
            ) {
                LineIcon(Glyph.EXPORT)
            }
        }
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            singleLine = true,
            enabled = dragged == null,
            placeholder = { Text("搜尋 ID 或名稱", color = Muted) },
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "搜尋封鎖名單" },
            shape = RoundedCornerShape(16.dp),
            colors =
                OutlinedTextFieldDefaults.colors(
                    unfocusedBorderColor = Border,
                    focusedBorderColor = Muted,
                    unfocusedContainerColor = Surface,
                ),
        )
        Box(Modifier.align(Alignment.End)) {
            TextButton(onClick = { menu = true }, enabled = dragged == null) {
                LineIcon(Glyph.SORT, Muted)
                Spacer(Modifier.width(6.dp))
                Text(sort.label, color = Muted, fontSize = 12.sp)
            }
            DropdownMenu(
                expanded = menu,
                onDismissRequest = { menu = false },
                containerColor = Surface,
            ) {
                BlocklistSort.entries.forEach { item ->
                    DropdownMenuItem(
                        text = { Text(item.label) },
                        onClick = {
                            sort = item
                            menu = false
                        },
                    )
                }
            }
        }
        if (!store.ready) {
            Column(
                Modifier.fillMaxWidth().padding(vertical = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (loadError == null)
                    CircularProgressIndicator(Modifier.size(24.dp), color = Muted)
                else {
                    Text(loadError, color = Muted)
                    TextButton(onClick = onRetry, enabled = !working) { Text("重試") }
                }
            }
        } else if (entries.isEmpty()) {
            Box(
                Modifier.fillMaxWidth().padding(vertical = 64.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (search.isBlank()) "尚無封鎖帳號" else "找不到符合的帳號",
                    color = Muted,
                    fontSize = 14.sp,
                )
            }
        } else {
            LazyColumn(
                state = list,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(bottom = 24.dp),
            ) {
                items(entries, key = { it.key }) { entry ->
                    val isDragged = dragged == entry.key
                    val layout =
                        list.layoutInfo.visibleItemsInfo.firstOrNull { it.key == entry.key }
                    val translation =
                        if (isDragged && layout != null) dragY - layout.offset - layout.size / 2f
                        else 0f
                    Row(
                        Modifier.fillMaxWidth()
                            .height(52.8.dp)
                            .zIndex(if (isDragged) 1f else 0f)
                            .graphicsLayer { translationY = translation }
                            .background(
                                if (isDragged) Color(0xFF292929) else Background,
                                RoundedCornerShape(12.dp),
                            ),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f).padding(end = 8.dp)) {
                            if (entry.name.isNotBlank()) {
                                Text(
                                    entry.name,
                                    fontSize = 15.sp,
                                    lineHeight = 20.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(Modifier.height(2.dp))
                            }
                            Text(
                                "@${entry.id}",
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                                color = Muted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        IconButton(
                            onClick = {
                                clipboard.setText(AnnotatedString(entry.id))
                                onCopied()
                            },
                            enabled = dragged == null,
                            modifier = Modifier.semantics { contentDescription = "複製 ${entry.id}" },
                        ) {
                            LineIcon(Glyph.COPY, Muted)
                        }
                        IconButton(
                            onClick = { onRemove(entry) },
                            enabled = !working && dragged == null,
                            modifier = Modifier.semantics { contentDescription = "移除 ${entry.id}" },
                        ) {
                            LineIcon(Glyph.REMOVE, Muted)
                        }
                        if (canDrag)
                            Box(
                                Modifier.size(width = 40.dp, height = 48.dp)
                                    .semantics {
                                        contentDescription = "拖曳 ${entry.id}"
                                        customActions =
                                            listOf("上移" to -1, "下移" to 1).map { (label, delta) ->
                                                CustomAccessibilityAction(label) {
                                                    val order =
                                                        store.entries.map { it.key }.toMutableList()
                                                    val from = order.indexOf(entry.key)
                                                    val to = from + delta
                                                    if (from >= 0 && to in order.indices) {
                                                        order.add(to, order.removeAt(from))
                                                        onReorder(order)
                                                        true
                                                    } else false
                                                }
                                            }
                                    }
                                    .pointerInput(entry.key) {
                                        detectDragGestures(
                                            onDragStart = {
                                                val item =
                                                    list.layoutInfo.visibleItemsInfo.firstOrNull {
                                                        it.key == entry.key
                                                    }
                                                if (item != null) {
                                                    preview = store.entries
                                                    dragged = entry.key
                                                    dragY = item.offset + item.size / 2f
                                                }
                                            },
                                            onDrag = { change, amount ->
                                                change.consume()
                                                dragY += amount.y
                                                moveAtPointer()
                                            },
                                            onDragEnd = { finishDrag(true) },
                                            onDragCancel = { finishDrag(false) },
                                        )
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                LineIcon(Glyph.DRAG, Muted)
                            }
                    }
                    HorizontalDivider(color = Border)
                }
            }
        }
    }
}
