package io.github.littlesurvival.antithreadarmy

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.readValue
import kotlinx.coroutines.*
import platform.CoreGraphics.CGRectZero
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.WebKit.WKWebsiteDataStore

@Composable actual fun rememberAccountClient(): AccountClient = remember { IosAccountClient() }

@OptIn(ExperimentalForeignApi::class)
private class IosAccountClient : AccountClient {
    override suspend fun search(username: String): AccountResult =
        withContext(Dispatchers.Main) {
            val config =
                WKWebViewConfiguration().apply {
                    websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore()
                }
            val webView = WKWebView(frame = CGRectZero.readValue(), configuration = config)
            var stage = "page-navigation"
            try {
                withTimeout(130_000) {
                    webView.loadRequest(
                        NSURLRequest(uRL = NSURL(string = "https://www.threads.com/reset_password"))
                    )
                    while (true) {
                        delay(300)
                        val ready =
                            webView.evaluate(
                                "location.origin === 'https://www.threads.com' && document.readyState !== 'loading'"
                            )
                        if (ready?.toString() == "1" || ready?.toString() == "true") break
                    }
                    stage = "page-query"
                    webView.evaluate(queryScript(username))
                    var raw: String? = null
                    while (raw == null) {
                        delay(250)
                        raw = webView.evaluate("window.__antiThreadarmyResult || null") as? String
                    }
                    parseResult(raw)
                }
            } catch (error: TimeoutCancellationException) {
                throw AccountQueryException("查詢逾時，請稍後再試。", errorReport(error, stage, username))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                throw AccountQueryException(
                    failure.message ?: "查詢失敗。",
                    errorReport(failure, stage, username),
                )
            } finally {
                webView.stopLoading()
                webView.loadHTMLString("", baseURL = null)
            }
        }
}

@OptIn(ExperimentalForeignApi::class)
private suspend fun WKWebView.evaluate(script: String): Any? =
    suspendCancellableCoroutine { continuation ->
        evaluateJavaScript(script) { value, error ->
            if (continuation.isActive) {
                if (error != null)
                    continuation.resumeWithException(
                        IllegalStateException(
                            "${error.domain} (${error.code}): ${error.localizedDescription}"
                        )
                    )
                else continuation.resume(value)
            }
        }
    }
