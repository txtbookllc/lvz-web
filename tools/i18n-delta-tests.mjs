#!/usr/bin/env node
/*
 * Negative suite for §0.7 --delta — run it after ANY change to the extractor or to --delta.
 *
 *   node tools/i18n-delta-tests.mjs
 *
 * Why this suite is unusually careful, in the plan's own words: a correct delta and a delta
 * that silently drops changed units BOTH look like "not many units to translate". The
 * failure is indistinguishable from success by inspection, and it fails toward shipping
 * stale translations. Nothing about a short list tells you whether it is short because the
 * edit was small or because the tool lost something.
 *
 * So this suite never asserts "the delta is non-empty". Every case asserts the EXACT count,
 * the EXACT ids, and the classification — and re-asserts the arithmetic invariant
 * (english == unchanged + send) that --delta also checks internally.
 *
 * The five cases the plan requires are [3]-[7]: a reworded unit, a moved unit, a brand-new
 * unit, a deleted unit, and a unit whose English is unchanged but whose translation is
 * missing. The last one is the reason --delta reads three files instead of two.
 *
 * Perturbations are exact substring replacements inside try/finally, never whole-file
 * rewrites: the tree is CRLF and a split/rejoin would strip \r, which git hides but
 * --check's byte comparison would surface as every language going STALE at once. The run
 * ends by asserting git status is unchanged.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = join(ROOT, "tools", "i18n-check.mjs");

let pass = 0, failed = 0;
const ok = (name, cond, detail = "") => {
    if (cond) { pass++; console.log(`  ok    ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail}`); }
};
const gitStatus = () => execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
const before = gitStatus();

function delta(lang, page) {
    const args = [TOOL, "--delta", lang, ...(page ? [page] : [])];
    try {
        const out = execFileSync("node", args, { cwd: ROOT, encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
        return JSON.parse(out);
    } catch (e) {
        return { crashed: true, detail: `${e.status}: ${(e.stdout || "").slice(0, 200)}${(e.message || "").slice(0, 300)}` };
    }
}

/* The invariant, re-checked from outside the tool on every single case. */
function invariantHolds(page) {
    const s = page?.summary;
    return !!s && s.english === s.unchanged + s.send;
}

const PRICING = "pricing.html";
const CONTACT = "contact.html";
const LI_ID = "#main/section[2]/div/div/div/ul/li";
const OPT7 = "#topic/option[7]";

/* ---------------------------------------------------------------- 1. healthy baseline */
console.log("\n[1] a healthy tree owes nothing — the state every other case is measured against");
let baselineOk = true;
for (const lang of ["es", "ar", "ja", "th"]) {
    const d = delta(lang);
    const pages = Object.entries(d.pages ?? {});
    const dirty = pages.filter(([, p]) => p.summary.send !== 0);
    const broken = pages.filter(([, p]) => !invariantHolds(p));
    ok(`--delta ${lang}: 0 units to send across all 7 pages`,
        !d.crashed && pages.length === 7 && dirty.length === 0,
        `  ${d.detail ?? dirty.map(([n, p]) => `${n}:${p.summary.send}`).join(", ")}`);
    ok(`--delta ${lang}: invariant english == unchanged + send holds on every page`,
        broken.length === 0, `  ${broken.map(([n]) => n).join(", ")}`);
    if (dirty.length) baselineOk = false;
}
ok("baseline is clean, so every count below is attributable to the perturbation", baselineOk);

/* An unstarted language must return EVERYTHING — the same kit then serves bulk
 * translation and maintenance, and a delta that returned 0 here would mean a new
 * language silently shipped untranslated. */
const fresh = delta("sv", PRICING);
ok("an unstarted language owes its entire page (delta degenerates to a full extract)",
    fresh.pages?.[PRICING]?.summary.unchanged === 0
    && fresh.pages[PRICING].summary.send === fresh.pages[PRICING].summary.english
    && fresh.pages[PRICING].summary.send > 40,
    `  ${JSON.stringify(fresh.pages?.[PRICING]?.summary)}`);
