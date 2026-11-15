// Shared UI test data; all account details are synthetic.
import assert from "node:assert/strict";
export const exampleContacts = [
  { type: "PHONE", value: "******0000" },
  { type: "PHONE", value: "+86 ******0000" },
  { type: "PHONE", value: "+886•••000" },
  { type: "PHONE", value: "+1 (***) ***-0000" },
  { type: "PHONE", value: "+886******0001" },
  { type: "PHONE", value: "+40 *** *** *22" },
  { type: "EMAIL", value: "e***@GMAIL.COM" },
  { type: "EMAIL", value: "e***@g****.com" },
  { type: "EMAIL", value: "e***@constructor" },
  { type: "EMAIL", value: "e***@PM.ME" },
  { type: "EMAIL", value: "e***@example.org" },
  { type: "EMAIL", value: "e***@**.com" },
];
const expectedRegions = "未知／中國大陸／台灣／美國、加拿大、百慕達及部分加勒比地區／羅馬尼亞";
export const maskedContacts = [
  { type: "PHONE", value: "******0000" },
  { type: "EMAIL", value: "e***@g****.com" },
];
export async function verifyContactDetails(page) {
  const details = page.locator('[aria-label="聯絡資訊"]');
  await details.getByText(expectedRegions, { exact: true }).waitFor();
  await details.getByText("Gmail／未知／Proton Mail", { exact: true }).waitFor();
  const values = await details.locator("dd").allTextContents();
  assert.deepEqual(values.slice(0, 2), [expectedRegions, "Gmail／未知／Proton Mail"]);
  assert.match(values[2], /QQ 郵箱（qq.com）/);
  assert.match(values[2], /iCloud Mail（me.com）/);
}
