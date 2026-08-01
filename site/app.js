// 8 个槽位是调色板上限（已过色盲/对比度校验），不能再加第 9 个颜色。
// 超出的来源走 FALLBACK_COLOR 灰色（dataviz 规范里的「其它」处理）。
// Boston Dynamics 的 feed 已空、The Robot Report 全 UA 403，两个槽位让给
// 实际在产出的来源；它们的历史条目会落到灰色，符合「尾部归入其它」。
const SOURCE_COLORS = {
  "arXiv": "#3987e5",
  "量子位": "#008300",
  "Google DeepMind": "#d55181",
  "Hacker News": "#c98500",
  "Hugging Face Blog": "#199e70",
  "IEEE Spectrum Robotics": "#d95926",
  "NVIDIA Blog": "#9085e9",
  "TechCrunch Robotics": "#e66767",
};
const FALLBACK_COLOR = "#898781";

// 顺序必须跟 scraper/sources.py 里的 TOPICS 一致 —— 这是分配颜色槽位的唯一依据
const TOPIC_COLORS = {
  "人形机器人": "#3987e5",
  "灵巧手与操作": "#008300",
  "移动与四足": "#d55181",
  "VLA与基础模型": "#c98500",
  "仿真与Sim2Real": "#199e70",
  "遥操作与数据采集": "#d95926",
  "世界模型": "#9085e9",
  "感知与传感": "#e34948",
};

const GISCUS_CONFIG = {
  repo: "roboherald/embodied-ai-chronicle",
  repoId: "R_kgDOTdDP2A",
  category: "General",
  categoryId: "DIC_kwDOTdDP2M4DBgr5",
  theme: "dark_dimmed",
};

const RANGES = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "7d", label: "最近 7 天" },
  { key: "30d", label: "最近 30 天" },
];

const LIKES_API_BASE = "https://embodied-chronicle-likes.1360895771.workers.dev";

const BOOKMARK_KEY = "eac_bookmarks";
const VISITED_KEY = "eac_visited";
const LIKED_KEY = "eac_liked";

// 不用 AbortSignal.timeout（微信内置浏览器等老 WebView 上没有这个 API，直接抛错导致点击静默失效）
function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function loadAllLikeCounts() {
  const counts = new Map();
  try {
    const res = await fetchWithTimeout(`${LIKES_API_BASE}/counts`);
    const data = await res.json();
    for (const [id, count] of Object.entries(data.counts || {})) counts.set(id, count);
  } catch {
    // 拿不到就都当 0，不阻塞页面渲染
  }
  return counts;
}

function loadIdSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}
function saveIdSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

const state = {
  events: [],
  activeSources: new Set(),
  activeTags: new Set(),
  activeTopics: new Set(),
  activeKinds: new Set(),
  activeRange: "all",
  query: "",
  bookmarksOnly: false,
  bookmarks: loadIdSet(BOOKMARK_KEY),
  visited: loadIdSet(VISITED_KEY),
  liked: loadIdSet(LIKED_KEY),
  likeCounts: new Map(),
  showTable: false,
  showTopicTable: false,
  companyMode: null,
  topicMode: null,
  milestones: [],
  health: null,
  activeTab: "latest",
};

async function init() {
  const res = await fetch("data/events.json", { cache: "no-store" });
  const events = await res.json();
  state.events = events;
  state.activeSources = new Set(events.map((e) => e.source));

  try {
    const mRes = await fetch("data/milestones.json", { cache: "no-store" });
    state.milestones = await mRes.json();
  } catch {
    state.milestones = [];
  }

  try {
    const hRes = await fetch("data/health.json", { cache: "no-store" });
    state.health = await hRes.json();
  } catch {
    state.health = null;
  }

  applyHashRoute();
  renderStats();
  renderSourceHealth();
  renderRangeFilters();
  renderSourceFilters();
  renderTopicFilters();
  renderKindFilters();
  renderTagFilters();
  renderCompanyHeader();
  renderTopicHeader();
  renderTopicTimeline();
  renderInsights();
  renderHotList();
  render();

  loadAllLikeCounts().then((counts) => {
    if (!counts.size) return;
    state.likeCounts = counts;
    document.querySelectorAll(".icon-btn[data-id]").forEach((btn) => {
      const count = counts.get(btn.dataset.id);
      if (count !== undefined) btn.querySelector(".count").textContent = count;
    });
    renderHotList();
  });

  window.addEventListener("hashchange", () => {
    applyHashRoute();
    syncChipClasses("tag-filters", state.activeTags);
    syncChipClasses("topic-filters", state.activeTopics);
    renderCompanyHeader();
    renderTopicHeader();
    render();
    // 钻取到某公司/方向时，自动切到「最新」把筛选后的列表露出来
    if (state.companyMode || state.topicMode) switchTab("latest");
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.getElementById("company-back").addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "";
  });
  document.getElementById("topic-back").addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "";
  });

  document.getElementById("search").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById("source-all").addEventListener("click", () => {
    state.activeSources = new Set(state.events.map((e) => e.source));
    syncChipClasses("source-filters", state.activeSources);
    render();
  });
  document.getElementById("source-none").addEventListener("click", () => {
    state.activeSources = new Set();
    syncChipClasses("source-filters", state.activeSources);
    render();
  });
  document.getElementById("bookmark-filter").addEventListener("click", (e) => {
    state.bookmarksOnly = !state.bookmarksOnly;
    e.currentTarget.classList.toggle("active", state.bookmarksOnly);
    render();
  });
  document.getElementById("table-toggle").addEventListener("click", () => {
    state.showTable = !state.showTable;
    document.getElementById("insights-charts").hidden = state.showTable;
    document.getElementById("insights-table").hidden = !state.showTable;
    if (state.showTable) renderInsightsTable();
  });
  document.getElementById("topic-timeline-table-toggle").addEventListener("click", () => {
    state.showTopicTable = !state.showTopicTable;
    document.getElementById("topic-timeline-rows").hidden = state.showTopicTable;
    document.getElementById("topic-timeline-table").hidden = !state.showTopicTable;
    if (state.showTopicTable) renderTopicTimelineTable();
  });
  document.getElementById("feedback-toggle").addEventListener("click", () => {
    document.querySelectorAll(".card-comments").forEach((p) => (p.hidden = true));
    document.querySelectorAll(".card-actions .icon-btn.active").forEach((b) => {
      if (b.textContent.includes("评论")) b.classList.remove("active");
    });
    mountGiscus(document.getElementById("giscus-container"), null);
  });
}