ok("...and classifies it all as new, with no phantom carry-over",
    Object.keys(fresh.pages[PRICING].summary.byChange).join() === "new");

/* ---------------------------------------------------------------- 2. perturbation driver */
function perturb(rel, from, to, name, assert) {
    const path = join(ROOT, rel);
    const orig = readFileSync(path, "utf8");
    if (!orig.includes(from)) {
        failed++; console.log(`  FAIL  ${name}  (anchor not found in ${rel}: ${JSON.stringify(from)})`);
        return;
    }
    if (orig.split(from).length !== 2) {
        failed++; console.log(`  FAIL  ${name}  (anchor is not unique in ${rel})`);
        return;
    }
    try {
        writeFileSync(path, orig.replace(from, to), "utf8");
        assert(name);
    } finally {
        writeFileSync(path, orig, "utf8");
        ok(`${name} :: restored byte-identically`, readFileSync(path, "utf8") === orig);
    }
}

const unitFor = (p, id) => (p.units ?? []).find((u) => u.at.includes(id));

/* ---------------------------------------------------------------- 3. reworded */
console.log("\n[3] a REWORDED unit — same id, new content, old translation as context");
perturb(PRICING, "<li>Every future update included</li>", "<li>Every future update included, forever</li>",
    "a reworded English unit is sent, with the old English and old translation attached",
    (n) => {
        const p = delta("es", PRICING).pages[PRICING];
        const u = unitFor(p, `${LI_ID}[4]`);
        ok(n, p.summary.send === 1 && u?.change === "reworded"
            && u.text === "Every future update included, forever"
            && u.was?.en === "Every future update included"
            && /actualizaciones futuras/.test(u.was?.tr ?? ""),
            `  summary=${JSON.stringify(p.summary)} unit=${JSON.stringify(u)?.slice(0, 240)}`);
        ok("  reworded: invariant holds", invariantHolds(p));
        ok("  reworded: exactly ONE unit moves — the other 50 are carried over",
            p.units.length === 1 && p.summary.unchanged === p.summary.english - 1,
            `  ${JSON.stringify(p.summary)}`);
    });

/* ---------------------------------------------------------------- 4. moved */
console.log("\n[4] a MOVED unit — content re-pairs by hash, and needs no model at all");
perturb(PRICING,
    "<li>Every future update included</li>\r\n                            <li>Use it on your personal Windows PCs</li>",
    "<li>Use it on your personal Windows PCs</li>\r\n                            <li>Every future update included</li>",
    "two swapped units are MOVED, each carrying the existing translation to reuse",
    (n) => {
        const p = delta("es", PRICING).pages[PRICING];
        const a = unitFor(p, `${LI_ID}[4]`), b = unitFor(p, `${LI_ID}[5]`);
        ok(n, p.summary.send === 2 && a?.change === "moved" && b?.change === "moved"
            && /personales/.test(a?.reuse ?? "") && /actualizaciones futuras/.test(b?.reuse ?? ""),
            `  summary=${JSON.stringify(p.summary)}\n        a=${JSON.stringify(a)?.slice(0, 200)}\n        b=${JSON.stringify(b)?.slice(0, 200)}`);
        ok("  moved: invariant holds", invariantHolds(p));
        ok("  moved: every moved unit carries a reuse string, so zero model tokens are needed",
            p.units.every((u) => u.change !== "moved" || typeof u.reuse === "string" && u.reuse.length));
    });

