/* ============================================================
   Due Process Calibrator — assert-based end-to-end test suite
   ------------------------------------------------------------
   Usage:
     npm install jsdom
     node test-due-process-calibrator.js [path/to/due-process-calibrator.html]

   Unlike the earlier console.log harness, every check here is a
   hard assert: any mismatch makes the run exit with code 1, so a
   regression in the scoring logic cannot pass silently.

   Scoring model under test (from the calibrator):
     base    = (f1 + vuln + f2) / 3
     adjusted= base - 0.4 * (f3 - 3)
     autoAvg = (a1+a2+a3+a4+a5+a6) / 6
     final   = adjusted + 0.4 * (autoAvg - 3) + 0.25 * kdma
     final   = clamp(1, 5), then rounded to one decimal
     Band cutoffs are compared in integer tenths of the displayed score.
     Maximal (Level 3+) iff tenths >= 43 AND f1 >= 4 AND a3 >= 4
                            AND vuln >= 4 AND (a1 >= 4 OR a4 >= 4)
     Bands:  < 2.3 Minimal · < 3.4 Moderate · else High
   Every expected value below is hand-computed from this model
   (exact fractions in the comments) before the DOM is asked.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML_PATH = process.argv[2] || path.join(__dirname, "due-process-calibrator.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

const pageErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => pageErrors.push("jsdomError: " + e.message));
vc.on("error", (...a) => pageErrors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
  virtualConsole: vc
});
const w = dom.window;
const d = w.document;

/* ---------- tiny harness ---------- */
let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) {
    failed++;
    console.error("FAIL  " + name);
    console.error("      " + String(e.message).split("\n").join("\n      "));
  }
}

/* ---------- DOM helpers ---------- */
const $ = (sel) => d.querySelector(sel);
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const FACTORS = ["f1", "vuln", "f2", "f3", "a1", "a2", "a3", "a4", "a5", "a6"];

function setCase(c) {
  $("#sys-desc").value = c.desc || "";
  fire($("#sys-desc"), "input");
  $("#kdma-level").value = String(c.kdma);
  fire($("#kdma-level"), "change");
  $("#kdma-text").value = c.tension || "";
  fire($("#kdma-text"), "input");
  FACTORS.forEach((id) => {
    $("#" + id).value = String(c[id]);
    fire($("#" + id), "input");
  });
}
function calibrate() { $("#btn-calibrate").click(); }
function verdict() { return $("#verdict").textContent; }
function scoreLine() { return $("#score-line").textContent; }
function safeguardTexts() {
  return Array.from(d.querySelectorAll("#safeguards li")).map((li) => li.textContent);
}
function runCase(c) { setCase(c); calibrate(); }
function expectScoreAndLevel(c, score, levelName) {
  runCase(c);
  assert.equal(scoreLine(), score + " / 5 duty intensity on the study scale",
    "score line mismatch");
  assert.equal(verdict(), levelName, "level mismatch");
}
const KDMA_MANDATORY = [
  "individualized reasons",       // advance notice with specific reasons
  "submit additional evidence",   // evidence route
  "human review",                 // mandatory human review
  "appeal process"                // appeal route
];

/* ============================================================
   1. Initial render
   ============================================================ */
console.log("\n[1] Initial render");

t("renders 10 factor sliders (4 Mathews-register + 6 automation)", () => {
  assert.equal(d.querySelectorAll(".range").length, 10);
});
t("renders 6 system profiles", () => {
  assert.equal(d.querySelectorAll(".profile").length, 6);
});
t("renders the 5-dimension reference card with floors", () => {
  const items = d.querySelectorAll("#dims li");
  assert.equal(items.length, 5);
  Array.from(items).forEach((li) =>
    assert.match(li.textContent, /Floor\./, "each dimension states its floor"));
});
t("results start hidden; default slider output reads 3 · Significant", () => {
  assert.equal($("#results").hidden, true);
  assert.equal($("#out-f1").textContent.replace(/\u00b7/g, "·"), "3 · Significant");
});

/* ============================================================
   2. Kept cases (fraud, risk, low-risk) — now as asserts
   ============================================================ */
console.log("\n[2] Kept cases from the original harness");

/* fraud preset: f1=4 vuln=5 f2=5 f3=2 | a: 5,5,5,3,5,5 | kdma=2
   base = 14/3 ; adjusted = 14/3 + 0.4 = 76/15
   autoAvg = 28/6 = 14/3 ; 0.4*(14/3 - 3) = 2/3
   final = 76/15 + 10/15 + 0.5 = 86/15 + 1/2 = 187/30 = 6.233… → clamp 5.0
   Gate: 5.0>=4.3, a3=5, vuln=5, a1=5 → Maximal                       */
