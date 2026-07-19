const SOURCE_COLORS = {
  "arXiv": "#3987e5",
  "Boston Dynamics": "#008300",
  "Google DeepMind": "#d55181",
  "Hacker News": "#c98500",
  "Hugging Face Blog": "#199e70",
  "IEEE Spectrum Robotics": "#d95926",
  "NVIDIA Blog": "#9085e9",
  "The Robot Report": "#e66767",
};
const FALLBACK_COLOR = "#898781";

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
  activeRange: "all",
  query: "",
  bookmarksOnly: false,
  bookmarks: loadIdSet(BOOKMARK_KEY),
  visited: loadIdSet(VISITED_KEY),
  liked: loadIdSet(LIKED_KEY),
  likeCounts: new Map(),
  showTable: false,
  companyMode: null,
};

async function init() {
  const res = await fetch("data/events.json", { cache: "no-store" });
  const events = await res.json();
  state.events = events;
  state.activeSources = new Set(events.map((e) => e.source));

  applyHashRoute();
  renderStats();
  renderRangeFilters();
  renderSourceFilters();
  renderTagFilters();
  renderCompanyHeader();
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
    renderCompanyHeader();
    render();
  });

  document.getElementById("company-back").addEventListener("click", (e) => {
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
  document.getElementById("feedback-toggle").addEventListener("click", () => {
    document.querySelectorAll(".card-comments").forEach((p) => (p.hidden = true));
    document.querySelectorAll(".card-actions .icon-btn.active").forEach((b) => {
      if (b.textContent.includes("评论")) b.classList.remove("active");
    });
    mountGiscus(document.getElementById("giscus-container"), null);
  });
}

function currentCompanyFromHash() {
  const raw = location.hash.replace(/^#/, "");
  const params = new URLSearchParams(raw);
  return params.get("company");
}

function applyHashRoute() {
  const company = currentCompanyFromHash();
  state.companyMode = company;
  state.activeTags = company ? new Set([company]) : new Set();
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
  const taggedCompanies = new Set(state.events.flatMap((e) => e.tags || [])).size;
  const latest = state.events.length ? state.events[0].date : "—";

  const tiles = [
    { value: total, label: "总条目数" },
    { value: sourceCount, label: "覆盖来源" },
    { value: taggedCompanies, label: "追踪到的公司/机构" },
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
  btn.disabled = true;
  try {
    const res = await fetchWithTimeout(`${LIKES_API_BASE}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: isLiking ? "up" : "down" }),
    });
    const data = await res.json();
    const count = data.count ?? "";
    btn.querySelector(".count").textContent = count;
    state.likeCounts.set(id, count);
    if (isLiking) {
      state.liked.add(id);
      btn.classList.add("active");
      btn.title = "再点一次取消";
    } else {
      state.liked.delete(id);
      btn.classList.remove("active");
      btn.title = "";
    }
    saveIdSet(LIKED_KEY, state.liked);
  } catch {
    // 网络失败就静默放弃，不影响其它功能
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
