/* Pre-registration verifier for a wave-2 language.
 *
 * WHY THIS EXISTS: `--check` cannot run until the language is in languages.json, and a
 * language may not be registered until all 7 pages exist. Without this, seven agents'
 * output would go unverified until the moment of registration, and a bad page would be
 * found only after the highest-blast-radius tool in the project had already rewritten 259
 * files. This runs every check that is meaningful BEFORE registration.
 *
 * It deliberately does NOT call checkTranslatedPage(): that also runs hreflang, switcher
 * and link-existence checks, all of which are SUPPOSED to fail pre-registration (the
 * entry does not exist yet, the assets are not generated yet). A verifier that reports
 * expected failures alongside real ones stops being read. Those three are exactly what
 * `--check` covers immediately after registration, so nothing goes unchecked — the split
 * is by "can this be true yet", not by convenience.
 *
 * Everything here calls the REAL exported internals. A re-implementation would prove
 * nothing about the code that actually gates the wave. */
import {
    readPage, structuralStream, stripJs, extractUnits, unitsById,
    checkUnitLeaks, checkLocalizedAssets, findings,
} from "file:///c:/dev/lowvisionzoom.com/tools/i18n-check.mjs";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";

const WEB = "c:/dev/lowvisionzoom.com";
/* --lang also lets the verifier be smoke-tested against an already-good language before any
 * agent runs: a verifier that has never been shown to pass on known-good input is as
 * untrustworthy as one that has never been shown to fail. */
const LANG = (process.argv.find(a => a.startsWith("--lang=")) ?? "--lang=zh-Hant").slice(7);
/* Same config the kit builder reads, so the kit cannot promise a value this does not check. */
const CFG = JSON.parse(readFileSync(`${WEB}/tools/wave2/wave2-langs.json`, "utf8"))
    .languages[LANG] ?? null;
const PAGES = ["index.html", "pricing.html", "buy.html", "contact.html",
    "faq.html", "compare.html", "why-smooth-magnification.html"];

const argPages = process.argv.slice(2).filter(a => !a.startsWith("--"));
const FIX_EOL = !process.argv.includes("--no-fix-eol");
const pages = argPages.length ? argPages : PAGES;

/* Simplified-only Han characters. A Traditional page must contain none of them.
 * Curated (no offline Unicode source for this); its NEGATIVE test is that it must fire
 * heavily on the shipped zh/ pages — see simplified-selftest below. On the first real run
 * hits are REVIEWED, not blindly trusted, in case the list carries a false positive.
 *
 * DELIBERATELY EXCLUDED — characters that are valid Traditional in their own right, so
 * listing them would fail a CORRECT page:
 *   唯 (唯一 — identical in both; caught by the ja smoke test)
 *   只 (Traditional "only": 只要/只需 — the highest-frequency false positive there is)
 *   准 (准許 "permit"; 準 is the one that means "accurate")
 *   余 (surname/pronoun; 餘 is "remaining")   划 (划船; 劃 is "to plan")
 *   谷 (valley; 穀 is "grain")                冲 (沖/衝 both exist in Traditional use)
 * KEPT despite a second reading, because the Simplified sense is the one this site's copy
 * would use and the other sense will not appear on it: 后 (後 "after" vs 后 "queen"),
 * 里 (裡 "inside" vs 里 "kilometre/village"). Both are review items, not silent failures. */
