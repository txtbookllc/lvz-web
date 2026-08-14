#!/usr/bin/env node
/*
 * Negative suite for the 0.6 checks — run it after ANY change to i18n-check.mjs.
 *
 *   node tools/i18n-leak-tests.mjs
 *
 * Why this file is in the repo rather than a scratchpad: a gate that has never been shown to
 * FAIL is not a gate, and the img@src check finds nothing on a healthy tree (209 localized
 * asset references across the shipped languages, 0 wrong). Without these tests an inert
 * check and a working one look identical. The per-unit leak check has the same property the
 * moment the last real leak is fixed — which it now is.
 *
 * Every perturbation is an EXACT substring replacement inside try/finally, never a whole-file
 * rewrite: the working tree is CRLF and a split/rejoin would strip \r, which git hides
 * (autocrlf normalizes on add) but --check's byte comparison would surface as all languages
 * going STALE at once. Each test asserts its file came back byte-identical, and the run ends
 * by asserting `git status` is exactly what it was before.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = join(ROOT, "tools", "i18n-check.mjs");
const { localizedAssetFor } = await import(pathToFileURL(TOOL).href);

let pass = 0, failed = 0;
const ok = (name, cond, detail = "") => {
    if (cond) { pass++; console.log(`  ok    ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail}`); }
};
const gitStatus = () => execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
const before = gitStatus();

const runCheck = (lang) => {
    const args = [TOOL, "--check", ...(lang ? ["--lang", lang] : [])];
    try { return execFileSync("node", args, { cwd: ROOT, encoding: "utf8" }); }
    catch (e) { return (e.stdout || "") + (e.stderr || ""); }
};

/* ---------------------------------------------------------------- 1. naming convention */
console.log("\n[1] localizedAssetFor() — the store-badge / howto naming rule");
for (const [src, lang, want] of [
    ["/media/store-badge/en.svg", "sv", "/media/store-badge/sv.svg"],
    ["/media/store-badge/es.svg", "en", "/media/store-badge/en.svg"],
    ["/media/howto-desktop.svg", "sv", "/media/howto-desktop.sv.svg"],
    ["/media/howto-desktop-hero.svg", "th", "/media/howto-desktop-hero.th.svg"],
    ["/media/howto-laptop.es.svg", "sv", "/media/howto-laptop.sv.svg"],
    ["/media/howto-desktop.es.svg", "en", "/media/howto-desktop.svg"],
    // wave 2's non-two-letter code must survive the rule
    ["/media/store-badge/en.svg", "zh-Hant", "/media/store-badge/zh-Hant.svg"],
    ["/media/howto-desktop.svg", "zh-Hant", "/media/howto-desktop.zh-Hant.svg"],
    // an unknown family must return null so the check FAILS rather than passing quietly
    ["/media/some-new-family.svg", "sv", null],
]) {
    const got = localizedAssetFor(src, lang);
    ok(`${src} @${lang} -> ${want}`, got === want, `  got ${got}`);
}

/* ---------------------------------------------------------------- 2. perturbations */
function perturb(rel, from, to, name, lang, match) {
    const path = join(ROOT, rel);
    const orig = readFileSync(path, "utf8");
    if (!orig.includes(from)) {
        failed++;
        console.log(`  FAIL  ${name}  (anchor not found in ${rel}: ${JSON.stringify(from)})`);
        return;
    }
    try {
        writeFileSync(path, orig.replace(from, to), "utf8");
        const out = runCheck(lang);
        ok(name, match.test(out),
            `\n        first findings:\n${out.split("\n").filter((l) => l.startsWith("FAIL")).slice(0, 3).map((l) => "        " + l).join("\n")}`);
    } finally {
        writeFileSync(path, orig, "utf8");
        ok(`${name} :: restored byte-identically`, readFileSync(path, "utf8") === orig);
    }
}

console.log("\n[2] img@src localization — the check that finds nothing on a healthy tree");
perturb("es/index.html", "/media/store-badge/es.svg", "/media/store-badge/en.svg",
    "a Spanish page shipping the ENGLISH store badge is caught", "es",
    /store-badge\/en\.svg.*must be.*store-badge\/es\.svg/);
perturb("es/index.html", "/media/howto-desktop.es.svg", "/media/howto-desktop.svg",
    "a Spanish page shipping the ENGLISH howto artwork is caught", "es",
    /howto-desktop\.svg.*must be.*howto-desktop\.es\.svg/);
perturb("es/index.html", "/media/store-badge/es.svg", "/media/store-badge/pt.svg",
    "a Spanish page shipping ANOTHER language's badge is caught", "es",
    /store-badge\/pt\.svg.*must be.*store-badge\/es\.svg/);

console.log("\n[3] per-unit leak — the classes the pre-0.6 heuristic could not see");
perturb("es/index.html", 'aria-label="Principal"', 'aria-label="Primary"',
    "an ATTRIBUTE leak is caught (old heuristic scanned text nodes only)", "es",
    /untranslated attr unit .*nav@aria-label: "Primary"/);
perturb("es/compare.html", "<h2>Fuentes</h2>", "<h2>Sources</h2>",
    "a ONE-WORD text leak is caught (old heuristic needed >4 words)", "es",
    /untranslated text unit .*h2\[7\]: "Sources"/);
perturb("es/why-smooth-magnification.html", '"name": "Ceguera al cambio"', '"name": "Change blindness"',
    "a JSON-LD leak is caught (old heuristic never scanned JSON-LD)", "es",
    /untranslated ld unit .*about\[4\]\.name: "Change blindness"/);
perturb("es/index.html", "<h4>Producto</h4>", "<h4>Product</h4>",
    "a cognate declared for nl does NOT excuse the same unit in es", "es",
    /untranslated text unit .*div\[2\]\/h4: "Product"/);

console.log("\n[4] leak-allow.json — an allowance must be revocable");
perturb("i18n/leak-allow.json", '"en": "Windows", "why": "OS name"', '"en": "Windows NT", "why": "OS name"',
    "a pin keyed on stale English text stops applying (a reword revokes it)", "es",
    /untranslated text unit .*tr\[15\]\/td\[2\]: "Windows"/);
/* The anchor deliberately matches only the KEY of this cognate, not its langs array: the
 * array grows every time a language legitimately joins (de, then sv, …), and an anchor that
 * included it made this test fail with "anchor not found" the first time that happened —
 * a red suite that proved nothing, exactly the shape of failure session 5 warned about
 * (a nonzero exit is not evidence the gate fired). */
perturb("i18n/leak-allow.json", '"en": "Support", "langs": [', '"en": "Support", "langs": ["xx"], "unused": [',
    "narrowing a cognate's langs makes the previously-allowed language fail", "de",
    /untranslated text unit .*div\[4\]\/h4: "Support"/);

/* ---------------------------------------------------------------- 3. tree integrity */
console.log("\n[5] tree integrity");
ok("git status is exactly what it was before the run", gitStatus() === before,
    `\n        before: ${JSON.stringify(before)}\n        after:  ${JSON.stringify(gitStatus())}`);

console.log(`\n${pass} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
