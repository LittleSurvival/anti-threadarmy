package io.github.littlesurvival.antithreadarmy

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import kotlin.coroutines.resume
import kotlinx.coroutines.*
import kotlinx.serialization.json.*

@Composable
actual fun rememberAccountClient(): AccountClient {
    val context = LocalContext.current.applicationContext
    return remember(context) { AndroidAccountClient(context) }
}

private class AndroidAccountClient(private val context: Context) : AccountClient {
    @SuppressLint("SetJavaScriptEnabled")
    override suspend fun search(username: String): AccountResult =
        withContext(Dispatchers.Main) {
            val webView = WebView(context)
            var stage = "page-navigation"
            try {
                withTimeout(130_000) {
                    // This app owns this WebView store; it never uses the user's Chrome profile.
                    suspendCancellableCoroutine<Unit> { continuation ->
                        CookieManager.getInstance().removeAllCookies {
                            if (continuation.isActive) continuation.resume(Unit)
                        }
                    }
                    webView.settings.javaScriptEnabled = true
                    webView.settings.domStorageEnabled = true
                    webView.settings.allowFileAccess = false
                    webView.settings.allowContentAccess = false
                    val loaded = CompletableDeferred<Unit>()
                    webView.webViewClient =
                        object : WebViewClient() {
                            override fun onPageFinished(view: WebView, url: String) {
                                if (!loaded.isCompleted) loaded.complete(Unit)
                            }

                            override fun onReceivedError(
                                view: WebView,
                                request: WebResourceRequest,
                                failure: WebResourceError,
                            ) {
                                if (request.isForMainFrame)
                                    loaded.completeExceptionally(
                                        IllegalStateException(
                                            "${failure.errorCode}: ${failure.description} (${request.url})"
                                        )
                                    )
                            }

                            override fun onReceivedHttpError(
                                view: WebView,
                                request: WebResourceRequest,
                                response: WebResourceResponse,
                            ) {
                                if (!request.isForMainFrame) return
                                val failure =
                                    IllegalStateException(
                                        "Threads 頁面回傳 HTTP ${response.statusCode} ${response.reasonPhrase}"
                                    )
                                val report = errorReport(failure, stage, username).toMutableMap()
                                report["response"] = buildJsonObject {
                                    put("url", request.url.toString())
                                    put("status", response.statusCode)
                                    put("statusText", response.reasonPhrase)
                                    putJsonObject("headers") {
                                        put("content-type", response.mimeType ?: "")
                                    }
                                }
                                loaded.completeExceptionally(
                                    AccountQueryException(failure.message!!, JsonObject(report))
                                )
                            }

                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean =
                                request.isForMainFrame &&
                                    (request.url.scheme != "https" ||
                                        request.url.host != "www.threads.com")
                        }
                    webView.loadUrl("https://www.threads.com/reset_password")
                    loaded.await()
                    stage = "page-query"
                    webView.evaluate(queryScript(username))
                    var raw: String? = null
                    while (raw == null) {
                        delay(250)
                        val encoded = webView.evaluate("window.__antiThreadarmyResult || null")
                        raw = Json.parseToJsonElement(encoded).jsonPrimitive.contentOrNull
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
                webView.destroy()
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
            }
        }
}

private suspend fun WebView.evaluate(script: String): String =
    suspendCancellableCoroutine { continuation ->
        evaluateJavascript(script) { value ->
            if (continuation.isActive) continuation.resume(value ?: "null")
        }
    }
