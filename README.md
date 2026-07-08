# lowvisionzoom.com

Marketing + legal website for **Low Vision Zoom** (a product of txtbook LLC). Static HTML/CSS,
served by **GitHub Pages** from the `main` branch root at <https://lowvisionzoom.com>.

## Pages

| File | URL | Purpose |
|------|-----|---------|
| `index.html` | `/` | Home — product, features, how-it-works, requirements, get/trial, FAQ |
| `pricing.html` | `/pricing.html` | Pricing — free trial + $9.99 one-time license (Paddle requirement) |
| `privacy.html` | `/privacy.html` | Privacy policy (Paddle requirement) |
| `terms.html` | `/terms.html` | Terms of service (Paddle requirement) |
| `refund.html` | `/refund.html` | Refund policy / money-back guarantee (Paddle requirement) |
| `contact.html` | `/contact.html` | Accessible contact form → support@ (see Contact form below) |
| `styles.css` | — | Shared styles: 18px base, high-contrast, dark mode, focus, reduced-motion |
| `media/magnifier.svg` | — | Header logo + favicon (plus-in-magnifier mark) — **generated**, do not hand-edit |
| `media/magnifier-blue.png` | — | Logo glyph (copy of the app asset) — **generated** |
| `media/og-card.png` | — | OG/social share card (1200×630) — **generated** |
| `media/howto-desktop.svg` | — | "How it works" gesture animation, Ctrl+scroll (animated SVG) — **generated** |
| `media/howto-laptop.svg` | — | "How it works" gesture animation, Ctrl+Alt+Plus/Minus — **generated** |
| `CNAME` | — | Pins the GitHub Pages custom domain to `lowvisionzoom.com` |
| `.nojekyll` | — | Disables Jekyll processing (plain static site) |

## Business model reflected on the site

Free **7-day trial** → **$9.99 one-time** license (no subscription, all updates included) →
**30-day money-back guarantee**. Payments run through **Paddle** as merchant of record. The app is a
signed installer distributed direct from this site (and, for discovery, a Microsoft Store EXE/MSI
listing).

## Contact form

`contact.html` is an accessible form that posts to the **`lvz-contact` Cloudflare Worker**
(`contact/` in the app repo) at `https://lvz-contact.lowvisionzoom.workers.dev/contact`. The Worker
verifies a **Cloudflare Turnstile** token, then relays the message to `support@lowvisionzoom.com` via
**Resend** with `reply_to` set to the sender. This keeps the support address off the site entirely —
**there are no `mailto:` links anywhere**; every "contact us" path routes through the form (with a
`?topic=` to preselect the reason). Turnstile sitekey is public in the HTML; the secret +
`RESEND_API_KEY` are Worker secrets.

## ⚠️ Launch placeholders to replace

Stubbed until the installer is hosted and Paddle checkout is live. Search the HTML for `TODO`:

1. **Download URL** — the "Get the free trial" / download buttons currently point at the `#get`
   section. Replace with the hosted signed-MSI URL. (`index.html`, `pricing.html`)
2. **Paddle checkout** — wire `/buy` and the launch CTAs to the Paddle checkout link/overlay once
   live. ("Email me at launch" currently routes to the contact form, which is fine pre-launch.)

> The legal/policy text is real, written for this product. Have it reviewed before relying on it.

## Brand assets are generated

The header logo/favicon (`media/magnifier.svg`), logo glyph (`media/magnifier-blue.png`), and the
OG/social card (`media/og-card.png`) are **emitted by the app repo's asset pipeline**
(`low-vision-zoom/packaging/generate-assets.ps1`) so the plus-in-magnifier mark can never drift
between the app icon and the site. Don't hand-edit them here — change the pipeline (or its source
art in `branding/`) and re-run it.

Likewise, the "how it works" gesture animations (`media/howto-desktop.svg`, `media/howto-laptop.svg`)
are copies of `low-vision-zoom/branding/howto-*.svg`, emitted by
`low-vision-zoom/packaging/generate-howto-anims.ps1` (which also renders the app's About-dialog GIFs
from the same sources). They are self-contained animated SVGs: colors follow `prefers-color-scheme`
and motion stops under `prefers-reduced-motion`, so the site shows them with plain `<img>` tags.
Edit the `branding/` sources and re-run that script.

## Internationalization (i18n)

The English pages at the repo root are the **hand-edited canonical source**. Each language in
`i18n/languages.json` has a directory (`/es/`, `/de/`, `/zh/`, …) holding **full translated
copies** of the four content pages (`index`, `pricing`, `buy`, `contact`). The legal pages
(`privacy`, `terms`, `refund`) are English-only by design; translated pages link to them with an
"(in English)" note. There is no build step — everything is committed static HTML, validated by
one dependency-free Node tool:

```bash
node tools/i18n-check.mjs --check            # validate everything (run before every push)
node tools/i18n-check.mjs --check --lang es  # one language only
node tools/i18n-check.mjs --accept es        # record snapshots after (re)translating Spanish
node tools/i18n-check.mjs --sitemap          # regenerate sitemap.xml from languages.json
node tools/i18n-check.mjs --print-blocks pricing.html   # expected hreflang/switcher markup
```

**How it stays in sync:** `i18n/snapshots/<lang>/<page>` is a byte copy of the *English* page at
the moment that language's translation was last accepted. `--check` diffs each snapshot against
the current English page — any difference reports the translation as STALE with the exact diff.

**The editing workflow:**
1. Edit the English pages freely (they are normal hand-written HTML).
2. `node tools/i18n-check.mjs --check` → lists every stale language with the diff of what changed.
3. Hand each diff + the existing translated page to a translator (AI agent with
   `i18n/TRANSLATING.md` as the contract) to apply *only that change*.
4. `node tools/i18n-check.mjs --accept <lang>` per updated language, then `--check` until green,
   then commit and push.

The validator also enforces: structural parity of every translated page with its English
counterpart (same tags/ids/classes — catches translator-mangled markup), inline-script parity
(code identical, only user-facing string literals may differ), per-language Paddle
`SUCCESS_URL`/`locale`, Turnstile `data-language`, `lang`/`dir` attributes (Arabic is RTL),
canonical/og/hreflang correctness on **all** pages including English, in-language internal links,
and untranslated-text leaks.

**Language routing:** English pages carry a tiny head script — a stored choice
(`localStorage["lvz-lang"]`, written only by an explicit switcher click or the one-time
first-visit browser-language match) redirects to `/<lang>/…`. Translated pages never redirect.
The header `<details class="lang-switch">` dropdown works without JS (plain links); site.js adds
choice persistence and close-on-Escape. Crawlers see English at the root and discover languages
via hreflang + `sitemap.xml`.

**Adding a language:** add its entry to `i18n/languages.json`, update the hreflang block +
switcher list on the English pages (`--print-blocks` prints them) and the `LANGS` array in the
head snippet, translate the four pages per `i18n/TRANSLATING.md`, run a review pass, `--accept`,
`--sitemap`, push. `--check` fails everywhere until all of these are done — that's intentional.

## Local preview

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy

Commit to `main` and push — GitHub Pages rebuilds automatically (usually within a minute or two).
The custom domain is pinned by `CNAME`.
