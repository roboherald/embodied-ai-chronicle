// 无头验证：用 jsdom 真正加载 index.html + app.js，断言渲染结果与交互行为。
// 这个环境没有浏览器，之前所有 UI 改动都只能靠"看代码觉得对"，这个脚本把它变成可验证的。
const fs = require("fs");
const path = require("path");
// jsdom 可能装在项目里（CI: npm install jsdom）或本地临时目录，两种都支持
function loadJsdom() {
  for (const p of ["jsdom", "/tmp/domtest/node_modules/jsdom"]) {
    try {
      return require(p);
    } catch {
      /* 试下一个 */
    }
  }
  console.error("找不到 jsdom，请先 `npm install jsdom`");
  process.exit(2);
}
const { JSDOM, VirtualConsole } = loadJsdom();

const SITE = path.join(__dirname, "..", "site");
const results = { pass: 0, fail: 0, errors: [] };

function check(name, cond, detail = "") {
  if (cond) {
    results.pass++;
    console.log(`  ✓ ${name}`);
  } else {
    results.fail++;
    results.errors.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function boot() {
  const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const events = fs.readFileSync(path.join(SITE, "data/events.json"), "utf8");
  const milestones = fs.readFileSync(path.join(SITE, "data/milestones.json"), "utf8");
  const health = fs.existsSync(path.join(SITE, "data/health.json"))
    ? fs.readFileSync(path.join(SITE, "data/health.json"), "utf8")
    : '{"sources":{},"dead":[]}';

  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on("jsdomError", (e) => consoleErrors.push(e.message));
  virtualConsole.on("error", (...a) => consoleErrors.push(a.join(" ")));

  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://roboherald.github.io/embodied-ai-chronicle/",
    virtualConsole,
  });
  const { window } = dom;

  // stub 掉网络：events/milestones 用本地文件，点赞接口一律失败（模拟被墙）
  window.fetch = (url) => {
    const u = String(url);
    if (u.includes("events.json")) return Promise.resolve(mkRes(events));
    if (u.includes("milestones.json")) return Promise.resolve(mkRes(milestones));
    if (u.includes("health.json")) return Promise.resolve(mkRes(health));
    return Promise.reject(new Error("network blocked (simulated)"));
  };
  function mkRes(text) {
    return { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(text)), text: () => Promise.resolve(text) };
  }
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  // jsdom 没实现 scrollIntoView
  window.Element.prototype.scrollIntoView = function () {};

  const appJs = fs.readFileSync(path.join(SITE, "app.js"), "utf8");
  window.eval(appJs);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

  // 等待 init() 的 async 链跑完
  await new Promise((r) => setTimeout(r, 300));

  return { window, doc: window.document, consoleErrors, health, events };
}

