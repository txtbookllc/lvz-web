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
 *   node tools/i18n-check.mjs --accept --blocks-only XX [page..]
 *                                                   same, but REFUSES unless the English change is
 *                                                   confined to the managed language-list blocks
 *   node tools/i18n-check.mjs --rewrite-blocks [--dry-run]
 *                                                   regenerate the three language-list blocks
 *                                                   (hreflang run, switcher <ul>, LANGS array)
 *                                                   in English + translations + snapshots, in
 *                                                   one atomic pass. --dry-run exits nonzero if
 *                                                   anything would change.
 *   node tools/i18n-check.mjs --leak-audit [--propose]
 *                                                   bucket every unit as ALWAYS_SAME / ALWAYS_DIFF
 *                                                   / MIXED across the shipped languages. MIXED is
 *                                                   where leaks live. --propose emits ready-to-paste
 *                                                   i18n/leak-allow.json entries.
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
    // Offset pass (0.4): every translatable span's RAW byte range in `html`, in document
    // order. {kind:"text"|"attr"|"js", start, end, raw, path, parentId, tag?, attr?, scriptIndex?}
    // Positions only — deciding which of these are translatable UNITS is --extract's job.
    const spans = [];
    // Element identity (0.5 prerequisite): one record per START TAG, in document order,
    // including void and self-closing tags — a <br> is a child element even though it never
    // enters the stack. This is what lets --extract group text fragments into UNITS: a unit
    // is a container element's inner HTML, not a text node, because word order crosses inline
    // tag boundaries ("Hold <strong>Ctrl</strong> and scroll"). Without element identity the
    // question "which element does this text belong to" cannot be answered from the parse.
    // Offsets: tagStart = "<", contentStart = after ">", contentEnd = "<" of the close tag,
    // tagEnd = after the close tag's ">". Void/self-closing: contentStart == contentEnd == tagEnd.
    const elements = [];
    const URL_ATTRS = { a: ["href"], link: ["href"], img: ["src"],
        source: ["src"], video: ["poster", "src"], script: ["src"], form: ["action"] };
    let i = 0;
    const stack = [];
    // Parallel to `stack`, holding element ids. Kept in lockstep so `stack` keeps its plain
    // string semantics for the existing includes()/lastIndexOf() callers.
    const openIds = [];
    const curId = () => (openIds.length ? openIds[openIds.length - 1] : -1);
    function openElement(tag, attrs, tagStart, contentStart) {
        const parentId = curId();
        const el = { id: elements.length, tag, parentId, children: [], attrs,
            tagStart, contentStart, contentEnd: contentStart, tagEnd: contentStart };
        elements.push(el);
        if (parentId !== -1) elements[parentId].children.push(el.id);
        return el;
    }
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
                    // Offset pass: the RAW slice, trimmed of surrounding whitespace so the span
                    // covers the text and not the markup indentation. Never store the decoded
                    // form — the source mixes &rsquo; with raw ’ in the same file, so a
                    // normalize-then-re-encode round trip would churn English bytes and
                    // invalidate every snapshot.
                    const lead = raw.length - raw.trimStart().length;
                    const trail = raw.length - raw.trimEnd().length;
                    spans.push({ kind: "text", start: i + lead, end: j - trail,
                        raw: raw.slice(lead, raw.length - trail), path: stack.slice(),
                        parentId: curId() });
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
            if (at !== -1) {
                // Close the matched element and any implicitly-closed descendants. This markup
                // is well-formed so `at` is normally the innermost open element; the loop is
                // there so an element can never be left with contentEnd == contentStart.
                for (let k = openIds.length - 1; k >= at; k--) {
                    const el = elements[openIds[k]];
                    el.contentEnd = i;
                    el.tagEnd = end + 1;
                }
                stack.length = at;
                openIds.length = at;
            }
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
        // The id openElement() will assign below. Nothing else pushes to `elements` in
        // between, so attribute spans can name their own element before it is created.
        const elemId = elements.length;
        const attrRe = /([a-zA-Z_:@][\w:.@-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        attrRe.lastIndex = m[0].length;
        for (let am; (am = attrRe.exec(body));) {
            const val = am[2] ?? am[3] ?? am[4];
            const name = am[1].toLowerCase();
            attrs[name] = val === undefined ? "" : decodeEntities(val);
            if (val !== undefined && TRANSLATABLE_ATTRS.has(name)) {
                // Offset of the value inside the tag: body starts at i+1, and the value sits
                // at the tail of the match (minus the closing quote, if any).
                const quoted = am[2] !== undefined || am[3] !== undefined;
                const startInMatch = am[0].length - val.length - (quoted ? 1 : 0);
                const start = i + 1 + am.index + startInMatch;
                spans.push({ kind: "attr", start, end: start + val.length, raw: val,
                    tag, attr: name, path: stack.slice(), parentId: curId(), elemId });
            }
        }
        events.push({ kind: "tag", tag, attrs });
        const el = openElement(tag, attrs, i, end + 1);
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
            if (tag === "script" && !("src" in attrs)) {
                const scriptBody = html.slice(i, rawEnd);
                const scriptIndex = scripts.length;
                const base = i;   // literal offsets are script-relative; rebase onto the file
                scripts.push(scriptBody);
                scanJs(scriptBody, (lit) => spans.push({ kind: "js", start: base + lit.start,
                    end: base + lit.end, raw: lit.raw, quote: lit.quote,
                    scriptIndex, path: stack.slice(), parentId: el.id }));
            }
            i = cm ? rawEnd + cm[0].length : html.length;
            // Raw-text elements never enter the stack, so close them here.
            el.contentEnd = rawEnd;
            el.tagEnd = i;
            events.push({ kind: "end", tag, attrs: null });
        } else if (!selfClose && !VOID_TAGS.has(tag)) {
            stack.push(tag);
            openIds.push(el.id);
        }
    }
    return { events, texts, citeTexts, scripts, links, spans, elements, html, file };
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
function scanJs(code, onLiteral) {
    let out = "", state = "code", litStart = -1;
    for (let i = 0; i < code.length; i++) {
        const c = code[i], n = code[i + 1];
        if (state === "code") {
            if (c === "'" || c === '"') { state = c; litStart = i + 1; out += "«S»"; }
            else if (c === "/" && n === "/") { state = "line"; i++; }
            else if (c === "/" && n === "*") { state = "block"; i++; }
            else out += c;
        } else if (state === "'" || state === '"') {
            if (c === "\\") i++;
            else if (c === state) {
                // RAW slice: the literal's bytes exactly as written, escapes intact.
                if (onLiteral) onLiteral({ start: litStart, end: i, quote: state,
                    raw: code.slice(litStart, i) });
                state = "code";
            }
        } else if (state === "line") {
            if (c === "\n") { state = "code"; out += "\n"; }
        } else if (state === "block") {
            if (c === "*" && n === "/") { state = "code"; i++; }
        }
    }
    return out.replace(/\s+/g, " ").trim();
}

