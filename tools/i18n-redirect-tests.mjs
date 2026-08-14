#!/usr/bin/env node
/*
 * Suite for the head language-redirect snippet — run it after ANY change to that snippet or to
 * i18n/languages.json.
 *
 *   node tools/i18n-redirect-tests.mjs
 *
 * The snippet is the only piece of this site that runs BEFORE paint on every English page, it
 * is copied verbatim into all 259 files, and it decides which language a first-time visitor
 * ever sees. It has no other coverage: --check proves all 259 copies are IDENTICAL, which says
 * nothing about whether the thing they all contain is correct.
 *
 * It is also silent when wrong. Sending a Taiwanese visitor to Simplified Chinese looks exactly
 * like a correct redirect from the outside — the page loads, the console is clean, and only a
 * reader who knows both scripts can tell.
 *
 * So this suite runs the REAL extracted snippet in a vm with stub globals, rather than
 * re-implementing it. The reimplementation would agree with itself and prove nothing.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(readFileSync(join(ROOT, "i18n", "languages.json"), "utf8"));

let pass = 0, failed = 0;
const ok = (name, cond, detail = "") => {
    if (cond) { pass++; console.log(`  ok    ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail}`); }
};
const gitStatus = () => execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
const before = gitStatus();

/* ---------------------------------------------------------------- extract the real snippet */
function snippetOf(rel) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    for (const m of src.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        if (m[1].includes("lvz-lang") && m[1].includes("documentElement.lang")) return m[1];
    }
    throw new Error(`no redirect snippet found in ${rel}`);
}
const SNIPPET = snippetOf("index.html");
ok("the redirect snippet is extractable from index.html", SNIPPET.includes("function resolve(tag)"));

/* Every copy must be byte-identical to index.html's, modulo the LANGS line that
 * --rewrite-blocks owns. If they ever diverge, testing one proves nothing about the rest. */
const norm = (s) => s.replace(/var LANGS = \[[^\]]*\];/, "var LANGS = [];").replace(/\r\n/g, "\n");
const copies = [];
for (const p of CFG.translatedPages) {
    copies.push(p);
    for (const l of CFG.languages.map((x) => x.code)) {
        copies.push(`${l}/${p}`);
        copies.push(`i18n/snapshots/${l}/${p}`);
    }
}
const divergent = copies.filter((c) => norm(snippetOf(c)) !== norm(SNIPPET));
ok(`all ${copies.length} copies of the snippet are identical (so testing one tests all)`,
    divergent.length === 0, `\n        divergent: ${divergent.slice(0, 5)}`);

/* ---------------------------------------------------------------- run it */
/**
 * Execute the snippet as a browser would.
 * @returns {{to: string|null, stored: string|null}} where it navigated, and what it remembered.
 */
function visit({ pageLang = "en", langs, navLangs = [], pref = null, path = "/index.html" }) {
    let code = SNIPPET;
    if (langs) code = code.replace(/var LANGS = \[[^\]]*\];/, `var LANGS = ${JSON.stringify(langs)};`);

    const store = new Map();
    if (pref !== null) store.set("lvz-lang", pref);
    let navigated = null;

    const sandbox = {
        document: { documentElement: { lang: pageLang } },
        navigator: { languages: navLangs, language: navLangs[0] },
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, v),
        },
        location: {
            pathname: path, search: "", hash: "",
            replace: (url) => { navigated = url; },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { timeout: 1000 });
    return { to: navigated, stored: store.get("lvz-lang") ?? null };
}

const LIVE = CFG.languages.map((x) => x.code);
/* deduped: zh-Hant is in LIVE now, and a doubled entry would make LANGS unrepresentative */
const FUTURE = [...new Set([...LIVE, "zh-Hant", "fil"])];
/* A LANGS list as it stood BEFORE zh-Hant registered. The graceful-degradation case — a
 * browser asking for a language the site does not have yet must land on the closest thing
 * rather than on nothing — is generic and worth keeping forever. Testing it against a
 * synthetic list keeps it alive now that zh-Hant is real, instead of retiring the
 * assertion on the very day the language shipped. */
const PRE_HANT = LIVE.filter((c) => c !== "zh-Hant");

const routes = (opts, expected, why) => {
    const r = visit(opts);
    ok(`${(opts.navLangs || []).join(",") || "(no browser lang)"}${opts.pref ? ` pref=${opts.pref}` : ""} -> ${expected ?? "(stay)"}   ${why}`,
        r.to === expected, `\n        got: ${JSON.stringify(r.to)}`);
};

/* ---------------------------------------------------------------- 1. today */
console.log("\n[1] the shipped languages must route exactly as they do now");
routes({ langs: LIVE, navLangs: ["fr"] }, "/fr/index.html", "exact");
routes({ langs: LIVE, navLangs: ["fr-CA"] }, "/fr/index.html", "region falls back to the base");
routes({ langs: LIVE, navLangs: ["pt-BR"] }, "/pt/index.html", "region falls back to the base");
routes({ langs: LIVE, navLangs: ["DE-de"] }, "/de/index.html", "uppercase browser tag");
routes({ langs: LIVE, navLangs: ["en-GB"] }, null, "English stays at the root — no /en/ folder");
routes({ langs: LIVE, navLangs: ["xx"] }, null, "unknown language stays on English");
routes({ langs: LIVE, navLangs: [] }, null, "no browser language at all");
routes({ langs: LIVE, navLangs: ["zh-CN"] }, "/zh/index.html", "mainland Chinese");
routes({ langs: LIVE, navLangs: ["zh-Hans"] }, "/zh/index.html", "Simplified script tag");