(async () => {
  const { window, doc, consoleErrors, health, events } = await boot();
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  console.log("\n[1] 页面无脚本错误");
  check("没有 JS 运行时错误", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  console.log("\n[2] 基础渲染");
  check("新闻卡片已渲染", $$("#timeline .card").length > 0, `实际 ${$$("#timeline .card").length} 张`);
  check("统计块已渲染", $$("#stats .stat-tile").length > 0);
  check("来源筛选已渲染", $$("#source-filters .chip").length > 0);
  check("研究方向筛选已渲染", $$("#topic-filters .chip").length > 0);

  console.log("\n[3] 标签页切换");
  const tabs = $$(".tab");
  check("有 3 个标签页", tabs.length === 3, `实际 ${tabs.length}`);
  const topicsTab = tabs.find((t) => t.dataset.tab === "topics");
  topicsTab.dispatchEvent(new window.Event("click", { bubbles: true }));
  check("点研究方向后该面板显示", !$('[data-panel="topics"]').hidden);
  check("点研究方向后最新面板隐藏", $('[data-panel="latest"]').hidden);

  console.log("\n[4] 方向×年份矩阵");
  const grid = $(".topic-grid");
  check("矩阵已渲染", !!grid);
  const labelCount = $$(".topic-grid-label").length;
  check("有方向标签", labelCount > 0, `${labelCount} 个`);
  check("有年份表头", $$(".topic-grid-year-head").length > 1);
  check("有里程碑圆点", $$(".topic-grid-dot").length > 0, `实际 ${$$(".topic-grid-dot").length}`);
  check("近况列与方向数一致", $$(".topic-grid-recent").length === labelCount,
    `${$$(".topic-grid-recent").length} vs ${labelCount}`);

  console.log("\n[5] 弹窗打开/关闭（之前的 bug 就在这）");
  $$(".topic-grid-label")[0].dispatchEvent(new window.Event("click", { bubbles: true }));
  const backdrop = $(".topic-modal-backdrop");
  check("弹窗已打开", backdrop && !backdrop.hidden);
  check("弹窗有里程碑卡片", $$(".milestone-card").length > 0, `实际 ${$$(".milestone-card").length}`);
  check("弹窗有年份分段", $$(".milestone-year-head").length > 0);

  const closeBtn = [...doc.querySelectorAll(".topic-modal-actions .text-btn")].find((b) =>
    b.textContent.includes("关闭")
  );
  check("找得到关闭按钮", !!closeBtn);
  closeBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  check("关闭按钮能真正关掉弹窗", backdrop.hidden === true);

  // Esc 关闭
  $$(".topic-grid-label")[0].dispatchEvent(new window.Event("click", { bubbles: true }));
  const esc = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true });
  doc.dispatchEvent(esc);
  check("Esc 也能关掉弹窗", backdrop.hidden === true);

  console.log("\n[6] 筛选");
  const latestTab = tabs.find((t) => t.dataset.tab === "latest");
  latestTab.dispatchEvent(new window.Event("click", { bubbles: true }));
  const before = $$("#timeline .card").length;
  const search = $("#search");
  search.value = "humanoid";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  const after = $$("#timeline .card").length;
  check("搜索能过滤结果", after > 0 && after < before, `${before} → ${after}`);
  search.value = "";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("清空搜索能恢复", $$("#timeline .card").length === before);

  console.log("\n[7] 点赞失败时的表现（模拟被墙）");
  const likeBtn = $("#timeline .card .icon-btn[data-id]");
  check("找得到点赞按钮", !!likeBtn);
  const countEl = likeBtn.querySelector(".count");
  const before2 = countEl.textContent;
  likeBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  check("点击后乐观更新数字", countEl.textContent !== before2, `${before2} → ${countEl.textContent}`);
  await new Promise((r) => setTimeout(r, 100));
  check("失败后回滚数字", countEl.textContent === before2, `回到 ${countEl.textContent}`);
  check("失败后有可见的错误提示", likeBtn.classList.contains("like-error"));

  console.log("\n[8] 内容类型筛选（第二维标签）");
  const kindRow = $("#kind-row");
  const kindChips = $$("#kind-filters .chip");
  check("内容类型筛选行已显示", !kindRow.hidden);
  check("有内容类型 chip", kindChips.length > 0, `${kindChips.length} 个`);
  const cardsBefore = $$("#timeline .card").length;
  kindChips[0].dispatchEvent(new window.Event("click", { bubbles: true }));
  const cardsAfter = $$("#timeline .card").length;
  check("内容类型能过滤", cardsAfter > 0 && cardsAfter < cardsBefore, `${cardsBefore} → ${cardsAfter}`);
  kindChips[0].dispatchEvent(new window.Event("click", { bubbles: true }));
  check("再点一次能取消", $$("#timeline .card").length === cardsBefore);
  check("卡片上渲染了类型标签", $$(".kind-pill").length > 0);

  console.log("\n[9] 数据源健康告警");
  const healthEl = $("#source-health");
  const deadList = JSON.parse(health).dead || [];
  check("健康提示元素存在", !!healthEl);
  if (deadList.length) {
    check("有失效源时显示告警", !healthEl.hidden);
    check("告警里点名了失效源", healthEl.textContent.includes(deadList[0]), healthEl.textContent);
  } else {
    check("无失效源时不显示告警", healthEl.hidden);
  }

  console.log("\n[10] HN 讨论热度徽标（替代无信息量的假摘要）");
  const allEvents = JSON.parse(events);
  const hnItems = allEvents.filter((e) => e.hn);
  if (hnItems.length) {
    check("HN 条目不再有 'N points,' 假摘要",
      !allEvents.some((e) => /^\d+ points,/.test(e.summary || "")),
      "仍有残留");
    check("HN 条目都达到分数门槛", hnItems.every((e) => e.hn.points >= 3),
      `最低 ${Math.min(...hnItems.map((e) => e.hn.points))} 分`);
    check("页面渲染了热度徽标", $$(".hn-meta").length > 0, `${$$(".hn-meta").length} 个`);
    const badge = $(".hn-meta a");
    check("徽标链接到讨论页", badge && badge.href.includes("news.ycombinator.com"));
  } else {
    check("（数据里暂无 HN 条目，跳过）", true);
  }

  console.log("\n[11] 表格视图（无障碍备选）");
  topicsTab.dispatchEvent(new window.Event("click", { bubbles: true }));
  $("#topic-timeline-table-toggle").dispatchEvent(new window.Event("click", { bubbles: true }));
  check("表格视图能显示", !$("#topic-timeline-table").hidden);
  check("表格里有里程碑行", $$("#topic-timeline-table table").length >= 1);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`通过 ${results.pass} / 失败 ${results.fail}`);
  if (results.fail) {
    console.log("\n失败项:");
    results.errors.forEach((e) => console.log("  - " + e));
    process.exit(1);
  }
  console.log("全部通过");
})().catch((e) => {
  console.error("\n验证脚本自身出错:", e.message);
  console.error(e.stack.split("\n").slice(0, 5).join("\n"));
  process.exit(2);
});
