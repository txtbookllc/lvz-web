/* Build one self-contained kit per page for zh-Hant.
 *
 * The contract sections are sliced from i18n/TRANSLATING.md VERBATIM by heading — never
 * paraphrased. Paraphrasing the glossary or the medical-claims guardrails would quietly
 * change the judgment they carry, which is the whole reason they are hand-written.
 *
 * Each page gets only the sections that govern it, plus the zh-Hant computed values it
 * needs, so no agent reads 20 KB of rules that do not apply to its page. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readPage, assetRefs, localizedAssetFor, extractUnits, unitsById }
    from "file:///c:/dev/lowvisionzoom.com/tools/i18n-check.mjs";

const WEB = "c:/dev/lowvisionzoom.com";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ per-language config
 * paddleLocale / turnstileLang are LOOKED UP per language, never guessed, and the vendors
 * disagree with each other and with us: Paddle says "zh-TW" where we say zh-Hant, Turnstile
 * says "tl" where we (and Windows) say "fil". An unsupported Paddle locale falls back to
 * "en", which also makes the LICENCE EMAIL English — see the running doc; that is a decision
 * to take deliberately per language, not a default to drift into.
 *
 * `notes` is the one hand-written field. It is judgment, not configuration: for zh-Hant it
 * had to say that 弱視 means amblyopia and is the wrong word for "low vision". Leaving it
 * empty for a new language is a bug, not a default — kits assert on it below. */
const LANGUAGES = JSON.parse(
    readFileSync(join(WEB, "tools", "wave2", "wave2-langs.json"), "utf8")).languages;

const CODE = (process.argv.find(a => a.startsWith("--lang=")) ?? "--lang=zh-Hant").slice(7);
const LANG = LANGUAGES[CODE];
if (!LANG) throw new Error(`kit: no config for ${CODE} — add it to LANGUAGES first`);

const src = readFileSync(join(WEB, "i18n/TRANSLATING.md"), "utf8").split(/\r?\n/);

