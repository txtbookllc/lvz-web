#!/usr/bin/env node
/*
 * Negative suite for §0.9 i18n-status.mjs — run it after ANY change to that tool
 * or to the artifact layout it probes.
 *
 *   node tools/i18n-status-tests.mjs
 *
 * Why this file exists. On a healthy tree the status matrix is entirely green,
 * and a status tool that reported DONE unconditionally would produce byte-for-byte
 * the same output as one that works. That is the same property that put the 0.6
 * suite in the repo, and it is worse here: this tool's whole purpose is to be
 * trusted without being re-derived, and the dispatch rule "never re-dispatch a
 * language whose output exists and validates" makes it the authority deciding
 * whether an agent runs. A falsely-green cell silently SKIPS work.
 *
 * So every one of the eight columns is flipped independently. Testing one probe
 * would leave the other seven indistinguishable from hard-coded `true`.
 *
 * Perturbations are exact substring replacements or renames inside try/finally,
 * never whole-file rewrites: the working tree is CRLF and a split/rejoin would
 * strip \r, which git hides (autocrlf normalizes on add) but --check's byte
 * comparison surfaces as every language going STALE at once. The run ends by
 * asserting `git status` is unchanged in BOTH repos, since this suite is the
 * first thing in the wave to perturb the app repo as well as the website.
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = join(ROOT, "tools", "i18n-status.mjs");
const { shotPrefix, shotPrefixCollisions, findAppRepo } =
    await import(pathToFileURL(TOOL).href);

const APP = findAppRepo();
if (!APP) {
    console.error("app repo not found — this suite needs both repos; pass LVZ_APP_REPO");
    process.exit(2);
}

let pass = 0, failed = 0;
const ok = (name, cond, detail = "") => {
    if (cond) { pass++; console.log(`  ok    ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail}`); }
};
const gitStatus = (cwd) =>
    execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim();
const webBefore = gitStatus(ROOT), appBefore = gitStatus(APP);

/* Run the tool as a subprocess and parse --json. --no-check unless a test needs
 * the validator column, because running it 18x per invocation is the slow part. */
function status(extra = []) {
    const args = [TOOL, "--json", ...extra];
    let out;
    try { out = execFileSync("node", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); }
    catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
    try { return JSON.parse(out); }
    catch { return { parseError: out.slice(0, 400) }; }
}
const row = (st, code) => st.languages.find((l) => l.code === code);

/* ---------------------------------------------------------------- 1. the positive gate */
console.log("\n[1] the plan's gate — the current 18 must all report fully done");
const base = status(["--no-check"]);
ok("--json parses", !base.parseError, `  ${base.parseError}`);
const registered = base.languages.filter((l) => l.registered);
ok(`${registered.length} languages registered`, registered.length === 18,
    `  got ${registered.length}`);
/* --no-check leaves the check column unmeasured, so completeness is asserted
 * per-column here and end-to-end (with the validator) in test [2]. */
for (const colName of ["pages", "snapshots", "resx", "email", "labels", "store", "art"]) {
    const bad = registered.filter((l) => !(l[colName].known && l[colName].have === l[colName].want));
    ok(`every registered language is complete for "${colName}"`, bad.length === 0,
        `  incomplete: ${bad.map((l) => l.code).join(", ")}`);
}
const wave2Rows = base.languages.filter((l) => !l.registered);
ok("all 18 wave-2 languages appear as unregistered rows", wave2Rows.length === 18,
    `  got ${wave2Rows.length}`);
ok("an unregistered language is never reported complete",
    wave2Rows.every((l) => l.complete === false));

console.log("\n[2] with the real validator — every registered language DONE");
const full = status([]);
const notDone = full.languages.filter((l) => l.registered && !l.complete);
ok("18/18 registered languages complete, validator included", notDone.length === 0,
    `  not done: ${notDone.map((l) => l.code).join(", ")}`);
ok("no English findings", full.englishFindings.length === 0,
    `  ${JSON.stringify(full.englishFindings.slice(0, 2))}`);

/* ---------------------------------------------------------------- 2. every column flips */

/* Move a file aside, run, restore. Rename rather than delete so nothing can be
 * lost if this process dies mid-test. */
function withMoved(path, name, assert, extra = ["--no-check"]) {
    const stash = `${path}.status-test-stash`;
    if (!existsSync(path)) {
        failed++; console.log(`  FAIL  ${name}  (anchor missing: ${path})`);
        return;
    }
    const bytes = readFileSync(path);
    try {
        renameSync(path, stash);
        assert(status(extra), name);
    } finally {
        if (existsSync(stash)) renameSync(stash, path);
        ok(`${name} :: restored byte-identically`,
            existsSync(path) && Buffer.compare(readFileSync(path), bytes) === 0);
    }
}