t("fraud profile → 5.0, Level 3+ · Maximal duty, needle at 100%", () => {
  d.querySelector('[data-profile="fraud"]').click();
  calibrate();
  assert.equal(scoreLine(), "5.0 / 5 duty intensity on the study scale");
  assert.equal(verdict(), "Level 3+ · Maximal duty");
  assert.equal($("#needle").style.left, "100%");
});
t("fraud profile carries the maintenance & independent-monitoring item", () => {
  assert.ok(safeguardTexts().some((s) => /independent monitoring/.test(s)));
});

/* risk preset: f1=5 vuln=3 f2=3 f3=2 | a: 3,4,2,5,4,2 | kdma=2
   base = 11/3 ; adjusted = 11/3 + 2/5 ; autoAvg = 20/6 = 10/3
   final = 11/3 + 2/5 + 0.4*(1/3) + 1/2 = 110/30+12/30+4/30+15/30 = 141/30 = 4.7
   Gate: 4.7>=4.3 BUT a3=2<4 → High (KDMA=2 + high score alone ≠ maximal) */
t("risk profile → 4.7, Level 3 (core-value KDMA cannot force maximal)", () => {
  d.querySelector('[data-profile="risk"]').click();
  calibrate();
  assert.equal(scoreLine(), "4.7 / 5 duty intensity on the study scale");
  assert.equal(verdict(), "Level 3 · High duty");
});
t("risk profile analysis names the core trade-off and the typed tension", () => {
  d.querySelector('[data-profile="risk"]').click();
  calibrate();
  const a = $("#analysis").textContent;
  assert.match(a, /as a core trade-off/);
  assert.match(a, /Public safety vs individualized sentencing/);
});

/* low-risk custom: f1=3 vuln=1 f2=1 f3=3 | all a=1 | kdma=0
   base = 5/3 ; adjusted = 5/3 ; autoAvg = 1 ; 0.4*(-2) = -0.8
   final = 5/3 - 4/5 = 25/15 - 12/15 = 13/15 = 0.866… → clamp → 1.0 Minimal
   Every safeguard trigger is false → fallback line must appear        */
t("low-risk system → 1.0 Minimal with the static-information fallback", () => {
  expectScoreAndLevel(
    { desc: "A scheduler suggests appointment slots for renewing a library card.",
      f1: 3, vuln: 1, f2: 1, f3: 3, a1: 1, a2: 1, a3: 1, a4: 1, a5: 1, a6: 1, kdma: 0 },
    "1.0", "Level 0 to 1 · Minimal duty");
  const items = safeguardTexts();
  assert.equal(items.length, 1);
  assert.match(items[0], /static information and reasoned notice/);
});

/* ============================================================
   3. New cases (a): floating-point stress at the 4.3 threshold
   ============================================================ */
console.log("\n[3] Threshold stress — hand-computed expectations");

/* T1 · exact 4.3 with full maximal profile → Maximal
   f1=4 vuln=4 f2=4 f3=3 | a: 4,1,4,1,1,4 (Σ=15) | kdma=2
   base = 12/3 = 4 ; autoAvg = 15/6 = 2.5 ; 0.4*(-0.5) = -0.2
   final = 4 - 0.2 + 0.5 = 4.3 exactly (IEEE raw 4.2999999999999998,
   rounds to the same double as the 4.3 literal, so >= 4.3 holds)    */
t("T1  score exactly 4.3 + full trigger profile → Maximal", () => {
  expectScoreAndLevel(
    { f1: 4, vuln: 4, f2: 4, f3: 3, a1: 4, a2: 1, a3: 4, a4: 1, a5: 1, a6: 4, kdma: 2 },
    "4.3", "Level 3+ · Maximal duty");
});

/* T2 · same 4.3 but a3=2 (human recourse exists) → High, not Maximal
   f1=4 vuln=4 f2=4 f3=3 | a: 4,3,2,1,1,4 (Σ=15) | kdma=2 → 4.3      */
t("T2  score 4.3 with human recourse present (a3=2) → High only", () => {
  expectScoreAndLevel(
    { f1: 4, vuln: 4, f2: 4, f3: 3, a1: 4, a2: 3, a3: 2, a4: 1, a5: 1, a6: 4, kdma: 2 },
    "4.3", "Level 3 · High duty");
});

/* T3 · 4.2, one tenth below, full trigger profile met → High
   f1=5 vuln=4 f2=4 f3=3 | a: 4,2,4,2,2,2 (Σ=16) | kdma=0
   base = 13/3 ; autoAvg = 16/6 = 8/3 ; 0.4*(8/3-3) = -2/15
   final = 13/3 - 2/15 = 65/15 - 2/15 = 63/15 = 4.2 exactly
   (IEEE raw 4.1999999999999993 → display 4.2 → below the gate)      */
