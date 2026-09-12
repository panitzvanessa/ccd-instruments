/* ============================================================
   Claimant-Side Tool Evaluator — assert-based e2e test suite v2
   ------------------------------------------------------------
   Usage:
     npm install jsdom
     node test-claimant-tool-evaluator.js [path/to/claimant-tool-evaluator.html]

   Model under test (after the reviewer round):
     eff(cap)  = min(slider 0-5, evidence cap)  verified→5, documented→3, none→0
     delivered = avg(13 effs) / 5 * 100                        (one decimal)
     required  = minimal 30 · moderate 55 · high 80 · maximal 92
     gap       = max(0, required − delivered)                  (points)
     relGap    = gap / required * 100                          (% of the duty)
     bands on relGap: <20 minimal · <40 moderate · <60 serious
                      · <80 critical · ≥80 structural
     compliance: gap 0 → fully (UNLESS a dimension sits at/near its
                 floor, avg ≤ 1.5, which withholds full compliance);
                 relGap < 40 → partially; else non-compliant
     repairs: greedy ascending eff; the last item stops at the exact
              point that closes the gap
   Every expectation below is hand-computed before the DOM is asked.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML_PATH = process.argv[2] || path.join(__dirname, "claimant-tool-evaluator.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

const pageErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  if (/Not implemented.*scroll/i.test(e.message)) return;
  pageErrors.push("jsdomError: " + e.message);
});
vc.on("error", (...a) => pageErrors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
  virtualConsole: vc
});
const w = dom.window;
const d = w.document;

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log("  ok  " + name); }
  catch (e) {
    failed++;
    console.error("FAIL  " + name);
    console.error("      " + String(e.message).split("\n").join("\n      "));
  }
}

const $ = (sel) => d.querySelector(sel);
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const CAP_IDS = ["translation","eligibility","evidence","mismatch","contest","explain",
                 "access","escalate","sovereignty","maintain","mimicry","effective","cost"];

function setCap(id, score, ev, note) {
  $("#" + id).value = String(score); fire($("#" + id), "input");
  $("#ev-" + id).value = ev; fire($("#ev-" + id), "change");
  if (note != null) { $("#note-" + id).value = note; fire($("#note-" + id), "input"); }
}
function setTool(desc, sys, req) {
  $("#tool-desc").value = desc || ""; fire($("#tool-desc"), "input");
  $("#sys-name").value = sys || ""; fire($("#sys-name"), "input");
  $("#req-level").value = req || ""; fire($("#req-level"), "change");
}
function evaluate() { $("#btn-evaluate").click(); }
function verdict() { return $("#verdict").textContent; }
function scoreLine() { return $("#score-line").textContent; }
function setAll(score, ev) { CAP_IDS.forEach((id) => setCap(id, score, ev)); }

async function main() {

/* ============================================================
   1. Initial render
   ============================================================ */
console.log("\n[1] Initial render");

await t("renders 13 capability cards, all at 0 / 5 with no evidence", () => {
  assert.equal(d.querySelectorAll("#cap-grid .factor").length, 13);
  CAP_IDS.forEach((id) => {
    assert.equal($("#out-" + id).textContent, "0 / 5");
    assert.equal($("#ev-" + id).value, "none");
  });
  assert.equal($("#results").hidden, true);
});

await t("the 13th capability is cost of contestation, feeding Economic", () => {
  const anchors = Array.from(d.querySelectorAll("#cap-grid .anchor")).map((p) => p.textContent);
  assert.match(anchors[12], /Deployer-funded contestation .*Economic dimension/);
});

await t("evaluation is guarded until a required level is chosen", () => {
  evaluate();
  assert.equal($("#eval-note").hidden, false);
  assert.match($("#eval-note").textContent, /Choose the required level/);
});

/* ============================================================
   2. Evidence discipline
   ============================================================ */
console.log("\n[2] Evidence caps");

await t("documented-only caps a 5 at 3; no-evidence forces a 4 to 0; verified opens the scale", () => {
  setCap("translation", 5, "documented");
  assert.equal($("#out-translation").textContent, "5 \u2192 3 / 5");
  setCap("eligibility", 4, "none");
  assert.equal($("#out-eligibility").textContent, "4 \u2192 0 / 5");
  assert.match($("#cap-eligibility").textContent, /unverified/);
  setCap("evidence", 5, "verified");
  assert.equal($("#out-evidence").textContent, "5 / 5");
  assert.equal($("#cap-evidence").hidden, true);
});

