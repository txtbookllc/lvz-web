# Translation contract — lowvisionzoom.com

This document is the complete, binding instruction set for translating the site. It is given
verbatim to every translator (human or AI). `tools/i18n_check.py --check` mechanically enforces
most of these rules; a page that violates them will be rejected.

## What you are translating

**Low Vision Zoom** is a Windows screen-magnifier app for people with low vision. The site sells
a $9.99 one-time license with a 7-day free trial. The audience includes many older adults and
screen-reader/assistive-technology users. The voice is calm, plain, respectful, and concrete —
never hype, never medical claims, never pity. Translate meaning and tone, not word-for-word.

You produce **full translated copies** of these four pages into the language directory
(e.g. `/es/index.html`):

- `index.html`, `pricing.html`, `buy.html`, `contact.html`

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