const SIMPLIFIED = new Set(Array.from(
    "个么亿们仅从仑仓仪价众优会伟传伤伦体侠侣侦侧侨俩债倾储儿兑党兰关兴养兽内冈册写军农冯决况冻净凄凉减凤凭凯击凿刍刘则刚创删别刹剂剑剧劝办务动励劲劳势勋匀匆区医华协单卖卢卫却厂厅历厉压厌厕厢厦厨县参双发变叙叠叶号叹吁后吓吕吗听启吴呐呕员呛呜咏咙咛咤咦咨咳响哑哔哗唝唠唤唧唬啧啬啮啰啸喷喽嗫嘘嘱噜噪团园围国图圆圣场坏块坚坛坝坞坟坠垄垒垦垫埚堑墙壮声壳壶处备复够头夸夹夺奂奋奖妆妇妈妩姗娄娇娱婴婶孙学孪宁宝实宠审宪宫宽宾寝对寻导寿将尔尘尧尸尽层届属屡屿岁岂岖岗岚岛岭岳峡峥峦崂崃崭嵘巅巩币帅师帏帐帘帜带帧帮广庄庆庐库应庙庞废开异弃张弥弯弹强归当录彦彻径忆忏忧怀态怂怄怅怆怜总怼恋恳恶恸恺恼悦悬悯惊惧惨惩惫惬惭惮惯愤愿慑戏战户扎扑执扩扪扫扬扰抚抛抟抠抢护报担拟拢拣拥拦拧拨择挂挚挛挝挟挠挡挣挤挥损捡换捣据掳掷掸掺揽搀搁搂搅携摄摆摇摊撑撵撷擞攒敌敛数斋斗斩断无旧时旷昙昼显晋晒晓晔晕晖暂札术朴机杀杂权条来杨杰极构枞枢枣枧枪枫柜柠栀标栈栋栏树样栾桠档桥桦桨梦检椁椭楼榄榈横樱橱橹檐欢欧歼残殒殴毁毕毙毡气氢汇汉汤汹沟没沥沦沧沪泞泪泷泸泻泼泽泾洁洒洼浃浅浆浇浊测济浏浑浒浓涂涌涛涝涟涡涣涤润涧涨涩淀渊渍渎渐渔渗温湾湿溃溅满滤滥滨滩漤潇潜澜灭灯灵灾灿炉炖炜点炼炽烁烂烛烟烦烧烨烩烫热焕爱爷牦牵牺犊状犹狈狞独狭狮狰狱猎猪猫献玑玛玮环现玺珑琐琼瑶璇瓮电画畅畴疗疟疡疮疯痉痒痪痴瘅瘗瘫瘾癣皑皱盏盐监盖盗盘瞒矫矶矾矿码砖砚砺础硅硕确碍碱礼祸禀禄离秃秆种积称秽稳穑穷窃窍窑窜窝窥窦竖竞笃笋笔笺笼筑筛筝筹签简箩篮篱类粪粮紧纠纡红纣纤约级纨纪纫纬纯纱纲纳纵纶纷纸纹纺线绀练组绅细织终绉绊绍绎经绑绒结绕绘给绚络绝绞统绢绣绥继绩绪绫续绮绰绳维绵绶绷绸综绽绾绿缀缄缅缆缉缎缓缔缕编缘缚缜缝缠缤缩缪缭缮缰罂网罗罚罢羁羟羡翘耸耻聂聋职联聪肃肠肤肾肿胀胁胆胜胧胪胫胶脉脏脐脑脓脚脱脸腊腌腻腾臜舆舰舱艰艳艺节芜芦苇苋苍苏苹茎茏茑荆荐荚荞荟荡荣荤药莱莲莴获莹莺莼萝萤营萧萨葱蒋蓝蓟蓦蔷蔼蕴薮藓虏虑虚虫虽虾蚀蚁蚂蚕蛊蛎蛮蛰蜕蜗蝇蝈蝉蝎衅衔补衬衮袄袜袭装裆裤褛褴见观规觅视览觉触誉誊计订讣认讥讦讨让讪讫训议讯记讲讳讴讵讶讷许讹论讼讽设访诀证评诅识诈诉诊词译诒诓试诗诘诚诛话诞诟诡询诣该详诧诩诫诬语误诰诱诲说诵请诸诺读诽课诿谀谁调谄谅谆谈谊谋谍谎谏谐谑谒谓谕谗谙谚谜谟谢谣谤谦谨谩谪谬谭谮谰谱谴贝贞负贡财责贤败账货质贩贪贫贬购贮贯贰贱贴贵贷贸费贺贼贾贿赁赂赃资赅赈赊赋赌赎赏赐赔赖赘赚赛赝赞赠赡赢赣赵赶趋趸跃跄践跷跸跹跻踊踌踪蹑蹒蹿躏躯车轧轨轩转轭轮软轰轱轴轻载轿较辄辅辆辈辉辍辎辐辑输辔辕辖辗辙辚辞辩辫边辽达迁过运还这进远违连迟迩迹适选逊递逻遗遥邓邬邮邹邻郑郸酝酱酿释里鉴銮钉针钊钌钍钎钏钒钓钔钙钛钝钞钟钠钡钢钣钥钦钧钨钩钪钫钮钯钱钳钴钵钹钻钼钾铀铁铂铃铅铆铈铉铊铋铌铍铎铐铑铒铕铖铗铙铛铜铝铟铠铡铢铣铤铧铨铪铬铭铮铯铰铱铲铳铵银铸铺链铿销锁锂锄锅锆锈锉锋锌锏锐锑锒锔锕锗错锚锛锟锡锢锣锤锥锦锨锩锭键锯锰锲锴锵锶锷锹锻镀镁镂镇镉镊镌镍镏镐镑镕镖镗镜镝镞镣镤镦镧镨镪镫镬镭镰镲镳镶长门闩闪闫闭问闯闰闱闲闳间闵闷闸闹闺闻闽闾阀阁阂阅阆阈阉阊阋阍阎阐阑阔阕阖阗阙阚队阳阴阵阶际陆陇陈陉陕陨险随隐隶隽难雏雳雾霁霉霭静鞑韦韧韩韪韬韵页顶顷顸项顺须顽顾顿颀颁颂预颅领颇颈颊颌颍颏颐频颓颔颖颗题颚颛颜额颞颠颡颢颤颦颧风飘飙飞饥饨饪饭饮饯饰饱饲饴饵饶饷饺饼饿馀馁馄馅馆馈馊馍馏馒馔马驭驮驯驰驱驳驴驶驷驹驻驼驾驿骁骂骄骅骆骇骈骊骋验骏骐骑骓骗骚骛骜骝骞骠骡骤骥髅髋鬓魇魉鱼鲁鲍鲜鲤鲨鲫鲸鳄鳍鳖鳗鸟鸠鸡鸣鸥鸦鸭鸯鸳鸵鸽鸿鹃鹅鹉鹊鹏鹤鹦鹰麦黄鼋齐齿龄龙龚龛龟"
));

