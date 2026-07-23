#!/usr/bin/env node
/*
 * i18n validator / staleness checker for lowvisionzoom.com. No dependencies.
 *
 * Translation model: English pages at the repo root are the hand-edited canonical
 * source; each language in i18n/languages.json has a directory (/es/, /de/, ...)
 * holding full translated copies of the four content pages. There is no build
 * step — this tool only VERIFIES. See i18n/TRANSLATING.md for the rules enforced.
 *
 * Commands
 *   node tools/i18n-check.mjs --check [--lang XX]   validate everything; nonzero exit on findings
 *   node tools/i18n-check.mjs --accept XX [page..]  record current English pages as the snapshot
 *                                                   XX's translation corresponds to
 *   node tools/i18n-check.mjs --sitemap             (re)write sitemap.xml from languages.json
 *   node tools/i18n-check.mjs --print-blocks PAGE   print the hreflang + switcher markup expected
 *                                                   on an English page (for pasting)
 *
 * Staleness model: i18n/snapshots/<lang>/<page> is a byte copy of the ENGLISH page
 * at the moment that language's translation was last accepted. Any diff between the
 * snapshot and the current English page = the translation is stale; --check prints
 * the diff so it can be handed to a translator as "apply only this change".
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "i18n", "languages.json"), "utf8"));
const SNAP_DIR = join(ROOT, "i18n", "snapshots");

// Attributes whose values legitimately differ between the English page and a
// translation. Excluded from structural parity; validated by targeted rules instead.
const TRANSLATABLE_ATTRS = new Set([
    "alt", "title", "aria-label", "placeholder", "content",
    "data-label-play", "data-label-pause", "data-language",
    "lang", "dir", "hreflang", "aria-current",
]);

// English text allowed to appear verbatim on a translated page (leak heuristic).
const LEAK_WHITELIST = ["Low Vision Zoom", "txtbook", "Douglas Ave", "Wichita",
    "Paddle", "Ctrl", "Alt", "SmartScreen", "Windows", "$9.99", "USD",
    // Bibliographic proper nouns (journal / organization names) that legitimately stay in the
    // source language in citations on why-smooth-magnification.html, per i18n/TRANSLATING.md's
    // medical-claims guardrails. Citation *titles* stay English too, but are exempted structurally
    // by the <em>/<cite> rule in the leak check below rather than listed here.
    "Optometry and Vision Science", "Nielsen Norman Group"];

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img",
    "input", "link", "meta", "param", "source", "track", "wbr"]);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    copy: "©", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
    ndash: "–", mdash: "—", hellip: "…", middot: "·", times: "×" };

function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X"
                ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            return Number.isNaN(code) ? m : String.fromCodePoint(code);
        }
        return Object.hasOwn(ENTITIES, body) ? ENTITIES[body] : m;
    });
}

/* --------------------------------------------------------------------------
 * HTML tokenizer — enough for this site's hand-authored, well-formed markup.
 * Produces: events (structural stream), texts (visible), scripts (inline), links.
 * ------------------------------------------------------------------------ */
