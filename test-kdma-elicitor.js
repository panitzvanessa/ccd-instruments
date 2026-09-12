/* ============================================================
   KDMA Elicitor (Module C) — assert-based e2e test suite
   ------------------------------------------------------------
   Usage:
     npm install jsdom
     node test-kdma-elicitor.js [path/to/kdma-elicitor.html]

   Level table under test (derived from Probes 1 and 3 only):
     P1 = no                    → Level 0 (ministerial)
     P1 = yes · P3 = marginal   → Level 1
     P1 = yes · P3 = central    → Level 2
   Probe 2 never changes the level; it shapes the justification
   and, when the balance is struck in software, raises an
   opacity/secrecy advisory. The fact-vs-value checkbox records
   a caution (error risk ≠ value tension), never forces a level.
   The handoff payload carries ONLY {desc, kdma, tension}.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML_PATH = process.argv[2] || path.join(__dirname, "kdma-elicitor.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

const pageErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  if (/Not implemented.*scroll/i.test(e.message)) return;
  pageErrors.push("jsdomError: " + e.message);
});
vc.on("error", (...a) => pageErrors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "http://localhost/", virtualConsole: vc
});
const w = dom.window, d = w.document;

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) {
    failed++;
    console.error("FAIL  " + name);
    console.error("      " + String(e.message).split("\n").join("\n      "));
  }
}
const $ = (s) => d.querySelector(s);
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));

function pickChip(groupSel, value) {
  const chip = d.querySelector(groupSel + ' .chip[data-v="' + value + '"]');
  chip.click();
}
function setProbe(name, value) {
  const r = d.querySelector('input[name="' + name + '"][value="' + value + '"]');
  r.checked = true; fire(r, "change");
}
function elicit() { $("#btn-elicit").click(); }
function levelText() { return $("#level-big").textContent; }
function decodePayload() {
  const href = $("#duty-link").getAttribute("href");
  const b64 = href.split("#ccd=")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

/* ============================================================
   1. Render and statelessness
   ============================================================ */
console.log("\n[1] Render and statelessness");

t("renders the walk, hides the result, and exposes the clear button", () => {
  assert.ok($("#q-decision") && $("#state-chips") && $("#person-chips"));
  assert.equal(d.querySelectorAll('input[name="p1"]').length, 2);
  assert.equal(d.querySelectorAll('input[name="p2"]').length, 3);
  assert.equal(d.querySelectorAll('input[name="p3"]').length, 2);
  assert.equal($("#result").hidden, true);
  assert.ok($("#btn-erase"));
});

t("the tool stores nothing, ever — localStorage stays empty through a full run", () => {
  $("#q-decision").value = "probe"; fire($("#q-decision"), "input");
  pickChip("#state-chips", "Program integrity");
  pickChip("#person-chips", "Dignity");
  setProbe("p1", "yes"); setProbe("p3", "central");
  elicit();
  assert.equal(w.localStorage.length, 0);
});

/* ============================================================
   2. The level table — every path
   ============================================================ */
console.log("\n[2] Level table");

t("P1 = no → Level 0, whatever else says; P3 is disabled; no tension line", () => {
  $("#btn-erase").click();
  setProbe("p1", "no");
  assert.equal(d.querySelector('input[name="p3"][value="central"]').disabled, true);
  elicit();
  assert.equal(levelText(), "Level 0 · No, largely ministerial rules");
  assert.match($("#tension-line").textContent, /No values-in-tension line/);
  assert.match($("#safeguards").textContent, /adds nothing to the score/);
  assert.equal(decodePayload().kdma, 0);
  assert.equal(decodePayload().tension, "");
});

t("P1 = yes · P3 = marginal → Level 1 with the four safeguards", () => {
  $("#btn-erase").click();
  pickChip("#state-chips", "Processing speed");
  pickChip("#person-chips", "Timeliness of aid");
  setProbe("p1", "yes"); setProbe("p3", "marginal");
  elicit();
  assert.equal(levelText(), "Level 1 · Partly, contested at the margins");
  assert.equal($("#tension-line").textContent, "Values in tension: Processing speed vs Timeliness of aid");
  assert.equal(d.querySelectorAll("#safeguards li").length, 4);
  assert.match($("#safeguards").textContent, /human review/);
  assert.equal(decodePayload().kdma, 1);
});

t("P1 = yes · P3 = central → Level 2, a core value trade-off", () => {
  $("#btn-erase").click();
  pickChip("#state-chips", "Program integrity");
  pickChip("#person-chips", "Access to subsistence");
  setProbe("p1", "yes"); setProbe("p3", "central");
  elicit();
  assert.equal(levelText(), "Level 2 · Yes, a core value trade-off");
  assert.equal(decodePayload().kdma, 2);
  assert.equal(decodePayload().tension, "Program integrity vs Access to subsistence");
});