function withEdited(path, from, to, name, assert, extra = ["--no-check"]) {
    const orig = readFileSync(path, "utf8");
    if (!orig.includes(from)) {
        failed++; console.log(`  FAIL  ${name}  (anchor not found in ${path}: ${JSON.stringify(from)})`);
        return;
    }
    try {
        writeFileSync(path, orig.replace(from, to), "utf8");
        assert(status(extra), name);
    } finally {
        writeFileSync(path, orig, "utf8");
        ok(`${name} :: restored byte-identically`, readFileSync(path, "utf8") === orig);
    }
}

const cellIs = (st, code, col, have, want) => {
    const c = row(st, code)?.[col];
    return !!c && c.known && c.have === have && c.want === want;
};
const notComplete = (st, code) => row(st, code)?.complete === false;

console.log("\n[3] each of the eight columns must be able to go red, independently");

withMoved(join(ROOT, "es", "faq.html"), "a missing site page drops the pages count",
    (st, n) => ok(n, cellIs(st, "es", "pages", 6, 7) && notComplete(st, "es"),
        `  got ${JSON.stringify(row(st, "es")?.pages)}`));

withMoved(join(ROOT, "i18n", "snapshots", "es", "faq.html"),
    "a missing snapshot drops the snap count",
    (st, n) => ok(n, cellIs(st, "es", "snapshots", 6, 7) && notComplete(st, "es"),
        `  got ${JSON.stringify(row(st, "es")?.snapshots)}`));

withMoved(join(APP, "Strings.es.resx"), "a missing resx flips the resx cell",
    (st, n) => ok(n, cellIs(st, "es", "resx", 0, 1) && notComplete(st, "es")));

withMoved(join(APP, "store-listing-i18n", "es.md"),
    "a missing store listing flips the store cell",
    (st, n) => ok(n, cellIs(st, "es", "store", 0, 1) && notComplete(st, "es")));

withEdited(join(APP, "branding", "howto-labels.json"),
    '"es": { "in":', '"es-MOVED": { "in":',
    "a missing howto-labels key drops lbls to 1/2",
    (st, n) => ok(n, cellIs(st, "es", "labels", 1, 2) && notComplete(st, "es"),
        `  got ${JSON.stringify(row(st, "es")?.labels)}`));

withEdited(join(APP, "fulfillment", "src", "i18n.ts"),
    '"en", "ar", "de", "es",', '"en", "ar", "de",',
    "a language absent from SUPPORTED_LANGS flips the email cell",
    (st, n) => ok(n, cellIs(st, "es", "email", 0, 1) && notComplete(st, "es")));

/* An 11-field template with 10 fields is the failure a mere existence check
 * would wave through — the DONE-iff rule says "all 11 fields". */
withEdited(join(APP, "fulfillment", "src", "i18n.ts"),
    'subject: "Tu clave de licencia de {product}"', 'subjectX: "Tu clave de licencia de {product}"',
    "an email template MISSING ONE FIELD is not done (existence is not enough)",
    (st, n) => ok(n, cellIs(st, "es", "email", 0, 1) && notComplete(st, "es")));

/* The DONE-iff rules say a resx or listing is done when it exists AND PASSES its validator.
 * Counting files would call a corrupt artifact done — and because this tool decides whether
 * an agent is dispatched, that means silently shipping the corruption. */
console.log("\n[3b] existence is not enough — §0.10's validators gate the resx and store cells");

withEdited(join(APP, "Strings.es.resx"),
    '<data name="Tray_Exit" xml:space="preserve"><value>Salir</value></data>', "",
    "a PRESENT resx that fails key parity reads red, not done",
    (st, n) => ok(n, cellIs(st, "es", "resx", 0, 1) && notComplete(st, "es"),
        `  got ${JSON.stringify(row(st, "es")?.resx)}`));

withEdited(join(APP, "store-listing-i18n", "es.md"), "\n6. Ingeniería sólida de Windows", "\nX. Ingeniería sólida de Windows",
    "a PRESENT listing that breaks a Store budget reads red, not done",
    (st, n) => ok(n, cellIs(st, "es", "store", 0, 1) && notComplete(st, "es"),
        `  got ${JSON.stringify(row(st, "es")?.store)}`));

/* And if the validator itself cannot run, those columns must go UNKNOWN — never quietly
 * fall back to "the file is there, call it done". */
