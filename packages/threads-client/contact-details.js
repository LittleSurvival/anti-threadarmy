import data from "./contact-data.json" with { type: "json" };

const callingCodes = Object.keys(data.callingCodes).sort((a, b) => b.length - a.length);
const email = /^[^@\s]*@([a-z0-9*•●…-]+(?:\.[a-z0-9*•●…-]+)+)$/i;
const mask = /[*•●…]/u;
const phoneFormatting = /[\s().-]/g;
const domains = Object.keys(data.emailProviders);

export function phoneLabel(value) {
  const number = value.replace(phoneFormatting, "");
  if (!/^[0-9*•●xX]+$/u.test(number) || number.startsWith("00") || value.includes("...")) {
    return "手機號碼";
  }
  return `手機號碼(${number.length}碼)`;
}

function emailCandidates(domain) {
  if (!mask.test(domain) || !/[a-z0-9]/.test(domain)) return [];
  const pattern = domain
    .replace(/\./g, "\\.")
    .replace(/[*•●]/g, "[a-z0-9-]")
    .replace(/…/g, "[a-z0-9-]+");
  const exact = new RegExp(`^${pattern}$`);
  let matches = domains.filter((value) => exact.test(value));
  if (!matches.length) {
    // Some sources use a fixed mask length. Preserve visible text in that case.
    const relaxed = domain.replace(/\./g, "\\.").replace(/[*•●…]+/g, "[a-z0-9-]+");
    const fallback = new RegExp(`^${relaxed}$`);
    matches = domains.filter((value) => fallback.test(value));
  }
  return matches.map((value) => `${data.emailProviders[value]}（${value}）`);
}

export function contactDetails(contacts) {
  const phoneRegions = new Set(),
    possiblePhoneRegions = new Set(),
    providers = new Set(),
    possibleProviders = new Set();
  for (const contact of contacts) {
    const value = contact.value.trim();
    if (contact.type === "PHONE") {
      // Remove formatting, never masking: +4*0 must not become +40.
      const normalized = /^\+[0-9\s*•●…xX().-]+$/u.test(value)
        ? value.replace(phoneFormatting, "").slice(1)
        : "";
      const prefix = normalized.match(/^([0-9]+)/)?.[1];
      const code = prefix && callingCodes.find((code) => prefix.startsWith(code));
      if (code) phoneRegions.add(data.callingCodes[code]);
      else {
        const candidates = prefix
          ? callingCodes.filter((code) =>
              [...code].every(
                (digit, i) => normalized[i] === digit || /[*•●…xX]/u.test(normalized[i] || ""),
              ),
            )
          : [];
        if (candidates.length)
          candidates.forEach((code) =>
            possiblePhoneRegions.add(`${data.callingCodes[code]}（+${code}）`),
          );
        else phoneRegions.add("未知");
      }
    }
    if (contact.type === "EMAIL") {
      const domain = value.length <= 320 ? email.exec(value)?.[1].toLowerCase() : undefined;
      if (domain && Object.hasOwn(data.emailProviders, domain))
        providers.add(data.emailProviders[domain]);
      else {
        const candidates = domain ? emailCandidates(domain) : [];
        if (candidates.length) candidates.forEach((provider) => possibleProviders.add(provider));
        else providers.add("未知");
      }
    }
  }
  return {
    phoneRegions: [...phoneRegions],
    possiblePhoneRegions: [...possiblePhoneRegions],
    providers: [...providers],
    possibleProviders: [...possibleProviders],
  };
}