t("T3  score 4.2 with a3/vuln/a1 all high → still High (score gate binds)", () => {
  expectScoreAndLevel(
    { f1: 5, vuln: 4, f2: 4, f3: 3, a1: 4, a2: 2, a3: 4, a4: 2, a5: 2, a6: 2, kdma: 0 },
    "4.2", "Level 3 · High duty");
});

/* T4 · mathematically 4.25 → rounds half-up to 4.3 → crosses the gate
   f1=5 vuln=4 f2=4 f3=3 | a: 4,1,4,1,1,2 (Σ=13) | kdma=1
   base = 13/3 ; autoAvg = 13/6 ; 0.4*(13/6-3) = -1/3
   final = 13/3 - 1/3 + 1/4 = 4 + 0.25 = 4.25 → Math.round(42.5)=43 → 4.3
   Documents that the effective raw threshold is 4.25, because the
   score is rounded to tenths BEFORE the >= 4.3 comparison.          */
t("T4  raw 4.25 rounds to 4.3 and triggers Maximal (effective gate = 4.25 raw)", () => {
  expectScoreAndLevel(
    { f1: 5, vuln: 4, f2: 4, f3: 3, a1: 4, a2: 1, a3: 4, a4: 1, a5: 1, a6: 2, kdma: 1 },
    "4.3", "Level 3+ · Maximal duty");
});

/* T5 · band edge 2.3: score exactly 2.3 → Moderate (band is < 2.3)
   f1=2 vuln=2 f2=2 f3=3 | a: 3,2,3,2,3,2 (Σ=15) | kdma=2
   base = 2 ; autoAvg = 2.5 ; final = 2 - 0.2 + 0.5 = 2.3            */
t("T5  score exactly 2.3 lands in Moderate, not Minimal", () => {
  expectScoreAndLevel(
    { f1: 2, vuln: 2, f2: 2, f3: 3, a1: 3, a2: 2, a3: 3, a4: 2, a5: 3, a6: 2, kdma: 2 },
    "2.3", "Level 2 · Moderate duty");
});

/* T6 · band edge 3.4: score exactly 3.4 → High (band is < 3.4)
   f1=4 vuln=3 f2=4 f3=3 | a: 2,3,2,3,2,2 (Σ=14) | kdma=0
   base = 11/3 ; autoAvg = 14/6 = 7/3 ; 0.4*(7/3-3) = -4/15
   final = 55/15 - 4/15 = 51/15 = 3.4                                */
t("T6  score exactly 3.4 lands in High, not Moderate", () => {
  expectScoreAndLevel(
    { f1: 4, vuln: 3, f2: 4, f3: 3, a1: 2, a2: 3, a3: 2, a4: 3, a5: 2, a6: 2, kdma: 0 },
    "3.4", "Level 3 · High duty");
});

/* T7 · 3.3, one tenth under the High band → Moderate
   f1=3 vuln=3 f2=3 f3=3 | a: 3,2,3,2,3,2 (Σ=15) | kdma=2
   final = 3 - 0.2 + 0.5 = 3.3                                       */
t("T7  score 3.3 stays Moderate", () => {
  expectScoreAndLevel(
    { f1: 3, vuln: 3, f2: 3, f3: 3, a1: 3, a2: 2, a3: 3, a4: 2, a5: 3, a6: 2, kdma: 2 },
    "3.3", "Level 2 · Moderate duty");
});

/* T8 · clamp floor: all mitigating, heavy deployer burden
   f1=1 vuln=1 f2=1 f3=5 | all a=1 | kdma=0
   base = 1 ; adjusted = 1 - 0.8 = 0.2 ; autoAvg = 1 → -0.8
   final = -0.6 → clamp → 1.0 ; needle at 0%                         */
t("T8  clamp floor holds at 1.0 and the needle sits at 0%", () => {
  expectScoreAndLevel(
    { f1: 1, vuln: 1, f2: 1, f3: 5, a1: 1, a2: 1, a3: 1, a4: 1, a5: 1, a6: 1, kdma: 0 },
    "1.0", "Level 0 to 1 · Minimal duty");
  assert.equal($("#needle").style.left, "0%");
});

/* ============================================================
   4. New cases (b): KDMA contributes but cannot substitute
   ============================================================ */
console.log("\n[4] KDMA composite rules");

/* T9 · ceiling score, core KDMA, but vuln=3 → High
   f1=5 vuln=3 f2=5 f3=2 | all a=5 | kdma=2
   base = 13/3 ; +0.4 ; autoAvg=5 → +0.8 ; +0.5 → 5.83 → clamp 5.0   */
