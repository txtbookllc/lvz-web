/* Cross-page consistency: a unit whose id AND English text are shared across pages must
 * have ONE translation across those pages.
 *
 * Nothing checked this before. Per-page verification cannot see it by construction, and
 * `--check` compares each page against English independently — so seven pages can each be
 * individually correct and collectively inconsistent. It showed up immediately: two agents
 * repaired the same `nav@aria-label` and produced different values. A screen-reader user
 * moving between pages would hear the same landmark named two different things. */
import { readPage, extractUnits, unitsById } from "file:///c:/dev/lowvisionzoom.com/tools/i18n-check.mjs";
import { existsSync } from "node:fs";

const WEB = "c:/dev/lowvisionzoom.com";
const LANG = (process.argv.find(a => a.startsWith("--lang=")) ?? "--lang=zh-Hant").slice(7);
const PAGES = ["index.html", "pricing.html", "buy.html", "contact.html",
    "faq.html", "compare.html", "why-smooth-magnification.html"];

const byKey = new Map();   // "id\ven" -> Map(translation -> [pages])
for (const page of PAGES) {
    const tp = `${WEB}/${LANG}/${page}`;
    if (!existsSync(tp)) continue;
    const em = unitsById(readPage(`${WEB}/${page}`));
    const tm = unitsById(readPage(tp));
    for (const [id, en] of em) {
        const tr = tm.get(id);
        if (!tr) continue;
        const key = `${id}\v${en.text}`;
        if (!byKey.has(key)) byKey.set(key, new Map());
        const m = byKey.get(key);
        if (!m.has(tr.text)) m.set(tr.text, []);
        m.get(tr.text).push(page);
    }
}

const REPORT = process.argv.includes("--report");
let bad = 0;
const report = [];
for (const [key, variants] of byKey) {
    if (variants.size < 2) continue;
    bad++;
    const [id, en] = key.split("\v");
    if (REPORT) {
        report.push(`### ${bad}. \`${id}\`\n`,
            `English:\n\n    ${en}\n`,
            `Variants in use:\n`,
            ...[...variants.entries()].map(([tr, pages], i) =>
                `- **${String.fromCharCode(97 + i)}.** used by ${pages.join(", ")}\n\n      ${tr}\n`),
            "");
    } else {
        console.log(`\nINCONSISTENT  ${id}`);
        console.log(`  English: ${JSON.stringify(en.slice(0, 90))}`);
        for (const [tr, pages] of variants)
            console.log(`  ${JSON.stringify(tr.slice(0, 70))}  <- ${pages.join(", ")}`);
    }
}
if (REPORT) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.argv[process.argv.indexOf("--report") + 1],
        `# Cross-page inconsistencies — ${LANG}\n\n`
        + `${bad} unit(s) appear on more than one page with more than one translation.\n\n`
        + report.join("\n"));
    console.log(`wrote report: ${bad} conflict(s)`);
}
const shared = [...byKey.values()].filter(v => [...v.values()].flat().length > 1).length;
console.log(`\n${bad === 0 ? "CONSISTENT" : bad + " INCONSISTENT unit(s)"} — ${shared} unit(s) shared across 2+ pages`);
process.exit(bad ? 1 : 0);