function parsePage(html, file) {
    const events = [];   // {kind:"tag"|"end"|"decl", tag, attrs}
    const texts = [];    // normalized visible text nodes
    const citeTexts = new Set(); // visible text inside <em>/<cite> — may stay in the source language
    const scripts = [];  // inline <script> bodies
    const links = [];    // {tag, attr, value}
    const URL_ATTRS = { a: ["href"], link: ["href"], img: ["src"],
        source: ["src"], video: ["poster", "src"], script: ["src"], form: ["action"] };
    let i = 0;
    const stack = [];
    while (i < html.length) {
        if (html[i] !== "<") {
            let j = html.indexOf("<", i);
            if (j === -1) j = html.length;
            const raw = html.slice(i, j);
            if (!stack.includes("style")) {
                const t = decodeEntities(raw).replace(/[\s ]+/g, " ").trim();
                if (t) {
                    texts.push(t);
                    // Emphasis/citation titles (e.g. paper titles wrapped in <em>) legitimately
                    // stay in the source language; exempt them from the untranslated-leak heuristic.
                    if (stack.includes("em") || stack.includes("cite")) citeTexts.add(t);
                }
            }
            i = j;
            continue;
        }
        if (html.startsWith("<!--", i)) {
            const end = html.indexOf("-->", i + 4);
            i = end === -1 ? html.length : end + 3;
            continue;
        }
        if (html.startsWith("<!", i)) {
            const end = html.indexOf(">", i);
            events.push({ kind: "decl", tag: html.slice(i + 2, end).toLowerCase(), attrs: null });
            i = end + 1;
            continue;
        }
        if (html.startsWith("</", i)) {
            const end = html.indexOf(">", i);
            const tag = html.slice(i + 2, end).trim().toLowerCase();
            events.push({ kind: "end", tag, attrs: null });
            const at = stack.lastIndexOf(tag);
            if (at !== -1) stack.length = at;
            i = end + 1;
            continue;
        }
        // start tag
        const end = html.indexOf(">", i);
        if (end === -1) throw new Error(`${file}: unterminated tag at offset ${i}`);
        let body = html.slice(i + 1, end);
        const selfClose = body.endsWith("/");
        if (selfClose) body = body.slice(0, -1);
        const m = body.match(/^[a-zA-Z][\w-]*/);
        if (!m) { i = end + 1; continue; }
        const tag = m[0].toLowerCase();
        const attrs = {};
        const attrRe = /([a-zA-Z_:@][\w:.@-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        attrRe.lastIndex = m[0].length;
        for (let am; (am = attrRe.exec(body));) {
            const val = am[2] ?? am[3] ?? am[4];
            attrs[am[1].toLowerCase()] = val === undefined ? "" : decodeEntities(val);
        }
        events.push({ kind: "tag", tag, attrs });
        for (const attr of URL_ATTRS[tag] || []) {
            if (attrs[attr]) links.push({ tag, attr, value: attrs[attr] });
        }
        i = end + 1;
        if (tag === "script" || tag === "style") {
            // raw-text elements: consume up to the closing tag
            const close = new RegExp(`</${tag}\\s*>`, "i");
            const rest = html.slice(i);
            const cm = close.exec(rest);
            const rawEnd = cm ? i + cm.index : html.length;
            if (tag === "script" && !("src" in attrs)) scripts.push(html.slice(i, rawEnd));
            i = cm ? rawEnd + cm[0].length : html.length;
            events.push({ kind: "end", tag, attrs: null });
        } else if (!selfClose && !VOID_TAGS.has(tag)) {
            stack.push(tag);
        }
    }
    return { events, texts, citeTexts, scripts, links, file };
}

const readPage = (path) => parsePage(readFileSync(path, "utf8"), path);

function isInternal(url) {
    if (url.startsWith(CONFIG.origin)) return true;
    return !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url);
}

/* Structural parity stream: tags + non-translatable attrs (internal hrefs excluded). */
function structuralStream(page) {
    return page.events.map((e) => {
        if (e.kind !== "tag") return `${e.kind}:${e.tag}`;
        const parts = [];
        for (const k of Object.keys(e.attrs).sort()) {
            if (TRANSLATABLE_ATTRS.has(k)) continue;
            const v = e.attrs[k];
            if ((k === "href" || k === "action") && v && isInternal(v)) continue;
            // Store badge art and the howto gesture animations are localized per language
            // (/media/store-badge/XX.svg, /media/howto-*.XX.svg — generated by the app repo's
            // packaging/generate-howto-anims.ps1); existence is still verified by checkLinks.
            if (k === "src" && (v.startsWith("/media/store-badge/") || v.startsWith("/media/howto-"))) continue;
            parts.push(`${k}=${v}`);
        }
        return `tag:${e.tag}[${parts.join("|")}]`;
    });
}

/* ------------------------------------------------------------------------
 * JS string-literal stripping (script parity): two scripts compare equal iff
 * their code is identical up to translated string literals; comments dropped.
 * ---------------------------------------------------------------------- */
function stripJs(code) {
    let out = "", state = "code";
    for (let i = 0; i < code.length; i++) {
        const c = code[i], n = code[i + 1];
        if (state === "code") {
            if (c === "'" || c === '"') { state = c; out += "«S»"; }
            else if (c === "/" && n === "/") { state = "line"; i++; }
            else if (c === "/" && n === "*") { state = "block"; i++; }
            else out += c;
        } else if (state === "'" || state === '"') {
            if (c === "\\") i++;
            else if (c === state) state = "code";
        } else if (state === "line") {
            if (c === "\n") { state = "code"; out += "\n"; }
        } else if (state === "block") {
            if (c === "*" && n === "/") { state = "code"; i++; }
        }
    }
    return out.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------------
 * Expected-block builders
 * ---------------------------------------------------------------------- */
function pageUrl(lang, page) {
    const prefix = lang === "en" ? `${CONFIG.origin}/` : `${CONFIG.origin}/${lang}/`;
    return page === "index.html" ? prefix : prefix + page;
}
const switcherHref = (lang, page) => (lang === "en" ? `/${page}` : `/${lang}/${page}`);

function expectedHreflang(page) {
    const lines = [`<link rel="alternate" hreflang="en" href="${pageUrl("en", page)}">`];
    for (const l of CONFIG.languages) {
        lines.push(`<link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l.code, page)}">`);
    }
    lines.push(`<link rel="alternate" hreflang="x-default" href="${pageUrl("en", page)}">`);
    return lines;
}

function expectedSwitcher(page, currentLang) {
    const label = currentLang === "en" ? "English"
        : CONFIG.languages.find((l) => l.code === currentLang).nativeName;
    const rows = [[`en`, `en`, `English`]]
        .concat(CONFIG.languages.map((l) => [l.code, l.hreflang, l.nativeName]));
    const out = [
        `<details class="lang-switch">`,
        `    <summary aria-label="Language: ${label}">`,
        `        <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9s1.3-6.5 3.8-9z"/></svg>`,
        `        <span>${label}</span>`,
        `    </summary>`,
        `    <ul>`,
    ];
    for (const [code, hreflang, name] of rows) {
        const cur = code === currentLang ? ` aria-current="true"` : "";
        out.push(`        <li><a href="${switcherHref(code, page)}" data-lang="${code}" lang="${code}" hreflang="${hreflang}"${cur}>${name}</a></li>`);
    }
    out.push(`    </ul>`, `</details>`);
    return out;
}

/* ------------------------------------------------------------------------
 * Checks
 * ---------------------------------------------------------------------- */
const findings = [];
const fail = (where, msg) => findings.push({ where, msg });

function checkHreflang(where, page, parsed, lang) {
    const expected = new Set([`en ${pageUrl("en", page)}`,
        `x-default ${pageUrl("en", page)}`]);
    for (const l of CONFIG.languages) expected.add(`${l.hreflang} ${pageUrl(l.code, page)}`);
    const actual = new Set();
    let canonical = null;
    for (const e of parsed.events) {
        if (e.kind !== "tag" || e.tag !== "link") continue;
        if (e.attrs.rel === "alternate" && e.attrs.hreflang) {
            actual.add(`${e.attrs.hreflang} ${e.attrs.href || ""}`);
        }
        if (e.attrs.rel === "canonical") canonical = e.attrs.href;
    }
    for (const x of expected) if (!actual.has(x)) fail(where, `missing hreflang alternate ${x.replace(" ", " -> ")}`);
    for (const x of actual) if (!expected.has(x)) fail(where, `unexpected hreflang alternate ${x.replace(" ", " -> ")}`);
    const want = pageUrl(lang, page);
    if (canonical !== want) fail(where, `canonical is ${JSON.stringify(canonical)}, expected "${want}"`);
}

function switcherEntries(parsed) {
    const entries = [];
    let depth = 0;
    for (const e of parsed.events) {
        if (e.kind === "tag" && e.tag === "details" && (e.attrs.class || "").includes("lang-switch")) depth = 1;
        else if (depth && e.kind === "end" && e.tag === "details") depth = 0;
        else if (depth && e.kind === "tag" && e.tag === "a") entries.push(e.attrs);
    }
    return entries;
}

function checkSwitcher(where, page, parsed, lang) {
    const entries = switcherEntries(parsed);
    const codes = ["en", ...CONFIG.languages.map((l) => l.code)];
    const got = entries.map((e) => e["data-lang"]);
    if (JSON.stringify(got) !== JSON.stringify(codes)) {
        fail(where, `switcher entries [${got}] != expected [${codes}]`);
        return;
    }
    for (const e of entries) {
        const code = e["data-lang"];
        const want = switcherHref(code, page);
        if (e.href !== want) fail(where, `switcher link for "${code}" is ${JSON.stringify(e.href)}, expected "${want}"`);
        const isCur = e["aria-current"] === "true";
        if (isCur !== (code === lang)) fail(where, `switcher aria-current wrong for "${code}" (page language is "${lang}")`);
    }
}

function checkRedirectSnippet(where, parsed) {
    const snippet = parsed.scripts.find((s) => s.includes("lvz-lang"));
    if (!snippet) { fail(where, "head i18n redirect snippet (lvz-lang) missing"); return; }
    const m = snippet.match(/LANGS\s*=\s*\[([^\]]*)\]/);
    const listed = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
    const codes = CONFIG.languages.map((l) => l.code);
    if (JSON.stringify(listed) !== JSON.stringify(codes)) {
        fail(where, `redirect snippet LANGS [${listed}] != languages.json [${codes}]`);
    }
}

function checkLinks(where, page, parsed, lang) {
    const translated = new Set(CONFIG.translatedPages);
    const englishOnly = new Set(CONFIG.englishOnlyPages);
    const langCodes = new Set(CONFIG.languages.map((l) => l.code));
    for (const { tag, attr, value } of parsed.links) {
        if (!isInternal(value)) continue;
        let u = value.startsWith(CONFIG.origin) ? value.slice(CONFIG.origin.length) : value;
        u = u.split("#")[0].split("?")[0];
        if (!u) continue; // same-page fragment / query
        if (!u.startsWith("/")) {
            fail(where, `internal link ${JSON.stringify(value)} must be root-relative (start with "/")`);
            continue;
        }
        let rel = u.slice(1);
        if (rel === "" || rel.endsWith("/")) rel += "index.html";
        if (!existsSync(join(ROOT, rel))) {
            const seg = rel.split("/")[0];
            // links into a language that has no translation yet are implied by the
            // per-language "translated page missing" finding — don't repeat them here
            if (!(langCodes.has(seg) && !existsSync(join(ROOT, seg)))) {
                fail(where, `broken internal link <${tag} ${attr}="${value}"> -> ${rel}`);
            }
            continue;
        }
        if (tag !== "a") continue;
        const parts = rel.split("/");
        const linkLang = parts.length > 1 && langCodes.has(parts[0]) ? parts[0] : "en";
        const base = parts[parts.length - 1];
        const isSwitcher = parsed.events.some((e) => e.kind === "tag" && e.tag === "a"
            && e.attrs.href === value && e.attrs["data-lang"]);
        if (englishOnly.has(base)) {
            if (linkLang !== "en") fail(where, `legal link ${JSON.stringify(value)} must point at the English root copy`);
        } else if (translated.has(base) && linkLang !== lang && !isSwitcher) {
            fail(where, `internal link ${JSON.stringify(value)} leaves the page's language ("${lang}")`);
        }
    }
}

function titleAndDescription(path) {
    const txt = readFileSync(path, "utf8");
    const t = txt.match(/<title>([\s\S]*?)<\/title>/);
    const d = txt.match(/<meta name="description" content="([\s\S]*?)"/);
    return [t ? t[1].trim() : "", d ? d[1].trim() : ""];
}

function getMeta(parsed, key) {
    for (const e of parsed.events) {
        if (e.kind === "tag" && e.tag === "meta"
            && (e.attrs.name === key || e.attrs.property === key)) return e.attrs.content ?? "";
    }
    return null;
}

function htmlAttrs(parsed) {
    const e = parsed.events.find((x) => x.kind === "tag" && x.tag === "html");
    return e ? e.attrs : {};
}

function unifiedDiff(oldText, newText, fromFile, toFile, maxLines = 60) {
    // minimal line diff (LCS-free, block-based): good enough to hand to a translator
    const a = oldText.split("\n"), b = newText.split("\n");
    const out = [`--- ${fromFile}`, `+++ ${toFile}`];
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
        // find next resync point
        let ri = i, rj = j, found = false;
        outer: for (let k = 1; k < 40 && !found; k++) {
            for (let di = 0; di <= k; di++) {
                const dj = k - di;
                if (i + di < a.length && j + dj < b.length && a[i + di] === b[j + dj]
                    && a[i + di + 1] === b[j + dj + 1]) {
                    ri = i + di; rj = j + dj; found = true; break outer;
                }
            }
        }
        if (!found) { ri = a.length; rj = b.length; }
        out.push(`@@ english line ${j + 1} @@`);
        for (; i < ri; i++) out.push(`- ${a[i]}`);
        for (; j < rj; j++) out.push(`+ ${b[j]}`);
    }
    return out.length > maxLines
        ? out.slice(0, maxLines).join("\n") + "\n... (diff truncated)"
        : out.join("\n");
}