console.log("\n[2] a stored choice always wins");
routes({ langs: LIVE, navLangs: ["fr"], pref: "de" }, "/de/index.html", "stored beats browser");
routes({ langs: LIVE, navLangs: ["fr"], pref: "xx" }, null, "an unusable stored value strands nobody");
routes({ langs: LIVE, navLangs: ["fr"], pref: "en" }, null, "stored English stays at the root");
ok("a first visit remembers the language it chose",
    visit({ langs: LIVE, navLangs: ["ja"] }).stored === "ja");
ok("a visit with a stored choice does not rewrite it",
    visit({ langs: LIVE, navLangs: ["ja"], pref: "de" }).stored === "de");

console.log("\n[3] the snippet is inert on a translated page");
for (const lang of ["fr", "zh", "ar"]) {
    ok(`${lang}/index.html does not redirect (would be a loop)`,
        visit({ langs: LIVE, pageLang: lang, navLangs: ["de"] }).to === null);
}

console.log("\n[4] the path is preserved, not just the language");
ok("a deep page keeps its filename",
    visit({ langs: LIVE, navLangs: ["fr"], path: "/why-smooth-magnification.html" }).to
        === "/fr/why-smooth-magnification.html");

/* ---------------------------------------------------------------- 2. the fix */
console.log("\n[5] zh-Hant is LIVE — and absence still degrades gracefully");
ok("zh-Hant IS registered (the live config carries it)", LIVE.includes("zh-Hant"),
    "\n        zh-Hant is missing from languages.json — [5] and [6] assume it is registered");
/* the real, shipping behaviour, asserted against the real LANGS */
routes({ langs: LIVE, navLangs: ["zh-TW"] }, "/zh-Hant/index.html", "LIVE: Taiwan gets Traditional");
routes({ langs: LIVE, navLangs: ["zh-CN"] }, "/zh/index.html", "LIVE: mainland still gets Simplified");
/* and the fallback that applied before it registered, kept permanently testable */
routes({ langs: PRE_HANT, navLangs: ["zh-TW"] }, "/zh/index.html",
    "without zh-Hant in LANGS, Taiwan degrades to Simplified — never to nothing");
routes({ langs: PRE_HANT, navLangs: ["zh-Hant"] }, "/zh/index.html",
    "an explicit Traditional request degrades the same way");
routes({ langs: LIVE, navLangs: ["tl-PH"] }, null, "Filipino unregistered — stays English, never a wrong language");

console.log("\n[6] the fix, on a LANGS carrying zh-Hant and fil");
routes({ langs: FUTURE, navLangs: ["zh-TW"] }, "/zh-Hant/index.html", "THE FIX: Taiwan gets Traditional");
routes({ langs: FUTURE, navLangs: ["zh-HK"] }, "/zh-Hant/index.html", "Hong Kong gets Traditional");
routes({ langs: FUTURE, navLangs: ["zh-MO"] }, "/zh-Hant/index.html", "Macau gets Traditional");
routes({ langs: FUTURE, navLangs: ["zh-Hant"] }, "/zh-Hant/index.html", "explicit Traditional");
routes({ langs: FUTURE, navLangs: ["zh-hant-tw"] }, "/zh-Hant/index.html", "lowercased by the browser, script plus region");
routes({ langs: FUTURE, navLangs: ["zh-CN"] }, "/zh/index.html", "MUST NOT drift to Traditional");
routes({ langs: FUTURE, navLangs: ["zh-Hans"] }, "/zh/index.html", "MUST NOT drift to Traditional");
routes({ langs: FUTURE, navLangs: ["zh-SG"] }, "/zh/index.html", "MUST NOT drift to Traditional");
routes({ langs: FUTURE, navLangs: ["zh"] }, "/zh/index.html", "neutral stays Simplified");
routes({ langs: FUTURE, navLangs: ["tl"] }, "/fil/index.html", "the legacy Filipino tag");
routes({ langs: FUTURE, navLangs: ["tl-PH"] }, "/fil/index.html", "legacy tag with region");
routes({ langs: FUTURE, navLangs: ["fil-PH"] }, "/fil/index.html", "current tag with region");
routes({ langs: FUTURE, navLangs: ["fr"] }, "/fr/index.html", "unaffected by the new entries");

ok("the stored value is the code as LANGS spells it, so the path segment is valid",
    visit({ langs: FUTURE, navLangs: ["zh-TW"] }).stored === "zh-Hant");

console.log("\n[7] the URL it builds is case-exact — Cloudflare Pages paths are case-sensitive");
ok("a script-bearing code keeps its capital in the redirect URL",
    visit({ langs: FUTURE, navLangs: ["zh-TW"] }).to === "/zh-Hant/index.html");

/* ---------------------------------------------------------------- 3. hostile input */
console.log("\n[8] nothing throws, whatever the browser reports");
for (const junk of ["", "-", "--", "_", "zh-", "-zh", "a".repeat(300), "../../etc", "zh-Hant-"]) {
    let threw = null;
    try { visit({ langs: FUTURE, navLangs: [junk] }); } catch (e) { threw = e; }
    ok(`navigator.language = ${JSON.stringify(junk.slice(0, 24))} does not throw`, threw === null,
        `\n        ${threw?.message}`);
}
ok("a path-traversal-looking browser language cannot produce a traversal URL",
    visit({ langs: FUTURE, navLangs: ["../../etc"] }).to === null);

/* ---------------------------------------------------------------- 4. tree integrity */
console.log("\n[9] tree integrity");
ok("git status is exactly what it was before the run", gitStatus() === before,
    `\n        before: ${JSON.stringify(before)}\n        after:  ${JSON.stringify(gitStatus())}`);

console.log(`\n${pass} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
