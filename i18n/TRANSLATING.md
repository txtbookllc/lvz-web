# Translation contract — lowvisionzoom.com

This document is the complete, binding instruction set for translating the site. It is given
verbatim to every translator (human or AI). `tools/i18n_check.py --check` mechanically enforces
most of these rules; a page that violates them will be rejected.

## What you are translating

**Low Vision Zoom** is a Windows screen-magnifier app for people with low vision. The site sells
a $9.99 one-time license with a 7-day free trial. The audience includes many older adults and
screen-reader/assistive-technology users. The voice is calm, plain, respectful, and concrete —
never hype, never medical claims, never pity. Translate meaning and tone, not word-for-word.

You produce **full translated copies** of these seven pages into the language directory
(e.g. `/es/index.html`):

- `index.html`, `pricing.html`, `buy.html`, `contact.html` — the core product pages.
- `faq.html` — frequently asked questions. Also carries a duplicated `FAQPage` schema in the
  `<head>`; see the per-page rules.
- `compare.html` — an honest comparison with other Windows magnifiers. The **Competitor and
  product names** rules below apply here with full force.
- `why-smooth-magnification.html` — a sourced vision-science explainer. The **Medical-claims
  guardrails** below apply here with full force.

The legal pages (`privacy.html`, `terms.html`, `refund.html`) are **not** translated — they stay
English-only at the site root.

Your language's entry in `i18n/languages.json` (code, `hreflang`, `ogLocale`, `paddleLocale`,
`turnstileLang`, `dir`) supplies every locale value referenced below.

## Glossary and terminology (non-negotiable)

| Term | Rule |
|---|---|
| **Windows** | Always the Microsoft operating system. NEVER the word for glass window panes (not Fenster/ventanas/окна as a translation of the OS name). Keep the English brand name "Windows" untouched. |
| **zoom / zooming** | The act of optically magnifying the screen. Never a word implying speed or dashing around. Use your language's standard term for magnification/zooming as used in camera or accessibility software. |
| **Low Vision Zoom** | Product name. Never translated, never reordered. |
| **low vision** | Use the correct, current accessibility/ophthalmology term in your language (e.g. es "baja visión", de "Sehbehinderung", fr "basse vision"). Never stigmatizing or archaic disability language. |
| **magnifier / screen magnifier** | Your language's established assistive-technology term (the same one Windows' built-in "Magnifier" feature uses locally, where one exists). |
| **Ctrl, Alt, Shift** | Keyboard key names — keep as printed on local keyboards (usually unchanged: "Ctrl", "Alt"). "Plus / Minus" and "0" may be translated/localized if that is how keys are described in your language. |
| **SmartScreen, "Windows protected your PC", "More info", "Run anyway"** | These quote Windows UI. Use Microsoft's actual localized strings for your locale if you know them confidently; otherwise translate naturally and keep the English string in parentheses the first time. |
| **Paddle, txtbook LLC, Cloudflare, Resend, GitHub, Turnstile** | Company/product names — never translated. |
| **$9.99 / USD** | Price is always "$9.99" USD, unchanged. You may adapt surrounding phrasing (e.g. "9,99 $ USD" if that is the standard local way to typeset a US-dollar price), but never convert the amount to another currency. |
| **merchant of record** | Use the standard local commerce term if one exists; otherwise keep English with a brief gloss. |
| **tray / system tray** | The Windows notification-area concept — use the local Windows term. |
| **license key** | Local software-licensing term. |

## Competitor and product names (non-negotiable)

These rules matter everywhere, but above all on `compare.html` and `faq.html`, which name other
products.

1. **Product and company names are never translated or transliterated.** Keep them exactly as
   printed, in Latin script, even on a page written in a non-Latin script: **Windows Magnifier,
   ZoomText, SuperNova, Magnifixer, Narrator, JAWS, Fusion, Freedom Scientific, Vispero, Dolphin
   (Dolphin Computer Access), Blacksun Software, Microsoft.** "Low Vision Zoom" and "txtbook LLC"
   follow the same rule (already in the glossary).
   - *Windows Magnifier* and *Narrator* are the **English product names** of Microsoft's built-in
     features. If your locale's Windows ships a localized name for the Magnifier feature, you may
     add it once in parentheses the first time it appears, but keep the English name as the primary
     reference so the comparison stays unambiguous. Do not silently replace it with the local name.