function checkTranslatedPage(langCfg, page) {
    const lang = langCfg.code;
    const where = `${lang}/${page}`;
    const enPath = join(ROOT, page);
    const trPath = join(ROOT, lang, page);
    if (!existsSync(trPath)) { fail(where, "translated page missing"); return; }
    const en = readPage(enPath);
    const tr = readPage(trPath);

    // 1. structural parity
    const se = structuralStream(en), st = structuralStream(tr);
    if (JSON.stringify(se) !== JSON.stringify(st)) {
        let i = 0;
        while (i < se.length && i < st.length && se[i] === st[i]) i++;
        fail(where, `structure diverges from English at element #${i}: ` +
            `${st[i] ?? "(end)"} — English has ${se[i] ?? "(end)"}`);
    }

    // 2. inline-script parity (code identical up to string literals)
    if (en.scripts.length !== tr.scripts.length) {
        fail(where, `${tr.scripts.length} inline scripts, English has ${en.scripts.length}`);
    } else {
        en.scripts.forEach((s, i) => {
            if (stripJs(s) !== stripJs(tr.scripts[i])) {
                fail(where, `inline script #${i} code differs from English beyond string literals`);
            }
        });
    }

    // 3. metadata
    const ha = htmlAttrs(tr);
    if (ha.lang !== lang) fail(where, `<html lang> is ${JSON.stringify(ha.lang)}, expected "${lang}"`);
    const wantDir = langCfg.dir || "ltr";
    if ((ha.dir || "ltr") !== wantDir) fail(where, `<html dir> is ${JSON.stringify(ha.dir)}, expected "${wantDir}"`);
    const [enTitle, enDesc] = titleAndDescription(enPath);
    const [trTitle, trDesc] = titleAndDescription(trPath);
    if (!trTitle || trTitle === enTitle) fail(where, "<title> missing or untranslated");
    if (!trDesc || trDesc === enDesc) fail(where, "meta description missing or untranslated");
    if (page === "index.html" && getMeta(tr, "og:locale") !== langCfg.ogLocale) {
        fail(where, `og:locale is ${JSON.stringify(getMeta(tr, "og:locale"))}, expected "${langCfg.ogLocale}"`);
    }
    const ogUrl = getMeta(tr, "og:url");
    if (ogUrl !== null && ogUrl !== pageUrl(lang, page)) {
        fail(where, `og:url is ${JSON.stringify(ogUrl)}, expected "${pageUrl(lang, page)}"`);
    }

    checkHreflang(where, page, tr, lang);
    checkSwitcher(where, page, tr, lang);
    checkRedirectSnippet(where, tr);
    checkLinks(where, page, tr, lang);

    // 4. buy.html locale plumbing
    if (page === "buy.html") {
        const body = tr.scripts.join("\n");
        const wantSuccess = `${CONFIG.origin}/${lang}/buy.html?state=success`;
        if (!body.includes(wantSuccess)) fail(where, `SUCCESS_URL must be "${wantSuccess}"`);
        const locales = [...body.matchAll(/locale:\s*"([^"]+)"/g)].map((m) => m[1]);
        if (!locales.length || locales.some((v) => v !== langCfg.paddleLocale)) {
            fail(where, `Paddle locale literals [${locales}] must all be "${langCfg.paddleLocale}"`);
        }
        const enBody = en.scripts.join("\n");
        for (const name of ["CLIENT_TOKEN", "PRICE_ID"]) {
            const re = new RegExp(`${name}\\s*=\\s*"([^"]+)"`);
            if (enBody.match(re)?.[1] !== body.match(re)?.[1]) {
                fail(where, `${name} was altered — must match the English page`);
            }
        }
    }

    // 5. contact.html Turnstile language
    if (page === "contact.html") {
        const ts = tr.events.find((e) => e.kind === "tag" && e.tag === "div"
            && (e.attrs.class || "").includes("cf-turnstile"));
        if (!ts || ts.attrs["data-language"] !== langCfg.turnstileLang) {
            fail(where, `Turnstile data-language must be "${langCfg.turnstileLang}"`);
        }
    }

    // 6. untranslated-leak heuristic
    const enTexts = new Set(en.texts);
    for (const t of tr.texts) {
        if (t.split(" ").length > 4 && enTexts.has(t)
            && !tr.citeTexts.has(t)
            && !LEAK_WHITELIST.some((w) => t.includes(w))) {
            fail(where, `untranslated English text: ${JSON.stringify(t.slice(0, 80))}`);
        }
    }

    // 7. staleness
    const snap = join(SNAP_DIR, lang, page);
    if (!existsSync(snap)) {
        fail(where, "no snapshot recorded — run --accept after translating");
    } else {
        const cur = readFileSync(enPath, "utf8");
        const old = readFileSync(snap, "utf8");
        if (cur !== old) {
            fail(where, "STALE — English changed since this translation was accepted:\n"
                + unifiedDiff(old, cur, `snapshot/${page}`, `english/${page}`));
        }
    }
}

