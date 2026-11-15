package io.github.littlesurvival.antithreadarmy

import kotlin.test.*

class ContactDetailsTest {
    @Test
    fun internationalPrefixesIncludeRomaniaAndPreserveSharedRegions() {
        for ((code, region) in
            listOf(
                "40" to "羅馬尼亞",
                "33" to "法國",
                "81" to "日本",
                "91" to "印度",
                "234" to "奈及利亞",
                "886" to "台灣",
            )) {
            assertEquals(
                listOf("電話地區" to region),
                contactDetails(listOf(Contact("PHONE", "+$code ***22"))),
            )
        }
        val shared = contactDetails(listOf(Contact("PHONE", "+7 ***22"))).single().second
        assertContains(shared, "俄羅斯")
        assertContains(shared, "哈薩克")
    }

    @Test
    fun formattingNeverJoinsMaskedPrefixDigits() {
        assertEquals(
            listOf("電話地區" to "羅馬尼亞"),
            contactDetails(
                listOf(Contact("PHONE", "+ 4 0 (***).***-22"), Contact("PHONE", "+40●●●22"))
            ),
        )
        assertEquals(
            listOf("電話地區" to "未知"),
            contactDetails(listOf("+999 ***22", "0040 ***22").map { Contact("PHONE", it) }),
        )
        val partial = contactDetails(listOf(Contact("PHONE", "+4*0 ***22"))).toMap()
        assertNull(partial["電話地區"])
        assertContains(partial.getValue("可能的電話地區"), "羅馬尼亞（+40）")
    }

    @Test
    fun aliasesAndUnknownDomainsRemainDistinctFromMaskedDomains() {
        val contacts =
            listOf(
                    "e***@PM.ME",
                    "e***@protonmail.ch",
                    "e***@me.com",
                    "e***@live.com",
                    "e***@yahoo.com.tw",
                    "e***@foxmail.com",
                    "e***@126.com",
                    "e***@Example.ORG",
                    "e***@gmail.com.example.org",
                    "e***@g****.com",
                    "e***@@gmail.com",
                    "e***@constructor",
                )
                .map { Contact("EMAIL", it) }
        assertEquals(
            listOf(
                "電子郵件服務" to "Proton Mail／iCloud Mail／Outlook／Yahoo Mail／QQ 郵箱／網易郵箱／未知",
                "可能的郵件服務" to "Gmail（gmail.com）",
            ),
            contactDetails(contacts),
        )
        val masked = contactDetails(listOf(Contact("EMAIL", "@**.com"))).toMap()
        assertNull(masked["電子郵件服務"])
        assertContains(masked.getValue("可能的郵件服務"), "QQ 郵箱（qq.com）")
        assertContains(masked.getValue("可能的郵件服務"), "iCloud Mail（me.com）")
    }
}