function isRecent(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return dateStr === today || dateStr === yesterday;
}

function currentCompanyFromHash() {
  const raw = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(raw);
  return params.get("company");
}

function currentTopicFromHash() {
  const raw = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(raw);
  return params.get("topic");
}

function applyHashRoute() {
  const company = currentCompanyFromHash();
  const topic = currentTopicFromHash();
  state.companyMode = company;
  state.topicMode = topic;
  state.activeTags = company ? new Set([company]) : new Set();
  state.activeTopics = topic ? new Set([topic]) : new Set();
}

function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
}

function renderCompanyHeader() {
  const section = document.getElementById("company-header");
  if (!state.companyMode) {
    section.hidden = true;
    return;
  }
  const items = state.events.filter((e) => (e.tags || []).includes(state.companyMode));
  section.hidden = false;
  document.getElementById("company-name").textContent = `公司 / 机构：${state.companyMode}`;

  const firstDate = items.length
    ? items.reduce((min, e) => (e.date < min ? e.date : min), items[0].date)
    : "—";
  const sourceCounts = new Map();
  for (const e of items) sourceCounts.set(e.source, (sourceCounts.get(e.source) || 0) + 1);
  const topSource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const tiles = [
    { value: items.length, label: "相关条目数" },
    { value: firstDate, label: "最早出现日期" },
    { value: topSource ? topSource[0] : "—", label: "最活跃来源" },
  ];
  const wrap = document.getElementById("company-stats");
  wrap.innerHTML = "";
  for (const t of tiles) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<div class="value">${t.value}</div><div class="label">${t.label}</div>`;
    wrap.appendChild(tile);
  }
}

function renderTopicHeader() {
  const section = document.getElementById("topic-header");
  if (!state.topicMode) {
    section.hidden = true;
    return;
  }
  const items = state.events.filter((e) => (e.topics || []).includes(state.topicMode));
  section.hidden = false;
  document.getElementById("topic-name").textContent = `研究方向：${state.topicMode}`;

  const firstDate = items.length
    ? items.reduce((min, e) => (e.date < min ? e.date : min), items[0].date)
    : "—";
  const sourceCounts = new Map();
  for (const e of items) sourceCounts.set(e.source, (sourceCounts.get(e.source) || 0) + 1);
  const topSource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const tiles = [
    { value: items.length, label: "相关条目数" },
    { value: firstDate, label: "最早出现日期" },
    { value: topSource ? topSource[0] : "—", label: "最活跃来源" },
  ];
  const wrap = document.getElementById("topic-stats");
  wrap.innerHTML = "";
  for (const t of tiles) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<div class="value">${t.value}</div><div class="label">${t.label}</div>`;
    wrap.appendChild(tile);
  }
}