/* The language switcher lists EVERY language's native name, so "中文（简体）" — two
 * Simplified characters — sits on every page in the site, English included. It is managed
 * territory (--rewrite-blocks owns it), so it is excluded here exactly as the extractor
 * excludes it. Measured: the English pages carry 14 such characters, 7 pages x 2, all of
 * them inside this block. Without the exclusion the check would fail every correct page. */
const stripSwitcher = (s) => s.replace(/<details class="lang-switch">[\s\S]*?<\/details>/g, "");

let failures = 0;
const fail = (page, msg) => { failures++; console.log(`  FAIL  [${page}] ${msg}`); };
const ok = (page, msg) => console.log(`  ok    [${page}] ${msg}`);

/** Normalize the file to CRLF, matching every other HTML file in the tree.
 * An agent-written file lands LF. autocrlf hides that in `git status`, but --check compares
 * WORKING-TREE bytes, so an LF page next to CRLF snapshots is a silent staleness bomb. */
function fixEol(path) {
    const raw = readFileSync(path, "latin1");           // byte-preserving round trip
    const crlf = raw.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    if (crlf !== raw) { writeFileSync(path, crlf, "latin1"); return "converted LF -> CRLF"; }
    return "already CRLF";
}

function verify(page) {
    const enPath = `${WEB}/${page}`;
    const trPath = `${WEB}/${LANG}/${page}`;
    console.log(`\n--- ${page}`);
    if (!existsSync(trPath)) { fail(page, "translated page does not exist"); return; }

    if (FIX_EOL) ok(page, `line endings: ${fixEol(trPath)}`);

    const en = readPage(enPath), tr = readPage(trPath);
    const raw = readFileSync(trPath, "utf8");

    // 1. structural parity — the same check --check runs, same function
    const se = structuralStream(en), st = structuralStream(tr);
    if (JSON.stringify(se) !== JSON.stringify(st)) {
        let i = 0;
        while (i < se.length && i < st.length && se[i] === st[i]) i++;
        fail(page, `structure diverges at element #${i}: got ${st[i] ?? "(end)"}, English has ${se[i] ?? "(end)"}`);
    } else ok(page, `structure: ${se.length} elements, tag-for-tag identical`);

    // 2. inline-script parity up to string literals
    if (en.scripts.length !== tr.scripts.length) {
        fail(page, `${tr.scripts.length} inline scripts, English has ${en.scripts.length}`);
    } else {
        let bad = 0;
        en.scripts.forEach((s, i) => { if (stripJs(s) !== stripJs(tr.scripts[i])) { bad++; fail(page, `inline script #${i} code differs beyond string literals`); } });
        if (!bad) ok(page, `${en.scripts.length} inline script(s): code identical`);
    }

    // 3. unit-set parity + placeholder parity, by id
    const eu = extractUnits(en).units, tu = extractUnits(tr).units;
    const em = unitsById(en), tm = unitsById(tr);
    const missing = [...em.keys()].filter(id => !tm.has(id));
    const extra = [...tm.keys()].filter(id => !em.has(id));
    if (missing.length) fail(page, `${missing.length} unit(s) missing: ${missing.slice(0, 3).join(", ")}`);
    if (extra.length) fail(page, `${extra.length} unexpected unit id(s): ${extra.slice(0, 3).join(", ")}`);
    if (!missing.length && !extra.length) ok(page, `units: ${eu.length} English / ${tu.length} translated, ids match`);

    let phBad = 0;
    for (const [id, e] of em) {
        const t = tm.get(id); if (!t) continue;
        const ek = Object.keys(e.tags ?? {}).sort().join(","), tk = Object.keys(t.tags ?? {}).sort().join(",");
        if (ek !== tk) { phBad++; if (phBad <= 3) fail(page, `placeholder set differs at ${id}: [${tk}] vs English [${ek}]`); }
    }
    if (!phBad) ok(page, "placeholders: every unit's set matches English");

    // 4. per-unit leak + localized assets — the real 0.6 checks
    const before = findings.length;
    checkUnitLeaks(`${LANG}/${page}`, em, tm, LANG);
    checkLocalizedAssets(`${LANG}/${page}`, en, tr, LANG);
    const raised = findings.slice(before);
    if (raised.length) { for (const f of raised) fail(page, String(f.msg ?? f)); }
    else ok(page, "0.6: no untranslated units, localized assets correct");

    /* 5. computed values — handed to the agent in the kit, so any miss is a real defect.
     * Driven by wave2-langs.json, the SAME file the kit builder reads: if these were an
     * independent transcription, a kit could promise a value nothing checks. */
    const dirRe = CFG?.dir === "rtl"
        ? /<html[^>]*\sdir="rtl"/
        : /<html(?![^>]*\sdir="(?!ltr)[^"]*")/;
    const want = [
        [`lang="${LANG}"`, new RegExp(`<html[^>]*\\slang="${LANG}"`)],
        [`dir "${CFG?.dir ?? "ltr"}"`, dirRe],
        [`canonical /${LANG}/`, new RegExp(`rel="canonical"[^>]*href="https://lowvisionzoom\\.com/${LANG}/${page === "index.html" ? '"' : page + '"'}`)],
    ];
    for (const [label, re] of want) if (re && !re.test(raw)) fail(page, `computed: ${label} not found`);

    if (CFG) {
        if (page === "index.html" && !new RegExp(`property="og:locale"[^>]*content="${CFG.ogLocale}"`).test(raw))
            fail(page, `computed: og:locale ${CFG.ogLocale} not found`);
        if (page === "buy.html") {
            if (!new RegExp(`https://lowvisionzoom\\.com/${LANG}/buy\\.html\\?state=success`).test(raw))
                fail(page, "computed: SUCCESS_URL not localized");
            const loc = (raw.match(/locale:\s*"([^"]+)"/g) ?? []);
            if (loc.length !== 2 || loc.some(l => !l.includes(`"${CFG.paddleLocale}"`)))
                fail(page, `computed: locale literals are ${JSON.stringify(loc)}, expected two x "${CFG.paddleLocale}"`);
        }
        if (page === "contact.html" && !new RegExp(`data-language="${CFG.turnstileLang}"`).test(raw))
            fail(page, `computed: Turnstile data-language="${CFG.turnstileLang}" not found`);
    }

    /* The switcher <summary> aria-label IS languages.json's switcherLabel. It is authored on
     * the first page and must then be identical on all seven — it is a computed attribute, so
     * the cross-page unit check cannot see it. Verified here against the other finished pages
     * of this language rather than against a hardcoded string. */
    const label = (/<summary[^>]*\saria-label="([^"]*)"/.exec(raw) ?? [])[1];
    if (!label) fail(page, "computed: switcher <summary> has no aria-label");
    else {
        for (const other of PAGES) {
            if (other === page) continue;
            const op = `${WEB}/${LANG}/${other}`;
            if (!existsSync(op)) continue;
            const ol = (/<summary[^>]*\saria-label="([^"]*)"/.exec(readFileSync(op, "utf8")) ?? [])[1];
            if (ol && ol !== label) { fail(page, `switcher aria-label ${JSON.stringify(label)} != ${JSON.stringify(ol)} on ${other}`); break; }
        }
    }

    /* internal links must be /<lang>-prefixed; legal pages must NOT be.
     * The switcher is excluded: its ENGLISH entry legitimately points at "/compare.html"
     * with no prefix, on every page in every language. Scanning it flagged a correct page.
     * Same managed-territory exclusion as the script check below. */
    const hrefs = [...stripSwitcher(raw).matchAll(/href="(\/[^"]*)"/g)].map(m => m[1]);
    const SITE = /^\/(index|pricing|buy|contact|faq|compare|why-smooth-magnification)\.html/;
    const unprefixed = hrefs.filter(h => SITE.test(h));
    const wrongLegal = hrefs.filter(h => new RegExp(`^/${LANG}/(privacy|terms|refund)\\.html`).test(h));
    if (unprefixed.length) fail(page, `${unprefixed.length} internal link(s) missing /${LANG}: ${unprefixed.slice(0, 3).join(", ")}`);
    if (wrongLegal.length) fail(page, `legal link(s) wrongly prefixed: ${wrongLegal.slice(0, 2).join(", ")}`);
    if (!unprefixed.length && !wrongLegal.length) ok(page, `links: ${hrefs.filter(h => h.startsWith(`/${LANG}`)).length} in-language, legal at root`);

    // 6. title / description must differ from English
    const t = (s) => (s.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1];
    const d = (s) => (s.match(/name="description"\s+content="([^"]*)"/) ?? [])[1];
    const enRaw = readFileSync(enPath, "utf8");
    if (!t(raw) || t(raw) === t(enRaw)) fail(page, "<title> missing or identical to English");
    if (!d(raw) || d(raw) === d(enRaw)) fail(page, "meta description missing or identical to English");

    /* 7. script assertion — only where the language has one. Latin-script languages have no
     * character-level hazard, and inventing a check for them would be theatre. */
    if (CFG?.scriptCheck === "simplified") {
        const hits = new Map();
        for (const ch of stripSwitcher(raw)) if (SIMPLIFIED.has(ch)) hits.set(ch, (hits.get(ch) ?? 0) + 1);
        if (hits.size) fail(page, `${[...hits.values()].reduce((a, b) => a + b, 0)} Simplified character(s): `
            + [...hits.entries()].map(([c, n]) => `${c}x${n}`).join(" "));
        else ok(page, "script: zero Simplified-only characters");
    }

    ok(page, `bytes: ${statSync(trPath).size} (English ${statSync(enPath).size})`);
}