/* Script parity only needs the code skeleton; --extract needs the literals too.
 * Same scanner, so the two can never disagree about what a string literal is. */
const stripJs = (code) => scanJs(code, null);

/* ------------------------------------------------------------------------
 * 0.5 --extract: translatable UNITS
 *
 * The unit is NOT a text node. It is the OUTERMOST element whose entire subtree is
 * inline-only and contains text, with inline descendants replaced by numbered
 * placeholders. Splitting "Hold <strong>Ctrl</strong> and scroll" into three units
 * produces broken German/Japanese/Arabic, because word order crosses the tag boundary.
 *
 * Measured on the English pages (this is a counted census, not an estimate):
 *   537 units · 93 hold more than one text fragment · 177 contain markup · 0 orphans
 *   (no visible text falls outside the rule, so there is no fallback path to get wrong)
 *   placeholders: a×156 strong×87 em×19 img×15 code×13 span×10 br×2 svg×1 polyline×1
 *
 * Every emitted span is a RAW slice. Nothing round-trips through decodeEntities: the
 * source mixes &rsquo; with raw ’ in the same file, so normalize-then-re-encode would
 * churn English bytes and invalidate all 126 snapshots.
 * ---------------------------------------------------------------------- */

/* Tags that may appear INSIDE a unit as a placeholder rather than ending it. */
const INLINE_TAGS = new Set(["a", "strong", "em", "b", "i", "span", "code", "br", "small",
    "sub", "sup", "abbr", "cite", "kbd", "mark", "u", "s", "q", "time", "var", "samp",
    "wbr", "bdi", "bdo", "img", "del", "ins",
    // inline SVG is decoration inside links/buttons; it never ends a text unit
    "svg", "path", "circle", "rect", "g", "line", "polyline", "polygon", "use", "defs"]);

/* Attributes carrying human copy. Deliberately NOT reusing TRANSLATABLE_ATTRS: that set
 * means "legitimately differs from English", which also covers lang/dir/hreflang/
 * aria-current/data-language — those differ because they are COMPUTED, and handing them
 * to a translator would be a bug. Confirmed against all 18 shipped languages. */
const ATTR_TRANSLATE = new Set(["alt", "title", "aria-label", "placeholder",
    "data-label-play", "data-label-pause"]);
const META_TRANSLATE = new Set(["description", "og:title", "og:description",
    "og:image:alt", "twitter:title", "twitter:description"]);

/* JSON-LD. On faq.html this is 9.9 KB — larger than that page's visible text — so it
 * cannot be treated as code. Classification verified against the 18 shipped languages:
 * every key below was translated in every language, and every key NOT below was left
 * byte-identical in every language (author.name/publisher.name = "txtbook LLC",
 * offers.category, operatingSystem, applicationSubCategory, top-level product name),
 * except url/inLanguage which differ but are COMPUTED, not translated. */
const LD_TRANSLATE = new Set(["description", "text", "headline", "alternateName",
    "disambiguatingDescription"]);

/* Opt-in marker for user-facing string literals in inline scripts. Built as a value so
 * this file can mention it without closing its own block comments. */
const UI_MARK = "/*" + " i18n:ui " + "*/";
/* `name` depends on where it sits: mainEntity[].name and about[].name are copy;
 * author.name / publisher.name / the top-level product name are not. */
const ldNameIsCopy = (path) => path.endsWith(".name")
    && !/(^|\.)(author|publisher|provider|brand)\.name$/.test(path);

/* Minimal JSON scanner that keeps BYTE OFFSETS and key paths. JSON.parse loses both, and
 * re-serializing would reformat the block and break byte-identity. Same discipline as
 * scanJs: report the raw slice between the quotes, escapes intact. */
function scanJson(src, onString) {
    let i = 0;
    const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    function str() {
        const start = ++i;                       // past the opening quote
        while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
        const end = i++;                         // past the closing quote
        return { start, end, raw: src.slice(start, end) };
    }
    function value(path) {
        ws();
        const c = src[i];
        if (c === '"') { onString(path, str()); return; }
        if (c === "{") {
            i++;
            for (;;) {
                ws();
                if (i >= src.length || src[i] === "}") { i++; return; }
                if (src[i] === ",") { i++; continue; }
                const k = str();
                ws(); i++;                       // the ':'
                value(path ? `${path}.${k.raw}` : k.raw);
            }
        } else if (c === "[") {
            i++;
            for (let n = 0;;) {
                ws();
                if (i >= src.length || src[i] === "]") { i++; return; }
                if (src[i] === ",") { i++; continue; }
                value(`${path}[${n++}]`);
            }
        } else {
            while (i < src.length && !/[,}\]\s]/.test(src[i])) i++;   // number/bool/null
        }
    }
    value("");
}

/* Structural id for a unit: a path that survives rewording, so --delta can pair units
 * across an English edit. An ancestor's `id` attribute beats a positional index. No
 * data-i18n-id attributes are added — the hand-readability of this markup is the asset. */
function elementPath(els, el) {
    const segs = [];
    let cur = el;
    while (cur) {
        if (cur !== el && cur.attrs && cur.attrs.id) { segs.unshift("#" + cur.attrs.id); break; }
        const par = cur.parentId === -1 ? null : els[cur.parentId];
        if (!par) { segs.unshift(cur.tag); break; }
        const sibs = par.children.map((c) => els[c]).filter((c) => c.tag === cur.tag);
        segs.unshift(sibs.length > 1 ? `${cur.tag}[${sibs.indexOf(cur) + 1}]` : cur.tag);
        cur = par;
    }
    return segs.join("/");
}