t("choosing P1 = yes re-enables P3 after a ministerial pass", () => {
  setProbe("p1", "no");
  assert.equal(d.querySelector('input[name="p3"][value="central"]').disabled, true);
  setProbe("p1", "yes");
  assert.equal(d.querySelector('input[name="p3"][value="central"]').disabled, false);
});

/* ============================================================
   3. Guards
   ============================================================ */
console.log("\n[3] Guards");

t("eliciting without Probe 1 asks for it; yes without Probe 3 asks for centrality", () => {
  $("#btn-erase").click();
  elicit();
  assert.match($("#elicit-note").textContent, /Answer Probe 1 first/);
  assert.equal($("#result").hidden, true);
  setProbe("p1", "yes");
  elicit();
  assert.match($("#elicit-note").textContent, /Answer Probe 3/);
});

t("a trade-off needs both values named before the level renders", () => {
  setProbe("p3", "central");
  elicit();
  assert.match($("#elicit-note").textContent, /Name both values/);
  assert.equal($("#result").hidden, true);
});

/* ============================================================
   4. Worked example chips
   ============================================================ */
console.log("\n[4] Worked examples");

t("the fraud example elicits Level 2 with the family's canonical tension", () => {
  d.querySelector('[data-example="fraud"]').click();
  elicit();
  assert.equal(levelText(), "Level 2 · Yes, a core value trade-off");
  assert.equal(decodePayload().tension, "Program integrity vs Access to subsistence");
  assert.match($("#q-decision").value, /flags benefit claims as fraudulent/);
});

t("the benefit-calculation example is ministerial → Level 0", () => {
  d.querySelector('[data-example="calc"]').click();
  elicit();
  assert.equal(levelText(), "Level 0 · No, largely ministerial rules");
  assert.match($("#justification").value, /risk-of-error input/);
});

t("the work-screening example lands at Level 1, contested at the margins", () => {
  d.querySelector('[data-example="work"]').click();
  elicit();
  assert.equal(levelText(), "Level 1 · Partly, contested at the margins");
});

/* ============================================================
   5. Flags and the justification
   ============================================================ */
console.log("\n[5] Flags and justification");

t("the fact-vs-value checkbox records a caution instead of forcing the level", () => {
  d.querySelector('[data-example="fraud"]').click();
  $("#fact-flag").checked = true;
  elicit();
  assert.equal(levelText(), "Level 2 · Yes, a core value trade-off", "level unchanged");
  assert.match($("#flags").textContent, /risk-of-error input's territory/);
  assert.match($("#justification").value, /Caution recorded/);
  assert.match($("#justification").value, /error risk, not value tension/);
});

t("a balance struck in software raises the opacity advisory; statute framing owns the duty", () => {
  d.querySelector('[data-example="fraud"]').click(); // p2 = design
  elicit();
  assert.match($("#flags").textContent, /raise Opacity/);
  assert.match($("#justification").value, /least visible exactly where it acts/);
  setProbe("p2", "statute");
  elicit();
  assert.doesNotMatch($("#flags").textContent, /raise Opacity/);
  assert.match($("#justification").value, /does not discharge the duty/);
});

t("custom values override the chips in the tension line", () => {
  $("#btn-erase").click();
  pickChip("#state-chips", "Uniformity");
  $("#state-custom").value = "Caseload throughput"; fire($("#state-custom"), "input");
  pickChip("#person-chips", "Dignity");
  setProbe("p1", "yes"); setProbe("p3", "marginal");
  elicit();
  assert.equal($("#tension-line").textContent, "Values in tension: Caseload throughput vs Dignity");
});

/* ============================================================
   6. Handoff payload shape
   ============================================================ */
console.log("\n[6] Handoff");

t("the payload carries exactly desc, kdma, tension — no factor keys ever", () => {
  d.querySelector('[data-example="fraud"]').click();
  elicit();
  const payload = decodePayload();
  assert.deepEqual(Object.keys(payload).sort(), ["desc", "kdma", "tension"]);
  assert.match($("#duty-link").getAttribute("href"), /^due-process-calibrator\.html#ccd=/);
  assert.match($("#handoff-text").textContent, /will not compute a result until you press Calibrate/);
});

/* ============================================================
   7. The memorandum (.docx)
   ============================================================ */
console.log("\n[7] Memorandum");

function crc32(buf) {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); T[n] = c >>> 0; }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function readStoredZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = {}; let p = 0;
  while (p + 4 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true);
    const nl = dv.getUint16(p + 26, true), xl = dv.getUint16(p + 28, true);
    const name = Buffer.from(bytes.slice(p + 30, p + 30 + nl)).toString("utf8");
    entries[name] = { crc, data: bytes.slice(p + 30 + nl + xl, p + 30 + nl + xl + size) };
    p += 30 + nl + xl + size;
  }
  return entries;
}