/* ---------------------------------------------------------------- 5. brand new */
console.log("\n[5] a BRAND-NEW unit — no prior English anywhere, so no context to give");
perturb(PRICING, "<li>30-day money-back guarantee</li>",
    "<li>30-day money-back guarantee</li>\r\n                            <li>Priority email support for one year</li>",
    "an inserted English unit is sent as new, with no was/reuse context",
    (n) => {
        const p = delta("es", PRICING).pages[PRICING];
        const u = (p.units ?? []).find((x) => x.text === "Priority email support for one year");
        ok(n, p.summary.send === 1 && u?.change === "new" && !u.was && !u.reuse,
            `  summary=${JSON.stringify(p.summary)} unit=${JSON.stringify(u)?.slice(0, 200)}`);
        ok("  new: invariant holds", invariantHolds(p));
        ok("  new: appending does not disturb its siblings' ids",
            p.units.length === 1, `  also sent: ${p.units.map((x) => x.id).join(", ")}`);
    });

/* ---------------------------------------------------------------- 6. deleted */
console.log("\n[6] a DELETED unit — a delta that only ever adds would leave it behind");
perturb(PRICING, "                            <li>No account required</li>\r\n", "",
    "a removed English unit is reported as deleted, so the translation drops it too",
    (n) => {
        const p = delta("es", PRICING).pages[PRICING];
        ok(n, (p.deleted ?? []).length === 1 && p.summary.deleted === 1,
            `  deleted=${JSON.stringify(p.deleted)} summary=${JSON.stringify(p.summary)}`);
        ok("  deleted: invariant holds", invariantHolds(p));
        /* Removing a middle sibling shifts the ids after it. Those are re-paired by hash
         * and come back as `moved` WITH their translations — not as expensive rewrites.
         * This is the property that makes positional ids affordable. */
        const shifted = (p.units ?? []).filter((u) => u.change === "moved");
        ok("  deleted: the ids it shifted come back as moved-with-reuse, not as new work",
            shifted.length > 0 && shifted.every((u) => typeof u.reuse === "string" && u.reuse.length)
            && (p.units ?? []).every((u) => u.change === "moved"),
            `  changes: ${JSON.stringify(p.summary.byChange)}`);
    });

/* ---------------------------------------------------------------- 7. THE KILLER CASE */
console.log("\n[7] English UNCHANGED but the translation is MISSING a unit");
console.log("    (an English-only diff reports zero here and ships the page untranslated)");
perturb(`es/${CONTACT}`, '<option value="terms">Pregunta sobre los términos</option>\r\n', "",
    "a unit absent from the translation is sent even though English never changed",
    (n) => {
        const p = delta("es", CONTACT).pages[CONTACT];
        const u = unitFor(p, OPT7);
        ok(n, p.summary.send === 1 && u?.change === "untranslated" && u.text === "Terms question",
            `  summary=${JSON.stringify(p.summary)} unit=${JSON.stringify(u)?.slice(0, 200)}`);
        ok("  untranslated: invariant holds", invariantHolds(p));
        /* The proof that this case needs three files: English is byte-identical to the
         * snapshot, so the English-side diff is empty and a two-file delta sees nothing. */
        const enNow = readFileSync(join(ROOT, CONTACT), "utf8");
        const snap = readFileSync(join(ROOT, "i18n", "snapshots", "es", CONTACT), "utf8");
        ok("  untranslated: English is byte-identical to the snapshot — a two-file delta would say ZERO",
            enNow === snap);
    });

/* ---------------------------------------------------------------- 8. no false negatives */
console.log("\n[8] the failure mode itself — a changed unit must never be quietly absent");
/* Every one of the four content pages, perturbed at a different KIND of unit, asserting
 * the specific id comes back. A delta that dropped one kind (attributes, JSON-LD) would
 * pass all the text-node cases above and still ship stale translations. */
