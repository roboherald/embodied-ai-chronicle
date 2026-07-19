const state = {
  events: [],
  activeSources: new Set(),
  query: "",
};

async function init() {
  const res = await fetch("data/events.json", { cache: "no-store" });
  const events = await res.json();
  state.events = events;
  state.activeSources = new Set(events.map((e) => e.source));

  renderSourceFilters();
  renderUpdatedAt();
  render();

  document.getElementById("search").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
}

function renderUpdatedAt() {
  const el = document.getElementById("updated-at");
  if (!state.events.length) {
    el.textContent = "暂无数据";
    return;
  }
  const latest = state.events[0].date;
  el.textContent = `共 ${state.events.length} 条 · 最新条目日期 ${latest}`;
}

function renderSourceFilters() {
  const sources = [...new Set(state.events.map((e) => e.source))].sort();
  const wrap = document.getElementById("source-filters");
  wrap.innerHTML = "";
  sources.forEach((source) => {
    const chip = document.createElement("button");
    chip.className = "source-chip active";
    chip.textContent = source;
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

function filteredEvents() {
  return state.events.filter((e) => {
    if (!state.activeSources.has(e.source)) return false;
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

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = item.source;
  meta.appendChild(badge);
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