const PAYLOAD_XSS = '<img src=x onerror="window.__pwn=1"><script>window.__pwn2=1</scr' + 'ipt>';

t("the memo exports as a valid four-part .docx carrying the EDITED justification", () => {
  d.querySelector('[data-example="fraud"]').click();
  elicit();
  $("#justification").value = "Edited by hand: the trade-off is real and central. " + PAYLOAD_XSS;
  let bytes = null;
  const RB = w.Blob, rc = w.URL.createObjectURL, rr = w.URL.revokeObjectURL,
        rk = w.HTMLAnchorElement.prototype.click;
  w.Blob = function (parts) { bytes = parts[0]; };
  w.URL.createObjectURL = () => "blob:mock"; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  try { $("#btn-word").click(); }
  finally { w.Blob = RB; w.URL.createObjectURL = rc; w.URL.revokeObjectURL = rr; w.HTMLAnchorElement.prototype.click = rk; }
  assert.ok(bytes && bytes[0] === 0x50 && bytes[1] === 0x4b);
  const entries = readStoredZip(bytes);
  assert.deepEqual(Object.keys(entries).sort(),
    ["[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "word/document.xml"]);
  for (const n of Object.keys(entries)) assert.equal(crc32(entries[n].data), entries[n].crc, "CRC " + n);
  const docXml = Buffer.from(entries["word/document.xml"].data).toString("utf8");
  assert.match(docXml, /KDMA Memorandum/);
  assert.match(docXml, /Level 2 · Yes, a core value trade-off/);
  assert.match(docXml, /Edited by hand: the trade-off is real and central\./);
  assert.match(docXml, /profiles no individual/);
  assert.ok(!docXml.includes("<script>"), "raw script must not reach the XML");
  assert.match(docXml, /&lt;img src=x/);
});

/* ============================================================
   8. Injection safety on the page
   ============================================================ */
console.log("\n[8] Injection safety");

t("hostile decision text and custom values stay inert on the page", () => {
  $("#btn-erase").click();
  $("#q-decision").value = PAYLOAD_XSS; fire($("#q-decision"), "input");
  $("#state-custom").value = PAYLOAD_XSS; fire($("#state-custom"), "input");
  $("#person-custom").value = "Dignity"; fire($("#person-custom"), "input");
  setProbe("p1", "yes"); setProbe("p3", "central");
  elicit();
  const zone = $("#result");
  assert.equal(zone.querySelector("img"), null);
  assert.equal(zone.querySelector("script"), null);
  assert.equal(w.__pwn, undefined);
  assert.equal(w.__pwn2, undefined);
  assert.ok($("#tension-line").textContent.includes("<img src=x"));
});

/* ============================================================
   9. Clear, content guarantees
   ============================================================ */
console.log("\n[9] Clear and content");

t("Clear resets probes, chips, flags, gating, and hides the result", () => {
  $("#btn-erase").click();
  assert.equal($("#result").hidden, true);
  assert.equal(d.querySelector('input[name="p1"]:checked'), null);
  assert.equal(d.querySelector('input[name="p3"][value="central"]').disabled, false);
  assert.equal(d.querySelectorAll('.chip[aria-pressed="true"]').length, 0);
  assert.equal($("#fact-flag").checked, false);
  assert.equal($("#q-decision").value, "");
});

t("the About section grounds KDMA in ITM, disavows profiling, and ships the license", () => {
  const txt = $("#about").textContent;
  assert.match(txt, /In the Moment/);
  assert.match(txt, /value\s+misalignment, which only procedure can surface/);
  assert.match(txt, /not a personality or psychometric assessment/);
  assert.match(txt, /never changes the level/);
  assert.match(txt, /Permission is hereby granted, free of charge/);
  assert.match(d.body.textContent, /characterizes the decision, never the decision-maker/);
});

console.log("");
t("page produced no jsdom/console errors during the whole run", () => {
  assert.deepEqual(pageErrors, []);
});

console.log("\n============================================");
console.log(" passed: " + passed + "   failed: " + failed);
console.log("============================================");
process.exit(failed ? 1 : 0);
