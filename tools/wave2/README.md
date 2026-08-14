# Wave-2 scaffolding

Per-language machinery for the 18-language wave-2 rollout. These are **not** general
validators — the general one that came out of this work is `tools/i18n-crosspage.mjs`, one
directory up, which is part of the permanent gate set.

They live in the repo rather than in a scratchpad because 17 languages still have to go
through them, and a session that ends takes its scratchpad with it. That is the same
resumability rule the rest of the wave follows.

| script | what it does |
|---|---|
| `kit-build.mjs` | Builds one self-contained translation kit per page. Slices the rule sections out of `i18n/TRANSLATING.md` **verbatim** by heading, then appends the per-page attribute checklist, the computed locale values, and the already-settled shared chrome. |
| `verify-page.mjs` | Pre-registration verification of a translated page. `--check` cannot run until the language is registered, and a language may not register until all 7 pages exist — this covers the gap. |
| `fix-assets.mjs` | Repairs localized asset `src` values, which are computed rather than translated. |

## Running them for language N

```sh
node tools/wave2/kit-build.mjs   <out-dir>            # writes <page>.md per page
node tools/wave2/verify-page.mjs --lang=<code> [page...]
node tools/wave2/fix-assets.mjs  [--apply] <page...>
node tools/i18n-crosspage.mjs    --lang=<code>        # after 2+ pages exist
```

## What must be edited per language — and why it is not automated

`kit-build.mjs` hardcodes `CODE = "zh-Hant"` and carries one hand-written section: the
language block (`ZH_HANT`) with its script rule and its vocabulary traps. **That section is
judgment, not configuration.** For zh-Hant it had to say that 弱視 means *amblyopia* and is
the wrong word for "low vision", and that Taiwan writes 滑鼠 where the mainland writes 鼠標 —
neither of which any script could derive, and both of which are the difference between a
correct page and a subtly wrong one. Templating it would invite the next language to inherit
an empty block and look finished.

Everything mechanical around it **is** derived and must stay that way:

- the localized asset list comes from the English page via `assetRefs()` / `localizedAssetFor()`,
  never from the contract's prose — the prose was stale and three pages shipped the English
  store badge because of it;
- the attribute checklist comes from `extractUnits()`, so it cannot drift from what the leak
  check actually tests;
- the shared chrome comes from the pages of that language already finished.

`verify-page.mjs` carries a curated Simplified-character set that only applies to zh-Hant.
Its `--simplified-selftest` is its negative test: the set must fire heavily on the shipped
`zh/` pages and score **zero** on the English ones. Any per-language script assertion added
later needs an equivalent, or an inert check will look exactly like a working one.
