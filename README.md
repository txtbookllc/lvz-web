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
| `styles.css` | — | Shared styles: 18px base, high-contrast, dark mode, focus, reduced-motion |
| `magnifier-blue.png` | — | Logo glyph |
| `CNAME` | — | Pins the GitHub Pages custom domain to `lowvisionzoom.com` |
| `.nojekyll` | — | Disables Jekyll processing (plain static site) |

## Business model reflected on the site

Free **7-day trial** → **$9.99 one-time** license (no subscription, all updates included) →
**30-day money-back guarantee**. Payments run through **Paddle** as merchant of record. The app is a
signed installer distributed direct from this site (and, for discovery, a Microsoft Store EXE/MSI
listing).

## ⚠️ Launch placeholders to replace

Two things are stubbed until the installer is signed and Paddle checkout is live. Search the HTML for
`TODO`:

1. **Download URL** — the "Get the free trial" / download buttons currently point at the `#get`
   section and a `mailto:` notify link. Replace with the hosted signed-MSI URL once Azure Trusted
   Signing is set up. (`index.html`, `pricing.html`)
2. **Paddle checkout** — the "Buy" / "Email me at launch" buttons should point at the Paddle
   checkout link/overlay once the Paddle account is approved. (`pricing.html`, `index.html`)

> The legal/policy text is real, written for this product. Have it reviewed before relying on it.

## Local preview

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy

Commit to `main` and push — GitHub Pages rebuilds automatically (usually within a minute or two).
The custom domain is pinned by `CNAME`.