/* Short stable content hash, kept as a SEPARATE field from the id: the path survives a
 * reword, the hash re-pairs a moved unit and tells a reword apart from a brand-new unit. */
function hash8(s) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
        h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193);
        h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) ^ (h2 >>> 13);
    }
    return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).slice(0, 8);
}

/* Replace a unit's inline descendants with numbered placeholders. Returns the placeholder
 * text plus the raw open/close tags needed to rebuild the original bytes exactly. */
function placeholderize(html, els, root, start, end) {
    const tags = {};
    const edits = [];
    let n = 0;
    (function walk(id) {
        for (const cid of els[id].children) {
            const c = els[cid];
            if (c.tagStart < start || c.tagEnd > end) continue;
            const k = String(++n);
            const open = html.slice(c.tagStart, c.contentStart);
            if (c.tagEnd === c.contentStart) {            // void / self-closing
                tags[k] = { o: open };
                edits.push({ start: c.tagStart, end: c.tagEnd, text: `<${k}/>` });
                continue;
            }
            tags[k] = { o: open, c: html.slice(c.contentEnd, c.tagEnd) };
            edits.push({ start: c.tagStart, end: c.contentStart, text: `<${k}>` });
            edits.push({ start: c.contentEnd, end: c.tagEnd, text: `</${k}>` });
            walk(cid);
        }
    })(root.id);
    let text = html.slice(start, end);
    for (const e of edits.sort((a, b) => b.start - a.start)) {
        text = text.slice(0, e.start - start) + e.text + text.slice(e.end - start);
    }
    return { text, tags };
}

/* Rebuild a unit's raw inner HTML from its placeholder text. Inverse of placeholderize. */
function unplaceholderize(text, tags) {
    return text.replace(/<(\/?)(\d+)(\/?)>/g, (m, close, k, self) => {
        const t = tags && tags[k];
        if (!t) return m;
        return close ? (t.c ?? "") : t.o;
    });
}

/* ------------------------------------------------------------------------
 * extractUnits: the whole translatable surface of one page, as offset-anchored units.
 *
 * Returns { units, splices, stats }.
 *   units   — what a translator is shown (deduped by identical English text)
 *   splices — every (unit, byte range) pair, for reassembly. A unit that was deduped
 *             contributes several splices. Ranges here are non-overlapping.
 * ---------------------------------------------------------------------- */