/** Slice from a heading line up to the next heading of the same-or-higher level. */
function section(heading) {
    const level = heading.match(/^#+/)[0].length;
    const start = src.findIndex(l => l.trim() === heading);
    if (start < 0) throw new Error(`kit: heading not found: ${heading}`);
    let end = src.length;
    for (let i = start + 1; i < src.length; i++) {
        const m = src[i].match(/^(#+)\s/);
        if (m && m[1].length <= level) { end = i; break; }
    }
    return src.slice(start, end).join("\n").trimEnd();
}

const S = {
    what: section("## What you are translating"),
    glossary: section("## Glossary and terminology (non-negotiable)"),
    competitors: section("## Competitor and product names (non-negotiable)"),
    medical: section("## Medical-claims guardrails (why-smooth-magnification.html)"),
    structure: section("## Technical rules — structure"),
    whatTo: section("## Technical rules — what TO translate"),
    jsonld: section("## Technical rules — JSON-LD structured data"),
    head: section("## Technical rules — head, links, locale plumbing"),
    badge: section("### Microsoft Store badge (every page except contact.html)"),
    quality: section("## Quality bar"),
    page: {
        "index.html": section("### index.html") + "\n\n" + section("### pricing.html / index.html FAQ"),
        "pricing.html": section("### pricing.html / index.html FAQ"),
        "buy.html": section("### buy.html"),
        "contact.html": section("### contact.html"),
        "faq.html": section("### faq.html"),
        "compare.html": section("### compare.html"),
        "why-smooth-magnification.html": section("### why-smooth-magnification.html"),
    },
};

const COMPETITORS_BRIEF = `## Competitor and product names (summary — full rules live on compare.html/faq.html)

Product and company names are **never** translated or transliterated, even on a non-Latin-script
page: **Windows, Windows Magnifier, Narrator, Microsoft, ZoomText, SuperNova, Magnifixer, JAWS,
Fusion, Freedom Scientific, Vispero, Dolphin, Blacksun Software, Paddle, txtbook LLC, Cloudflare,
Resend, GitHub, Turnstile, Low Vision Zoom**. Never add coloring words about another product that
are not in the English.`;

const MEDICAL_BRIEF = `## Medical-claims guardrail (summary — full rules live on why-smooth-magnification.html)

Never render anything as a claim that the app **treats, corrects, cures, prevents, diagnoses, or
reduces the symptoms of** any condition — not macular degeneration, not low vision itself, not eye
strain or fatigue. Introduce no clinical-outcome language ("clinically proven", "reduces eye
strain", "doctor recommended") that is absent from the English. Where the English hedges, translate
the hedge at **equal strength** — the hedges are load-bearing.`;

/* ---- computed values ---------------------------------------------------------------------
 * These are COMPUTED, not translated. They are handed over exactly so that no agent has to
 * derive locale plumbing — deriving it was wave 1's largest cause of re-runs. */
const url = (p) => p === "index.html"
    ? `https://lowvisionzoom.com/${CODE}/`
    : `https://lowvisionzoom.com/${CODE}/${p}`;

/* The switcher's `<summary aria-label>` is `switcherLabel` in languages.json, and it is the
 * ONE authored string the whole switcher block needs. It is not derivable from nativeName —
 * `pl` is "Język: polski", lowercase, because Polish lowercases language names in running
 * text. So: on the first page of a language the agent AUTHORS it and reports it; from the
 * second page on it is read back off the finished page and pinned, exactly like the rest of
 * the chrome. That keeps the orchestrator out of translating it while still guaranteeing all
 * seven pages agree. It is a computed attribute, so `pinnedChrome()` cannot see it. */
function switcherLabelRule() {
    for (const done of PAGES) {
        const tp = join(WEB, CODE, done);
        if (!existsSync(tp)) continue;
        const m = /<summary[^>]*\saria-label="([^"]*)"/.exec(readFileSync(tp, "utf8"));
        if (m) return { pinned: m[1] };
    }
    return { pinned: null };
}

function computed(page) {
    const label = switcherLabelRule();
    const lines = [
        `- \`<html lang="${CODE}" dir="${LANG.dir}">\``,
        `- canonical \`<link rel="canonical" href="${url(page)}">\``,
        `- \`og:url\` content → \`${url(page)}\``,
    ];
    if (page === "index.html") lines.push(`- \`og:locale\` content → \`${LANG.ogLocale}\``);
    lines.push(
        `- every internal site link is prefixed \`/${CODE}\` (\`/pricing.html#x\` → \`/${CODE}/pricing.html#x\`)`,
        `- legal links stay at the root (\`/privacy.html\`, \`/terms.html\`, \`/refund.html\`) and their`,
        `  visible link text gains the marker \`${LANG.legalMarker}\``,
        `- the \`<link rel="alternate" hreflang=...>\` run is copied from English **byte-identically**`,
        `- the language-switcher \`<ul>\` is copied from English **byte-identically, including leaving**`,
        `  \`aria-current="true"\` **on the English entry** — ${CODE} has no entry yet and a script adds`,
        `  it later. Change ONLY the \`<summary>\`: its visible text becomes \`${LANG.nativeName}\`,`,
        label.pinned
            ? `  and its attribute is **exactly** \`aria-label="${label.pinned}"\` — already settled on`
              + `\n  another page of this language, so reproduce it, do not re-word it.`
            : `  and you AUTHOR its \`aria-label\`: your language's equivalent of \`Language: ${LANG.nativeName}\`,`
              + `\n  following your own language's conventions — Polish, for instance, writes`
              + `\n  \`Język: polski\` in lowercase, and Chinese uses a full-width colon with no space.`
              + `\n  **Report the exact string you chose in your receipt**; the other six pages will be`
              + `\n  required to match it.`,
    );
    /* DERIVED FROM THE ENGLISH PAGE, never from the contract's prose. TRANSLATING.md's
     * heading says the store badge lives on "index.html, pricing.html, buy.html"; the pages
     * say otherwise — compare, faq and why-smooth-magnification carry one too. Hardcoding
     * the prose version left three pages with no instruction, and they correctly shipped
     * the ENGLISH badge. Same class of bug the status tool hit in session 4: when a
     * convention already has an implementation, read it. localizedAssetFor() IS that
     * implementation, so the kit now calls it. */
    const assets = assetRefs(readPage(join(WEB, page)))
        .map(r => ({ from: r.src, to: localizedAssetFor(r.src, CODE) }));
    const uniq = [...new Map(assets.map(a => [a.from, a])).values()];
    if (uniq.some(a => a.to === null))
        throw new Error(`kit: unrecognized localized-asset pattern on ${page}`);
    if (uniq.length) lines.push(`- localized asset \`src\` values — **change every one of these**:`,
        ...uniq.map(a => `    - \`${a.from}\` → \`${a.to}\``),
        `  These files do not exist yet; write the paths anyway.`);
    if (["index.html", "faq.html", "compare.html", "why-smooth-magnification.html"].includes(page))
        lines.push(`- JSON-LD: \`"inLanguage"\` → \`"${CODE}"\` **only where the English block already has`
            + ` that key**; any self-\`url\` → \`${url(page)}\`. Add no keys.`);
    if (page === "buy.html") lines.push(
        `- \`SUCCESS_URL\` → \`"https://lowvisionzoom.com/${CODE}/buy.html?state=success"\``,
        `- **both** \`locale: "en"\` occurrences → \`locale: "${LANG.paddleLocale}"\``
            + (LANG.paddleLocale === CODE ? "" :
                ` — this is **Paddle's own code**, which deliberately differs from our\n  language code \`${CODE}\`. Do not "correct" it.`)
            + (LANG.paddleLocale === "en"
                ? `\n  (Paddle does not support this language; an English checkout here is expected and accepted.)` : ""),
        `- \`CLIENT_TOKEN\` and \`PRICE_ID\` are never touched.`);
    if (page === "contact.html") lines.push(
        `- Turnstile widget \`data-language="${LANG.turnstileLang}"\` (English has \`"auto"\`)`,
        `- \`<option value="...">\` values unchanged — only the display text is translated.`);
    return lines.join("\n");
}

/* The one hand-written, per-language section. Kept in a file rather than inline so adding a
 * language is "write the notes, add the config row" and an empty one is conspicuous. */
function languageNotes() {
    const p = join(WEB, "tools", "wave2", LANG.notesFile);
    if (!existsSync(p)) throw new Error(
        `kit: ${LANG.notesFile} is missing. Every language needs hand-written notes — the traps`
        + ` differ per language and no script can derive them. Write it before building kits.`);
    const s = readFileSync(p, "utf8").trim();
    if (s.length < 200) throw new Error(`kit: ${LANG.notesFile} looks like a stub (${s.length} B)`);
    return s;
}

const HOWTO = `## How to do this job

1. Read the English page at \`c:/dev/lowvisionzoom.com/{{PAGE}}\`.
2. Write the complete translated page to \`c:/dev/lowvisionzoom.com/zh-Hant/{{PAGE}}\`.
3. Read **nothing else**. Do not search the repo, do not open other languages' pages, do not
   open the checker. Everything you need is this kit plus that one English page. (Repo
   exploration was a large hidden cost in the previous wave.)
4. Do not worry about line endings — indentation and byte-level structure matter, line endings
   are normalized for you afterwards.

## What you return

A receipt of **at most 10 lines**. Never paste translated content into your reply — the reply
goes into an orchestrator's context and the translation belongs in the file.

\`\`\`
page: {{PAGE}}
written: <absolute path>
bytes: <size of the file you wrote>
structure: <"tag-for-tag identical to English" or exactly what differs and why>
uncertain: <up to 3 terms you were unsure of, or "none">
notes: <anything the orchestrator must check, or "none">
\`\`\`
`;

/* An explicit, PAGE-DERIVED checklist of translatable attributes.
 *
 * Why this exists: `nav aria-label="Primary"` shipped untranslated in `th` in wave 1, was
 * found and fixed in session 3 — and then TWO wave-2 agents missed the same attribute
 * again, even though the contract's "what TO translate" section names `aria-label`. Prose
 * in a rules section is evidently not enough for attributes: they are invisible when you
 * are reading a page as prose. A concrete list of THIS page's attributes, with their
 * English values, converts a rule the agent must remember to apply into a checklist it can
 * tick off. The list comes from extractUnits(), so it can never drift from what the leak
 * check will actually test — computed attributes (aria-current, data-language, hreflang)
 * are already excluded by ATTR_TRANSLATE and so never appear here. */
function attrChecklist(page) {
    const units = extractUnits(readPage(join(WEB, page))).units.filter(u => u.kind === "attr");
    if (!units.length) return "";
    const rows = units.map(u => `| \`${u.id}\` | ${JSON.stringify(u.text)} |`).join("\n");
    return `## Attributes on this page that MUST be translated — tick every row

These are easy to miss because they are invisible when reading the page as prose. Every one
of them is checked mechanically; leaving any in English fails the page. \`nav@aria-label\`
in particular has shipped untranslated before.

| attribute | English value |
|---|---|
${rows}

(Attributes NOT in this list — \`aria-current\`, \`data-language\`, \`hreflang\`, \`lang\` — are
computed. Do not translate those; use the computed values below.)`;
}

/* Shared site chrome, PINNED to the wording already agreed on the finished pages.
 *
 * Measured on this language: with one agent per page, 11 of 22 units that appear on more
 * than one page came back worded differently — each page individually correct, the set
 * collectively inconsistent. The 18 wave-1 languages, translated one agent per LANGUAGE,
 * show 0-2. Splitting by page is what causes it, because each agent re-decides the chrome
 * from scratch.
 *
 * So for every page after the first, the chrome stops being a translation decision and
 * becomes a computed value: the exact string is handed over, as with og:locale or the
 * canonical URL. Pin, don't re-translate — same principle, applied to prose that has
 * already been settled. */
/* The 23 units that appear on more than one English page — the site chrome.
 * MEASURED: no single page carries all of them (best is faq.html at 22/23, index.html only
 * 17), so pinning from "the first finished page" is structurally incapable of covering the
 * set, and the residue comes back worded differently on each page. Hence --emit-chrome:
 * translate these ONCE, before any page, and pin all of them everywhere. */
function sharedUnits() {
    const where = new Map();
    for (const p of PAGES)
        for (const [id, u] of unitsById(readPage(join(WEB, p)))) {
            const k = `${id}\v${u.text}`;
            if (!where.has(k)) where.set(k, { id, en: u.text, pages: [] });
            where.get(k).pages.push(p);
        }
    return [...where.values()].filter(u => u.pages.length > 1);
}

function pinnedChrome(page) {
    const enTarget = unitsById(readPage(join(WEB, page)));
    const pins = new Map();
    /* Highest priority: the dedicated chrome pass, if it has been done. */
    const chromeFile = join(WEB, "tools", "wave2", `chrome-${CODE}.json`);
    if (existsSync(chromeFile)) {
        const done = JSON.parse(readFileSync(chromeFile, "utf8"));
        for (const u of done.units ?? []) {
            const en = enTarget.get(u.id);
            if (en && en.text === u.en && u.tr) pins.set(u.id, { en: u.en, tr: u.tr });
        }
    }
    for (const done of PAGES) {
        const tp = join(WEB, CODE, done);
        if (done === page || !existsSync(tp)) continue;
        const enDone = unitsById(readPage(join(WEB, done)));
        const trDone = unitsById(readPage(tp));
        for (const [id, en] of enTarget) {
            if (pins.has(id)) continue;
            const other = enDone.get(id);
            if (!other || other.text !== en.text) continue;   // same id AND same English
            const tr = trDone.get(id);
            if (tr) pins.set(id, { en: en.text, tr: tr.text });
        }
    }
    if (!pins.size) return "";
    const rows = [...pins.entries()].map(([id, p]) =>
        `#### \`${id}\`\n\nEnglish:\n\n    ${p.en}\n\nUse EXACTLY this:\n\n    ${p.tr}\n`);
    return `## Shared chrome — ALREADY TRANSLATED, reproduce these EXACTLY

${pins.size} unit(s) on this page also appear on pages of this language that are already
finished and signed off. Their wording is settled. **Do not re-translate them and do not
improve them** — reproduce the string given below, character for character.

This is not a style preference. These strings are the skip link, the header nav, the footer
and the call-to-action: they appear on all seven pages, and a screen-reader user moving
between pages must hear the same landmark named the same way. Measured on this very
language, independent per-page translation made 11 of 22 shared units disagree.

Where a string shows numbered markers like \`<1>…</1>\`, those stand for the inline tags at
that position in the English page (a link, \`<strong>\`, etc.). Keep the real tags from the
English page and put the given text inside them. Keep every HTML entity (\`&copy;\`,
\`&nbsp;\`) exactly as written.

${rows.join("\n")}`;
}

const PAGES = ["index.html", "pricing.html", "buy.html", "contact.html",
    "faq.html", "compare.html", "why-smooth-magnification.html"];

/* Emitted BEFORE any page agent runs. Must sit after PAGES is initialized. */
if (process.argv.includes("--emit-chrome")) {
    const units = sharedUnits();
    const out = join(WEB, "tools", "wave2", `chrome-${CODE}.todo.json`);
    writeFileSync(out, JSON.stringify({
        "//": `Site chrome for ${CODE}. Translate every "en" into "tr", change nothing else.`
            + ` These strings appear on 2+ pages and MUST be identical on all of them.`,
        lang: CODE, nativeName: LANG.nativeName,
        units: units.map(u => ({ id: u.id, pages: u.pages.length, en: u.en, tr: "" })),
    }, null, 2) + "\n");
    console.log(`${out}\n${units.length} shared unit(s) to translate before any page runs.`);
    process.exit(0);
}

const FULL_COMPETITORS = new Set(["compare.html", "faq.html"]);
const FULL_MEDICAL = new Set(["why-smooth-magnification.html"]);
const HAS_JSONLD = new Set(["index.html", "faq.html", "compare.html", "why-smooth-magnification.html"]);
/* Derived, not listed — same reason as the asset list itself. */
const HAS_BADGE = new Set(PAGES.filter(p =>
    assetRefs(readPage(join(WEB, p))).some(r => r.src.startsWith("/media/store-badge/"))));

for (const page of PAGES) {
    const parts = [
        `# Translation kit — ${page} → zh-Hant`,
        `*Condensed from \`i18n/TRANSLATING.md\`. Every rule section below is verbatim from that`,
        `contract; only the selection is per-page. This kit is complete — you need no other file.*`,
        S.what,
        S.glossary,
        FULL_COMPETITORS.has(page) ? S.competitors : COMPETITORS_BRIEF,
        FULL_MEDICAL.has(page) ? S.medical : MEDICAL_BRIEF,
        S.structure,
        S.whatTo,
        ...(HAS_JSONLD.has(page) ? [S.jsonld] : []),
        S.head,
        `## Per-page rules — ${page}`,
        ...(HAS_BADGE.has(page) ? [S.badge] : []),
        S.page[page],
        attrChecklist(page),
        languageNotes(),
        `## Computed values for this page — use these EXACTLY, do not derive them\n\n${computed(page)}`,
        pinnedChrome(page),
        S.quality,
        HOWTO.replaceAll("{{PAGE}}", page),
    ];
    const kit = parts.join("\n\n") + "\n";
    writeFileSync(join(OUT, `${page}.md`), kit);
    console.log(`${page.padEnd(32)} kit ${String(Buffer.byteLength(kit, "utf8")).padStart(6)} B`);
}