/* The negative test for the Simplified list: it MUST fire hard on the shipped zh/ pages.
 * A character list that matches nothing is indistinguishable from a working one. */
if (process.argv.includes("--simplified-selftest")) {
    let total = 0, pagesHit = 0;
    for (const p of PAGES) {
        const s = stripSwitcher(readFileSync(`${WEB}/zh/${p}`, "utf8"));
        let n = 0; for (const ch of s) if (SIMPLIFIED.has(ch)) n++;
        if (n) pagesHit++;
        total += n;
        console.log(`  zh/${p.padEnd(30)} ${String(n).padStart(5)} Simplified chars`);
    }
    const enTotal = PAGES.reduce((acc, p) => {
        const s = stripSwitcher(readFileSync(`${WEB}/${p}`, "utf8"));
        let n = 0; for (const ch of s) if (SIMPLIFIED.has(ch)) n++;
        return acc + n;
    }, 0);
    console.log(`\n  zh/ total: ${total} across ${pagesHit}/7 pages   (English pages: ${enTotal}, must be 0)`);
    process.exit(total > 500 && pagesHit === 7 && enTotal === 0 ? 0 : 1);
}

for (const p of pages) verify(p);
console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"} — ${pages.length} page(s)`);
process.exit(failures ? 1 : 0);
