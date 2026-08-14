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

/* ---- zh-Hant computed values -------------------------------------------------------------
 * These are COMPUTED, not translated. They are handed over exactly so that no agent has to
 * derive locale plumbing — deriving it was wave 1's largest cause of re-runs.
 * paddleLocale and turnstileLang were LOOKED UP (2026-08-13), not guessed: Paddle Billing uses
 * "zh-TW" for Traditional while using "zh-Hans" for Simplified, and Turnstile uses "zh-tw". */
const CODE = "zh-Hant";
const url = (p) => p === "index.html"
    ? "https://lowvisionzoom.com/zh-Hant/"
    : `https://lowvisionzoom.com/zh-Hant/${p}`;

function computed(page) {
    const lines = [
        `- \`<html lang="zh-Hant" dir="ltr">\``,
        `- canonical \`<link rel="canonical" href="${url(page)}">\``,
        `- \`og:url\` content → \`${url(page)}\``,
    ];
    if (page === "index.html") lines.push(`- \`og:locale\` content → \`zh_TW\``);
    lines.push(
        `- every internal site link is prefixed \`/zh-Hant\` (\`/pricing.html#x\` → \`/zh-Hant/pricing.html#x\`)`,
        `- legal links stay at the root (\`/privacy.html\`, \`/terms.html\`, \`/refund.html\`) and their`,
        `  visible link text gains the marker \`（英文）\``,
        `- the \`<link rel="alternate" hreflang=...>\` run is copied from English **byte-identically**`,
        `- the language-switcher \`<ul>\` is copied from English **byte-identically, including leaving**`,
        `  \`aria-current="true"\` **on the English entry** — zh-Hant has no entry yet and a script adds`,
        `  it later. Change ONLY the \`<summary>\`: its visible text becomes \`中文（繁體）\` and its`,
        `  attribute becomes \`aria-label="語言：中文（繁體）"\` (full-width colon, no space).`,
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
        lines.push(`- JSON-LD: \`"inLanguage"\` → \`"zh-Hant"\` **only where the English block already has`
            + ` that key**; any self-\`url\` → \`${url(page)}\`. Add no keys.`);
    if (page === "buy.html") lines.push(
        `- \`SUCCESS_URL\` → \`"https://lowvisionzoom.com/zh-Hant/buy.html?state=success"\``,
        `- **both** \`locale: "en"\` occurrences → \`locale: "zh-TW"\` (this is Paddle's code for`,
        `  Traditional Chinese — it is NOT "zh-Hant"; do not "correct" it)`,
        `- \`CLIENT_TOKEN\` and \`PRICE_ID\` are never touched.`);
    if (page === "contact.html") lines.push(
        `- Turnstile widget \`data-language="zh-tw"\` (English has \`"auto"\`)`,
        `- \`<option value="...">\` values unchanged — only the display text is translated.`);
    return lines.join("\n");
}

const ZH_HANT = `## This language: zh-Hant — Traditional Chinese (Taiwan)

You are writing **Traditional Chinese as used in Taiwan** (正體中文／繁體中文，臺灣用語).

**Script.** Every Han character you write must be the Traditional form. The finished file must
contain **zero** Simplified-only characters (设, 显, 屏, 软, 视, 缩, 键, 时, 会, 说, 这, 单, 关, 开,
…). This is checked mechanically and a single Simplified character fails the page.

**Taiwan vocabulary, not mainland vocabulary.** Both are written in Traditional here, so the script
check cannot catch this — it is on you. Use the left column:

| use (TW) | not (CN) | meaning |
|---|---|---|
| 滑鼠 | 鼠標 | mouse |
| 螢幕 | 屏幕 | screen |
| 軟體 | 軟件 | software |
| 硬體 | 硬件 | hardware |
| 程式 | 程序 | program |
| 檔案 | 文件 | file |
| 資料夾 | 文件夾 | folder |
| 網路 | 網絡 | network |
| 預設 | 默認 | default |
| 設定 | 設置 | setting(s) |
| 影片 | 視頻 | video |
| 解析度 | 分辨率 | resolution |
| 記憶體 | 內存 | memory |
| 支援 | 支持 | support (technical) |
| 資訊 | 信息 | information |
| 品質 | 質量 | quality |
| 登入 | 登錄 | log in |
| 捲動 | 滾動 | scroll |
| 按一下 | 點擊 | click (Windows TW wording) |
| 系統匣 | 系統托盤 | system tray |
| 授權金鑰 | 許可證密鑰 | license key |

**Two terms to get right, because the wrong choice is a real error, not a preference:**

- **low vision** → use 低視能 (or 低視力). Do **NOT** use 弱視 — in Taiwanese clinical usage 弱視
  is *amblyopia*, a different condition. This is an accessibility product; naming the wrong
  condition is the kind of error the dignity rule in the Quality bar exists to prevent.
- **magnifier** → Windows' own Taiwan name for the built-in feature is **放大鏡**. Per the
  competitor rules, keep "Windows Magnifier" in English as the primary reference; you may add
  放大鏡 once in parentheses on first mention.

**Typography.** Full-width punctuation （），。：、「」 per Taiwanese convention. No space between
a full-width colon and what follows. Keep \`$9.99\` exactly as printed.

## Computed values for this page — use these EXACTLY, do not derive them

${"{{COMPUTED}}"}`;

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
function pinnedChrome(page) {
    const enTarget = unitsById(readPage(join(WEB, page)));
    const pins = new Map();
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
        ZH_HANT.replace("{{COMPUTED}}", computed(page)),
        pinnedChrome(page),
        S.quality,
        HOWTO.replaceAll("{{PAGE}}", page),
    ];
    const kit = parts.join("\n\n") + "\n";
    writeFileSync(join(OUT, `${page}.md`), kit);
    console.log(`${page.padEnd(32)} kit ${String(Buffer.byteLength(kit, "utf8")).padStart(6)} B`);
}
