/* Repair localized asset `src` values on already-written zh-Hant pages.
 *
 * These are COMPUTED values, not translation: localizedAssetFor() is their definition, and
 * the pages shipped the English badge only because my kit failed to tell three agents to
 * change it. Re-dispatching a ~90K-token translation agent to edit one attribute would be
 * paying a model to do exactly what a script defines. The `alt` text beside it WAS
 * translated by the agent and is left untouched.
 *
 * Splice by offset into the raw string; never split-and-rejoin (line-ending rule). */
import { readPage, assetRefs, localizedAssetFor }
    from "file:///c:/dev/lowvisionzoom.com/tools/i18n-check.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const WEB = "c:/dev/lowvisionzoom.com";
const CODE = "zh-Hant";
const APPLY = process.argv.includes("--apply");

for (const page of process.argv.slice(2).filter(a => !a.startsWith("--"))) {
    const trPath = `${WEB}/${CODE}/${page}`;
    const wanted = new Map();
    for (const r of assetRefs(readPage(`${WEB}/${page}`))) {
        const to = localizedAssetFor(r.src, CODE);
        if (to === null) throw new Error(`unrecognized asset pattern ${r.src} on ${page}`);
        wanted.set(r.src, to);
    }
    let raw = readFileSync(trPath, "utf8");
    let n = 0;
    for (const [from, to] of wanted) {
        // match only inside an attribute value, so prose mentioning the path is untouched
        const re = new RegExp(`(=")${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(")`, "g");
        raw = raw.replace(re, (_m, a, b) => { n++; return a + to + b; });
    }
    const crlfBefore = (readFileSync(trPath, "utf8").match(/\r\n/g) ?? []).length;
    if (APPLY && n) writeFileSync(trPath, raw, "utf8");
    const crlfAfter = APPLY ? (readFileSync(trPath, "utf8").match(/\r\n/g) ?? []).length : crlfBefore;
    console.log(`${page.padEnd(32)} ${APPLY ? "fixed" : "would fix"} ${n} ref(s)`
        + `  [${[...wanted.values()].join(", ")}]  CRLF ${crlfBefore}->${crlfAfter}`);
}