/* ============================================================
   3. Gap computation — hand-computed
   ============================================================ */
console.log("\n[3] Gap computation, relative bands");

/* All 13 verified at 5 → delivered 100.0; maximal 92 → gap 0, no floor issues */
await t("full marks vs maximal → fully compliant, gap 0.0 pts (0.0% of the duty)", () => {
  setAll(5, "verified");
  setTool("A complete counterpart.", "", "maximal");
  evaluate();
  assert.equal(verdict(), "Fully compliant · no due-process deficit");
  assert.equal(scoreLine(), "Required 92% · Delivered 100.0% · Gap 0.0 pts (0.0% of the duty)");
  assert.equal($("#needle").style.left, "0%");
  assert.match($("#levels-line").textContent, /\(meets the required level\)$/);
});

/* Reviewer scenario 1 — floor masked by the average:
   all 13 at 5 verified except mimicry 0, effective 0 (Empirical = 0.0)
   sum 55 → delivered 55/65 = 84.6% ≥ high 80 → gap 0
   BUT Empirical at 0.0 ≤ 1.5 → full compliance is withheld            */
await t("R1  zero Empirical with high averages no longer reads fully compliant", () => {
  setAll(5, "verified");
  setCap("mimicry", 0, "verified");
  setCap("effective", 0, "verified");
  setTool("Strong everywhere except in fact.", "", "high");
  evaluate();
  assert.equal(verdict(), "Compliant on average · a floor is breached");
  assert.equal(scoreLine(), "Required 80% · Delivered 84.6% · Gap 0.0 pts (0.0% of the duty)");
  const a = $("#assessment").textContent;
  assert.match(a, /Empirical/);
  assert.match(a, /averages cannot\s+buy back|cannot buy back/);
  assert.match(a, /rests with the evaluator/);
});

/* Reviewer scenario 2 — nothing delivered vs Minimal:
   delivered 0.0, gap 30.0 pts, relGap 100.0% → structural failure     */
await t("R2  empty record vs minimal duty now reads structural failure", () => {
  setAll(0, "none");
  setTool("", "", "minimal");
  evaluate();
  assert.equal(verdict(), "Non-compliant · structural failure");
  assert.equal(scoreLine(), "Required 30% · Delivered 0.0% · Gap 30.0 pts (100.0% of the duty)");
  assert.equal($("#needle").style.left, "100%");
});

/* Mixed hand case (13 caps):
   verified effs: translation 5, eligibility 4, evidence 3, mismatch 2,
   contest 1, access 5, escalate 4, sovereignty 3, maintain 2, mimicry 1
   explain / effective / cost at no-evidence → 0
   sum 30 → delivered 30/65 = 46.2% ; moderate 55 → gap 8.8 pts
   relGap 8.8/55 = 16.0% → minimal deficit, partially compliant
   rolls: Technical (5,4,3,2,1)=3.0 · Economic (5,0)=2.5 · Temporal (2)=2.0
          Empirical (1,0)=0.5 floor-flag · Accountability (0,4,3)=2.3
   weakest: Empirical 0.5 · Temporal 2.0 · Accountability 2.3
   repairs (pts→% at 100/65 = 1.5385/pt): explain 0→5 (+7.7), then
   effective 0→1 (+1.5) stops the set — the last item does NOT say →5  */
await t("mixed profile → 46.2%, gap 8.8 pts (16.0% of the duty), minimal deficit", () => {
  const effs = { translation:5, eligibility:4, evidence:3, mismatch:2, contest:1,
                 access:5, escalate:4, sovereignty:3, maintain:2, mimicry:1 };
  Object.keys(effs).forEach((id) => setCap(id, effs[id], "verified"));
  setCap("explain", 0, "none");
  setCap("effective", 0, "none");
  setCap("cost", 0, "none");
  setTool("A state appeals portal with forms and an FAQ.", "the fraud flagging system", "moderate");
  evaluate();
  assert.equal(scoreLine(), "Required 55% · Delivered 46.2% · Gap 8.8 pts (16.0% of the duty)");
  assert.equal(verdict(), "Partially compliant · minimal deficit");
  assert.equal($("#needle").style.left, "16%");
  assert.match($("#levels-line").textContent, /\(8\.8 pts short of the required level\)$/);
});