function checkEnglishPages() {
    for (const page of CONFIG.translatedPages) {
        const parsed = readPage(join(ROOT, page));
        checkHreflang(page, page, parsed, "en");
        checkSwitcher(page, page, parsed, "en");
        checkRedirectSnippet(page, parsed);
        checkLinks(page, page, parsed, "en");
    }
    for (const page of CONFIG.englishOnlyPages) {
        const parsed = readPage(join(ROOT, page));
        let canonical = null;
        for (const e of parsed.events) {
            if (e.kind === "tag" && e.tag === "link" && e.attrs.rel === "canonical") canonical = e.attrs.href;
        }
        const want = pageUrl("en", page);
        if (canonical !== want) fail(page, `canonical is ${JSON.stringify(canonical)}, expected "${want}"`);
        if (switcherEntries(parsed).length) fail(page, "legal pages must not carry the language switcher");
        checkLinks(page, page, parsed, "en");
    }
}

/* ------------------------------------------------------------------------
 * Commands
 * ---------------------------------------------------------------------- */
function cmdCheck(onlyLang) {
    checkEnglishPages();
    for (const l of CONFIG.languages) {
        if (onlyLang && l.code !== onlyLang) continue;
        for (const page of CONFIG.translatedPages) checkTranslatedPage(l, page);
    }
    for (const { where, msg } of findings) console.log(`FAIL  ${where}: ${msg}`);
    if (findings.length) {
        console.log(`\n${findings.length} finding(s).`);
        return 1;
    }
    const n = onlyLang ? 1 : CONFIG.languages.length;
    console.log(`OK — English invariants + ${n} language(s) x ${CONFIG.translatedPages.length} pages clean.`);
    return 0;
}