withMoved(join(APP, "tools", "i18n-validate.mjs"),
    "without the validator, resx/store go unknown rather than silently downgrading to existence",
    (st, n) => {
        const r = row(st, "es");
        ok(n, r && r.resx.known === false && r.store.known === false && r.complete === false,
            `  resx=${JSON.stringify(r?.resx)} store=${JSON.stringify(r?.store)}`);
        ok("  ...while the columns that do not depend on it stay measured",
            r?.pages.known && r.email.known && r.labels.known);
    });

console.log("\n[4] artwork — all four sources must be probed, not just the first");
withMoved(join(ROOT, "media", "howto-desktop.es.svg"),
    "a missing WEB SVG drops the art count",
    (st, n) => ok(n, cellIs(st, "es", "art", 13, 14) && row(st, "es").artDetail.web === 2,
        `  got ${JSON.stringify(row(st, "es")?.artDetail)}`));
withMoved(join(ROOT, "media", "store-badge", "es.svg"),
    "a missing STORE BADGE drops the art count",
    (st, n) => ok(n, cellIs(st, "es", "art", 13, 14) && row(st, "es").artDetail.badge === 0,
        `  got ${JSON.stringify(row(st, "es")?.artDetail)}`));
withMoved(join(APP, "Assets", "howto-desktop-dark.es.gif"),
    "a missing APP GIF drops the art count",
    (st, n) => ok(n, cellIs(st, "es", "art", 13, 14) && row(st, "es").artDetail.gifs === 3,
        `  got ${JSON.stringify(row(st, "es")?.artDetail)}`));
withMoved(join(APP, "store-listing-i18n", "screenshots", "per-language", "spanish_about.png"),
    "a missing STORE PNG drops the art count",
    (st, n) => ok(n, cellIs(st, "es", "art", 13, 14) && row(st, "es").artDetail.shots === 5,
        `  got ${JSON.stringify(row(st, "es")?.artDetail)}`));

console.log("\n[5] the check column is the real validator, not a file count");
/* All seven files present, all artifacts present — and still not done, because
 * the page leaks English. This is the test that separates a status tool from a
 * directory listing. */
withEdited(join(ROOT, "es", "compare.html"), "<h2>Fuentes</h2>", "<h2>Sources</h2>",
    "a leaking page is NOT done even with every file present",
    (st, n) => {
        const r = row(st, "es");
        ok(n, r && r.pages.have === 7 && r.check.have === 0 && r.complete === false,
            `  pages=${JSON.stringify(r?.pages)} check=${JSON.stringify(r?.check)}`);
        ok("and the finding is surfaced on the row",
            (r?.findings ?? []).some((f) => /untranslated text unit/.test(f.msg)),
            `  findings: ${JSON.stringify((r?.findings ?? []).slice(0, 1))}`);
    }, []);

/* A stale page is the other failure a file count cannot see. */
withEdited(join(ROOT, "i18n", "snapshots", "es", "pricing.html"),
    "<title>", "<title data-status-test=\"1\">",
    "a STALE translation is NOT done (snapshot diverged from English)",
    (st, n) => ok(n, row(st, "es")?.check.have === 0 && notComplete(st, "es")
        && (row(st, "es").findings ?? []).some((f) => /STALE/.test(f.msg)),
        `  check=${JSON.stringify(row(st, "es")?.check)}`), []);

/* ---------------------------------------------------------------- 3. unmeasured != absent */
console.log("\n[6] unmeasured is not absent — the rule that keeps the tool honest");
/* Run WITH the validator, so the check column is known-good and the app-side
 * columns are the only unknowns — otherwise "not complete" proves nothing. */
const blind = status(["--app", join(ROOT, "tools")]);
const es = row(blind, "es");
ok("a wrong --app leaves app-side columns UNKNOWN, not zero",
    es && [es.resx, es.email, es.labels, es.store, es.art].every((c) => c.known === false),
    `  ${JSON.stringify({ resx: es?.resx, art: es?.art })}`);
ok("an explicit --app is authoritative — it never falls back to the sibling default",
    blind.appRepo === null, `  appRepo=${JSON.stringify(blind.appRepo)}`);
ok("web-side columns are still measured when the app repo is missing",
    es && es.pages.known && es.pages.have === 7 && es.check.known && es.check.have === 1,
    `  pages=${JSON.stringify(es?.pages)} check=${JSON.stringify(es?.check)}`);
ok("unknown app columns alone are enough to withhold DONE", es?.complete === false);
ok("the artwork detail still reports the web half it CAN see",
    es?.artDetail.web === 3 && es?.artDetail.gifs === null,
    `  ${JSON.stringify(es?.artDetail)}`);

