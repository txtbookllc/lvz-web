## This language: sv — Swedish (Sweden)

You are writing **Swedish for a Swedish consumer audience**. Latin script, so there is no
script check here — the risks are register and compounding, not characters.

**Register: use `du`, not `ni`.** Swedish consumer software and Microsoft's own Swedish
Windows address the reader as `du`. `ni` reads as stiff or dated in this context, and this
site's voice is calm and plain. Be consistent across all seven pages.

**Compounds are written as ONE word (särskrivning is an error).** This matters more than
usual here because the page is full of two-part technical terms:

| write | not |
|---|---|
| skärmförstorare | skärm förstorare |
| skärmläsare | skärm läsare |
| licensnyckel | licens nyckel |
| systemfält | system fält |
| musmarkör | mus markör |
| gratisversion / provperiod | gratis version / prov period |

Incorrectly split compounds are the single most recognisable sign of machine-translated
Swedish, and this audience includes screen-reader users, for whom a split compound is also
read aloud wrongly.

**Terms:**

- **low vision** → **synnedsättning** (the current, neutral term; it is what Swedish
  accessibility and eye-care bodies use). Do **not** use `synskadad` as the primary term
  where the English says "low vision" — `synskadad` spans the whole range including blindness,
  and the English is deliberately narrower. Never `handikappad`, which is dated and
  stigmatising.
- **magnifier / screen magnifier** → **skärmförstorare**. Windows' own Swedish name for the
  built-in feature is **Förstoringsglaset**; per the competitor rules keep "Windows Magnifier"
  in English as the primary reference and you may add Förstoringsglaset once in parentheses on
  first mention.
- **zoom / zooma in / zooma ut** are the normal Swedish terms — use them; do not invent a
  native coinage.
- **tray / system tray** → **systemfältet** (Windows Swedish uses this).
- **Windows, Ctrl, Alt** stay exactly as printed, per the glossary.

**Language names are lowercase in Swedish** (`svenska`, not `Svenska`) when they appear in
running text — relevant when you author the language-switcher `aria-label`. The list entry in
the switcher keeps its existing capitalised form; that block is managed and you must not
touch it.

**Typography.** Decimal comma for Swedish numbers, but **`$9.99` stays exactly as printed**
per the glossary — do not rewrite it as `9,99 $` or convert to kronor. Swedish uses no space
before `:` or `?`. Quotation marks are `”…”` (both sides curly-right) if you need them.