function cmdAccept(lang, pages) {
    if (!CONFIG.languages.some((l) => l.code === lang)) {
        console.error(`unknown language "${lang}" (not in languages.json)`);
        return 1;
    }
    const dest = join(SNAP_DIR, lang);
    mkdirSync(dest, { recursive: true });
    for (const page of pages.length ? pages : CONFIG.translatedPages) {
        const src = join(ROOT, page);
        const tgt = join(dest, page);
        if (existsSync(tgt)) {
            const oldText = readFileSync(tgt, "utf8");
            const newText = readFileSync(src, "utf8");
            if (oldText !== newText) {
                console.log(unifiedDiff(oldText, newText, `old-snapshot/${page}`, `new-snapshot/${page}`));
            }
        }
        copyFileSync(src, tgt);
        console.log(`accepted ${lang}/${page} (snapshot updated)`);
    }
    return 0;
}

function cmdSitemap() {
    const urls = [
        ...CONFIG.translatedPages.map((p) => pageUrl("en", p)),
        ...CONFIG.englishOnlyPages.map((p) => pageUrl("en", p)),
        ...CONFIG.languages.flatMap((l) => CONFIG.translatedPages.map((p) => pageUrl(l.code, p))),
    ];
    const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((u) => `  <url><loc>${u}</loc></url>`),
        "</urlset>", ""].join("\n");
    writeFileSync(join(ROOT, "sitemap.xml"), xml, "utf8");
    console.log(`sitemap.xml written (${urls.length} URLs)`);
    return 0;
}

function cmdPrintBlocks(page) {
    console.log("<!-- hreflang block -->");
    for (const line of expectedHreflang(page)) console.log("    " + line);
    console.log("\n<!-- language switcher (English page) -->");
    for (const line of expectedSwitcher(page, "en")) console.log("            " + line);
    return 0;
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
if (has("--accept")) {
    const rest = argv.slice(argv.indexOf("--accept") + 1);
    process.exit(cmdAccept(rest[0], rest.slice(1)));
} else if (has("--sitemap")) {
    process.exit(cmdSitemap());
} else if (has("--print-blocks")) {
    process.exit(cmdPrintBlocks(valOf("--print-blocks")));
} else {
    process.exit(cmdCheck(valOf("--lang")));
}
