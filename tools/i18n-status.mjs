#!/usr/bin/env node
/*
 * i18n wave status — §0.9 of the approved wave-2 plan.
 *
 * Prints a language x artifact matrix for the whole product, computed from the
 * filesystem plus the existing validators. STATE IS DERIVED, NEVER STORED: there
 * is no cache and no status file, so this cannot go stale and costs zero model
 * tokens to reconstruct. A fresh session runs one command and knows where the
 * wave stands.
 *
 *   node tools/i18n-status.mjs                 the matrix
 *   node tools/i18n-status.mjs --lang sv       one language, with per-artifact detail
 *   node tools/i18n-status.mjs --json          machine-readable
 *   node tools/i18n-status.mjs --no-check      skip the validator column (fast)
 *   node tools/i18n-status.mjs --strict        exit nonzero if a registered language is incomplete
 *   node tools/i18n-status.mjs --app <path>    locate the app repo explicitly
 *
 * Three rules this tool is built around:
 *
 * 1. `check` is the REAL validator, imported — not a file count. Seven files
 *    existing in sv/ says nothing about whether they are stale, leaking English,
 *    or shipping the English store badge. i18n-check.mjs is importable behind an
 *    is-main guard precisely so gates run against the same code the CLI runs.
 *
 * 2. UNMEASURED IS NOT ABSENT. If the app repo is not found, the five app-side
 *    columns print "?", never "--". A status tool that reports "missing" when it
 *    means "I could not look" is worse than no status tool at all.
 *
 * 3. This file follows i18n-check.mjs's is-main convention for the same reason:
 *    a status tool that wrongly reported everything DONE would look exactly like
 *    a working one, so tools/i18n-status-tests.mjs drives these exports directly.
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, ROOT, SNAP_DIR, findings,
    checkTranslatedPage, checkEnglishPages } from "./i18n-check.mjs";

/* The wave-2 roster (plan §"The 18 languages"). Listed here, not in
 * languages.json, because the standing rule is that a language is REGISTERED
 * only once its 7 pages exist — so an in-progress language is by definition
 * absent from the registry, and a status tool that read only the registry would
 * be blind to exactly the languages being worked on. */
const WAVE2 = ["zh-Hant", "sv", "cs", "hu", "ro", "da", "fi", "el", "nb",
    "he", "ms", "bg", "sk", "fil", "bn", "hr", "ta", "fa"];

/* Artifact shapes, relative to their repo root. */
const WEB_SVGS = ["howto-desktop", "howto-desktop-hero", "howto-laptop"];
const APP_GIFS = ["howto-desktop-dark", "howto-desktop-light",
    "howto-laptop-dark", "howto-laptop-light"];
const STORE_SHOTS = ["about", "hero", "max_zoom", "tray_fullscreen",
    "tray_menu", "zoomed_out"];
/* The EmailTemplate interface in fulfillment/src/i18n.ts. */
const EMAIL_FIELDS = ["dir", "subject", "intro", "yourKey", "toActivate",
    "step1", "step2", "step3", "keep", "orderRef", "questions"];
/* 3 web SVGs + 1 store badge + 4 app GIFs + 6 Store PNGs. */
const ART_TOTAL = WEB_SVGS.length + 1 + APP_GIFS.length + STORE_SHOTS.length;

/* ------------------------------------------------------------------------
 * Locating the app repo
 * ---------------------------------------------------------------------- */

/* A directory existing at the expected path is not proof it is the app repo.
 * Require marker files, so a wrong path cannot silently report every app-side
 * artifact as absent.
 *
 * An EXPLICIT override (--app / LVZ_APP_REPO) is authoritative: if it does not
 * look like the app repo, the answer is "not found", never the sibling default.
 * Falling back would answer a question about a repo the caller did not name —
 * which is the same class of lie as reporting unmeasured artifacts as absent. */
function findAppRepo(override) {
    const explicit = override ?? process.env.LVZ_APP_REPO;
    const looksRight = (p) =>
        existsSync(join(p, "Strings.resx")) && existsSync(join(p, "store-listing-i18n"));
    if (explicit) {
        const p = resolve(explicit);
        return looksRight(p) ? p : null;
    }
    const p = resolve(ROOT, "..", "low-vision-zoom");
    return looksRight(p) ? p : null;
}

/* ------------------------------------------------------------------------
 * Cell type: a count against a target, or an unmeasured hole
 * ---------------------------------------------------------------------- */
