# Contact metadata

`contact-data.json` is shared by the website, extension, Python GUI and mobile app. Mobile embeds the same file at build time. It contains 216 calling codes and 1,152 email domains; querying does not send contact information to a metadata service.

## Sources

- Calling codes and shared regions: [Google libphonenumber metadata](https://github.com/google/libphonenumber/blob/5ea78f46ccc1a258012344801ce04eb6eb4c55da/resources/PhoneNumberMetadata.xml), with Traditional Chinese region names from CLDR through `Intl.DisplayNames`. Copyright The Libphonenumber Authors; Apache-2.0. `+1` uses a compact shared-region label. Non-geographical codes are labeled as international services.
- Reserved `+379`: [ITU E.164 assigned country codes](https://www.itu.int/dms_pub/itu-t/opb/sp/T-SP-E.164D-2016-PDF-E.pdf). This is a reserved Vatican code, not an assertion that it is currently used.
- Email domain/provider pairs: [Thunderbird ISPDB](https://github.com/thunderbird/autoconfig/tree/f50a4feb7dd0e0ed76a7ce440d591ac592dcc313/ispdb), created by Ben Bucksch and maintained by its contributors, under MPL-2.0. The derived email table retains that license; see `CONTACT_DATA_LICENSE.txt`. Server settings and authentication configuration are not included.
- Additional aliases and naming normalization: [Fastmail domains](https://www.fastmail.help/hc/en-us/articles/6239365719055-What-domains-can-I-use-with-Fastmail), [Mail.com domains](https://www.mail.com/mail/domains/), [Apple](https://support.apple.com/en-ca/118230), [Proton](https://proton.me/support/addresses-and-aliases), [Microsoft](https://support.microsoft.com/en-us/outlook/sender-support-in-outlook-com), [Tuta](https://tuta.com/support/general), [GMX](https://www.gmx.net/mail/e-mail-adressen/) and common regional mail services.

The snapshot combines the ISPDB with provider-published aliases and normalizes common brand names. A missing custom domain is not evidence of an invalid mailbox or a specific hosting provider. Update this shared table when source data changes; do not add separate per-app copies.

## Interpretation

- A complete visible calling code identifies its assigned region or shared regions; it does not establish a person's location or nationality.
- A partially masked calling code yields possible regions consistent with the visible prefix.
- An exact known email domain identifies its listed service. Masked domains yield **possible** services and their matching domains, even when only one candidate remains.
- Each `*`, `•` or `●` first matches one hidden character; `…` matches an unknown-length run. If no exact-length candidate exists, masked runs are retried as unknown-length runs while retaining all visible characters.
- For example, `@**.com` matches `qq.com`, `me.com` and other two-character `.com` domains in the table. These remain candidates, not confirmed ownership.
- Completely hidden or unmatched information is displayed as `未知`. Never infer a provider from the visible local part before `@`.