await t("dimension roll-ups match hand math; Economic now averages access and cost", () => {
  const rolls = Array.from(d.querySelectorAll("#dimrolls li strong")).map((s) => s.textContent);
  assert.match(rolls[0], /Technical · 3\.0 \/ 5/);
  assert.match(rolls[1], /Economic · 2\.5 \/ 5/);
  assert.match(rolls[2], /Temporal · 2\.0 \/ 5/);
  assert.match(rolls[3], /Empirical · 0\.5 \/ 5 — at or near the floor/);
  assert.match(rolls[4], /Accountability · 2\.3 \/ 5/);
});

await t("dimension cards label the criterion as the top anchor", () => {
  const first = d.querySelector("#dimrolls li").textContent;
  assert.match(first, /Top anchor\./);
});

await t("weakest points vary their phrasing and quote the floor only when near it", () => {
  const items = Array.from(d.querySelectorAll("#weakest li"));
  assert.equal(items.length, 3);
  assert.match(items[0].textContent, /1 · Empirical · 0\.5.*thins here first/s);
  assert.match(items[0].textContent, /Floor\./);
  assert.match(items[1].textContent, /2 · Temporal · 2\.0.*Second weakest/s);
  assert.doesNotMatch(items[1].textContent, /Floor\./);
  assert.match(items[1].textContent, /Top anchor\./);
  assert.match(items[2].textContent, /3 · Accountability · 2\.3.*Third weakest/s);
});