t("T9  score 5.0 + KDMA core, population not vulnerable → High only", () => {
  expectScoreAndLevel(
    { f1: 5, vuln: 3, f2: 5, f3: 2, a1: 5, a2: 5, a3: 5, a4: 5, a5: 5, a6: 5, kdma: 2 },
    "5.0", "Level 3 · High duty");
});

/* T10 · opacity via the a4 (trade-secret) branch alone → Maximal
   f1=5 vuln=5 f2=5 f3=3 | a: 3,3,4,4,3,3 (Σ=20) | kdma=1
   base = 5 ; autoAvg = 10/3 → +2/15 ; +0.25 → 5.383 → clamp 5.0     */
t("T10 a1=3 but a4=4: proprietary secrecy satisfies the opacity branch → Maximal", () => {
  expectScoreAndLevel(
    { f1: 5, vuln: 5, f2: 5, f3: 3, a1: 3, a2: 3, a3: 4, a4: 4, a5: 3, a6: 3, kdma: 1 },
    "5.0", "Level 3+ · Maximal duty");
});

/* T11 · same but a4=3: no opacity branch at all → High
   f1=5 vuln=5 f2=5 f3=3 | a: 3,3,4,3,3,3 (Σ=19) | kdma=1
   base = 5 ; autoAvg = 19/6 → +1/15 ; +0.25 → 5.316 → clamp 5.0     */
t("T11 score 5.0, a3/vuln high, but a1=a4=3 → High (opacity branch required)", () => {
  expectScoreAndLevel(
    { f1: 5, vuln: 5, f2: 5, f3: 3, a1: 3, a2: 3, a3: 4, a4: 3, a5: 3, a6: 3, kdma: 1 },
    "5.0", "Level 3 · High duty");
});

/* T12 · booking preset (thesis gatekeeping case): Maximal with kdma=0
   f1=5 vuln=5 f2=4 f3=2 | a: 4,4,5,3,4,5 (Σ=25) | kdma=0
   base = 14/3 ; +0.4 ; autoAvg = 25/6 → 0.4*(7/6) = 7/15
   final = 70/15 + 6/15 + 7/15 = 83/15 = 5.53 → clamp 5.0
   Gate: a3=5, vuln=5, a1=4 → Maximal without any KDMA bonus          */
t("T12 booking profile reaches Maximal with KDMA at zero (KDMA not required)", () => {
  d.querySelector('[data-profile="booking"]').click();
  calibrate();
  assert.equal(scoreLine(), "5.0 / 5 duty intensity on the study scale");
  assert.equal(verdict(), "Level 3+ · Maximal duty");
  assert.doesNotMatch($("#analysis").textContent, /contested KDMAs/);
});

/* T13 · severity gate: harm at 3 blocks Maximal even at ceiling score
   f1=3 vuln=5 f2=5 f3=1 | all a=5 | kdma=0
   base = 13/3 ; adjusted = 13/3 + 0.8 ; autoAvg = 5 → +0.8
   final = 13/3 + 1.6 = 5.93… → clamp 5.0
   Gate: f1=3 < 4 → NOT maximal despite a3/vuln/a1 all at 5 → High.
   Implements thesis ch. 6: the maximal profile includes "immediate
   and severe harm", now checked directly rather than via the score. */
t("T13 score 5.0 with harm at 'Significant' (f1=3) → High, not Maximal", () => {
  expectScoreAndLevel(
    { f1: 3, vuln: 5, f2: 5, f3: 1, a1: 5, a2: 5, a3: 5, a4: 5, a5: 5, a6: 5, kdma: 0 },
    "5.0", "Level 3 · High duty");
});

/* T14 · mirror of T13 with f1=4: severity present → Maximal
   f1=4 vuln=5 f2=5 f3=1 | all a=5 | kdma=0
   base = 14/3 ; +0.8 ; +0.8 → 6.26… → clamp 5.0 → Maximal            */
t("T14 same system with harm at 'Serious' (f1=4) → Maximal", () => {
  expectScoreAndLevel(
    { f1: 4, vuln: 5, f2: 5, f3: 1, a1: 5, a2: 5, a3: 5, a4: 5, a5: 5, a6: 5, kdma: 0 },
    "5.0", "Level 3+ · Maximal duty");
});

t("maximal analysis names the dissertation's own formulation for the 3+ label", () => {
  runCase({ f1: 4, vuln: 5, f2: 5, f3: 1, a1: 5, a2: 5, a3: 5, a4: 5, a5: 5, a6: 5, kdma: 0 });
  assert.match($("#analysis").textContent,
    /Level 3 with maintenance and independent monitoring enforced/);
});