function renderHotList() {
  const section = document.getElementById("hot-list");
  const wrap = document.getElementById("hot-list-items");
  const cutoff = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const weekItems = state.events.filter((e) => e.date >= cutoff);
  if (!weekItems.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const ranked = weekItems
    .map((e) => ({ e, count: state.likeCounts.get(e.id) || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  wrap.innerHTML = "";
  if (!ranked.length) {
    wrap.innerHTML = `<p class="hot-list-empty">本周还没有点赞数据，点一下新闻卡片下面的"👍 有用"就能上榜。</p>`;
    return;
  }
  ranked.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "hot-item";
    row.innerHTML = `
      <span class="hot-rank">${i + 1}</span>
      <a class="hot-title" href="${r.e.url}" target="_blank" rel="noopener noreferrer">${r.e.title}</a>
      <span class="hot-count">👍 ${r.count}</span>
    `;
    wrap.appendChild(row);
  });
}

function renderStats() {
  const total = state.events.length;
  const sourceCount = new Set(state.events.map((e) => e.source)).size;
  // 原来这里是「追踪到的公司/机构」，但 60% 内容来自 arXiv、摘要里不写机构名，
  // 这个数字长期接近 0，属于误导。换成真正有信息量的里程碑数。
  const milestoneCount = state.milestones.length;
  const latest = state.events.length ? state.events[0].date : "—";

  const tiles = [
    { value: total, label: "总条目数" },
    { value: sourceCount, label: "覆盖来源" },
    { value: milestoneCount, label: "收录里程碑" },
    { value: latest, label: "最新更新日期" },
  ];

  const wrap = document.getElementById("stats");
  wrap.innerHTML = "";
  for (const t of tiles) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<div class="value">${t.value}</div><div class="label">${t.label}</div>`;
    wrap.appendChild(tile);
  }
}

// 数据源失效过一次都没被发现（The Robot Report 突然 403，站点默默少一个来源）。
// 把健康状况显式摆出来，坏了要看得见。
function renderSourceHealth() {
  const el = document.getElementById("source-health");
  if (!el) return;
  const dead = state.health?.dead || [];
  if (!dead.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = `⚠️ 数据源异常：${dead.join("、")} 最近一次抓取没有返回任何内容，可能已失效。`;
}

function renderRangeFilters() {
  const wrap = document.getElementById("range-filters");
  wrap.innerHTML = "";
  RANGES.forEach((r) => {
    const chip = document.createElement("button");
    chip.className = "chip range" + (r.key === state.activeRange ? " active" : "");
    chip.textContent = r.label;
    chip.addEventListener("click", () => {
      state.activeRange = r.key;
      wrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      render();
    });
    wrap.appendChild(chip);
  });
}

function renderSourceFilters() {
  const sources = [...new Set(state.events.map((e) => e.source))].sort();
  const wrap = document.getElementById("source-filters");
  wrap.innerHTML = "";
  sources.forEach((source) => {
    const chip = document.createElement("button");
    chip.className = "chip active";
    chip.dataset.value = source;
    chip.innerHTML = `<span class="dot" style="background:${SOURCE_COLORS[source] || FALLBACK_COLOR}"></span>${source}`;
    chip.addEventListener("click", () => {
      if (state.activeSources.has(source)) {
        state.activeSources.delete(source);
        chip.classList.remove("active");
      } else {
        state.activeSources.add(source);
        chip.classList.add("active");
      }
      render();
    });
    wrap.appendChild(chip);
  });
}

function renderTagFilters() {
  const tagCounts = new Map();
  for (const e of state.events) {
    for (const tag of e.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const row = document.getElementById("tag-row");
  const wrap = document.getElementById("tag-filters");
  if (!tagCounts.size) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  wrap.innerHTML = "";
  [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([tag, count]) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.activeTags.has(tag) ? " active" : "");
      chip.dataset.value = tag;
      chip.textContent = `${tag} (${count})`;
      chip.addEventListener("click", () => {
        if (state.activeTags.has(tag)) {
          state.activeTags.delete(tag);
          chip.classList.remove("active");
        } else {
          state.activeTags.add(tag);
          chip.classList.add("active");
        }
        render();
      });
      wrap.appendChild(chip);
    });
}

function renderTopicFilters() {
  const topicCounts = new Map();
  for (const e of state.events) {
    for (const topic of e.topics || []) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
  }
  const wrap = document.getElementById("topic-filters");
  wrap.innerHTML = "";
  Object.keys(TOPIC_COLORS)
    .filter((topic) => topicCounts.get(topic))
    .forEach((topic) => {
      const count = topicCounts.get(topic);
      const chip = document.createElement("button");
      chip.className = "chip" + (state.activeTopics.has(topic) ? " active" : "");
      chip.dataset.value = topic;
      chip.innerHTML = `<span class="dot" style="background:${TOPIC_COLORS[topic]}"></span>${topic} (${count})`;
      chip.addEventListener("click", () => {
        if (state.activeTopics.has(topic)) {
          state.activeTopics.delete(topic);
          chip.classList.remove("active");
        } else {
          state.activeTopics.add(topic);
          chip.classList.add("active");
        }
        render();
      });
      wrap.appendChild(chip);
    });
}

// 内容类型：和研究方向正交的第二维，不占调色板槽位，用纯文字 chip 渲染
function renderKindFilters() {
  const counts = new Map();
  for (const e of state.events) {
    for (const kind of e.kinds || []) counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const row = document.getElementById("kind-row");
  const wrap = document.getElementById("kind-filters");
  wrap.innerHTML = "";
  const kinds = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  if (!kinds.length) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  kinds.forEach((kind) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.activeKinds.has(kind) ? " active" : "");
    chip.dataset.value = kind;
    chip.textContent = `${kind} (${counts.get(kind)})`;
    chip.addEventListener("click", () => {
      if (state.activeKinds.has(kind)) {
        state.activeKinds.delete(kind);
        chip.classList.remove("active");
      } else {
        state.activeKinds.add(kind);
        chip.classList.add("active");
      }
      render();
    });
    wrap.appendChild(chip);
  });
}

// ─── 研究方向脉络：方向 × 年份矩阵 ───────────────────────────────
// 里程碑跨 8 年、新闻只有最近 120 天，放同一根线性轴上必然一边挤成一坨、
// 一边大片空白。改成按年份切等宽格子：年份是离散刻度，比例失真消失；
// 新闻活跃度单独一列，两种时间尺度物理分开。

function milestoneYears() {
  const years = new Set();
  for (const m of state.milestones) years.add(m.date.slice(0, 4));
  if (!years.size) return [];
  const list = [...years].map(Number).sort((a, b) => a - b);
  const out = [];
  for (let y = list[0]; y <= list[list.length - 1]; y++) out.push(String(y));
  return out;
}

function recentEventCount(topic) {
  return state.events.filter((e) => (e.topics || []).includes(topic)).length;
}

function renderTopicTimeline() {
  const rowsWrap = document.getElementById("topic-timeline-rows");
  rowsWrap.innerHTML = "";

  const topics = Object.keys(TOPIC_COLORS).filter(
    (topic) =>
      state.events.some((e) => (e.topics || []).includes(topic)) ||
      state.milestones.some((m) => m.topic === topic)
  );

  if (!topics.length) {
    rowsWrap.innerHTML = '<p class="topic-timeline-empty-hint">暂无可展示的研究方向数据。</p>';
    return;
  }

  const years = milestoneYears();
  const maxRecent = Math.max(1, ...topics.map(recentEventCount));

  const grid = document.createElement("div");
  grid.className = "topic-grid";
  grid.style.setProperty("--year-count", years.length);

  // 表头：年份 + 近况列
  grid.appendChild(document.createElement("div"));
  years.forEach((y) => {
    const cell = document.createElement("div");
    cell.className = "topic-grid-year-head";
    cell.textContent = y;
    grid.appendChild(cell);
  });
  const recentHead = document.createElement("div");
  recentHead.className = "topic-grid-year-head topic-grid-recent-head";
  recentHead.textContent = "近 120 天";
  grid.appendChild(recentHead);

  topics.forEach((topic) => {
    const color = TOPIC_COLORS[topic];
    const milestones = state.milestones.filter((m) => m.topic === topic);

    const label = document.createElement("button");
    label.className = "topic-grid-label";
    label.innerHTML = `<span class="dot" style="background:${color}"></span><span class="topic-grid-name">${topic}</span>`;
    label.title = `查看「${topic}」完整发展脉络`;
    label.addEventListener("click", () => openTopicModal(topic));
    grid.appendChild(label);

    years.forEach((y) => {
      const inYear = milestones.filter((m) => m.date.startsWith(y));
      const cell = document.createElement("button");
      cell.className = "topic-grid-cell" + (inYear.length ? " has-milestone" : "");
      cell.title = inYear.length
        ? `${topic} · ${y}：${inYear.map((m) => m.title).join("；")}`
        : `${topic} · ${y}：暂无收录的里程碑`;
      cell.addEventListener("click", () => openTopicModal(topic, y));
      inYear.forEach(() => {
        const d = document.createElement("span");
        d.className = "topic-grid-dot";
        d.style.background = color;
        cell.appendChild(d);
      });
      grid.appendChild(cell);
    });

    // 近况列：最近 120 天的相关条目数，用条长表示活跃度
    const count = recentEventCount(topic);
    const recentCell = document.createElement("button");
    recentCell.className = "topic-grid-recent";
    recentCell.title = `最近 120 天有 ${count} 条「${topic}」相关内容，点击筛选查看`;
    recentCell.addEventListener("click", () => {
      location.hash = `topic=${encodeURIComponent(topic)}`;
    });
    const bar = document.createElement("span");
    bar.className = "topic-grid-recent-bar";
    bar.style.width = `${(count / maxRecent) * 100}%`;
    bar.style.background = color;
    const num = document.createElement("span");
    num.className = "topic-grid-recent-num";
    num.textContent = count;
    recentCell.append(bar, num);
    grid.appendChild(recentCell);
  });

  rowsWrap.appendChild(grid);

  const hint = document.createElement("p");
  hint.className = "topic-timeline-empty-hint";
  hint.textContent = "每个圆点是一个里程碑事件（年份等宽，非真实时间比例）。点方向名或格子查看完整脉络。";
  rowsWrap.appendChild(hint);
}

// ─── 弹窗：垂直叙事流 ─────────────────────────────────────────
// 不再需要缩放/拖动——那些本来就是在给「挤在一起」打补丁。

let topicModalEl = null;

function ensureTopicModal() {
  if (topicModalEl) return topicModalEl;

  const backdrop = document.createElement("div");
  backdrop.className = "topic-modal-backdrop";
  backdrop.hidden = true;

  const panel = document.createElement("div");
  panel.className = "topic-modal-panel";

  const header = document.createElement("div");
  header.className = "topic-modal-header";
  const title = document.createElement("h3");

  const actions = document.createElement("div");
  actions.className = "topic-modal-actions";

  const viewListLink = document.createElement("a");
  viewListLink.className = "text-btn";
  viewListLink.textContent = "查看相关新闻 →";
  viewListLink.href = "#";

  const closeBtn = document.createElement("button");
  closeBtn.className = "text-btn";
  closeBtn.textContent = "✕ 关闭";
  closeBtn.addEventListener("click", closeTopicModal);

  actions.append(viewListLink, closeBtn);
  header.append(title, actions);

  const body = document.createElement("div");
  body.className = "topic-modal-body";

  panel.append(header, body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeTopicModal();
  });

  topicModalEl = { backdrop, title, body, viewListLink };
  return topicModalEl;
}

function handleTopicModalKeydown(e) {
  if (e.key === "Escape") closeTopicModal();
}

function openTopicModal(topic, scrollToYear) {
  const modal = ensureTopicModal();
  const color = TOPIC_COLORS[topic];
  const milestones = state.milestones
    .filter((m) => m.topic === topic)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const events = state.events
    .filter((e) => (e.topics || []).includes(topic))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  modal.title.innerHTML = `<span class="dot" style="background:${color}"></span>${topic}`;
  modal.body.innerHTML = "";

  // 里程碑：按年份分段的叙事流
  if (milestones.length) {
    const byYear = new Map();
    for (const m of milestones) {
      const y = m.date.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(m);
    }
    for (const [year, list] of byYear) {
      const section = document.createElement("section");
      section.className = "milestone-year";
      section.dataset.year = year;

      const yh = document.createElement("h4");
      yh.className = "milestone-year-head";
      yh.textContent = year;
      section.appendChild(yh);

      for (const m of list) {
        const card = document.createElement("article");
        card.className = "milestone-card";
        card.style.setProperty("--card-color", color);

        const date = document.createElement("div");
        date.className = "milestone-date";
        date.textContent = m.date;

        const link = document.createElement("a");
        link.className = "milestone-title";
        link.href = m.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = m.title;

        card.append(date, link);
        if (m.description) {
          const desc = document.createElement("p");
          desc.className = "milestone-desc";
          desc.textContent = m.description;
          card.appendChild(desc);
        }
        section.appendChild(card);
      }
      modal.body.appendChild(section);
    }
  } else {
    const empty = document.createElement("p");
    empty.className = "topic-timeline-empty-hint";
    empty.textContent = "这个方向还没有收录里程碑事件。";
    modal.body.appendChild(empty);
  }

  // 最近动态：单独一段，和历史里程碑物理分开
  const recent = document.createElement("section");
  recent.className = "milestone-year milestone-recent";
  const rh = document.createElement("h4");
  rh.className = "milestone-year-head";
  rh.textContent = `最近动态（${events.length} 条）`;
  recent.appendChild(rh);

  if (events.length) {
    const list = document.createElement("div");
    list.className = "milestone-recent-list";
    for (const e of events.slice(0, 12)) {
      const row = document.createElement("a");
      row.className = "milestone-recent-item";
      row.href = e.url;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      row.innerHTML = `<span class="milestone-recent-date">${e.date}</span><span class="milestone-recent-title">${e.title}</span><span class="milestone-recent-source">${e.source}</span>`;
      list.appendChild(row);
    }
    recent.appendChild(list);
    if (events.length > 12) {
      const more = document.createElement("p");
      more.className = "topic-timeline-empty-hint";
      more.textContent = `还有 ${events.length - 12} 条，点右上角「查看相关新闻」看全部。`;
      recent.appendChild(more);
    }
  } else {
    const none = document.createElement("p");
    none.className = "topic-timeline-empty-hint";
    none.textContent = "最近 120 天没有这个方向的新内容。";
    recent.appendChild(none);
  }
  modal.body.appendChild(recent);

  modal.viewListLink.onclick = (e) => {
    e.preventDefault();
    closeTopicModal();
    location.hash = `topic=${encodeURIComponent(topic)}`;
  };

  modal.backdrop.hidden = false;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", handleTopicModalKeydown);

  modal.body.scrollTop = 0;
  if (scrollToYear) {
    const target = modal.body.querySelector(`.milestone-year[data-year="${scrollToYear}"]`);
    if (target) target.scrollIntoView({ block: "start" });
  }
}

function closeTopicModal() {
  if (!topicModalEl) return;
  topicModalEl.backdrop.hidden = true;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", handleTopicModalKeydown);
}

function renderTopicTimelineTable() {
  const wrap = document.getElementById("topic-timeline-table");
  wrap.innerHTML = "";

  const t1 = document.createElement("table");
  t1.innerHTML =
    "<thead><tr><th>研究方向</th><th>相关条目数</th></tr></thead><tbody>" +
    Object.keys(TOPIC_COLORS)
      .map((topic) => {
        const count = state.events.filter((e) => (e.topics || []).includes(topic)).length;
        return `<tr><td>${topic}</td><td>${count}</td></tr>`;
      })
      .join("") +
    "</tbody>";
  wrap.appendChild(t1);

  const milestones = [...state.milestones].sort((a, b) => (a.date < b.date ? -1 : 1));
  const t2 = document.createElement("table");
  t2.innerHTML =
    "<thead><tr><th>日期</th><th>研究方向</th><th>里程碑</th></tr></thead><tbody>" +
    (milestones.length
      ? milestones
          .map(
            (m) =>
              `<tr><td>${m.date}</td><td>${m.topic}</td><td><a href="${m.url}" target="_blank" rel="noopener noreferrer">${m.title}</a></td></tr>`
          )
          .join("")
      : '<tr><td colspan="3">暂无收录的里程碑事件。</td></tr>') +
    "</tbody>";
  wrap.appendChild(t2);
}

function weeklyBuckets() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(today);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    weeks.push({ start, end, count: 0 });
  }
  for (const e of state.events) {
    const d = new Date(e.date + "T00:00:00Z");
    for (const w of weeks) {
      if (d >= w.start && d <= w.end) {
        w.count++;
        break;
      }
    }
  }
  return weeks;
}

function renderInsights() {
  const weeks = weeklyBuckets();
  const maxCount = Math.max(1, ...weeks.map((w) => w.count));
  const weeklyWrap = document.getElementById("weekly-chart");
  weeklyWrap.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "bar-chart";
  weeks.forEach((w) => {
    const col = document.createElement("div");
    col.className = "bar-col";
    const value = document.createElement("div");
    value.className = "bar-value";
    value.textContent = w.count;
    const b = document.createElement("div");
    b.className = "bar";
    b.style.height = `${Math.max(2, (w.count / maxCount) * 100)}px`;
    b.title = `${w.start.toISOString().slice(0, 10)} ~ ${w.end.toISOString().slice(0, 10)}: ${w.count} 条`;
    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = `${w.end.getMonth() + 1}/${w.end.getDate()}`;
    col.appendChild(value);
    col.appendChild(b);
    col.appendChild(label);
    bar.appendChild(col);
  });
  weeklyWrap.appendChild(bar);

  const sourceCounts = new Map();
  for (const e of state.events) {
    sourceCounts.set(e.source, (sourceCounts.get(e.source) || 0) + 1);
  }
  const sorted = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(1, ...sorted.map(([, c]) => c));
  const sourceWrap = document.getElementById("source-chart");
  sourceWrap.innerHTML = "";
  const list = document.createElement("div");
  list.className = "hbar-list";
  sorted.forEach(([source, count]) => {
    const row = document.createElement("div");
    row.className = "hbar-row";
    const label = document.createElement("div");
    label.className = "hbar-label";
    label.textContent = source;
    const track = document.createElement("div");
    track.className = "hbar-track";
    const fill = document.createElement("div");
    fill.className = "hbar-fill";
    fill.style.width = `${Math.max(2, (count / maxSource) * 100)}%`;
    fill.style.background = SOURCE_COLORS[source] || FALLBACK_COLOR;
    track.appendChild(fill);
    const value = document.createElement("div");
    value.className = "hbar-value";
    value.textContent = count;
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    list.appendChild(row);
  });
  sourceWrap.appendChild(list);
}

function renderInsightsTable() {
  const weeks = weeklyBuckets();
  const sourceCounts = new Map();
  for (const e of state.events) {
    sourceCounts.set(e.source, (sourceCounts.get(e.source) || 0) + 1);
  }
  const wrap = document.getElementById("insights-table");
  wrap.innerHTML = "";

  const t1 = document.createElement("table");
  t1.innerHTML =
    "<thead><tr><th>周区间(截至)</th><th>条目数</th></tr></thead><tbody>" +
    weeks
      .map((w) => `<tr><td>${w.end.toISOString().slice(0, 10)}</td><td>${w.count}</td></tr>`)
      .join("") +
    "</tbody>";
  wrap.appendChild(t1);

  const t2 = document.createElement("table");
  t2.innerHTML =
    "<thead><tr><th>来源</th><th>条目数</th></tr></thead><tbody>" +
    [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `<tr><td>${s}</td><td>${c}</td></tr>`)
      .join("") +
    "</tbody>";
  wrap.appendChild(t2);
}

function syncChipClasses(containerId, activeSet) {
  document.querySelectorAll(`#${containerId} .chip`).forEach((chip) => {
    chip.classList.toggle("active", activeSet.has(chip.dataset.value));
  });
}

