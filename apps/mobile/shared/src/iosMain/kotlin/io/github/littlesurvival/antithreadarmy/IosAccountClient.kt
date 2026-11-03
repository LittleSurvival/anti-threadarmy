package io.github.littlesurvival.antithreadarmy

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.*
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.WebKit.WKWebsiteDataStore
import platform.CoreGraphics.CGRectZero
import kotlinx.cinterop.readValue
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Composable actual fun rememberAccountClient(): AccountClient = remember { IosAccountClient() }

@OptIn(ExperimentalForeignApi::class)
private class IosAccountClient : AccountClient {
    override suspend fun search(username: String): AccountResult = withContext(Dispatchers.Main) {
        val config = WKWebViewConfiguration().apply { websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore() }
        val webView = WKWebView(frame = CGRectZero.readValue(), configuration = config)
        try {
            withTimeout(100_000) {
                webView.loadRequest(NSURLRequest(uRL = NSURL(string = "https://www.threads.com/reset_password")))
                while (true) {
                    delay(300)
                    val ready = webView.evaluate("location.origin === 'https://www.threads.com' && document.readyState !== 'loading'")
                    if (ready?.toString() == "1" || ready?.toString() == "true") break
                }
                webView.evaluate(queryScript(username))
                var raw: String? = null
                while (raw == null) {
                    delay(250)
                    raw = webView.evaluate("window.__antiThreadarmyResult || null") as? String
                }
                parseResult(raw)
            }
        } catch (error: TimeoutCancellationException) {
            error("查詢逾時，請稍後再試。")
        } finally {
            webView.stopLoading()
            webView.loadHTMLString("", baseURL = null)
        }
    }
}

@OptIn(ExperimentalForeignApi::class)
private suspend fun WKWebView.evaluate(script: String): Any? = suspendCancellableCoroutine { continuation ->
    evaluateJavaScript(script) { value, error ->
        if (continuation.isActive) {
            if (error != null) continuation.resumeWithException(IllegalStateException("Threads 頁面無法執行查詢，請稍後重試。"))
            else continuation.resume(value)
        }
    }
}