/* ---------------------------------------------------------------- 4. the naming collision */
console.log("\n[7] Store screenshot prefixes are derived from English names — collisions");
/* The rule must match packaging/generate-store-hero.ps1 EXACTLY — first word of englishName,
 * lowercased — because that script writes the files this tool goes looking for. A tool that
 * derives its own convention agrees on today's data and diverges on tomorrow's. */
for (const [name, want] of [
    ["Spanish", "spanish"],
    ["Chinese (Simplified)", "chinese"],
    ["Chinese (Traditional)", "chinese"],
    ["Norwegian Bokmål", "norwegian"],   // NOT norwegian_bokmål — the generator takes word 1
    ["Filipino", "filipino"],
]) ok(`shotPrefix(${JSON.stringify(name)}) -> ${want}`, shotPrefix(name) === want,
    `  got ${JSON.stringify(shotPrefix(name))}`);

/* storeShotName is the agreed fix for the collision: it overrides the derived name. */
ok("storeShotName overrides the derived first-word name",
    shotPrefix({ englishName: "Chinese (Traditional)", storeShotName: "chinese_traditional" })
    === "chinese_traditional");
ok("a language without storeShotName still derives normally",
    shotPrefix({ englishName: "Swedish" }) === "swedish");
ok("the override resolves the zh / zh-Hant collision",
    shotPrefixCollisions(new Map([
        ["zh", shotPrefix({ englishName: "Chinese (Simplified)" })],
        ["zh-Hant", shotPrefix({ englishName: "Chinese (Traditional)", storeShotName: "chinese_traditional" })],
    ])).length === 0);

ok("zh and zh-Hant collide on the same prefix",
    shotPrefixCollisions(new Map([["zh", "chinese"], ["zh-Hant", "chinese"], ["es", "spanish"]]))
        .some(([p, codes]) => p === "chinese" && codes.length === 2));
ok("distinct prefixes do not report a collision",
    shotPrefixCollisions(new Map([["zh", "chinese"], ["es", "spanish"]])).length === 0);
ok("the healthy tree currently has NO collision", base.collisions.length === 0,
    `  ${JSON.stringify(base.collisions)}`);

/* End-to-end: registering the colliding language must make the tool say so.
 * This is the wiring test — the unit tests above would pass even if buildStatus
 * never called shotPrefixCollisions. */
const langsPath = join(ROOT, "i18n", "languages.json");
withEdited(langsPath,
    '{ "code": "th",',
    '{ "code": "zh-Hant", "hreflang": "zh-Hant", "nativeName": "X", "switcherLabel": "X", "englishName": "Chinese (Traditional)", "ogLocale": "zh_TW", "paddleLocale": "en", "turnstileLang": "auto", "dir": "ltr" },\n    { "code": "th",',
    "registering zh-Hant WITHOUT the override surfaces the collision end-to-end",
    (st, n) => ok(n, st.collisions.some((c) => c.prefix === "chinese"
        && c.codes.includes("zh") && c.codes.includes("zh-Hant")),
        `  ${JSON.stringify(st.collisions)}`));

/* ...and the agreed fix silences it. Registering zh-Hant WITH storeShotName must produce no
 * collision and must point the tool at chinese_traditional_*.png — the same files
 * generate-store-hero.ps1 will write, since it reads the same field. */
withEdited(langsPath,
    '{ "code": "th",',
    '{ "code": "zh-Hant", "hreflang": "zh-Hant", "nativeName": "X", "switcherLabel": "X", "englishName": "Chinese (Traditional)", "storeShotName": "chinese_traditional", "ogLocale": "zh_TW", "paddleLocale": "en", "turnstileLang": "auto", "dir": "ltr" },\n    { "code": "th",',
    "registering zh-Hant WITH storeShotName resolves it — no collision reported",
    (st, n) => ok(n, st.collisions.length === 0, `  ${JSON.stringify(st.collisions)}`));

/* ---------------------------------------------------------------- 5. tree integrity */
console.log("\n[8] tree integrity — both repos");
ok("website git status is exactly what it was before the run", gitStatus(ROOT) === webBefore,
    `\n        before: ${JSON.stringify(webBefore)}\n        after:  ${JSON.stringify(gitStatus(ROOT))}`);
ok("app repo git status is exactly what it was before the run", gitStatus(APP) === appBefore,
    `\n        before: ${JSON.stringify(appBefore)}\n        after:  ${JSON.stringify(gitStatus(APP))}`);

console.log(`\n${pass} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