await t("the smallest set stops at the exact point that closes the gap", () => {
  const fixes = Array.from(d.querySelectorAll("#fixes li")).map((li) => li.textContent);
  assert.equal(fixes.length, 2);
  assert.match(fixes[0], /^Build or verify in use: Explainability of the tool itself, 0 \u2192 5 \(\+7\.7 pts/);
  assert.match(fixes[1], /^Build or verify in use: Practical effectiveness, 0 \u2192 1 \(\+1\.5 pts/);
});

await t("unverified capabilities include cost and are counted in the narrative", () => {
  const u = Array.from(d.querySelectorAll("#unverified li")).map((li) => li.textContent);
  assert.equal(u.length, 3);
  assert.match(u[2], /Cost of contestation — could not be verified/);
  assert.match($("#assessment").textContent, /3 capabilities could not be verified/);
});

/* All 13 verified at 2 → delivered 26/65 = 40.0; high 80 → gap 40 pts
   relGap 50.0% → serious deficit, non-compliant                        */
await t("all-2s vs high → gap 40.0 pts (50.0% of the duty), non-compliant · serious", () => {
  setAll(2, "verified");
  setTool("Thin portal.", "", "high");
  evaluate();
  assert.equal(scoreLine(), "Required 80% · Delivered 40.0% · Gap 40.0 pts (50.0% of the duty)");
  assert.equal(verdict(), "Non-compliant · serious deficit");
  assert.equal($("#needle").style.left, "50%");
});

/* ============================================================
   4. Injection safety
   ============================================================ */
console.log("\n[4] Injection safety");

const PAYLOAD = '<img src=x onerror="window.__pwn=1"><script>window.__pwn2=1</scr' + 'ipt>';

await t("hostile description and system name are neutralized in the assessment", () => {
  setAll(3, "verified");
  setTool(PAYLOAD, PAYLOAD, "moderate");
  evaluate();
  const a = $("#assessment");
  assert.equal(a.querySelector("img"), null);
  assert.equal(a.querySelector("script"), null);
  assert.equal(w.__pwn, undefined);
  assert.equal(w.__pwn2, undefined);
  assert.ok(a.textContent.includes("<img src=x"));
});

/* ============================================================
   5. Persistence, export and import
   ============================================================ */
console.log("\n[5] Persistence, export, import");

await t("save → load restores evidence, notes, and scores; storage stays versioned", () => {
  $("#btn-clear-saved").click();
  setAll(3, "verified");
  setCap("maintain", 4, "documented", "changelog only");
  setTool("Persist check portal", "sys", "moderate");
  evaluate();
  $("#btn-save").click();
  assert.equal(d.querySelectorAll("#saved-list li").length, 1);
  setAll(0, "none");
  d.querySelector("#saved-list [data-load]").click();
  assert.equal($("#maintain").value, "4");
  assert.equal($("#ev-maintain").value, "documented");
  assert.equal($("#note-maintain").value, "changelog only");
  const parsed = JSON.parse(w.localStorage.getItem("cste_v1"));
  assert.equal(parsed.v, 1);
  assert.equal(parsed.items.length, 1);
});

await t("export produces a versioned JSON file of the saved evaluations", () => {
  let captured = null;
  const RealBlob = w.Blob, rc = w.URL.createObjectURL, rr = w.URL.revokeObjectURL,
        rk = w.HTMLAnchorElement.prototype.click;
  let name = null;
  w.Blob = function (parts) { captured = parts[0]; };
  w.URL.createObjectURL = () => "blob:mock";
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { name = this.download; };
  try { $("#btn-export").click(); }
  finally {
    w.Blob = RealBlob; w.URL.createObjectURL = rc;
    w.URL.revokeObjectURL = rr; w.HTMLAnchorElement.prototype.click = rk;
  }
  const parsed = JSON.parse(captured);
  assert.equal(parsed.v, 1);
  assert.equal(parsed.items.length, 1);
  assert.match(name, /^ccd-evaluations-\d{4}-\d{2}-\d{2}\.json$/);
});

await t("import merges by id, skips duplicates, and reports the count", async () => {
  const existing = JSON.parse(w.localStorage.getItem("cste_v1")).items[0];
  const incoming = {
    v: 1,
    items: [
      existing, /* duplicate id — must be skipped */
      { id: "imported-1", name: "Imported portal", date: "2026-07-01",
        gap: 12.3, reqLabel: "Level 2 · Moderate duty",
        inputs: existing.inputs }
    ]
  };
  const file = new w.File([JSON.stringify(incoming)], "ccd-evaluations.json",
    { type: "application/json" });
  const input = $("#import-file");
  Object.defineProperty(input, "files", { value: { 0: file, length: 1 }, configurable: true });
  fire(input, "change");
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(d.querySelectorAll("#saved-list li").length, 2);
  assert.match($("#io-note").textContent, /1 evaluation imported\./);
});

await t("importing a malformed file reports the error without breaking the list", async () => {
  const file = new w.File(["not json at all"], "junk.json", { type: "application/json" });
  const input = $("#import-file");
  Object.defineProperty(input, "files", { value: { 0: file, length: 1 }, configurable: true });
  fire(input, "change");
  await new Promise((r) => setTimeout(r, 25));
  assert.match($("#io-note").textContent, /not a valid evaluations export/);
  assert.equal(d.querySelectorAll("#saved-list li").length, 2);
});

await t("stale flag raises on any change and clears on re-evaluation", () => {
  setAll(3, "verified");
  setTool("Stale check", "", "moderate");
  evaluate();
  assert.equal($("#stale").hidden, true);
  $("#note-access").value = "x"; fire($("#note-access"), "input");
  assert.equal($("#stale").hidden, false);
  evaluate();
  assert.equal($("#stale").hidden, true);
});

/* ============================================================
   6. Word report
   ============================================================ */
console.log("\n[6] Word report");

function crc32(buf) {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    T[n] = c >>> 0;
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function readStoredZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = {};
  let p = 0;
  while (p + 4 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true);
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const name = Buffer.from(bytes.slice(p + 30, p + 30 + nameLen)).toString("utf8");
    const data = bytes.slice(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + size);
    entries[name] = { crc, data };
    p += 30 + nameLen + extraLen + size;
  }
  return entries;
}
function captureDocx(prep) {
  let capturedBytes = null, capturedName = null;
  const RealBlob = w.Blob, realCreate = w.URL.createObjectURL,
        realRevoke = w.URL.revokeObjectURL, realClick = w.HTMLAnchorElement.prototype.click;
  w.Blob = function (parts) { capturedBytes = parts[0]; };
  w.URL.createObjectURL = () => "blob:mock";
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { capturedName = this.download; };
  try { prep(); $("#btn-word").click(); }
  finally {
    w.Blob = RealBlob; w.URL.createObjectURL = realCreate;
    w.URL.revokeObjectURL = realRevoke; w.HTMLAnchorElement.prototype.click = realClick;
  }
  return { bytes: capturedBytes, name: capturedName };
}
const EXPECTED_PARTS = [
  "[Content_Types].xml", "_rels/.rels", "docProps/core.xml",
  "word/_rels/document.xml.rels", "word/document.xml", "word/numbering.xml"
];

await t("export produces a valid six-part OOXML package, CRCs verified from scratch", () => {
  const out = captureDocx(() => {
    const effs = { translation:5, eligibility:4, evidence:3, mismatch:2, contest:1,
                   access:5, escalate:4, sovereignty:3, maintain:2, mimicry:1 };
    Object.keys(effs).forEach((id) => setCap(id, effs[id], "verified"));
    setCap("explain", 0, "none");
    setCap("effective", 0, "none");
    setCap("cost", 0, "none");
    setTool(PAYLOAD + " appeals portal", "the fraud system", "moderate");
    evaluate();
  });
  assert.ok(out.bytes && out.bytes[0] === 0x50 && out.bytes[1] === 0x4b);
  const entries = readStoredZip(out.bytes);
  assert.deepEqual(Object.keys(entries).sort(), [...EXPECTED_PARTS].sort());
  for (const name of EXPECTED_PARTS) {
    assert.equal(crc32(entries[name].data), entries[name].crc, "CRC mismatch in " + name);
  }
});

await t("document.xml carries the relative gap, top anchors, varied weakest, exact repairs", () => {
  const out = captureDocx(() => {});
  const docXml = Buffer.from(readStoredZip(out.bytes)["word/document.xml"].data).toString("utf8");
  assert.match(docXml, /Gap 8\.8 pts \(16\.0% of the duty\)/);
  assert.match(docXml, /8\.8 pts short of the required level/);
  assert.match(docXml, /Top anchor\./);
  assert.match(docXml, /Second weakest/);
  assert.match(docXml, /Practical effectiveness, 0 \u2192 1 \(\+1\.5 pts/);
  assert.match(docXml, /13\. Cost of contestation: <\/w:t>.{0,120}?0 of 5 · No evidence/);
  assert.match(docXml, /could not be verified, counts as absent/);
  assert.ok(!docXml.includes("<script>"), "raw script must not reach the XML");
  assert.match(docXml, /&lt;img src=x/);
});

await t("the floor-breach verdict flows into the report verbatim", () => {
  const out = captureDocx(() => {
    setAll(5, "verified");
    setCap("mimicry", 0, "verified");
    setCap("effective", 0, "verified");
    setTool("Strong everywhere except in fact.", "", "high");
    evaluate();
  });
  const docXml = Buffer.from(readStoredZip(out.bytes)["word/document.xml"].data).toString("utf8");
  assert.match(docXml, /Compliant on average · a floor is breached/);
  assert.match(docXml, /rests with the evaluator/);
});

/* ============================================================
   7. License, manual, accessibility
   ============================================================ */
console.log("\n[7] License, manual, accessibility");

await t("MIT license ships in full; manual discloses weights, relative bands, floor rule", () => {
  const body = d.body.textContent;
  assert.match(body, /Permission is hereby granted, free of charge/);
  assert.match(body, /unequal implicit weight|weigh unequally/);
  assert.match(body, /relative to the duty itself|against the duty itself/);
  assert.match(body, /floors are minimums an average\s+cannot buy back|minimums an average cannot buy back/);
});

await t("manual documents the Word report button and what it exports", () => {
  const body = d.body.textContent;
  assert.match(body, /Saving your work, and the Word report/);
  assert.match(body, /Download the Word report writes a \.docx/);
  assert.match(body, /same machinery Module A\s+uses for its own report|same machinery Module A uses/);
});

await t("manual names the Evaluate button, the stale flag, and the last-result rule", () => {
  const body = d.body.textContent;
  assert.match(body, /Press Evaluate the tool to produce the result/);
  assert.match(body, /Inputs changed, evaluate again/);
  assert.match(body, /keeps following the last evaluated result/);
});

await t("the readout is a polite live region for screen readers", () => {
  assert.equal(d.querySelector(".readout").getAttribute("aria-live"), "polite");
});

console.log("");
await t("page produced no jsdom/console errors during the whole run", () => {
  assert.deepEqual(pageErrors, []);
});

console.log("\n============================================");
console.log(" passed: " + passed + "   failed: " + failed);
console.log("============================================");
process.exit(failed ? 1 : 0);
}

main();
