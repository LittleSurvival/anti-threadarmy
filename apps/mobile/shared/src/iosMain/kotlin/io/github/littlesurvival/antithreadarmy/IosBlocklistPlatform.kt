package io.github.littlesurvival.antithreadarmy

import androidx.compose.runtime.*
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.interop.LocalUIViewController
import kotlin.coroutines.resume
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.*
import platform.Foundation.*
import platform.UIKit.*
import platform.UniformTypeIdentifiers.UTTypeJSON
import platform.darwin.NSObject

@OptIn(ExperimentalForeignApi::class, ExperimentalComposeUiApi::class)
@Composable
internal actual fun rememberBlocklistPlatform(): BlocklistPlatform {
    val controller = LocalUIViewController.current
    val platform = remember(controller) { IosBlocklistPlatform(controller) }
    DisposableEffect(platform) { onDispose { platform.cancel() } }
    return platform
}

@OptIn(ExperimentalForeignApi::class)
private class IosBlocklistPlatform(private val presenter: UIViewController) : BlocklistPlatform {
    private val directory =
        (NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, true)
            .first() as String) + "/anti-threadarmy"
    private val path = "$directory/blocklist.json"
    private var picker: UIDocumentPickerViewController? = null
    private var delegate: UIDocumentPickerDelegateProtocol? = null // UIKit keeps a weak delegate.
    private var pending: CancellableContinuation<NSURL?>? = null

    override fun now(): Long = (NSDate().timeIntervalSince1970 * 1000).toLong()

    override suspend fun read(): String? =
        withContext(Dispatchers.Default) {
            if (!NSFileManager.defaultManager.fileExistsAtPath(path)) null
            else readText(NSURL.fileURLWithPath(path))
        }

    override suspend fun write(json: String) =
        withContext(Dispatchers.Default) {
            check(NSFileManager.defaultManager.createDirectoryAtPath(directory, true, null, null)) {
                "無法建立本地名單。"
            }
            check((json as NSString).writeToFile(path, true, NSUTF8StringEncoding, null)) {
                "無法儲存本地名單。"
            }
        }

    override suspend fun importJson(): String? {
        val url =
            pick(
                UIDocumentPickerViewController(
                    forOpeningContentTypes = listOf(UTTypeJSON),
                    asCopy = true,
                )
            ) ?: return null
        val access = url.startAccessingSecurityScopedResource()
        return try {
            withContext(Dispatchers.Default) { readText(url) }
        } finally {
            if (access) url.stopAccessingSecurityScopedResource()
        }
    }

    override suspend fun exportJson(json: String): Boolean {
        val folder = NSTemporaryDirectory() + "anti-threadarmy-" + NSUUID().UUIDString
        val file = "$folder/anti-threadarmy-blocklist.json"
        try {
            check(NSFileManager.defaultManager.createDirectoryAtPath(folder, true, null, null))
            check((json as NSString).writeToFile(file, true, NSUTF8StringEncoding, null)) {
                "無法準備匯出檔案。"
            }
            return pick(
                UIDocumentPickerViewController(
                    forExportingURLs = listOf(NSURL.fileURLWithPath(file)),
                    asCopy = true,
                )
            ) != null
        } finally {
            NSFileManager.defaultManager.removeItemAtPath(folder, null)
        }
    }

    private suspend fun pick(controller: UIDocumentPickerViewController): NSURL? =
        withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { continuation ->
                check(pending == null) { "檔案選擇器已開啟。" }
                pending = continuation
                delegate =
                    object : NSObject(), UIDocumentPickerDelegateProtocol {
                        override fun documentPicker(
                            controller: UIDocumentPickerViewController,
                            didPickDocumentsAtURLs: List<*>,
                        ) {
                            complete(didPickDocumentsAtURLs.firstOrNull() as? NSURL)
                        }

                        override fun documentPickerWasCancelled(
                            controller: UIDocumentPickerViewController
                        ) {
                            complete(null)
                        }
                    }
                picker = controller
                controller.delegate = delegate
                controller.allowsMultipleSelection = false
                continuation.invokeOnCancellation { cancel() }
                presenter.presentViewController(controller, animated = true, completion = null)
            }
        }

    private fun complete(url: NSURL?) {
        val continuation = pending
        pending = null
        picker = null
        delegate = null
        if (continuation?.isActive == true) continuation.resume(url)
    }

    fun cancel() {
        val continuation = pending
        pending = null
        picker?.dismissViewControllerAnimated(true, null)
        picker = null
        delegate = null
        continuation?.cancel()
    }

    private fun readText(url: NSURL): String {
        val attributes =
            NSFileManager.defaultManager.attributesOfItemAtPath(url.path ?: error("無效檔案。"), null)
        val size = (attributes?.get(NSFileSize) as? NSNumber)?.longLongValue ?: error("無法讀取檔案。")
        require(size <= BlocklistJson.MAX_CHARS * 4L) { "JSON 檔案太大。" }
        val data = NSData.dataWithContentsOfURL(url) ?: error("無法讀取檔案。")
        val text =
            NSString.create(data = data, encoding = NSUTF8StringEncoding)?.toString()
                ?: error("檔案必須使用 UTF-8 編碼。")
        require(text.length <= BlocklistJson.MAX_CHARS) { "JSON 檔案太大。" }
        return text
    }
}