t("KDMA at 'contested at the margins' forces the four mandatory safeguards even in Moderate", () => {
  // Reuse T5 (Moderate, kdma=2 → same rule fires for kdma>=1); assert all four present.
  runCase({ f1: 2, vuln: 2, f2: 2, f3: 3, a1: 3, a2: 2, a3: 3, a4: 2, a5: 3, a6: 2, kdma: 2 });
  const joined = safeguardTexts().join(" | ");
  KDMA_MANDATORY.forEach((k) =>
    assert.ok(joined.includes(k), "missing mandatory safeguard: " + k));
});

t("KDMA at zero on a mild profile leaves the four KDMA-mandated items out", () => {
  runCase({ f1: 2, vuln: 2, f2: 2, f3: 3, a1: 2, a2: 2, a3: 2, a4: 2, a5: 2, a6: 2, kdma: 0 });
  const joined = safeguardTexts().join(" | ");
  ["submit additional evidence", "appeal process"].forEach((k) =>
    assert.ok(!joined.includes(k), "unexpected KDMA-mandated safeguard: " + k));
});

/* ============================================================
   5. New cases (c): injection safety through innerHTML paths
   ============================================================ */
console.log("\n[5] Injection safety");

const PAYLOAD_DESC = '<img src=x onerror="window.__pwn1=1"><script>window.__pwn2=1</script>';
const PAYLOAD_TENSION = '"><svg onload="window.__pwn3=1"><b>x</b>';

t("X1  hostile description is neutralized in the analysis panel", () => {
  runCase({ desc: PAYLOAD_DESC, f1: 4, vuln: 4, f2: 4, f3: 3,
            a1: 4, a2: 1, a3: 4, a4: 1, a5: 1, a6: 4, kdma: 2 });
  const analysis = $("#analysis");
  assert.equal(analysis.querySelector("img"), null, "img element must not be created");
  assert.equal(analysis.querySelector("svg"), null);
  assert.equal(analysis.querySelector("script"), null, "script element must not be created");
  assert.equal(w.__pwn1, undefined);
  assert.equal(w.__pwn2, undefined);
  assert.ok(analysis.textContent.includes('<img src=x'),
    "payload must survive as visible text");
});

t("X2  hostile KDMA tension text is neutralized", () => {
  runCase({ desc: "System", tension: PAYLOAD_TENSION,
            f1: 4, vuln: 4, f2: 4, f3: 3, a1: 4, a2: 1, a3: 4, a4: 1, a5: 1, a6: 4, kdma: 1 });
  const analysis = $("#analysis");
  assert.equal(analysis.querySelector("svg"), null, "svg element must not be created");
  assert.equal(analysis.querySelector("b"), null, "no element from tension text");
  assert.equal(w.__pwn3, undefined);
  assert.ok(analysis.textContent.includes('"><svg onload='),
    "payload must survive as visible text");
});

t("X3  hostile description survives save → list → load without becoming markup", () => {
  $("#btn-clear-saved").click();
  runCase({ desc: PAYLOAD_DESC, f1: 4, vuln: 4, f2: 4, f3: 3,
            a1: 4, a2: 1, a3: 4, a4: 1, a5: 1, a6: 4, kdma: 2 });
  $("#btn-save").click();
  const list = $("#saved-list");
  assert.equal(d.querySelectorAll("#saved-list li").length, 1);
  assert.equal(list.querySelector("img"), null, "saved-name render must not create img");
  assert.equal(list.querySelector("script"), null);
  assert.ok(list.textContent.includes('<img src=x'), "name shown as text");
  // round-trip: load must restore the exact raw string into the textarea
  list.querySelector("[data-load]").click();
  assert.ok($("#sys-desc").value.startsWith('<img src=x'), "load restores raw text");
  assert.equal(w.__pwn1, undefined);
});

/* ============================================================
   6. Persistence & interaction plumbing
   ============================================================ */
console.log("\n[6] Persistence and staleness");

t("save → delete → clear leaves an empty list and shows the empty note", () => {
  $("#btn-clear-saved").click();
  runCase({ desc: "Persist check", f1: 3, vuln: 3, f2: 3, f3: 3,
            a1: 3, a2: 3, a3: 3, a4: 3, a5: 3, a6: 3, kdma: 0 });
  $("#btn-save").click();
  assert.equal(d.querySelectorAll("#saved-list li").length, 1);
  d.querySelector("#saved-list [data-del]").click();
  assert.equal(d.querySelectorAll("#saved-list li").length, 0);
  assert.equal($("#saved-empty").hidden, false);
});