perturb("index.html", "Low Vision Zoom: a calm screen magnifier for Windows.",
    "Low Vision Zoom: a calm screen magnifier for Windows 11.",
    "a changed META ATTRIBUTE unit is not dropped",
    (n) => {
        const p = delta("es", "index.html").pages["index.html"];
        const u = (p.units ?? []).find((x) => x.kind === "attr");
        ok(n, p.summary.send >= 1 && u?.change === "reworded"
            && /meta\[description\]@content/.test(u.id),
            `  ${JSON.stringify(p.summary)} unit=${JSON.stringify(u)?.slice(0, 160)}`);
        ok("  attr: invariant holds", invariantHolds(p));
    });

perturb("faq.html", '"name": "Is there a cheaper alternative to ZoomText?"',
    '"name": "Is there a lower-cost alternative to ZoomText?"',
    "a changed JSON-LD unit is not dropped",
    (n) => {
        const p = delta("es", "faq.html").pages["faq.html"];
        const ld = (p.units ?? []).filter((u) => u.kind === "ld");
        ok(n, ld.length === 1 && ld[0].change === "reworded"
            && ld[0].text === "Is there a lower-cost alternative to ZoomText?",
            `  ${JSON.stringify(p.summary)} kinds=${JSON.stringify((p.units ?? []).map((u) => u.kind))}`);
        ok("  ld: invariant holds", invariantHolds(p));
    });

/* A unit that is deduped across several ids must report ALL the ids that need work —
 * dropping one would leave a visible string untranslated while the delta looked complete. */
console.log("\n[9] deduped units must name every id that needs work");
const dedup = delta("sv", "compare.html").pages["compare.html"];
const multi = (dedup.units ?? []).filter((u) => u.at.length > 1);
ok("compare.html has units shared by several ids (repeated table cells)",
    multi.length > 0, `  ${multi.length}`);
ok("every shared id is listed in `at`, and the totals count ids not units",
    dedup.summary.send === (dedup.units ?? []).reduce((n, u) => n + u.at.length, 0)
    && dedup.summary.send > dedup.summary.units,
    `  send=${dedup.summary.send} units=${dedup.summary.units}`);

/* Pins a MEASURED gap between the plan and the extractor, so it is a tracked decision
 * rather than a surprise. Plan §0.5 says identical English strings dedupe into one unit,
 * and cites faq.html's JSON-LD answers duplicating the visible <details> answers (~24 of
 * 32) as the payoff. They do NOT dedupe: extractUnits keys on kind + text + tags, and an
 * `ld` unit is never merged with a `text` unit. Measured: faq.html 96 ids / 96 units, zero
 * deduped, while the bare answer text really does occur twice in the file.
 *
 * Not "fixed" here, because merging across kinds is an ESCAPING hazard, not a one-line
 * change: an ld unit's raw slice is a JSON string (\" and \\) and a text unit's carries
 * inline markup and entities, so a merged unit cannot splice into both without a
 * per-kind re-encode — which is exactly the normalize-then-re-encode round trip the
 * raw-slice rule forbids. Left as a decision for Jonathan; see docs/i18n-wave2.md.
 *
 * If someone later implements cross-kind dedupe, this test fails and forces the round-trip
 * gate to be re-proven. That is the intent. */
console.log("\n[9b] tracked gap — JSON-LD and visible text do NOT dedupe (plan §0.5 expects they would)");
const faq = delta("sv", "faq.html").pages["faq.html"];
ok("faq.html emits one unit per id — no cross-kind dedupe today",
    faq.summary.units === faq.summary.send && faq.summary.units === 96,
    `  ${JSON.stringify(faq.summary)}`);
const faqEn = readFileSync(join(ROOT, "faq.html"), "utf8");
ok("...even though an answer string demonstrably occurs both as JSON-LD and as visible text",
    faqEn.split("Is there a cheaper alternative to ZoomText?").length - 1 === 2);

/* ---------------------------------------------------------------- 10. tree integrity */
console.log("\n[10] tree integrity");
ok("git status is exactly what it was before the run", gitStatus() === before,
    `\n        before: ${JSON.stringify(before)}\n        after:  ${JSON.stringify(gitStatus())}`);

console.log(`\n${pass} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
