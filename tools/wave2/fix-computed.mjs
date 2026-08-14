/* Force COMPUTED values on already-written pages to the settled value.
 *
 * These are not translation. The switcher's `<summary aria-label>` is languages.json's
 * switcherLabel: one authored string per language that must be byte-identical on all seven
 * pages. It is a computed attribute, so neither the cross-page unit check nor --emit-chrome
 * can see it, and a page agent left to author it will word it its own way.
 *
 * Once wave2-langs.json carries `switcherLabel`, kit-build pins it and this script has
 * nothing to do. It exists for pages that were already in flight when the value was settled.
 *
 * Splice by offset into the raw string; never split-and-rejoin (the line-ending rule). */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const WEB = "c:/dev/lowvisionzoom.com";
const LANG = (process.argv.find(a => a.startsWith("--lang=")) ?? "").slice(7);
const APPLY = process.argv.includes("--apply");
if (!LANG) throw new Error("usage: fix-computed.mjs --lang=<code> [--apply]");

const CFG = JSON.parse(readFileSync(`${WEB}/tools/wave2/wave2-langs.json`, "utf8")).languages[LANG];
if (!CFG?.switcherLabel) throw new Error(`no switcherLabel for ${LANG} in wave2-langs.json`);

const PAGES = ["index.html", "pricing.html", "buy.html", "contact.html",
    "faq.html", "compare.html", "why-smooth-magnification.html"];

let changed = 0, already = 0;
for (const page of PAGES) {
    const p = `${WEB}/${LANG}/${page}`;
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    const m = /(<summary[^>]*\saria-label=")([^"]*)(")/.exec(raw);
    if (!m) { console.log(`${page.padEnd(32)} NO SUMMARY aria-label FOUND`); continue; }
    if (m[2] === CFG.switcherLabel) { already++; console.log(`${page.padEnd(32)} already correct`); continue; }
    console.log(`${page.padEnd(32)} ${APPLY ? "set" : "would set"} ${JSON.stringify(m[2])} -> ${JSON.stringify(CFG.switcherLabel)}`);
    if (APPLY) {
        writeFileSync(p, raw.slice(0, m.index) + m[1] + CFG.switcherLabel + m[3]
            + raw.slice(m.index + m[0].length), "utf8");
    }
    changed++;
}
console.log(`\n${changed} page(s) ${APPLY ? "fixed" : "would change"}, ${already} already correct.`);