t("localStorage stores under dpc_v3 and survives a JSON round-trip", () => {
  $("#btn-clear-saved").click();
  runCase({ desc: "Storage key check", f1: 3, vuln: 3, f2: 3, f3: 3,
            a1: 3, a2: 3, a3: 3, a4: 3, a5: 3, a6: 3, kdma: 1, tension: "T" });
  $("#btn-save").click();
  const raw = w.localStorage.getItem("dpc_v3");
  assert.ok(raw, "dpc_v3 key present");
  const arr = JSON.parse(raw);
  assert.equal(arr.length, 1);
  assert.equal(arr[0].inputs.kdma, 1);
  assert.equal(arr[0].inputs.f1, 3);
});

t("editing any input after a result raises the stale flag; recalibrating clears it", () => {
  runCase({ desc: "Stale check", f1: 3, vuln: 3, f2: 3, f3: 3,
            a1: 3, a2: 3, a3: 3, a4: 3, a5: 3, a6: 3, kdma: 0 });
  assert.equal($("#stale").hidden, true);
  $("#f1").value = "4"; fire($("#f1"), "input");
  assert.equal($("#stale").hidden, false);
  calibrate();
  assert.equal($("#stale").hidden, true);
});

t("save without a prior result asks the user to calibrate first", () => {
  const fresh = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  fresh.window.document.querySelector("#btn-save").click();
  const note = fresh.window.document.querySelector("#save-note");
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Calibrate a system first/);
});

/* ============================================================
   7. Word report (.docx assembled in the browser)
   ============================================================ */
console.log("\n[7] Word report");

/* Minimal reader for stored-entry ZIPs + independent CRC-32,
   so the archive the page builds is verified from scratch. */
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

t("W1  clicking the report button before any result asks to calibrate first", () => {
  const fresh = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  fresh.window.document.querySelector("#btn-word").click();
  const note = fresh.window.document.querySelector("#word-note");
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Calibrate a system first/);
});

t("W2  export produces a valid stored ZIP with the six OOXML parts, CRCs verified", () => {
  const out = captureDocx(() => {
    d.querySelector('[data-profile="fraud"]').click();
    calibrate();
  });
  assert.ok(out.bytes instanceof w.Uint8Array || out.bytes instanceof Uint8Array,
    "bytes captured from the Blob");
  assert.equal(out.bytes[0], 0x50); // P
  assert.equal(out.bytes[1], 0x4b); // K
  const entries = readStoredZip(out.bytes);
  assert.deepEqual(Object.keys(entries).sort(), [...EXPECTED_PARTS].sort());
  for (const name of EXPECTED_PARTS) {
    assert.equal(crc32(entries[name].data), entries[name].crc,
      "CRC mismatch in " + name);
  }
  assert.match(out.name, /^due-process-report-.+\.docx$/);
});

t("W3  document.xml carries the verdict, score, inputs, analysis, and cited package", () => {
  const out = captureDocx(() => {
    d.querySelector('[data-profile="fraud"]').click();
    calibrate();
  });
  const docXml = Buffer.from(readStoredZip(out.bytes)["word/document.xml"].data).toString("utf8");
  assert.match(docXml, /Due Process Calibration Report/);
  assert.match(docXml, /Level 3\+ · Maximal duty/);
  assert.match(docXml, /5\.0 \/ 5 duty intensity/);
  assert.match(docXml, /flags benefit claims as fraudulent/); // system description
  assert.match(docXml, /Severity &amp; reversibility of harm: /); // input with value
  assert.match(docXml, /4 of 5 — Serious/);
  assert.match(docXml, /Yes, a core value trade-off/); // KDMA label
  assert.match(docXml, /independent monitoring/); // maximal safeguard
  assert.match(docXml, /Bauserman v\. Unemployment Ins\. Agency/); // cite preserved
  assert.match(docXml, /Accountability\./); // five-dimensions checklist
  assert.match(docXml, /<w:numId w:val="1"\/>/); // real bulleted lists
  assert.match(docXml, /<w:i\/>/); // italics survive from em tags
});

t("W4  hostile description is XML-escaped inside the report, not injected", () => {
  const out = captureDocx(() => {
    runCase({ desc: PAYLOAD_DESC, f1: 4, vuln: 4, f2: 4, f3: 3,
              a1: 4, a2: 1, a3: 4, a4: 1, a5: 1, a6: 4, kdma: 2 });
  });
  const docXml = Buffer.from(readStoredZip(out.bytes)["word/document.xml"].data).toString("utf8");
  assert.ok(!docXml.includes("<script>"), "raw script tag must not reach the XML");
  assert.ok(!docXml.includes("<img "), "raw img tag must not reach the XML");
  assert.match(docXml, /&lt;img src=x/);
  assert.match(docXml, /&lt;script&gt;/);
});