function extractUnits(parsed) {
    const { html, elements: els, spans } = parsed;
    const units = [];
    const splices = [];
    const byText = new Map();          // English text -> unit, for dedupe
    const stats = { text: 0, attr: 0, ld: 0, js: 0, skippedManaged: 0, nested: 0 };

    const add = (id, kind, text, extra) => {
        const key = kind + " " + text + " " + JSON.stringify(extra?.tags ?? null);
        let u = byText.get(key);
        if (u) { u.at.push(id); return u; }
        u = { id, kind, hash: hash8(text), text, at: [id], ...extra };
        byText.set(key, u);
        units.push(u);
        stats[kind]++;
        return u;
    };

    /* --- managed territory: the language switcher is regenerated by --rewrite-blocks
       from languages.json (19 <li> rows + the summary label), so it needs zero
       translation. Its one authored string, switcherLabel, lives in languages.json. --- */
    const managed = new Set();
    for (const el of els) {
        const isSw = el.tag === "details" && (el.attrs.class || "").includes("lang-switch");
        if (isSw || (el.parentId !== -1 && managed.has(el.parentId))) managed.add(el.id);
    }

    /* --- subtree facts, bottom-up --- */
    const textSpans = new Map();
    for (const s of spans) {
        if (s.kind !== "text" || s.parentId === -1) continue;
        if (els[s.parentId].tag === "script" || els[s.parentId].tag === "style") continue;
        if (!textSpans.has(s.parentId)) textSpans.set(s.parentId, []);
        textSpans.get(s.parentId).push(s);
    }
    const hasText = new Array(els.length).fill(false);
    const allInline = new Array(els.length).fill(true);
    for (let k = els.length - 1; k >= 0; k--) {
        hasText[k] = (textSpans.get(k) || []).length > 0;
        for (const cid of els[k].children) {
            const c = els[cid];
            if (c.tag === "script" || c.tag === "style") { allInline[k] = false; continue; }
            if (!INLINE_TAGS.has(c.tag) || !allInline[cid]) allInline[k] = false;
            if (hasText[cid]) hasText[k] = true;
        }
    }
    const isUnit = (k) => hasText[k] && allInline[k]
        && els[k].tag !== "script" && els[k].tag !== "style";

    /* --- text units (outermost only) --- */
    const unitRanges = [];
    for (let k = 0; k < els.length; k++) {
        if (!isUnit(k)) continue;
        let anc = els[k].parentId, nested = false;
        while (anc !== -1) { if (isUnit(anc)) { nested = true; break; } anc = els[anc].parentId; }
        if (nested) continue;
        if (managed.has(k)) { stats.skippedManaged++; continue; }
        const el = els[k];
        const inner = html.slice(el.contentStart, el.contentEnd);
        const lead = inner.length - inner.trimStart().length;
        const trail = inner.length - inner.trimEnd().length;
        const start = el.contentStart + lead, end = el.contentEnd - trail;
        if (end <= start) continue;
        const { text, tags } = placeholderize(html, els, el, start, end);
        const u = add(elementPath(els, el), "text", text,
            Object.keys(tags).length ? { tags } : undefined);
        splices.push({ start, end, unit: u });
        unitRanges.push({ start, end });
    }

    /* --- attribute units --- */
    const insideUnit = (s) => unitRanges.some((r) => s.start >= r.start && s.end <= r.end);
    for (const s of spans) {
        if (s.kind !== "attr" || !s.raw.trim()) continue;
        const own = els[s.elemId];
        if (managed.has(s.elemId)) { stats.skippedManaged++; continue; }
        let name = s.attr, id;
        if (s.tag === "meta") {
            const key = own.attrs.name || own.attrs.property || "";
            if (!META_TRANSLATE.has(key)) continue;
            id = `meta[${key}]@content`;
        } else {
            if (!ATTR_TRANSLATE.has(name)) continue;
            id = `${elementPath(els, own)}@${name}`;
        }
        const u = add(id, "attr", s.raw);
        // An attribute on a placeholder tag (an <img alt> inside a sentence) sits INSIDE a
        // text unit's byte range. It is still shown to the translator, but it must not be
        // spliced separately or the two writes would overlap — the text unit's raw slice
        // already carries those bytes. (When --inject is built it will have to patch the
        // attribute inside the placeholder's open tag; v1's agent writes the HTML itself.)
        if (insideUnit(s)) stats.nested++;
        else splices.push({ start: s.start, end: s.end, unit: u });
    }

    /* --- JSON-LD units --- */
    let ldIdx = 0;
    for (const el of els) {
        if (el.tag !== "script" || (el.attrs.type || "") !== "application/ld+json") continue;
        const base = el.contentStart;
        const body = html.slice(el.contentStart, el.contentEnd);
        const tag = `#ld${ldIdx++}`;
        scanJson(body, (path, s) => {
            const leaf = path.split(".").pop().replace(/\[\d+\]$/, "");
            const copy = LD_TRANSLATE.has(leaf) || ldNameIsCopy(path);
            if (!copy || !s.raw.trim()) return;
            const u = add(`${tag}:${path}`, "ld", s.raw);
            splices.push({ start: base + s.start, end: base + s.end, unit: u });
        });
    }

    /* --- inline-script literals: OPT-IN ONLY ---
       Script literals cannot be classified heuristically: across the English pages "en"
       occurs 13 times as both a locale value and an untouchable fallback, and "buy-card"
       and "Copied!" are both short ASCII. So a literal is translatable only if it sits in
       an object introduced by the marker comment UI_MARK below. Nothing carries that
       marker today; buy.html's four user-facing strings get hoisted into one when the
       language expansion lands and every snapshot is re-accepted anyway. */
    for (const el of els) {
        if (el.tag !== "script" || el.attrs.src || (el.attrs.type || "").includes("json")) continue;
        const body = html.slice(el.contentStart, el.contentEnd);
        const mark = body.indexOf(UI_MARK);
        if (mark === -1) continue;
        const close = body.indexOf("};", mark);
        const region = { lo: el.contentStart + mark, hi: el.contentStart + (close === -1 ? body.length : close) };
        for (const s of spans) {
            if (s.kind !== "js" || s.start < region.lo || s.end > region.hi || !s.raw.trim()) continue;
            const key = html.slice(html.lastIndexOf("\n", s.start), s.start).match(/([\w$]+)\s*:\s*["']$/);
            const u = add(`#js:${key ? key[1] : s.start}`, "js", s.raw);
            splices.push({ start: s.start, end: s.end, unit: u });
        }
    }

    splices.sort((a, b) => a.start - b.start);
    return { units, splices, stats };
}

/* Rebuild a page's bytes from its own extracted units. This is the correctness proof for
 * --extract (and, if it is ever built, for --inject): every unit is an exact raw slice,
 * placeholders invert exactly, and nothing outside a unit is touched. */
function reassemble(parsed, { splices }, textFor) {
    const { html } = parsed;
    let out = "", cur = 0;
    for (const sp of splices) {
        if (sp.start < cur) throw new Error(`overlapping splices at ${sp.start}`);
        const t = textFor ? textFor(sp.unit) : sp.unit.text;
        out += html.slice(cur, sp.start)
            + (sp.unit.kind === "text" ? unplaceholderize(t, sp.unit.tags) : t);
        cur = sp.end;
    }
    return out + html.slice(cur);
}

/* ------------------------------------------------------------------------
 * 0.6 — per-unit leak check
 *
 * The old heuristic (still below, as check #6) compares whole TEXT NODES and only fires
 * above 4 words. That left headings, buttons, every translatable ATTRIBUTE, all of
 * JSON-LD and compare.html's 253 mostly-short table cells unchecked. Comparing --extract's
 * units by id closes all of it at once: a unit whose translation equals English is a leak,
 * at any length, in any of the four kinds.
 *
 * Comparison is on a NORMALIZED form (entities decoded, whitespace collapsed), which makes
 * the check stricter than raw-byte equality — "&rsquo;" vs "’" cannot hide a leak.
 *
 * The whitelist exists because identical is not always wrong, and the distinction is not
 * derivable from content. Measured across the 18 shipped languages: 27 units are identical
 * in EVERY language and 75 in SOME. Within that 75, `nl` "Product", `es` "Legal",
 * `de` "Support", `es`/`it` "No", `fr` "Message" are COGNATES — ordinary copy that happens
 * to coincide — while `th` leaving aria-label="Primary" is a leak. No content rule separates
 * those, so the allowance is data, split on a principle rather than a list:
 *
 *   pins     — the unit is a proper noun, price, key name, or citation. It SHOULD be
 *              identical in any language, so it is allowed in ALL of them and every new
 *              language inherits it for free.
 *   cognates — ordinary copy that coincides in a NAMED language. A new language gets no
 *              free pass; it trips the check once and a human decides. That review is the
 *              point, and it is ~30 seconds with --leak-audit --propose.
 *
 * Entries are keyed by (unit id, English text). Keying on the English text as well means a
 * reword of the English silently REVOKES the allowance and forces the unit to be re-reviewed
 * — the failure mode a whitelist would otherwise have.
 * ---------------------------------------------------------------------- */
const normalizeUnit = (s) => decodeEntities(s).replace(/\s+/g, " ").trim();
const allowKey = (id, enText) => `${id} ${normalizeUnit(enText)}`;

const LEAK_ALLOW_FILE = join(ROOT, "i18n", "leak-allow.json");
function loadLeakAllow() {
    const empty = { pin: new Set(), cognate: new Map(), raw: { pins: [], cognates: [] } };
    if (!existsSync(LEAK_ALLOW_FILE)) return empty;
    const raw = JSON.parse(readFileSync(LEAK_ALLOW_FILE, "utf8"));
    const pin = new Set((raw.pins || []).map((e) => allowKey(e.id, e.en)));
    const cognate = new Map();
    for (const e of raw.cognates || []) cognate.set(allowKey(e.id, e.en), new Set(e.langs || []));
    return { pin, cognate, raw };
}
const LEAK_ALLOW = loadLeakAllow();

/* unit id -> unit, expanding deduped units through their `at` list. */
function unitsById(parsed) {
    const m = new Map();
    for (const u of extractUnits(parsed).units) for (const id of u.at) m.set(id, u);
    return m;
}

/* English extraction is identical for all 18 languages; do it once per page. */
const enUnitCache = new Map();
function englishUnits(page, parsed) {
    if (!enUnitCache.has(page)) enUnitCache.set(page, unitsById(parsed));
    return enUnitCache.get(page);
}

function checkUnitLeaks(where, enUnits, trUnits, lang) {
    for (const [id, en] of enUnits) {
        const tr = trUnits.get(id);
        // A missing or extra unit is unit-set parity's finding, not a leak; --extract-selftest
        // owns that gate and reporting it twice would just be noise.
        if (!tr) continue;
        const enText = normalizeUnit(en.text);
        if (!enText || normalizeUnit(tr.text) !== enText) continue;
        const k = allowKey(id, en.text);
        if (LEAK_ALLOW.pin.has(k)) continue;
        if (LEAK_ALLOW.cognate.get(k)?.has(lang)) continue;
        fail(where, `untranslated ${en.kind} unit ${id}: ${JSON.stringify(enText.slice(0, 70))}`
            + ` — translate it, or add it to i18n/leak-allow.json with a reason`);
    }
}

/* ------------------------------------------------------------------------
 * 0.6 — img@src localization
 *
 * structuralStream() deliberately drops /media/store-badge/ and /media/howto-* from
 * structural parity because they are localized per language, and checkLinks() only tests
 * existsSync — and /media/store-badge/en.svg exists. So a translated page shipping the
 * ENGLISH store badge passed every check. Measured over the 18 shipped languages: 209
 * localized asset references, 0 wrong — the blind spot is real but has never been
 * exercised. This check exists so that stays true through 18 more languages, which is
 * exactly when a copy-paste leaves en.svg behind.
 *
 * The expectation is DERIVED from the English page rather than hardcoded, and an
 * unrecognized pattern FAILS rather than passing quietly — the failure mode this check
 * was written to close.
 * ---------------------------------------------------------------------- */
const LOCALIZED_ASSET = /^\/media\/(?:store-badge\/|howto-)/;

/* Naming convention, confirmed against all 18 languages:
 *   /media/store-badge/<lang>.svg   — always carries a code, English included
 *   /media/howto-<name>.svg         — English; translations insert .<lang> before the ext */
function localizedAssetFor(src, lang) {
    let m = /^(\/media\/store-badge\/)[^/]+(\.[a-z0-9]+)$/.exec(src);
    if (m) return `${m[1]}${lang}${m[2]}`;
    m = /^(\/media\/howto-[^./]+)(?:\.[^./]+)?(\.[a-z0-9]+)$/.exec(src);
    if (m) return lang === "en" ? `${m[1]}${m[2]}` : `${m[1]}.${lang}${m[2]}`;
    return null;
}

function assetRefs(parsed) {
    const out = [];
    for (const e of parsed.events) {
        if (e.kind !== "tag" || !e.attrs) continue;
        for (const attr of ["src", "poster", "href"]) {
            const v = e.attrs[attr];
            if (typeof v === "string" && LOCALIZED_ASSET.test(v)) out.push({ tag: e.tag, attr, src: v });
        }
    }
    return out;
}

function checkLocalizedAssets(where, en, tr, lang) {
    const a = assetRefs(en), b = assetRefs(tr);
    if (a.length !== b.length) {
        fail(where, `${b.length} localized asset reference(s), English has ${a.length}`);
        return;
    }
    for (let i = 0; i < a.length; i++) {
        const want = localizedAssetFor(a[i].src, lang);
        if (want === null) {
            fail(where, `unrecognized localized-asset pattern ${JSON.stringify(a[i].src)}`
                + " — teach localizedAssetFor() the new family rather than exempting it");
            continue;
        }
        if (b[i].src !== want) {
            fail(where, `<${b[i].tag} ${b[i].attr}=${JSON.stringify(b[i].src)}> must be `
                + `${JSON.stringify(want)} — a translated page is showing another language's artwork`);
        }
    }
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
    const cur = currentLang === "en" ? null
        : CONFIG.languages.find((l) => l.code === currentLang);
    // The <span> always carries nativeName verbatim, but the aria-label is authored per
    // language and is NOT derivable from it: Polish lowercases the language name in running
    // text ("Język: polski" vs nativeName "Polski"), French puts &nbsp; before its colon, and
    // Chinese uses a full-width colon with no space. Hence switcherLabel, stored RAW so
    // entities survive into the emitted markup byte-for-byte.
    const name = cur ? cur.nativeName : "English";
    const ariaLabel = cur ? cur.switcherLabel : "Language: English";
    return [
        `<details class="lang-switch">`,
        `    <summary aria-label="${ariaLabel}">`,
        `        <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9s1.3-6.5 3.8-9z"/></svg>`,
        `        <span>${name}</span>`,
        `    </summary>`,
        `    <ul>`,
        ...switcherItems(page, currentLang).map((l) => `        ${l}`),
        `    </ul>`,
        `</details>`,
    ];
}

/* The <li> rows of the switcher, unindented. This is the only part of the switcher
 * block --rewrite-blocks regenerates: <summary>, <svg> and <span> are preserved
 * territory (they carry per-language authored text, not a function of languages.json). */
function switcherItems(page, currentLang) {
    const rows = [[`en`, `en`, `English`]]
        .concat(CONFIG.languages.map((l) => [l.code, l.hreflang, l.nativeName]));
    return rows.map(([code, hreflang, name]) => {
        const cur = code === currentLang ? ` aria-current="true"` : "";
        return `<li><a href="${switcherHref(code, page)}" data-lang="${code}" lang="${code}" hreflang="${hreflang}"${cur}>${name}</a></li>`;
    });
}

/* ------------------------------------------------------------------------
 * Managed regions
 *
 * Three blocks on every translated page are pure functions of languages.json:
 * the hreflang run, the switcher's <ul> interior, and the LANGS array in the head
 * redirect snippet. --rewrite-blocks regenerates them in place across English,
 * translations and snapshots so adding a language is one script run, not a ~259
 * (soon ~511) file hand edit.
 *
 * These are OFFSET SPLICES into the raw file text — never a split/rejoin.
 * The repo has MIXED line endings (core.autocrlf=true, no .gitattributes): English
 * is CRLF except buy.html, translations are split 4/3 and 1/6 CRLF/LF by wave-1
 * batch, snapshots are 6/1. Rebuilding a whole file would strip \r from ~200 files,
 * rewrite them entirely, and break snapshot/English byte-equality — marking all 18
 * shipped languages STALE in one commit. Every splice below preserves the bytes
 * outside its region exactly, and emits the line ending already in use inside it.
 * ---------------------------------------------------------------------- */

/* The line ending in use inside [start,end); falls back to the file's dominant one. */
function eolIn(html, start, end) {
    const nl = html.indexOf("\n", start);
    if (nl === -1 || nl >= end) return html.includes("\r\n") ? "\r\n" : "\n";
    return nl > 0 && html[nl - 1] === "\r" ? "\r\n" : "\n";
}
const lineStartAt = (html, i) => html.lastIndexOf("\n", i) + 1;
const indentAt = (html, i) => html.slice(i, i + 64).match(/^[ \t]*/)[0];

const HREFLANG_LINE = /^[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*">[ \t]*\r?$/;

/* The contiguous run of <link rel="alternate" hreflang=...> lines. */
function findHreflangRegion(html) {
    const first = html.indexOf('<link rel="alternate" hreflang=');
    if (first === -1) return null;
    const start = lineStartAt(html, first);
    let cur = start, end = start;
    while (cur < html.length) {
        let nl = html.indexOf("\n", cur);
        if (nl === -1) nl = html.length;
        if (!HREFLANG_LINE.test(html.slice(cur, nl))) break;
        end = Math.min(nl + 1, html.length);
        cur = end;
    }
    if (end === start) return null;
    return { start, end, indent: indentAt(html, start), eol: eolIn(html, start, end) };
}

/* The <li> rows between <ul> and </ul> inside <details class="lang-switch">. */
function findSwitcherRegion(html) {
    const d = html.indexOf('<details class="lang-switch">');
    if (d === -1) return null;
    const dEnd = html.indexOf("</details>", d);
    const ul = html.indexOf("<ul>", d);
    if (ul === -1 || (dEnd !== -1 && ul > dEnd)) return null;
    const ulClose = html.indexOf("</ul>", ul);
    if (ulClose === -1) return null;
    const start = html.indexOf("\n", ul) + 1;      // first <li> line
    const end = lineStartAt(html, ulClose);        // the </ul> line
    if (!start || end < start) return null;
    return { start, end, indent: indentAt(html, start), eol: eolIn(html, start, end) };
}

/* The interior of the LANGS array literal in the head redirect snippet. */
function findLangsRegion(html) {
    const m = /LANGS\s*=\s*\[([^\]]*)\]/.exec(html);
    if (!m) return null;
    const start = m.index + m[0].indexOf("[") + 1;
    return { start, end: start + m[1].length, indent: "", eol: "" };
}

/* Compute the rewritten text for one file. Splices are applied last-offset-first
 * so earlier offsets stay valid. Returns null if the file carries no managed block. */
function rewriteManagedBlocks(orig, page, lang) {
    const edits = [];
    const missing = [];

    const h = findHreflangRegion(orig);
    if (h) edits.push({ ...h, name: "hreflang",
        text: expectedHreflang(page).map((l) => h.indent + l).join(h.eol) + h.eol });
    else missing.push("hreflang");

    const s = findSwitcherRegion(orig);
    if (s) edits.push({ ...s, name: "switcher",
        text: switcherItems(page, lang).map((l) => s.indent + l).join(s.eol) + s.eol });
    else missing.push("switcher");

    const g = findLangsRegion(orig);
    if (g) edits.push({ ...g, name: "LANGS",
        text: CONFIG.languages.map((l) => JSON.stringify(l.code)).join(", ") });
    else missing.push("LANGS");

    if (!edits.length) return null;
    let html = orig;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
        html = html.slice(0, e.start) + e.text + html.slice(e.end);
    }
    const changed = edits.filter((e) => orig.slice(e.start, e.end) !== e.text).map((e) => e.name);
    return { html, changed, missing };
}

/* Every file carrying managed blocks: English + translations + snapshots.
 * Snapshots are byte copies of the ENGLISH page, so their switcher language is "en". */
function managedTargets() {
    const out = [];
    for (const page of CONFIG.translatedPages) {
        out.push({ path: join(ROOT, page), page, lang: "en", label: page });
        for (const l of CONFIG.languages) {
            out.push({ path: join(ROOT, l.code, page), page, lang: l.code, label: `${l.code}/${page}` });
            out.push({ path: join(SNAP_DIR, l.code, page), page, lang: "en",
                label: `snapshots/${l.code}/${page}` });
        }
    }
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
        // API_BASE decides where the funnel beacon and the license-key poll go —
        // pinned like the payment constants so no copy can quietly drift.
        for (const name of ["CLIENT_TOKEN", "PRICE_ID", "API_BASE"]) {
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

    // 6a. per-unit leak check (0.6) — every unit, every kind, any length. Subsumes the
    // heuristic below for anything it can see; 6b is kept because it compares text nodes as
    // a SET and so still catches English pasted into the wrong element, which a per-id
    // comparison cannot.
    checkUnitLeaks(where, englishUnits(page, en), unitsById(tr), lang);

    // 6b. localized artwork (0.6)
    checkLocalizedAssets(where, en, tr, lang);

    // 6c. untranslated-leak heuristic
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

/* Replace the three managed regions with a sentinel, so two pages can be compared
 * on everything EXCEPT the language-list blocks. Line endings are normalized: the
 * question being asked is "did the CONTENT change", not "did the bytes change". */
function maskManaged(html) {
    const regions = [findHreflangRegion(html), findSwitcherRegion(html), findLangsRegion(html)]
        .filter(Boolean)
        .sort((a, b) => b.start - a.start);
    let out = html;
    for (const r of regions) out = out.slice(0, r.start) + "«MANAGED»" + out.slice(r.end);
    return out.replace(/\r\n/g, "\n");
}

function cmdAccept(lang, pages, blocksOnly) {
    if (!CONFIG.languages.some((l) => l.code === lang)) {
        console.error(`unknown language "${lang}" (not in languages.json)`);
        return 1;
    }
    const dest = join(SNAP_DIR, lang);
    mkdirSync(dest, { recursive: true });
    let refused = 0;
    for (const page of pages.length ? pages : CONFIG.translatedPages) {
        const src = join(ROOT, page);
        const tgt = join(dest, page);
        // --blocks-only: re-accept ONLY if English changed exclusively inside the managed
        // language-list blocks. Plain --accept silently swallows any English edit, turning
        // real translation debt into a "clean" snapshot; this refuses instead.
        if (blocksOnly) {
            if (!existsSync(tgt)) {
                console.error(`REFUSED ${lang}/${page}: no existing snapshot to re-accept`);
                refused++;
                continue;
            }
            const oldMasked = maskManaged(readFileSync(tgt, "utf8"));
            const newMasked = maskManaged(readFileSync(src, "utf8"));
            if (oldMasked !== newMasked) {
                console.error(`REFUSED ${lang}/${page}: English changed OUTSIDE the managed blocks`
                    + " — this is real translation debt, not a language-list update.");
                console.error(unifiedDiff(oldMasked, newMasked,
                    `snapshot/${page} (masked)`, `english/${page} (masked)`));
                refused++;
                continue;
            }
        }
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
    if (refused) console.error(`\n${refused} page(s) refused — snapshot NOT updated for those.`);
    return refused ? 1 : 0;
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

function cmdRewriteBlocks(dryRun) {
    const targets = managedTargets();
    let scanned = 0, changed = 0, absent = 0, incomplete = 0;
    for (const t of targets) {
        if (!existsSync(t.path)) {
            // A language mid-rollout legitimately has no pages yet; snapshots likewise.
            absent++;
            continue;
        }
        scanned++;
        const orig = readFileSync(t.path, "utf8");
        const res = rewriteManagedBlocks(orig, t.page, t.lang);
        if (!res) { console.log(`WARN  ${t.label}: no managed blocks found`); incomplete++; continue; }
        if (res.missing.length) {
            console.log(`WARN  ${t.label}: missing managed block(s): ${res.missing.join(", ")}`);
            incomplete++;
        }
        if (res.html === orig) continue;
        changed++;
        console.log(`${dryRun ? "would rewrite" : "rewrote"}  ${t.label}  [${res.changed.join(", ")}]`);
        if (!dryRun) writeFileSync(t.path, res.html, "utf8");
    }
    console.log(`\n${scanned} file(s) scanned, ${changed} ${dryRun ? "would change" : "changed"}`
        + `, ${absent} absent, ${incomplete} with missing blocks.`);
    if (dryRun && !changed) console.log("zero diff — generated blocks match what is committed.");
    // --dry-run is a gate: nonzero exit means "this run would modify files".
    return dryRun && changed ? 1 : 0;
}

/* --extract <lang> [page...] — the translator's worksheet: every translatable unit of a
 * page as compact JSON, instead of ~176 KB of HTML per language. */
function cmdExtract(lang, pages) {
    const dir = lang === "en" ? ROOT : join(ROOT, lang);
    const out = { lang, pages: {} };
    for (const page of pages.length ? pages : CONFIG.translatedPages) {
        const path = join(dir, page);
        if (!existsSync(path)) { console.error(`missing ${lang}/${page}`); return 1; }
        const parsed = readPage(path);
        const { units } = extractUnits(parsed);
        out.pages[page] = units.map((u) => ({
            id: u.id, hash: u.hash, kind: u.kind, text: u.text,
            ...(u.tags ? { tags: u.tags } : {}),
            ...(u.at.length > 1 ? { at: u.at } : {}),
        }));
    }
    console.log(JSON.stringify(out, null, 1));
    return 0;
}

/* --extract-selftest — the Phase 0 gate that must pass before ANY translation runs.
 *
 * Two independent proofs, over English and all 18 shipped languages:
 *   1. Round-trip: rebuild each page's bytes from its own extracted units. Byte-identical
 *      or the raw-slice discipline is broken somewhere (entities, placeholders, or the
 *      repo's mixed CRLF/LF line endings).
 *   2. Unit-set parity: each translated page's unit ids match English's exactly, every
 *      unit is non-empty, and placeholder sets match per unit. A translation that dropped
 *      or invented a unit — or lost a <strong> — fails here.
 */
function cmdExtractSelftest(onlyLang) {
    let files = 0, badRt = 0, badSet = 0, totalUnits = 0, totalBytes = 0;
    const problems = [];
    const note = (m) => { if (problems.length < 30) problems.push(m); };

    for (const page of CONFIG.translatedPages) {
        const enParsed = readPage(join(ROOT, page));
        const en = extractUnits(enParsed);
        files++;
        totalUnits += en.units.length;
        totalBytes += en.units.reduce((n, u) => n + u.text.length, 0);
        if (reassemble(enParsed, en) !== enParsed.html) { badRt++; note(`ROUNDTRIP ${page}`); }
        const enIds = new Set(en.units.flatMap((u) => u.at));
        const enTags = new Map(en.units.flatMap((u) => u.at.map((a) =>
            [a, Object.keys(u.tags || {}).length])));

        for (const l of CONFIG.languages) {
            if (onlyLang && l.code !== onlyLang) continue;
            const p = join(ROOT, l.code, page);
            if (!existsSync(p)) continue;
            const parsed = readPage(p);
            const ex = extractUnits(parsed);
            files++;
            if (reassemble(parsed, ex) !== parsed.html) { badRt++; note(`ROUNDTRIP ${l.code}/${page}`); }
            const ids = new Set(ex.units.flatMap((u) => u.at));
            for (const id of enIds) if (!ids.has(id)) { badSet++; note(`MISSING  ${l.code}/${page}  ${id}`); }
            for (const id of ids) if (!enIds.has(id)) { badSet++; note(`EXTRA    ${l.code}/${page}  ${id}`); }
            for (const u of ex.units) {
                if (!u.text.trim()) { badSet++; note(`EMPTY    ${l.code}/${page}  ${u.id}`); }
                for (const a of u.at) {
                    const want = enTags.get(a);
                    if (want !== undefined && want !== Object.keys(u.tags || {}).length) {
                        badSet++; note(`PLACEHOLDERS ${l.code}/${page} ${a}: ${Object.keys(u.tags || {}).length} vs English ${want}`);
                    }
                }
            }
        }
    }
    for (const m of problems) console.log("FAIL  " + m);
    console.log(`\n${files} file(s) extracted; English surface: ${totalUnits} units, `
        + `${(totalBytes / 1024).toFixed(1)} KB of strings.`);
    if (badRt || badSet) {
        console.log(`${badRt} round-trip failure(s), ${badSet} unit-set failure(s).`);
        return 1;
    }
    console.log("round-trip byte-identical on every file; unit sets match English everywhere.");
    return 0;
}

/* --leak-audit — the bucketing that produced 0.6's defect list, as a command.
 *
 * For every unit id, count the languages that left it byte-identical to English:
 *   ALWAYS_SAME  every language      -> a pin; belongs in leak-allow.json "pins"
 *   ALWAYS_DIFF  no language         -> healthy, the overwhelming majority
 *   MIXED        some but not all    -> a language did something its 17 peers did not.
 *                                       Either a leak to FIX or a cognate to declare.
 * MIXED is where every defect this wave has found was found. --propose prints the entries
 * to paste into i18n/leak-allow.json, so declaring a new language's cognates is a review
 * rather than a transcription exercise.
 */
function cmdLeakAudit(propose, onlyLang) {
    const langs = CONFIG.languages.map((l) => l.code).filter((c) => !onlyLang || c === onlyLang);
    const rows = [];
    for (const page of CONFIG.translatedPages) {
        const en = unitsById(readPage(join(ROOT, page)));
        const tr = new Map();
        for (const code of langs) {
            const p = join(ROOT, code, page);
            if (existsSync(p)) tr.set(code, unitsById(readPage(p)));
        }
        for (const [id, u] of en) {
            const enText = normalizeUnit(u.text);
            if (!enText) continue;
            const same = [], diff = [];
            for (const [code, m] of tr) {
                const t = m.get(id);
                if (!t) continue;
                (normalizeUnit(t.text) === enText ? same : diff).push(code);
            }
            if (same.length) rows.push({ page, id, kind: u.kind, en: u.text, enText, same, diff });
        }
    }
    const allowed = (r, code) => LEAK_ALLOW.pin.has(allowKey(r.id, r.en))
        || LEAK_ALLOW.cognate.get(allowKey(r.id, r.en))?.has(code);
    const always = rows.filter((r) => !r.diff.length);
    const mixed = rows.filter((r) => r.diff.length);
    const open = mixed.filter((r) => r.same.some((c) => !allowed(r, c)));

    console.log(`ALWAYS_SAME ${always.length}   MIXED ${mixed.length}   `
        + `MIXED not yet declared in leak-allow.json: ${open.length}\n`);
    for (const r of open) {
        console.log(`MIXED [${r.kind}] ${r.page} ${r.id}`);
        console.log(`   en: ${JSON.stringify(r.enText.slice(0, 90))}`);
        console.log(`   identical in: ${r.same.filter((c) => !allowed(r, c)).join(", ")}`);
    }
    if (propose) {
        const undeclared = (list, kind) => list.filter((r) => !(kind === "pins"
            ? LEAK_ALLOW.pin.has(allowKey(r.id, r.en))
            : r.same.every((c) => allowed(r, c))));
        const seen = new Set();
        const uniq = (r) => { const k = allowKey(r.id, r.en); if (seen.has(k)) return false; seen.add(k); return true; };
        console.log("\n--- paste into i18n/leak-allow.json ---");
        console.log(JSON.stringify({
            pins: undeclared(always, "pins").filter(uniq)
                .map((r) => ({ id: r.id, en: r.enText, why: "REVIEW: identical in every language" })),
            cognates: undeclared(open, "cognates").filter(uniq).map((r) => ({
                id: r.id, en: r.enText,
                langs: r.same.filter((c) => !allowed(r, c)),
                why: "REVIEW: leak to fix, or cognate?",
            })),
        }, null, 2));
    }
    return 0;
}

function cmdPrintBlocks(page) {
    console.log("<!-- hreflang block -->");
    for (const line of expectedHreflang(page)) console.log("    " + line);
    console.log("\n<!-- language switcher (English page) -->");
    for (const line of expectedSwitcher(page, "en")) console.log("            " + line);
    return 0;
}

/* The internals are exported so the Phase 0 gates can be run as real tests against the
 * SAME code the CLI uses — a harness that re-implements parsePage would prove nothing.
 * The dispatch below therefore only runs when this file is the entry point. */
export { parsePage, readPage, scanJs, stripJs, scanJson, structuralStream,
    rewriteManagedBlocks, managedTargets, maskManaged, extractUnits, reassemble,
    placeholderize, unplaceholderize, elementPath,
    unitsById, normalizeUnit, allowKey, localizedAssetFor, assetRefs,
    checkUnitLeaks, checkLocalizedAssets, findings,
    checkTranslatedPage, checkEnglishPages,
    CONFIG, ROOT, SNAP_DIR, TRANSLATABLE_ATTRS };

const isMain = process.argv[1]
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const argv = process.argv.slice(2);
    const has = (f) => argv.includes(f);
    const valOf = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
    if (has("--accept")) {
        const rest = argv.slice(argv.indexOf("--accept") + 1).filter((a) => a !== "--blocks-only");
        process.exit(cmdAccept(rest[0], rest.slice(1), has("--blocks-only")));
    } else if (has("--rewrite-blocks")) {
        process.exit(cmdRewriteBlocks(has("--dry-run")));
    } else if (has("--extract")) {
        const rest = argv.slice(argv.indexOf("--extract") + 1);
        process.exit(cmdExtract(rest[0] || "en", rest.slice(1)));
    } else if (has("--extract-selftest")) {
        process.exit(cmdExtractSelftest(valOf("--lang")));
    } else if (has("--leak-audit")) {
        process.exit(cmdLeakAudit(has("--propose"), valOf("--lang")));
    } else if (has("--sitemap")) {
        process.exit(cmdSitemap());
    } else if (has("--print-blocks")) {
        process.exit(cmdPrintBlocks(valOf("--print-blocks")));
    } else {
        process.exit(cmdCheck(valOf("--lang")));
    }
}
