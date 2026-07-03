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

## Local preview

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy

Commit to `main` and push — GitHub Pages rebuilds automatically (usually within a minute or two).
The custom domain is pinned by `CNAME`.