2. **Translate every claim about another product as a neutral, faithful statement — exactly as
   strong, and exactly as weak, as the English.** Do not sharpen, editorialize, or make a
   competitor sound worse (or better) than the English does. Never add coloring words that are not
   in the source — no "only", "merely", "unfortunately", "bloated", "overpriced", "clunky", or the
   like. If the English says a product "is typically sold as an annual license", your translation
   says exactly that and no more.
   - **Why this is non-negotiable:** these pages publish in 18 countries. A translation that turns
     a neutral fact into a disparaging claim about a *named* competitor can be a false or misleading
     statement under local advertising and unfair-competition law in some of those jurisdictions.
     The English is deliberately careful; your job is to preserve that care, not to "improve" it.
3. **"see vendor" / "see [vendor]" cells and phrases** mean "we will not state this on their behalf
   second-hand." Translate the phrase; never replace it with a specific claim of your own invention.
4. **The fairness and affiliation disclosure** on `compare.html` ("We are not affiliated with,
   endorsed by, or partnered with any of them… we use their names only to identify their products…")
   is a legal disclaimer, not marketing copy. Translate it in full and faithfully. Do not soften,
   shorten, or drop any part of it. The same goes for the "Who wrote this, and how to read it"
   fairness framing and the "reasons not to buy Low Vision Zoom" section — they are what keeps the
   page honest; keep their candor.
5. **Competitor links and dates are not changed.** External `href`s (support.microsoft.com,
   freedomscientific.com, yourdolphin.com, blacksunsoftware.com, apps.microsoft.com …) stay
   byte-identical. The dated "verified July 20, 2026" / "checked on July 20, 2026" wording is
   translated as text, but **the date itself is never changed**.

## Medical-claims guardrails (why-smooth-magnification.html)

This page's safety depends entirely on staying in **design-and-experience** language and never
crossing into a medical or clinical claim. The English is written carefully to do exactly that; a
translation that drifts into health-benefit language creates real regulatory risk in some markets.

1. **Describe the app's *behavior* and the *experience* of using it, and reference the perceptual
   *principle* only in general terms.** That is the register of the entire page — match it.
2. **Never render anything as a claim that the app *treats, corrects, cures, prevents, diagnoses,
   or reduces the symptoms of* any condition** — not macular degeneration or AMD, not low vision
   itself, not eye strain, not fatigue, not anything. The English never makes such a claim; your
   translation must not either.
3. **Introduce no clinical-outcome language** that is absent from the English: no "clinically
   proven", "reduces eye strain", "doctor recommended", "therapeutic", or any wording that reads as
   a guaranteed health benefit. Where the English hedges — "many people with low vision find…",
   "generally understood principles of vision", "designed to work with how the eye tracks motion" —
   translate the hedge at **equal strength**. The hedges are load-bearing.
4. **The disclaimer sentences are the most important on the page.** "Nothing on this page is a
   medical claim.", "None of this is a treatment claim.", "none of them studied Low Vision Zoom",
   "none should be read as evidence of a specific outcome from the app" — translate every one of
   these fully and unambiguously. Never drop, weaken, or bury them.
5. **Citations stay in English.** Author names, paper/article titles, and journal or publisher
   names (*Communications Biology*, *Nature*, *Annual Review of Vision Science*, *Trends in
   Cognitive Sciences*, American Optometric Association, Nielsen Norman Group, and the rest) are
   **not** translated or transliterated — they identify a specific English-language source. You MAY
   translate the short plain-language gloss that follows each citation (the "— what it says" clause)
   and generic link text ("Abstract", "Read it", "PDF"). Every citation URL stays byte-identical.
6. **Scientific terms** (spatial constancy, smooth pursuit, saccade, change blindness, preferred
   retinal locus, eccentric viewing) use your language's established scientific term where one
   exists; where there is no standard term, keep the English and gloss it once. Never coin a term
   that sounds like a diagnosis.

## Technical rules — structure

1. **Never change document structure.** Same elements, same order, same nesting, same
   ids/classes/roles, same number of `<br>` tags (you may move a `<br>` within a heading to where
   the line-break reads naturally). The checker compares tag-by-tag against the English page.
2. **Never touch code.** Inline `<script>` blocks must be byte-identical to the English page
   *except for the user-facing string literals inside them* (status messages, error messages),
   plus the specific literals listed under "Per-page rules". Do not translate JS comments; leave
   them in English. Do not reformat, reindent, or reorder code.
3. **Leave HTML comments in English, unchanged.**
4. **Never change** form `value="..."` attributes, `name` attributes, `data-sitekey`, the
   Cloudflare beacon `<script>`, or any `id`.
5. Escape properly: the files are UTF-8, so write your language natively (no HTML entities needed
   beyond what English uses, e.g. keep `&nbsp;` where English has it).

## Technical rules — what TO translate

- All visible text nodes (headings, paragraphs, list items, buttons, labels, `<option>` display
  text, `<summary>`, figcaption).
- `<title>` and `<meta name="description" content>`.
- Open Graph text: `og:title`, `og:description`, `og:image:alt` content values.
- These attributes wherever they carry English text: `alt`, `title`, `aria-label`,
  `placeholder`, `data-label-play`, `data-label-pause`.
- User-facing string literals inside inline scripts (e.g. "Opening secure checkout…",
  validation and error messages).

## Technical rules — JSON-LD structured data

Several pages carry `<script type="application/ld+json">` blocks in the `<head>` (index.html has a
`SoftwareApplication`; faq.html a `FAQPage`; compare.html and why-smooth-magnification.html an
`Article`). These are machine-readable and matter for search and AI visibility. Handle them like
this, and no more:

**The structure of the block — every key, in the same order — must stay byte-identical to English.
Only the string *values* may change.** (The checker compares each inline script's code against the
English one up to its string literals; adding, removing, or renaming a key changes the code and the
page is rejected.) So:

- **Translate only these human-readable string values:** `name`, `headline`, `description`, and — in
  the `FAQPage` — every `Question` `name` and every `acceptedAnswer.text`.
- **`"inLanguage"`: only where the English block already has that key**, change its value to your
  language code (e.g. `"en"` → `"es"`). **Never add an `inLanguage` key** to a block that lacks one
  (the homepage `SoftwareApplication` has none — leave it without one).
- **Any `"url"` value that points at the page you are translating** becomes its `/XX/` form (e.g. the
  `FAQPage` `"url": "https://lowvisionzoom.com/faq.html"` → `".../es/faq.html"`). Leave the
  organization/author/publisher URLs (`https://lowvisionzoom.com/`), `image`, `installUrl`,
  `offers.url`, prices, `priceCurrency`, `softwareVersion`, `operatingSystem`, `datePublished`, and
  `dateModified` **exactly** as in English.
- **Do not add, remove, reorder, or translate keys.** The `FAQPage` `acceptedAnswer.text` is plain
  text — no links, no HTML tags; keep it plain.

## Technical rules — head, links, locale plumbing

1. `<html lang="XX" dir="...">` — your code and `dir` from languages.json (`rtl` for Arabic only).
2. **Canonical + og:url:** `https://lowvisionzoom.com/XX/` for index,
   `https://lowvisionzoom.com/XX/<page>.html` for the others. `og:locale` = your `ogLocale`
   (index.html only). The hreflang `<link rel="alternate">` block is copied from the English page
   **unchanged** (it already lists every language).
3. **The i18n redirect `<script>` in `<head>` is copied verbatim** from the English page. It
   checks `document.documentElement.lang` and does nothing on non-English pages — keep it anyway
   so the pages stay structurally identical.
4. **Asset links stay root-relative and unchanged:** `/styles.css`, `/site.js`, `/media/...`.
5. **Internal page links go in-language — mechanically prefix with `/XX`:** the English pages use
   root-relative links, so `/index.html#demo` → `/XX/index.html#demo`,
   `/pricing.html#organizations` → `/XX/pricing.html#organizations`, `/buy.html?checkout=1` →
   `/XX/buy.html?checkout=1`, etc. Keep every `#fragment` and `?query` exactly. Same-page
   fragment links (`#demo`, `#get`) stay as they are.
6. **Legal links stay English:** `privacy.html`, `terms.html`, `refund.html` → `/privacy.html`
   etc. (root). Append a translated "(in English)" marker to the visible link text, e.g.
   es: `Privacidad (en inglés)`.
7. **Language switcher** (`<details class="lang-switch">` in the header): keep every entry and
   its href (they already point at each language's copy of the current page). Move
   `aria-current="true"` from the English entry to YOUR language's entry, and change the
   `<summary>` label text to your language's native name.
8. **External links** (https://…paddle.com etc.) unchanged.

## Per-page rules

### Microsoft Store badge (index.html, pricing.html, buy.html)
- The primary install CTA is an `<a class="store-badge">` wrapping an official localized badge
  image. Set the `<img src>` to your language's badge, `/media/store-badge/XX.svg` (all site
  languages have one; they come from get.microsoft.com/images/), and translate the `alt`.
- The badge link's `href` (apps.microsoft.com) is external — keep it byte-identical to English.
- The `class="download-direct"` link under the badge is the secondary direct download —
  translate its text like any other link.

### index.html
- `og:locale` content → your `ogLocale`.
- The `SoftwareApplication` JSON-LD block in `<head>`: translate its `description` string (see the
  JSON-LD rules above). Leave `price`, `priceCurrency`, `softwareVersion`, `operatingSystem`, the
  URLs, and `image` unchanged.
- The homepage FAQ is a short **teaser** — three questions (cost, trial end, SmartScreen) with a
  "See all frequently asked questions →" link to `/faq.html`. Keep it a teaser: the full,
  schema-marked FAQ lives on `faq.html`; do not expand the homepage back into a full FAQ copy.
- The two howto `<img>` `alt` texts and the demo `video` `aria-label` describe animations —
  translate them fully (they are what screen-reader users get instead of the animation).
- Trust chips ("7 day free trial", "No ads", …): keep them chip-short.
- The `.kbd` gesture labels ("Ctrl + Scroll ↑"): keep key names per the glossary.

### pricing.html / index.html FAQ
- "$9.99" stays literal (see glossary). "7-day", "30-day" numbers unchanged.

### buy.html
- In the inline checkout script, change ONLY these literals:
  - `SUCCESS_URL` → `"https://lowvisionzoom.com/XX/buy.html?state=success"`
  - both `locale: "en"` occurrences → `locale: "<paddleLocale>"` from languages.json (for
    languages Paddle doesn't support, languages.json already says `"en"` — checkout will appear
    in English; that is expected).
  - the user-facing status/error message strings.
  - `CLIENT_TOKEN` and `PRICE_ID` are NOT translatable — never touch them.

### contact.html
- `<option value="...">` values unchanged; only display text translated.
- Turnstile widget: set `data-language="<turnstileLang>"` (English page has `data-language="auto"`).
- The email field hint ("We'll only use this to reply to you.") gains one translated sentence:
  "We may reply in English." — support is English-speaking; visitors may write in any language.

### faq.html
- Every answer exists **twice**: the visible HTML inside each `<details>`, and the plain-text
  `acceptedAnswer.text` in the `FAQPage` JSON-LD (`<head>`). Translate **both**, and keep them
  saying the same thing. Keep each JSON-LD `Question` `name` in sync with its visible `<summary>`.
  See the JSON-LD rules above for what else changes in that block (`inLanguage`, self-`url`).
- Keep `<code>` key names (Ctrl, Alt, Shift, Plus, Minus, "Windows key", Esc, 0) per the glossary.
- The three `<h2>` group headings (Choosing a magnifier / Using Low Vision Zoom / Buying, trial,
  and trust) are ordinary headings — translate them.

### compare.html
- **Read "Competitor and product names" above first** — those rules govern this page.
- The comparison `<table>`: translate every column header, row header, and visible cell, but never
  change the table's shape (same rows, same columns, same order). Short cell values — "Yes", "No",
  "None", "see vendor", "—" — become the natural short equivalents in your language.
- `Article` JSON-LD: translate `headline` and `description`; set `inLanguage` and the self-`url`
  per the JSON-LD rules; leave `datePublished` / `dateModified` unchanged.
- The `.cta-fact` factual paragraph at the foot of the page: translate it **in full** from this
  page's English. It has one sentence more than the homepage's version — the "It magnifies up to
  5×, smoothly, centered on the mouse cursor" sentence — **keep that sentence**. Word the sentences
  it shares with the homepage the same way your locale's homepage already words them.

### why-smooth-magnification.html
- **Read "Medical-claims guardrails" above first** — those rules govern this page, and this page is
  the reason they exist.
- `Article` JSON-LD: translate `headline` and `description`; set `inLanguage` and the self-`url`;
  leave dates unchanged. The `about` `name` values are perceptual-science terms — use your
  language's standard term where one exists, otherwise leave them in English.
- The `<table>` mapping each feature to the principle it serves: translate the cells, keep the
  structure.
- The citation list follows the guardrails: source identity (authors, titles, journals) stays in
  English; the plain-language gloss after each citation and generic link text may be translated;
  URLs are byte-identical.

## Quality bar

- Read your finished page top to bottom as a native speaker who has never seen the English.
  It should sound like it was written in your language, for your market.
- No offensive, stigmatizing, or condescending phrasing anywhere — this is an accessibility
  product; dignity is part of the brand.
- Formal/informal register: choose what mainstream consumer software uses in your locale
  (e.g. German "Sie", Spanish "usted"-neutral phrasing or neutral imperative, French "vous").
  Be consistent across all four pages.
- Numbers, punctuation, and typography follow your locale (quotes, spaces before punctuation in
  French, etc.) — but keep `$9.99` per the glossary.

## Acceptance

Run `node tools/i18n-check.mjs --check --lang XX` — it must pass. Then a second, independent
review pass happens before `--accept` records the English snapshot the translation corresponds to.