const cell = (have, want) => ({ have, want, known: true });
const unknown = () => ({ have: 0, want: 0, known: false });
const isDone = (c) => c.known && c.want > 0 && c.have === c.want;
function render(c) {
    if (!c.known) return "?";
    if (c.want === 0) return "n/a";
    if (c.want === 1) return c.have ? "ok" : "--";
    return `${c.have}/${c.want}`;
}

/* ------------------------------------------------------------------------
 * App-repo sources, parsed once per run
 * ---------------------------------------------------------------------- */

/* Parse fulfillment/src/i18n.ts textually. It is TypeScript source for a
 * Worker, so it cannot be imported from here; this reads SUPPORTED_LANGS and
 * the TEMPLATES blocks. */
function loadEmailTemplates(APP) {
    if (!APP) return null;
    const path = join(APP, "fulfillment", "src", "i18n.ts");
    if (!existsSync(path)) return null;
    const src = readFileSync(path, "utf8");

    const listed = new Set();
    const listMatch = src.match(/SUPPORTED_LANGS\s*=\s*\[([\s\S]*?)\]/);
    if (listMatch) for (const m of listMatch[1].matchAll(/"([^"]+)"/g)) listed.add(m[1]);

    /* Template blocks are top-level keys of TEMPLATES at two-space indent.
     * A hyphenated code (zh-Hant) must be quoted in JS, so accept both forms. */
    const blocks = new Map();
    const start = src.indexOf("TEMPLATES");
    if (start >= 0) {
        const body = src.slice(start);
        const hits = [...body.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][\w-]*)):\s*\{/gm)];
        hits.forEach((h, i) => {
            const end = i + 1 < hits.length ? hits[i + 1].index : body.length;
            blocks.set(h[1] ?? h[2], body.slice(h.index, end));
        });
    }
    return { listed, blocks };
}

function loadLabelKeys(APP, file) {
    if (!APP) return null;
    const path = join(APP, "branding", file);
    if (!existsSync(path)) return null;
    return new Set(Object.keys(JSON.parse(readFileSync(path, "utf8"))));
}

/* §0.10's validators, run once and attributed per language. The DONE-iff rules say a resx or
 * a listing is done when it exists AND PASSES its validator — so counting files would
 * overstate doneness, which is the one thing this tool must never do. If the validator cannot
 * be run at all, those columns go UNKNOWN rather than falling back to existence: silently
 * weakening a check is how a matrix starts lying. */
