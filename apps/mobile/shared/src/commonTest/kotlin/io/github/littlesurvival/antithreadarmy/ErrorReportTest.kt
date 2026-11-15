package io.github.littlesurvival.antithreadarmy

import kotlin.test.*
import kotlinx.serialization.json.*

class ErrorReportTest {
    @Test
    fun pageFailurePreservesResponseThroughNativeBridge() {
        val report = buildJsonObject {
            put("version", 1)
            put("timestamp", "2026-01-01T00:00:00Z")
            put("stage", "graphql-response")
            put("message", "fixture failure")
            put("name", "Error")
            putJsonObject("response") {
                put("status", 503)
                put("body", "{\"error\":\"fixture upstream\"}")
            }
        }
        val envelope = buildJsonObject {
            put("ok", false)
            put("error", "fixture failure")
            put("report", report)
        }
        val failure = assertFailsWith<AccountQueryException> { parseResult(envelope.toString()) }
        assertEquals(report, errorReport(failure, "native-wrapper"))
        assertEquals(503, failure.report["response"]!!.jsonObject["status"]!!.jsonPrimitive.int)
        assertContains(
            failure.report["response"]!!.jsonObject["body"]!!.jsonPrimitive.content,
            "fixture upstream",
        )
    }

    @Test
    fun nativeFailureHasStackAndStageWithoutInventedResponse() {
        val report =
            errorReport(
                IllegalStateException("fixture navigation failed"),
                "page-navigation",
                "example_user",
            )
        assertEquals("page-navigation", report["stage"]!!.jsonPrimitive.content)
        assertContains(report["stack"]!!.jsonPrimitive.content, "fixture navigation failed")
        assertEquals(
            "example_user",
            report["context"]!!.jsonObject["input"]!!.jsonPrimitive.content,
        )
        assertNull(report["response"])
    }
}
