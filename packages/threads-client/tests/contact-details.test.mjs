import { test } from "node:test";
import assert from "node:assert/strict";
import { contactDetails } from "../contact-details.js";

const phone = (value) => ({ type: "PHONE", value });
const email = (value) => ({ type: "EMAIL", value });

test("Romania and international codes are recognized before masked national digits", () => {
  assert.deepEqual(contactDetails([phone("+40 *** *** *22")]).phoneRegions, ["羅馬尼亞"]);
  for (const [code, region] of [
    ["33", "法國"],
    ["49", "德國"],
    ["81", "日本"],
    ["82", "南韓"],
    ["91", "印度"],
    ["55", "巴西"],
    ["234", "奈及利亞"],
    ["64", "紐西蘭"],
    ["886", "台灣"],
    ["86", "中國大陸"],
  ]) {
    assert.deepEqual(contactDetails([phone(`+${code} ***000`)]).phoneRegions, [region]);
  }
  assert.match(contactDetails([phone("+44 ***000")]).phoneRegions[0], /英國/);
  assert.match(contactDetails([phone("+7 ***000")]).phoneRegions[0], /哈薩克/);
  assert.match(contactDetails([phone("+7 ***000")]).phoneRegions[0], /俄羅斯/);
  assert.deepEqual(contactDetails([phone("+800 ***000")]).phoneRegions, ["國際服務（非地理號碼）"]);
});

test("formatting and repeated results work without bridging masked or unknown prefixes", () => {
  assert.deepEqual(contactDetails([phone("+ 4 0 (***).***-22"), phone("+40●●●22")]).phoneRegions, [
    "羅馬尼亞",
  ]);
  assert.deepEqual(contactDetails(["+999 ***000", "0040 ***22", "***22"].map(phone)).phoneRegions, [
    "未知",
  ]);
  const partial = contactDetails([phone("+4*0 ***22")]);
  assert.deepEqual(partial.phoneRegions, []);
  assert.ok(partial.possiblePhoneRegions.includes("羅馬尼亞（+40）"));
  assert.ok(partial.possiblePhoneRegions.includes("捷克（+420）"));
});

test("provider aliases and regional domains match exactly and deduplicate", () => {
  assert.deepEqual(
    contactDetails(
      [
        "e***@GOOGLEMAIL.COM",
        "e***@gmail.com",
        "e***@pm.me",
        "e***@protonmail.ch",
        "e***@me.com",
        "e***@mac.com",
        "e***@live.com",
        "e***@hotmail.com",
        "e***@yahoo.com.tw",
        "e***@qq.com",
        "e***@foxmail.com",
        "e***@126.com",
      ].map(email),
    ).providers,
    ["Gmail", "Proton Mail", "iCloud Mail", "Outlook", "Yahoo Mail", "QQ 郵箱", "網易郵箱"],
  );
});

test("masked domains expose candidates, while unmatched or fully hidden information is unknown", () => {
  const details = contactDetails(
    [
      "e***@Example.ORG",
      "e***@gmail.com.example.org",
      "e***@g****.com",
      "e***@constructor",
      "e***@@gmail.com",
      "e***@-gmail.com",
      "e***@example.org",
    ].map(email),
  );
  assert.deepEqual(details.providers, ["未知"]);
  assert.deepEqual(details.possibleProviders, ["Gmail（gmail.com）"]);
  const masked = contactDetails([email("@**.com")]);
  assert.deepEqual(masked.providers, []);
  assert.ok(masked.possibleProviders.includes("QQ 郵箱（qq.com）"));
  assert.ok(masked.possibleProviders.includes("iCloud Mail（me.com）"));
  assert.deepEqual(contactDetails([email("@***.***")]).providers, ["未知"]);
});

test("expanded ISP and provider alias data covers domains beyond the old short list", () => {
  assert.deepEqual(
    contactDetails(
      [
        "e***@dr.com",
        "e***@fastmail.tw",
        "e***@comcast.net",
        "e***@rambler.ru",
        "e***@free.fr",
      ].map(email),
    ).providers,
    ["Mail.com", "Fastmail", "Comcast", "Rambler", "Freebox"],
  );
});