function rangeCutoff() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = { today: 0, "7d": 6, "30d": 29 };
  if (!(state.activeRange in days)) return null;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days[state.activeRange]);
  return cutoff.toISOString().slice(0, 10);
}

function filteredEvents() {
  const cutoff = rangeCutoff();
  return state.events.filter((e) => {
    if (!state.activeSources.has(e.source)) return false;
    if (cutoff && e.date < cutoff) return false;
    if (state.activeTags.size && !(e.tags || []).some((t) => state.activeTags.has(t))) return false;
    if (state.activeTopics.size && !(e.topics || []).some((t) => state.activeTopics.has(t))) return false;
    if (state.activeKinds.size && !(e.kinds || []).some((k) => state.activeKinds.has(k))) return false;
    if (state.bookmarksOnly && !state.bookmarks.has(e.id)) return false;
    if (!state.query) return true;
    const haystack = `${e.title} ${e.summary}`.toLowerCase();
    return haystack.includes(state.query);
  });
}

function render() {
  const events = filteredEvents();
  const timeline = document.getElementById("timeline");
  const emptyState = document.getElementById("empty-state");
  timeline.innerHTML = "";

  if (!events.length) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const groups = new Map();
  for (const e of events) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }

  for (const [date, items] of groups) {
    const group = document.createElement("section");
    group.className = "day-group";

    const label = document.createElement("h2");
    label.className = "day-label";
    label.textContent = date;
    group.appendChild(label);

    const cards = document.createElement("div");
    cards.className = "cards";
    for (const item of items) {
      cards.appendChild(renderCard(item));
    }
    group.appendChild(cards);
    timeline.appendChild(group);
  }
}

