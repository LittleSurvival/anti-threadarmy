package io.github.littlesurvival.antithreadarmy

import kotlinx.serialization.json.*

private val contactData = Json.parseToJsonElement(contactDataJson).jsonObject
private val callingCodeRegions =
    contactData.getValue("callingCodes").jsonObject.mapValues { it.value.jsonPrimitive.content }
private val callingCodes = callingCodeRegions.keys.sortedByDescending { it.length }
private val emailProviders =
    contactData.getValue("emailProviders").jsonObject.mapValues { it.value.jsonPrimitive.content }
private val phone = Regex("""^\+[0-9\s*•●…xX().-]+$""")
private val formatting = Regex("""[\s().-]""")
private val prefix = Regex("""^\+([0-9]+)""")
private val email =
    Regex("""^[^@\s]*@([a-z0-9*•●…-]+(?:\.[a-z0-9*•●…-]+)+)$""", RegexOption.IGNORE_CASE)
private val mask = Regex("""[*•●…]""")
private val visibleDomain = Regex("[a-z0-9]")
private val phoneMask = "*•●…xX"

private fun emailCandidates(domain: String): List<String> {
    if (!mask.containsMatchIn(domain) || !visibleDomain.containsMatchIn(domain)) return emptyList()
    val exact =
        Regex(
            "^" +
                domain
                    .replace(".", "\\.")
                    .replace(Regex("[*•●]"), "[a-z0-9-]")
                    .replace("…", "[a-z0-9-]+") +
                "$"
        )
    var matches = emailProviders.keys.filter { exact.matches(it) }
    if (matches.isEmpty()) {
        val relaxed =
            Regex("^" + domain.replace(".", "\\.").replace(Regex("[*•●…]+"), "[a-z0-9-]+") + "$")
        matches = emailProviders.keys.filter { relaxed.matches(it) }
    }
    return matches.map { "${emailProviders.getValue(it)}（$it）" }
}

internal fun contactDetails(contacts: List<Contact>): List<Pair<String, String>> = buildList {
    val regions = linkedSetOf<String>()
    val possibleRegions = linkedSetOf<String>()
    for (contact in contacts.filter { it.type == "PHONE" }) {
        val value = contact.value.trim()
        val normalized = if (phone.matches(value)) value.replace(formatting, "") else ""
        val digits = prefix.find(normalized)?.groupValues?.get(1)
        val code = if (digits != null) callingCodes.firstOrNull { digits.startsWith(it) } else null
        if (code != null) regions.add(callingCodeRegions.getValue(code))
        else {
            val candidates =
                if (digits != null)
                    callingCodes.filter { candidate ->
                        candidate.withIndex().all { (index, digit) ->
                            val char = normalized.getOrNull(index + 1)
                            char == digit || (char != null && char in phoneMask)
                        }
                    }
                else emptyList()
            if (candidates.isEmpty()) regions.add("未知")
            else
                candidates.forEach {
                    possibleRegions.add("${callingCodeRegions.getValue(it)}（+$it）")
                }
        }
    }
    if (regions.isNotEmpty()) add("電話地區" to regions.joinToString("／"))
    if (possibleRegions.isNotEmpty()) add("可能的電話地區" to possibleRegions.joinToString("／"))
    val providers = linkedSetOf<String>()
    val possibleProviders = linkedSetOf<String>()
    for (contact in contacts.filter { it.type == "EMAIL" }) {
        val value = contact.value.trim()
        val domain =
            if (value.length <= 320) email.matchEntire(value)?.groupValues?.get(1)?.lowercase()
            else null
        val provider = emailProviders[domain]
        if (provider != null) providers.add(provider)
        else {
            val candidates = if (domain != null) emailCandidates(domain) else emptyList()
            if (candidates.isEmpty()) providers.add("未知") else possibleProviders.addAll(candidates)
        }
    }
    if (providers.isNotEmpty()) add("電子郵件服務" to providers.joinToString("／"))
    if (possibleProviders.isNotEmpty()) add("可能的郵件服務" to possibleProviders.joinToString("／"))
}
