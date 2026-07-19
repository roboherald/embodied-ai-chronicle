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

const RANGES = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "7d", label: "最近 7 天" },
  { key: "30d", label: "最近 30 天" },
];

const state = {
  events: [],
  activeSources: new Set(),
  activeTags: new Set(),
  activeRange: "all",
  query: "",
};

async function init() {
  const res = await fetch("data/events.json", { cache: "no-store" });
  const events = await res.json();
  state.events = events;
  state.activeSources = new Set(events.map((e) => e.source));

  renderStats();
  renderRangeFilters();
  renderSourceFilters();
  renderTagFilters();
  render();

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
      chip.className = "chip";
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

function renderCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.setProperty("--card-color", SOURCE_COLORS[item.source] || FALLBACK_COLOR);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = item.source;
  meta.appendChild(badge);
  for (const tag of item.tags || []) {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = tag;
    meta.appendChild(pill);
  }
  card.appendChild(meta);

  const link = document.createElement("a");
  link.className = "title";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = item.title;
  card.appendChild(link);

  if (item.summary) {
    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = item.summary;
    card.appendChild(summary);
  }

  return card;
}

init();