async function handleLikeClick(btn) {
  const id = btn.dataset.id;
  const isLiking = !state.liked.has(id);
  const countEl = btn.querySelector(".count");
  const prevCount = state.likeCounts.get(id) || 0;

  // 乐观更新：先本地反映点击结果，即使网络慢/被墙也有即时反馈
  countEl.textContent = isLiking ? prevCount + 1 : Math.max(0, prevCount - 1);
  btn.classList.toggle("active", isLiking);
  btn.disabled = true;
  try {
    const res = await fetchWithTimeout(`${LIKES_API_BASE}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: isLiking ? "up" : "down" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const count = data.count ?? (isLiking ? prevCount + 1 : Math.max(0, prevCount - 1));
    countEl.textContent = count;
    state.likeCounts.set(id, count);
    if (isLiking) {
      state.liked.add(id);
      btn.title = "再点一次取消";
    } else {
      state.liked.delete(id);
      btn.title = "";
    }
    saveIdSet(LIKED_KEY, state.liked);
  } catch (err) {
    // 不再静默：回滚乐观更新，并明确闪红提示，方便定位是网络/被墙问题
    countEl.textContent = prevCount;
    btn.classList.toggle("active", state.liked.has(id));
    btn.title = "连接点赞服务失败，请检查网络（或该域名被拦截）";
    btn.classList.add("like-error");
    setTimeout(() => btn.classList.remove("like-error"), 1600);
  } finally {
    btn.disabled = false;
  }
}

function renderCard(item) {
  const card = document.createElement("article");
  card.className = "card" + (state.visited.has(item.id) ? " visited" : "");
  card.style.setProperty("--card-color", SOURCE_COLORS[item.source] || FALLBACK_COLOR);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  if (isRecent(item.date)) {
    const newBadge = document.createElement("span");
    newBadge.className = "badge badge-new";
    newBadge.textContent = "🆕 新";
    meta.appendChild(newBadge);
  }
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = item.source;
  meta.appendChild(badge);
  for (const tag of item.tags || []) {
    const pill = document.createElement("span");
    pill.className = "tag-pill clickable";
    pill.textContent = tag;
    pill.title = `查看「${tag}」的公司主页`;
    pill.addEventListener("click", () => {
      location.hash = `company=${encodeURIComponent(tag)}`;
    });
    meta.appendChild(pill);
  }
  for (const topic of item.topics || []) {
    const pill = document.createElement("span");
    pill.className = "topic-pill clickable";
    pill.innerHTML = `<span class="dot" style="background:${TOPIC_COLORS[topic] || FALLBACK_COLOR}"></span>${topic}`;
    pill.title = `查看「${topic}」研究方向脉络`;
    pill.addEventListener("click", () => {
      location.hash = `topic=${encodeURIComponent(topic)}`;
    });
    meta.appendChild(pill);
  }
  for (const kind of item.kinds || []) {
    const pill = document.createElement("span");
    pill.className = "kind-pill";
    pill.textContent = kind;
    meta.appendChild(pill);
  }
  card.appendChild(meta);

  const link = document.createElement("a");
  link.className = "title";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = item.title;
  link.addEventListener("click", () => {
    state.visited.add(item.id);
    saveIdSet(VISITED_KEY, state.visited);
    card.classList.add("visited");
  });
  card.appendChild(link);

  if (item.summary) {
    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = item.summary;
    card.appendChild(summary);
  }

  // HN 条目原本的摘要是 "N points, <链接>"，对读者零信息量。
  // 改成把讨论热度渲染成可点击的徽标。
  if (item.hn) {
    const hn = document.createElement("div");
    hn.className = "hn-meta";
    const a = document.createElement("a");
    a.href = item.hn.discussion;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = `▲ ${item.hn.points} · 💬 ${item.hn.comments} 条讨论`;
    hn.appendChild(a);
    card.appendChild(hn);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.className = "icon-btn" + (state.bookmarks.has(item.id) ? " active" : "");
  bookmarkBtn.textContent = state.bookmarks.has(item.id) ? "⭐ 已收藏" : "☆ 收藏";
  bookmarkBtn.addEventListener("click", () => {
    if (state.bookmarks.has(item.id)) {
      state.bookmarks.delete(item.id);
      bookmarkBtn.classList.remove("active");
      bookmarkBtn.textContent = "☆ 收藏";
      if (state.bookmarksOnly) render();
    } else {
      state.bookmarks.add(item.id);
      bookmarkBtn.classList.add("active");
      bookmarkBtn.textContent = "⭐ 已收藏";
    }
    saveIdSet(BOOKMARK_KEY, state.bookmarks);
  });
  actions.appendChild(bookmarkBtn);

  const likeBtn = document.createElement("button");
  likeBtn.className = "icon-btn" + (state.liked.has(item.id) ? " active" : "");
  likeBtn.dataset.id = item.id;
  likeBtn.innerHTML = `👍 有用 <span class="count">${state.likeCounts.get(item.id) || 0}</span>`;
  likeBtn.title = state.liked.has(item.id) ? "再点一次取消" : "";
  likeBtn.addEventListener("click", () => handleLikeClick(likeBtn));
  actions.appendChild(likeBtn);

  const commentPanel = document.createElement("div");
  commentPanel.className = "card-comments";
  commentPanel.hidden = true;

  const commentBtn = document.createElement("button");
  commentBtn.className = "icon-btn";
  commentBtn.textContent = "💬 评论";
  commentBtn.addEventListener("click", () => {
    const opening = commentPanel.hidden;
    if (opening) {
      document.querySelectorAll(".card-comments").forEach((p) => {
        if (p !== commentPanel) p.hidden = true;
      });
      document.querySelectorAll(".card-actions .icon-btn.active").forEach((b) => {
        if (b !== commentBtn && b.textContent.includes("评论")) b.classList.remove("active");
      });
    }
    commentPanel.hidden = !opening;
    commentBtn.classList.toggle("active", opening);
    if (opening) {
      mountGiscus(commentPanel, item.id);
    }
  });
  actions.appendChild(commentBtn);

  card.appendChild(actions);
  card.appendChild(commentPanel);

  return card;
}

// giscus 同一页面只支持一个实例，所以全站只维护一个共享的 widget，
// 谁申请就把它搬到谁的容器里重新加载（会丢弃之前那处的评论框）。
let activeGiscusContainer = null;
function mountGiscus(container, term) {
  if (activeGiscusContainer && activeGiscusContainer !== container) {
    activeGiscusContainer.innerHTML = "";
  }
  container.innerHTML = "";
  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.setAttribute("data-repo", GISCUS_CONFIG.repo);
  script.setAttribute("data-repo-id", GISCUS_CONFIG.repoId);
  script.setAttribute("data-category", GISCUS_CONFIG.category);
  script.setAttribute("data-category-id", GISCUS_CONFIG.categoryId);
  if (term) {
    script.setAttribute("data-mapping", "specific");
    script.setAttribute("data-term", term);
    script.setAttribute("data-strict", "1");
  } else {
    script.setAttribute("data-mapping", "pathname");
    script.setAttribute("data-strict", "0");
  }
  script.setAttribute("data-reactions-enabled", "1");
  script.setAttribute("data-emit-metadata", "0");
  script.setAttribute("data-input-position", "bottom");
  script.setAttribute("data-theme", GISCUS_CONFIG.theme);
  script.setAttribute("data-lang", "zh-CN");
  script.setAttribute("data-loading", "lazy");
  script.crossOrigin = "anonymous";
  script.async = true;
  container.appendChild(script);
  activeGiscusContainer = container;
}

init();
