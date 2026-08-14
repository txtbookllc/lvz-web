## This language: da — Danish (Denmark)

You are writing **Danish for a Danish consumer audience**. Latin script, so there is no
script check here — the risks are register, compounding, and grammatical gender, not
characters.

**Register: use `du`, not `De`.** Danish consumer software — including Microsoft's own
Danish Windows — addresses the reader as `du`; `De` has all but disappeared from general use
and would read as a formal-letter throwback here, at odds with this site's calm, plain voice.
Be consistent across all seven pages: never slide into `De` in a "please note" aside or a
legal-sounding sentence.

**Compounds are written as ONE word (særskrivning is an error).** This is the same failure
mode as in Swedish and Norwegian, and it matters just as much here because the page is full
of two-part technical terms:

| write | not |
|---|---|
| forstørrelsesprogram | forstørrelses program |
| skærmforstørrelse | skærm forstørrelse |
| skærmlæser | skærm læser |
| licensnøgle | licens nøgle |
| meddelelsesområde | meddelelses område |
| musemarkør | mus markør |
| prøveperiode | prøve periode |

A split compound is the most recognisable sign of machine-translated Danish, and it also
changes how a screen reader pronounces the phrase — this audience includes screen-reader
users, so a wrongly split compound is not just visibly wrong, it is heard as wrong too.

**Terms:**

- **low vision** → **svagsynet** (adjective) / **svagsynethed** (noun). This is the current,
  precise Danish clinical/accessibility term — it is the word in the name of IBOS
  (*Institut for Blinde og Synshandicappede*, Denmark's national institute for the blind and
  partially sighted) and in Dansk Blindesamfund's own usage. Do **not** use `blind` as a
  stand-in — blindness is a narrower, clinically different category, and the English "low
  vision" is deliberately not that. Avoid the umbrella term `synshandicappet` (spans the whole
  range including blindness, too broad where the English is specific) and never use `vanfør`,
  which is archaic and stigmatising.
- **magnifier / screen magnifier** — use the two established terms, not an agent noun:
  - the **program** is a **forstørrelsesprogram**. This is the category name used by
    Hjælpemiddelbasen, the Danish national assistive-technology database, and by Danish AT
    vendors (ScanDis, LVI) for exactly this class of software.
  - the **function / effect** is **skærmforstørrelse** — the word ZoomText's Danish
    distributor uses in its own strapline ("Skærmforstørrelse og skærmlæser til svagtseende").
  - Do **NOT** write `skærmforstørrer`. It looks plausible by analogy with `skærmlæser`, but
    it is not the term Danish assistive-technology material actually uses. This was checked
    against Danish AT sources rather than inferred from the pattern.
  - Windows' own Danish name for the built-in accessibility tool is **Forstørrelsesglas** —
    per the competitor rules keep "Windows Magnifier" in English as the primary reference, and
    you may add "(Forstørrelsesglas)" once in parentheses on first mention.
- **zoom / zoome ind / zoome ud** are the normal, established Danish terms — use them as-is;
  do not invent a native coinage.
- **tray / system tray** → **meddelelsesområdet**. The site glossary's rule is "use the local
  Windows term", and Microsoft's Danish Windows uses *meddelelsesområdet*. `systembakke` is
  the older informal word Microsoft moved away from; do not use it. (Checked, not assumed.)
- **licence key** → **licensnøgle**.
- **Windows, Ctrl, Alt, Low Vision Zoom, txtbook LLC** stay exactly as printed, per the
  glossary — never translated, never inflected.

**Grammatical gender on articles — a distinctively Danish trap.** Danish nouns are common or
neuter, and machine translation frequently attaches the wrong article, which reads as
immediately foreign. For this page's vocabulary: **en** licensnøgle, **en** prøveperiode,
**en** skærmforstørrelse, **en** skærmlæser (common gender) but **et** forstørrelsesprogram,
**et** program, **et** forstørrelsesglas, **et** meddelelsesområde (neuter). Check the
definite-form endings too: forstørrelsesprogramm**et**, meddelelsesområd**et**, but
licensnøgl**en**, prøveperiod**en**.

**Typography.** Danish uses decimal comma for Danish numbers, but **`$9.99` stays exactly as
printed** per the glossary — do not rewrite it as `9,99 $` and do not convert it to kroner.
No space before `:` or `?`. For quotation marks, use the guillemet style »…« (no inner space)
if the page needs them; if this Danish page set has already settled on straight/curly `"…"` in
earlier pages, match that instead — pick one convention and hold it across all seven pages.