function loadValidators(APP) {
    if (!APP) return null;
    const tool = join(APP, "tools", "i18n-validate.mjs");
    if (!existsSync(tool)) return null;
    let out;
    try {
        out = execFileSync("node", [tool, "--json"],
            { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
        /* Nonzero exit is the normal path when there ARE findings; stdout still holds them. */
        out = e.stdout || "";
    }
    let parsed;
    try { parsed = JSON.parse(out); } catch { return null; }

    const byLang = { resx: new Map(), listing: new Map() };
    for (const f of parsed.findings ?? []) {
        let m = /^Strings\.([A-Za-z-]+)\.resx$/.exec(f.where);
        if (m) { (byLang.resx.get(m[1]) ?? byLang.resx.set(m[1], []).get(m[1])).push(f); continue; }
        m = /^store-listing-i18n\/([A-Za-z-]+)\.md$/.exec(f.where);
        if (m) (byLang.listing.get(m[1]) ?? byLang.listing.set(m[1], []).get(m[1])).push(f);
    }
    return byLang;
}

function loadContext(appOverride) {
    const APP = findAppRepo(appOverride);
    return {
        APP,
        email: loadEmailTemplates(APP),
        howtoLabels: loadLabelKeys(APP, "howto-labels.json"),
        heroLabels: loadLabelKeys(APP, "store-hero-labels.json"),
        validators: loadValidators(APP),
    };
}

/* ------------------------------------------------------------------------
 * Store screenshots are named by ENGLISH LANGUAGE NAME, not by code
 * ---------------------------------------------------------------------- */

/* chinese_about.png, indonesian_hero.png — a convention that predates this wave.
 *
 * The rule is NOT invented here: it is exactly what packaging/generate-store-hero.ps1:65
 * does — the FIRST WORD of englishName, lowercased — because that script is what writes the
 * files. Anything else and the status tool would look for names the generator never produces.
 * (An earlier version of this function stripped parentheticals and joined the remaining words
 * with "_". It agreed for all 18 shipped languages and would have diverged on wave 2's
 * "Norwegian Bokmål": generator `norwegian`, tool `norwegian_bokmål`.)
 *
 * `storeShotName` in languages.json overrides it. That exists because the first-word rule
 * collides: "Chinese (Simplified)" and "Chinese (Traditional)" both give "chinese", and the
 * two would overwrite each other's six Store images. Jonathan's decision (2026-08-11) is to
 * give zh-Hant a distinct name for this purpose only — zh keeps `chinese`, so none of the
 * 108 existing files are renamed and the Partner Center upload habit is unchanged.
 * generate-store-hero.ps1 honours the same field; if you add another consumer, it must too. */
function shotPrefix(lang) {
    if (!lang) return null;
    if (typeof lang === "string") return firstWordPrefix(lang);   // englishName directly
    return lang.storeShotName || firstWordPrefix(lang.englishName);
}
const firstWordPrefix = (englishName) =>
    (englishName ? englishName.split(" ")[0].toLowerCase() : null);

/* Group codes by the prefix they claim. Any group of 2+ is a naming collision:
 * those languages would overwrite each other's Store screenshots. */
function shotPrefixCollisions(prefixByCode) {
    const byPrefix = new Map();
    for (const [code, p] of prefixByCode) {
        if (!byPrefix.has(p)) byPrefix.set(p, []);
        byPrefix.get(p).push(code);
    }
    return [...byPrefix].filter(([, codes]) => codes.length > 1);
}

/* ------------------------------------------------------------------------
 * Per-language probes
 * ---------------------------------------------------------------------- */
const countExisting = (paths) => paths.reduce((n, p) => n + (existsSync(p) ? 1 : 0), 0);

const probePages = (code) =>
    cell(countExisting(CONFIG.translatedPages.map((p) => join(ROOT, code, p))),
        CONFIG.translatedPages.length);

const probeSnapshots = (code) =>
    cell(countExisting(CONFIG.translatedPages.map((p) => join(SNAP_DIR, code, p))),
        CONFIG.translatedPages.length);

/* The real validator, run per language against the same code path the CLI uses.
 * `findings` is a module-level accumulator in i18n-check.mjs, so what this call
 * appended is exactly the slice past the pre-call length. */
function probeCheck(langCfg) {
    const before = findings.length;
    for (const page of CONFIG.translatedPages) checkTranslatedPage(langCfg, page);
    return findings.slice(before);
}

function probeResx(ctx, code) {
    if (!ctx.APP) return unknown();
    if (!existsSync(join(ctx.APP, `Strings.${code}.resx`))) return cell(0, 1);
    if (!ctx.validators) return unknown();   // exists, but parity could not be established
    return cell(ctx.validators.resx.get(code)?.length ? 0 : 1, 1);
}

function probeEmail(ctx, code) {
    if (!ctx.email) return unknown();
    const block = ctx.email.blocks.get(code);
    if (!block || !ctx.email.listed.has(code)) return cell(0, 1);
    /* Present but incomplete is not done — all 11 fields or nothing. */
    const missing = EMAIL_FIELDS.filter((f) => !new RegExp(`\\b${f}\\s*:`).test(block));
    return cell(missing.length ? 0 : 1, 1);
}

const probeLabels = (ctx, code) =>
    (ctx.howtoLabels && ctx.heroLabels
        ? cell((ctx.howtoLabels.has(code) ? 1 : 0) + (ctx.heroLabels.has(code) ? 1 : 0), 2)
        : unknown());

function probeStoreListing(ctx, code) {
    if (!ctx.APP) return unknown();
    if (!existsSync(join(ctx.APP, "store-listing-i18n", `${code}.md`))) return cell(0, 1);
    if (!ctx.validators) return unknown();   // exists, but the budgets could not be checked
    return cell(ctx.validators.listing.get(code)?.length ? 0 : 1, 1);
}

/* Artwork spans both repos. The DONE-iff rule names 3 web SVGs + 4 app GIFs +
 * 6 Store PNGs; the store badge is counted here as well, because it is the
 * artifact a copy-paste most easily leaves behind as en.svg — the blind spot
 * §0.6 closed in the pages, unclosed on disk. */
function probeArt(ctx, code, prefix) {
    const web = countExisting(WEB_SVGS.map((n) => join(ROOT, "media", `${n}.${code}.svg`)));
    const badge = existsSync(join(ROOT, "media", "store-badge", `${code}.svg`)) ? 1 : 0;
    if (!ctx.APP) return { cell: unknown(), web, badge, gifs: null, shots: null };
    const gifs = countExisting(APP_GIFS.map((n) => join(ctx.APP, "Assets", `${n}.${code}.gif`)));
    const shots = prefix
        ? countExisting(STORE_SHOTS.map((s) => join(ctx.APP, "store-listing-i18n",
            "screenshots", "per-language", `${prefix}_${s}.png`)))
        : 0;
    return { cell: cell(web + badge + gifs + shots, ART_TOTAL), web, badge, gifs, shots };
}

/* ------------------------------------------------------------------------
 * Assemble the matrix
 * ---------------------------------------------------------------------- */
function buildStatus({ appOverride, onlyLang, runCheck = true } = {}) {
    const ctx = loadContext(appOverride);
    const registered = new Map(CONFIG.languages.map((l) => [l.code, l]));
    const roster = [...CONFIG.languages.map((l) => l.code),
        ...WAVE2.filter((c) => !registered.has(c))];

    /* Only registered languages carry an englishName, so an unregistered one has
     * an UNKNOWN prefix rather than an assumed one. */
    const prefixByCode = new Map();
    for (const code of roster) {
        const p = shotPrefix(registered.get(code));
        if (p) prefixByCode.set(code, p);
    }

    const englishBefore = findings.length;
    checkEnglishPages();
    const englishFindings = findings.slice(englishBefore);

    const rows = [];
    for (const code of roster) {
        if (onlyLang && code !== onlyLang) continue;
        const cfg = registered.get(code);
        const art = probeArt(ctx, code, prefixByCode.get(code));
        const checkFindings = cfg && runCheck ? probeCheck(cfg) : null;
        const row = {
            code,
            registered: !!cfg,
            pages: probePages(code),
            snapshots: probeSnapshots(code),
            /* An unregistered language cannot be checked at all: --check iterates
             * languages.json. "n/a" is the honest cell, not a failure. */
            check: cfg ? (runCheck ? cell(checkFindings.length ? 0 : 1, 1) : unknown())
                : cell(0, 0),
            resx: probeResx(ctx, code),
            email: probeEmail(ctx, code),
            labels: probeLabels(ctx, code),
            store: probeStoreListing(ctx, code),
            art: art.cell,
            artDetail: art,
            findings: checkFindings,
        };
        row.complete = row.registered && [row.pages, row.snapshots, row.check,
            row.resx, row.email, row.labels, row.store, row.art].every(isDone);
        rows.push(row);
    }

    return { ctx, rows, englishFindings, prefixByCode,
        collisions: shotPrefixCollisions(prefixByCode) };
}

/* ------------------------------------------------------------------------
 * Output
 * ---------------------------------------------------------------------- */
const COLS = [
    ["lang", (r) => r.code, 8],
    ["reg", (r) => (r.registered ? "ok" : "--"), 4],
    ["pages", (r) => render(r.pages), 6],
    ["snap", (r) => render(r.snapshots), 5],
    ["check", (r) => render(r.check), 6],
    ["resx", (r) => render(r.resx), 5],
    ["email", (r) => render(r.email), 6],
    ["lbls", (r) => render(r.labels), 5],
    ["store", (r) => render(r.store), 6],
    ["art", (r) => render(r.art), 6],
    ["", (r) => (r.complete ? "DONE" : ""), 4],
];

function printTable(rows) {
    console.log(COLS.map(([h, , w]) => h.padEnd(w)).join(""));
    console.log(COLS.map(([, , w]) => "-".repeat(Math.max(1, w - 1)).padEnd(w)).join(""));
    let prevRegistered = null;
    for (const r of rows) {
        if (prevRegistered === true && !r.registered) {
            console.log("".padEnd(8) + "unregistered — pages must exist before a language joins languages.json");
        }
        prevRegistered = r.registered;
        console.log(COLS.map(([, f, w]) => String(f(r)).padEnd(w)).join(""));
    }
}

function printDetail(r, prefixByCode) {
    const a = r.artDetail;
    const n = (v, total) => (v === null ? "?" : `${v}/${total}`);
    console.log(`\n${r.code} — artwork breakdown`);
    console.log(`  web svg    ${n(a.web, WEB_SVGS.length)}   media/howto-*.${r.code}.svg`);
    console.log(`  badge      ${n(a.badge, 1)}   media/store-badge/${r.code}.svg`);
    console.log(`  app gif    ${n(a.gifs, APP_GIFS.length)}   Assets/howto-*.${r.code}.gif`);
    console.log(`  store png  ${n(a.shots, STORE_SHOTS.length)}   screenshots/per-language/${prefixByCode.get(r.code) ?? "<prefix unknown until registered>"}_*.png`);
    if (r.findings?.length) {
        console.log(`\n${r.code} — ${r.findings.length} validator finding(s)`);
        for (const f of r.findings) console.log(`  FAIL  ${f.where}: ${f.msg.split("\n")[0]}`);
    }
}

function cmdStatus({ appOverride, onlyLang, runCheck, asJson }) {
    const st = buildStatus({ appOverride, onlyLang, runCheck });

    if (asJson) {
        console.log(JSON.stringify({
            appRepo: st.ctx.APP,
            englishFindings: st.englishFindings.map((f) => ({ where: f.where, msg: f.msg })),
            collisions: st.collisions.map(([prefix, codes]) => ({ prefix, codes })),
            languages: st.rows.map((r) => ({
                code: r.code, registered: r.registered, complete: r.complete,
                pages: r.pages, snapshots: r.snapshots, check: r.check, resx: r.resx,
                email: r.email, labels: r.labels, store: r.store, art: r.art,
                artDetail: { web: r.artDetail.web, badge: r.artDetail.badge,
                    gifs: r.artDetail.gifs, shots: r.artDetail.shots },
                findings: (r.findings ?? []).map((f) => ({ where: f.where, msg: f.msg })),
            })),
        }, null, 2));
        return { st };
    }

    console.log(`app repo: ${st.ctx.APP ?? 'NOT FOUND — app-side columns show "?" (unmeasured, not absent)'}`);
    if (!runCheck) console.log("check column skipped (--no-check)");
    console.log("");
    printTable(st.rows);

    /* DONE always means "including the validator". Under --no-check it is simply
     * not establishable — say so rather than quietly redefining the word. */
    const done = st.rows.filter((r) => r.complete).length;
    console.log(runCheck
        ? `\n${done}/${st.rows.length} language(s) fully done`
        : `\n0/${st.rows.length} fully done — DONE cannot be established with --no-check;` +
          " the columns above are still accurate");
    for (const f of st.englishFindings) console.log(`  FAIL  ENGLISH ${f.where}: ${f.msg.split("\n")[0]}`);

    /* Config problems print loudly but do not fail the run: this command is meant
     * to be the first thing a session runs, unconditionally. */
    for (const [prefix, codes] of st.collisions) {
        console.log(`\n!! CONFIG  store screenshot prefix "${prefix}" is claimed by ${codes.length} languages: ${codes.join(", ")}`);
        console.log("           screenshots/per-language/ is keyed by English language name, so these");
        console.log("           overwrite each other. Needs a naming decision BEFORE Store images are");
        console.log("           generated for the colliding languages.");
    }

    if (onlyLang) {
        if (!st.rows.length) console.log(`\nunknown language "${onlyLang}"`);
        else for (const r of st.rows) printDetail(r, st.prefixByCode);
    } else {
        for (const r of st.rows.filter((x) => x.findings?.length)) {
            console.log(`\n${r.code} — ${r.findings.length} validator finding(s); run --lang ${r.code} for detail`);
        }
    }

    return { st };
}

export { buildStatus, shotPrefix, shotPrefixCollisions, findAppRepo, loadContext,
    probePages, probeSnapshots, probeCheck, probeResx, probeEmail, probeLabels,
    probeStoreListing, probeArt, render, isDone, WAVE2, ART_TOTAL };

const isMain = process.argv[1]
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const argv = process.argv.slice(2);
    const has = (f) => argv.includes(f);
    const valOf = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
    /* --strict asks "is this actually done", which is a question --no-check
     * cannot answer. The validator wins over the speed flag. */
    if (has("--strict") && has("--no-check")) {
        console.log("note: --strict overrides --no-check; the validator must run to answer it\n");
    }
    const { st } = cmdStatus({
        appOverride: valOf("--app"),
        onlyLang: valOf("--lang"),
        runCheck: has("--strict") || !has("--no-check"),
        asJson: has("--json"),
    }) || {};
    if (has("--strict") && st) {
        const bad = st.rows.filter((r) => r.registered && !r.complete).length;
        process.exit(bad || st.englishFindings.length ? 1 : 0);
    }
    process.exit(0);
}