t("W5  report follows lastResult even when sliders moved after calibration (stale state)", () => {
  d.querySelector('[data-profile="risk"]').click();
  calibrate(); // lastResult: risk → 4.7 High
  $("#f1").value = "1"; fire($("#f1"), "input"); // stale edit, no recalibration
  const out = captureDocx(() => {});
  const docXml = Buffer.from(readStoredZip(out.bytes)["word/document.xml"].data).toString("utf8");
  assert.match(docXml, /Level 3 · High duty/);
  assert.match(docXml, /4\.7 \/ 5 duty intensity/);
});

/* ============================================================
   8. Audit annotations embedded in the manual
   ============================================================ */
console.log("\n[8] Audit annotations");

t("manual states the tool runs steps 1 and 2 of the chapter 6 procedure", () => {
  assert.match(d.body.textContent, /calibrator runs steps 1 and 2/);
});
t("KDMA is marked as an extension beyond the dissertation, on-page and in sources", () => {
  const body = d.body.textContent;
  assert.match(body, /extension beyond the dissertation/);
  assert.match(body, /does not appear in the dissertation's chapters/);
});
t("sources appendix distinguishes dissertation-cited cases from tool-verified ones", () => {
  assert.match(d.body.textContent, /verified for this tool and extend the\s+dissertation's citation record/);
});
t("how-the-number-is-built documents the effective 4.25 raw cutoff", () => {
  assert.match(d.body.textContent, /raw value from 4\.25 upward reads 4\.3/);
});
t("manual documents the stale flag, the last-result rule, and the Module B pairing", () => {
  const body = d.body.textContent;
  assert.match(body, /Inputs changed,\s+calibrate again/);
  assert.match(body, /keeps following the last calibrated result/);
  assert.match(body, /Module B, the Claimant-Side Tool Evaluator/);
  assert.match(body, /Drop the harm to Significant and it leaves the band too/);
});

t("a #ccd= hash from a companion tool prefills, syncs the guided answers, and calibrates", () => {
  const payload = { desc: "Hash import check", f1: 5, vuln: 5, f2: 5, f3: 2,
                    a1: 4, a2: 4, a3: 5, a4: 3, a5: 4, a6: 5, kdma: 2, tension: "A vs B" };
  const b64 = Buffer.from(unescape(encodeURIComponent(JSON.stringify(payload))), "binary")
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fresh = new JSDOM(html, { runScripts: "dangerously",
    url: "http://localhost/due-process-calibrator.html#ccd=" + b64 });
  const fd = fresh.window.document;
  assert.equal(fd.querySelector("#sys-desc").value, "Hash import check");
  assert.equal(fd.querySelector("#f1").value, "5");
  assert.equal(fd.querySelector("#a4").value, "3");
  assert.equal(fd.querySelector("#kdma-level").value, "2");
  assert.equal(fd.querySelector("#gq-a3").value, "5", "guided answers synced");
  assert.equal(fd.querySelector("#results").hidden, false, "auto-calibrated");
  assert.equal(fd.querySelector("#verdict").textContent, "Level 3+ · Maximal duty");
});

t("a malformed #ccd= hash loads the page normally", () => {
  const fresh = new JSDOM(html, { runScripts: "dangerously",
    url: "http://localhost/x.html#ccd=%%%not-base64%%%" });
  assert.equal(fresh.window.document.querySelector("#results").hidden, true);
  assert.equal(fresh.window.document.querySelectorAll(".range").length, 10);
});

t("a kdma-only payload (the Elicitor's) prefills Step 4 without auto-calibrating", () => {
  const payload = { desc: "Elicited by Module C", kdma: 2, tension: "Program integrity vs Access to subsistence" };
  const b64 = Buffer.from(unescape(encodeURIComponent(JSON.stringify(payload))), "binary")
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fresh = new JSDOM(html, { runScripts: "dangerously",
    url: "http://localhost/due-process-calibrator.html#ccd=" + b64 });
  const fd = fresh.window.document;
  assert.equal(fd.querySelector("#sys-desc").value, "Elicited by Module C");
  assert.equal(fd.querySelector("#kdma-level").value, "2");
  assert.equal(fd.querySelector("#kdma-text").value, "Program integrity vs Access to subsistence");
  assert.equal(fd.querySelector("#gq-kdma").value, "2", "guided answer synced");
  assert.equal(fd.querySelector("#f1").value, "3", "sliders untouched at defaults");
  assert.equal(fd.querySelector("#results").hidden, true, "no result until the person calibrates");
});

/* ============================================================
   9. Guided assessment (Step 1.5)
   ============================================================ */
console.log("\n[9] Guided assessment");

function answer(target, val) {
  const s = d.querySelector('#gq-' + target);
  s.value = String(val);
  fire(s, "change");
}

t("G1  renders eleven mapped selects plus the tension text question", () => {
  assert.equal(d.querySelectorAll("#guided select[data-target]").length, 11);
  const targets = Array.from(d.querySelectorAll("#guided select[data-target]"))
    .map((s) => s.getAttribute("data-target")).sort();
  assert.deepEqual(targets, ["a1","a2","a3","a4","a5","a6","f1","f2","f3","kdma","vuln"]);
  assert.ok(d.querySelector("#gq-tension"));
  assert.equal(d.querySelectorAll("#guided .g-tag").length, 12);
});

t("G2  answering a question moves its slider, repaints the output, and flashes the note", () => {
  answer("f1", 5);
  assert.equal($("#f1").value, "5");
  assert.equal($("#out-f1").textContent.replace(/\u00b7/g, "·"), "5 · Subsistence-level");
  assert.equal($("#guide-note").hidden, false);
});

t("G3  the placeholder answer changes nothing", () => {
  $("#f2").value = "2"; fire($("#f2"), "input");
  const before = $("#f2").value;
  const s = d.querySelector("#gq-f2");
  s.value = ""; fire(s, "change");
  assert.equal($("#f2").value, before, "empty answer must not move the slider");
});

t("G4  moving a slider by hand syncs back into the matching question", () => {
  $("#a5").value = "4"; fire($("#a5"), "input");
  assert.equal(d.querySelector("#gq-a5").value, "4");
});

t("G5  loading a profile fills every question with the profile's values", () => {
  d.querySelector('[data-profile="fraud"]').click();
  assert.equal(d.querySelector("#gq-a3").value, "5");
  assert.equal(d.querySelector("#gq-f3").value, "2");
  assert.equal(d.querySelector("#gq-kdma").value, "2");
  assert.equal(d.querySelector("#gq-tension").value, "Fraud prevention vs access to benefits");
});

t("G6  the KDMA answer and Step 4 stay mirrored in both directions", () => {
  answer("kdma", 1);
  assert.equal($("#kdma-level").value, "1");
  $("#kdma-level").value = "2"; fire($("#kdma-level"), "change");
  assert.equal(d.querySelector("#gq-kdma").value, "2");
  const gt = d.querySelector("#gq-tension");
  gt.value = "cost vs adequacy"; fire(gt, "input");
  assert.equal($("#kdma-text").value, "cost vs adequacy");
  $("#kdma-text").value = "adequacy vs cost"; fire($("#kdma-text"), "input");
  assert.equal(gt.value, "adequacy vs cost");
});

t("G7  the toggle collapses the questions, relabels itself, and restores", () => {
  const btn = $("#btn-guide-toggle"), body = $("#guide-body");
  assert.equal(body.hidden, false);
  btn.click();
  assert.equal(body.hidden, true);
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.match(btn.textContent, /Use the guided questions/);
  btn.click();
  assert.equal(body.hidden, false);
  assert.match(btn.textContent, /Fill in manually instead/);
});

/* G8 · end-to-end mapping proof: starting from the booking profile,
   answering the twelve questions with the fraud values must reproduce
   the fraud calibration exactly (5.0, Maximal — hand-computed in [2]). */
t("G8  answering all questions with the fraud values reproduces the fraud calibration", () => {
  d.querySelector('[data-profile="booking"]').click(); // deliberately different start
  const fraud = { f1: 4, vuln: 5, f2: 5, f3: 2, a1: 5, a2: 5, a3: 5, a4: 3, a5: 5, a6: 5, kdma: 2 };
  Object.keys(fraud).forEach((k) => answer(k, fraud[k]));
  const gt = d.querySelector("#gq-tension");
  gt.value = "Fraud prevention vs access to benefits"; fire(gt, "input");
  calibrate();
  assert.equal(scoreLine(), "5.0 / 5 duty intensity on the study scale");
  assert.equal(verdict(), "Level 3+ · Maximal duty");
  assert.match($("#analysis").textContent, /as a core trade-off/);
});

t("G9  manual documents the guided step and the no-gap-filling rule", () => {
  const body = d.body.textContent;
  assert.match(body, /Step 1\.5, the guided assessment/);
  assert.match(body, /the meter never fills gaps for you/);
});

/* ============================================================
   Summary
   ============================================================ */
console.log("");
t("page produced no jsdom/console errors during the whole run", () => {
  assert.deepEqual(pageErrors, []);
});

console.log("\n============================================");
console.log(" passed: " + passed + "   failed: " + failed);
console.log("============================================");
process.exit(failed ? 1 : 0);
