const state = {
  data: null,
  openCsts: new Set(),
  openCouncils: new Set(),
  selectedId: null,
  filters: { search: "", cst: "All", council: "All", metric: "All", quick: "all" },
};

const fmt = new Intl.NumberFormat("en-US");
const byId = (id) => document.getElementById(id);
const sumBy = (rows, key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
const formatNumber = (value) => value === null || value === undefined || value === "" ? "Unavailable" : fmt.format(value);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function metricLabel(crew) {
  if (crew.unitMetric === null || crew.unitMetric === undefined || crew.unitMetric === "") return "Unavailable";
  if (crew.unitMetric >= 4) return "Strong";
  if (crew.unitMetric >= 2) return "Watch";
  return "Risk";
}

function trainingLabel(crew) {
  if (crew.unitLeaderTrained === null || crew.committeeChairTrained === null) return "Unavailable";
  if (crew.unitLeaderTrained && crew.committeeChairTrained) return "Complete";
  if (crew.unitLeaderTrained || crew.committeeChairTrained) return "Partial";
  return "Gap";
}

function daysUntilRenewal(crew) {
  if (!crew.renewalDate) return null;
  const asOf = new Date(`${state.data.meta.asOf}T00:00:00`);
  const renewal = new Date(`${crew.renewalDate}T00:00:00`);
  return Math.ceil((renewal - asOf) / 86400000);
}

function renewalLabel(crew) {
  const days = daysUntilRenewal(crew);
  if (days === null) return "Unavailable";
  if (days < 0) return "Past";
  if (days <= 120) return "Next 120";
  return "Later";
}

function healthLabel(value) {
  if (value === null || value === undefined) return "Unavailable";
  return value ? "Healthy" : "Needs attention";
}

function statusClass(label) {
  const value = String(label).toLowerCase();
  if (["healthy", "complete", "strong"].includes(value)) return "good";
  if (["partial", "watch", "next 120"].includes(value)) return "warn";
  if (["needs attention", "gap", "risk", "past"].includes(value)) return "bad";
  return "neutral";
}

function groupRows(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row[key] || "Unassigned";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  });
  return [...groups].map(([name, items]) => ({ name, rows: items }));
}

function countsFor(rows, getter) {
  const counts = new Map();
  rows.forEach((row) => {
    const label = getter(row);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const order = { Healthy: 0, Complete: 0, Strong: 0, "Next 120": 1, Partial: 1, Watch: 1, Later: 2, "Needs attention": 3, Gap: 3, Risk: 3, Past: 3, Unavailable: 4 };
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => (order[a.label] ?? 9) - (order[b.label] ?? 9));
}

function stageCell(rows, label, getter) {
  const counts = countsFor(rows, getter);
  const total = Math.max(rows.length, 1);
  const primary = counts[0] || { label: "None", count: 0 };
  const summary = counts.map((item) => `${item.label}: ${item.count}`).join("; ");
  return `
    <div class="stage-cell" title="${escapeHtml(summary)}">
      <div class="stage-label"><span>${escapeHtml(label)}</span><span>${escapeHtml(primary.label)} ${fmt.format(primary.count)}</span></div>
      <div class="track stacked">
        ${counts.map((item) => `<span class="seg ${statusClass(item.label)}" style="width:${(item.count / total) * 100}%"></span>`).join("")}
      </div>
    </div>`;
}

function progressFor(rows) {
  if (!rows.length) return 0;
  let positive = 0;
  let available = 0;
  rows.forEach((crew) => {
    const signals = [
      crew.sizeHealthy,
      crew.growthHealthy,
      crew.leadershipHealthy,
      crew.outdoorHealthy,
      crew.unitLeaderTrained === null || crew.committeeChairTrained === null ? null : crew.unitLeaderTrained && crew.committeeChairTrained,
      crew.unitMetric === null || crew.unitMetric === undefined ? null : crew.unitMetric >= 3,
    ];
    signals.forEach((signal) => {
      if (signal === null || signal === undefined) return;
      available += 1;
      positive += Number(signal);
    });
  });
  return available ? Math.round((positive / available) * 100) : 0;
}

function rowStages(rows) {
  return [
    stageCell(rows, "Size", (crew) => healthLabel(crew.sizeHealthy)),
    stageCell(rows, "Growth", (crew) => healthLabel(crew.growthHealthy)),
    stageCell(rows, "Leadership", (crew) => healthLabel(crew.leadershipHealthy)),
    stageCell(rows, "Outdoor", (crew) => healthLabel(crew.outdoorHealthy)),
    stageCell(rows, "Training", trainingLabel),
    stageCell(rows, "Renewal", renewalLabel),
    stageCell(rows, "Metric", metricLabel),
  ].join("");
}

function statusChip(label, value) {
  return `<span class="status-chip ${statusClass(value)}" title="${escapeHtml(label)}">${escapeHtml(value)}</span>`;
}

function renderCrewRow(crew) {
  const selected = state.selectedId === crew.unitId ? " selected" : "";
  const delta = crew.primaryYoY === null || crew.primaryYoY === undefined ? "Unavailable" : crew.primaryYoY > 0 ? `+${crew.primaryYoY}` : String(crew.primaryYoY);
  return `
    <button class="crew-row${selected}" type="button" data-crew-id="${escapeHtml(crew.unitId)}">
      <strong>Crew ${escapeHtml(crew.crewNumber || crew.unitId)}</strong>
      <span class="crew-descriptor"><span class="row-meta">${escapeHtml(crew.district || "District unavailable")}</span><span class="row-meta">${escapeHtml(crew.crewName)}</span></span>
      <span class="row-meta">${escapeHtml(formatNumber(crew.primaryYouth))} primary · ${escapeHtml(delta)} YOY</span>
      <span class="row-meta">${escapeHtml(crew.renewalDate || "Unscheduled")}</span>
      <span class="crew-statuses">
        ${statusChip("Size", healthLabel(crew.sizeHealthy))}
        ${statusChip("Growth", healthLabel(crew.growthHealthy))}
        ${statusChip("Leadership", healthLabel(crew.leadershipHealthy))}
        ${statusChip("Outdoor", healthLabel(crew.outdoorHealthy))}
        ${statusChip("Training", trainingLabel(crew))}
        ${statusChip("Metric", metricLabel(crew))}
      </span>
    </button>`;
}

function renderCouncilGroup(group, cst) {
  const key = `${cst}|${group.name}`;
  const open = state.openCouncils.has(key);
  const rows = [...group.rows].sort((a, b) => b.primaryYouth - a.primaryYouth || a.crewNumber.localeCompare(b.crewNumber, undefined, { numeric: true }));
  return `
    <article class="group-block${open ? " open" : ""}">
      <button class="group-row" type="button" data-council-key="${escapeHtml(key)}" aria-expanded="${open}">
        <div class="district-cell"><span class="district-stripe"></span><span class="disclosure" aria-hidden="true">›</span><span class="district-title"><strong>${escapeHtml(group.name)}</strong><span>${fmt.format(rows.length)} crews · ${fmt.format(sumBy(rows, "primaryYouth"))} primary youth</span></span></div>
        <div class="progress-cell"><span class="progress-number">${progressFor(rows)}%</span><span class="track"><i class="fill" style="--w:${progressFor(rows)}%"></i></span></div>
        ${rowStages(rows)}
      </button>
      <div class="crew-list">${open ? rows.map(renderCrewRow).join("") : ""}</div>
    </article>`;
}

function renderBoard(rows) {
  const cstGroups = groupRows(rows, "cst").sort((a, b) => Number(a.name) - Number(b.name));
  byId("groupRows").innerHTML = cstGroups.map((cstGroup) => {
    const cst = String(cstGroup.name);
    const open = state.openCsts.has(cst);
    const councilGroups = groupRows(cstGroup.rows, "council").sort((a, b) => b.rows.length - a.rows.length || b.rows.reduce((s, r) => s + r.primaryYouth, 0) - a.rows.reduce((s, r) => s + r.primaryYouth, 0));
    return `
      <article class="service-block${open ? " open" : ""}">
        <button class="service-row" type="button" data-cst-key="${escapeHtml(cst)}" aria-expanded="${open}">
          <div class="district-cell"><span class="district-stripe"></span><span class="disclosure" aria-hidden="true">›</span><span class="district-title"><strong>CST ${escapeHtml(cst)}</strong><span>${fmt.format(cstGroup.rows.length)} crews · ${fmt.format(councilGroups.length)} councils · ${fmt.format(sumBy(cstGroup.rows, "primaryYouth"))} primary youth</span></span></div>
          <div class="progress-cell"><span class="progress-number">${progressFor(cstGroup.rows)}%</span><span class="track"><i class="fill" style="--w:${progressFor(cstGroup.rows)}%"></i></span></div>
          ${rowStages(cstGroup.rows)}
        </button>
        <div class="district-list">${open ? councilGroups.map((group) => renderCouncilGroup(group, cst)).join("") : ""}</div>
      </article>`;
  }).join("") || `<div class="empty-state">No crews match the current filters.</div>`;
}

function detailValue(label, value, wide = false) {
  return `<div class="${wide ? "detail-wide" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value === "" || value === null || value === undefined ? "Unavailable" : value)}</strong></div>`;
}

function renderDetail() {
  const crew = state.data.crews.find((item) => item.unitId === state.selectedId);
  const target = byId("crewDetail");
  byId("closeDetail").classList.toggle("hidden", !crew);
  if (!crew) {
    target.className = "empty-state";
    target.textContent = "Select a crew in the health board to inspect its membership, training, renewal, and unit-metric fields.";
    return;
  }
  const days = daysUntilRenewal(crew);
  target.className = "detail-section";
  target.innerHTML = `
    <div class="detail-title"><strong>Crew ${escapeHtml(crew.crewNumber)}</strong><span>${escapeHtml(crew.council)} · CST ${escapeHtml(crew.cst)}</span></div>
    <div class="detail-grid">
      ${detailValue("Primary youth", formatNumber(crew.primaryYouth))}
      ${detailValue("Primary youth YOY", crew.primaryYoY === null || crew.primaryYoY === undefined ? "Unavailable" : crew.primaryYoY > 0 ? `+${crew.primaryYoY}` : crew.primaryYoY)}
      ${detailValue("Total youth", formatNumber(crew.youth))}
      ${detailValue("Adults", formatNumber(crew.adults))}
      ${detailValue("Unit metric", crew.unitMetric)}
      ${detailValue("Renewal date", crew.renewalDate)}
      ${detailValue("Renewal horizon", renewalLabel(crew))}
      ${detailValue("Days to renewal", days === null ? "Unavailable" : fmt.format(days))}
      ${detailValue("Unit leader trained", crew.unitLeaderTrained ? "Yes" : "No")}
      ${detailValue("Committee chair trained", crew.committeeChairTrained ? "Yes" : "No")}
      ${detailValue("District", crew.district, true)}
      ${detailValue("Renewal workflow", crew.renewalWorkflow, true)}
    </div>
    <div class="status-explanations">
      ${[["Size", healthLabel(crew.sizeHealthy)], ["Growth", healthLabel(crew.growthHealthy)], ["Youth leadership", healthLabel(crew.leadershipHealthy)], ["Outdoor", healthLabel(crew.outdoorHealthy)], ["Training", trainingLabel(crew)], ["Unit metric", metricLabel(crew)]].map(([label, value]) => `<div><span>${escapeHtml(label)}</span>${statusChip(label, value)}</div>`).join("")}
    </div>`;
}

function metricMatches(crew) {
  if (crew.unitMetric === null || crew.unitMetric === undefined) return state.filters.metric === "All";
  if (state.filters.metric === "strong") return crew.unitMetric >= 4;
  if (state.filters.metric === "watch") return crew.unitMetric >= 2 && crew.unitMetric < 4;
  if (state.filters.metric === "risk") return crew.unitMetric < 2;
  return true;
}

function matchesFilters(crew) {
  const query = state.filters.search.trim().toLowerCase();
  const haystack = [crew.crewNumber, crew.crewName, crew.council, crew.district].join(" ").toLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (state.filters.cst !== "All" && crew.cst !== state.filters.cst) return false;
  if (state.filters.council !== "All" && crew.council !== state.filters.council) return false;
  if (!metricMatches(crew)) return false;
  if (state.filters.quick === "growth" && crew.primaryYoY <= 0) return false;
  if (state.filters.quick === "training" && crew.unitLeaderTrained && crew.committeeChairTrained) return false;
  if (state.filters.quick === "renewal" && renewalLabel(crew) !== "Next 120") return false;
  return true;
}

function populateCouncilFilter() {
  const select = byId("councilFilter");
  const previous = state.filters.council;
  const source = state.data.crews.filter((crew) => state.filters.cst === "All" || crew.cst === state.filters.cst);
  const values = unique(source.map((crew) => crew.council));
  select.innerHTML = `<option value="All">All councils</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  state.filters.council = values.includes(previous) ? previous : "All";
  select.value = state.filters.council;
}

function renderSummary(rows) {
  const count = rows.length;
  const councils = new Set(rows.map((crew) => crew.council)).size;
  const trainingRows = rows.filter((crew) => crew.unitLeaderTrained !== null && crew.committeeChairTrained !== null);
  const training = trainingRows.length ? Math.round(trainingRows.filter((crew) => crew.unitLeaderTrained && crew.committeeChairTrained).length / trainingRows.length * 100) : null;
  const metricRows = rows.filter((crew) => crew.unitMetric !== null && crew.unitMetric !== undefined);
  const average = metricRows.length ? sumBy(metricRows, "unitMetric") / metricRows.length : null;
  const delta = sumBy(rows, "primaryYoY");
  byId("crewCount").textContent = fmt.format(count);
  byId("councilCount").textContent = `${fmt.format(councils)} councils in view`;
  byId("youthCount").textContent = fmt.format(sumBy(rows, "youth"));
  byId("primaryYouth").textContent = fmt.format(sumBy(rows, "primaryYouth"));
  byId("adultCount").textContent = fmt.format(sumBy(rows, "adults"));
  byId("trainingRate").textContent = training === null ? "Unavailable" : `${training}%`;
  byId("averageMetric").textContent = average === null ? "Unavailable" : average.toFixed(2);
  byId("primaryDelta").textContent = delta > 0 ? `+${fmt.format(delta)} year over year` : delta < 0 ? `${fmt.format(delta)} year over year` : "No year-over-year change";
  byId("primaryDelta").className = delta > 0 ? "delta-positive" : delta < 0 ? "delta-negative" : "";
  byId("visibleCount").textContent = `${fmt.format(count)} crews`;
}

function renderBars(id, items, valueKey = "value", limit = 12) {
  const target = byId(id);
  const displayed = items.slice(0, limit);
  const max = Math.max(...displayed.map((item) => Number(item[valueKey]) || 0), 1);
  target.innerHTML = displayed.map((item) => {
    const value = Number(item[valueKey]) || 0;
    const width = value ? Math.max(3, Math.round(value / max * 100)) : 0;
    return `<div class="bar-row"><span class="bar-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><span class="bar-track"><span class="bar-fill" style="--value:${width}%"></span></span><strong>${fmt.format(value)}</strong></div>`;
  }).join("") || `<div class="empty-state">No data in the current view.</div>`;
}

function aggregate(rows, key, valueKey = null) {
  const values = new Map();
  rows.forEach((row) => {
    const name = row[key] || "Unassigned";
    values.set(name, (values.get(name) || 0) + (valueKey ? Number(row[valueKey]) || 0 : 1));
  });
  return [...values].map(([name, value]) => ({ name, value }));
}

function renderDiagnostics(rows) {
  renderBars("cstYouthBars", aggregate(rows, "cst", "primaryYouth").map((item) => ({ ...item, name: `CST ${item.name}` })).sort((a, b) => Number(a.name.replace("CST ", "")) - Number(b.name.replace("CST ", ""))), "value", 20);
  const metric = [
    { name: "Risk · 0–1", value: rows.filter((crew) => crew.unitMetric !== null && crew.unitMetric !== undefined && crew.unitMetric < 2).length },
    { name: "Watch · 2–3", value: rows.filter((crew) => crew.unitMetric >= 2 && crew.unitMetric < 4).length },
    { name: "Strong · 4–5", value: rows.filter((crew) => crew.unitMetric >= 4).length },
    { name: "Unavailable", value: rows.filter((crew) => crew.unitMetric === null || crew.unitMetric === undefined).length },
  ];
  renderBars("metricBars", metric);
  const growth = [
    { name: "Growing", value: rows.filter((crew) => crew.primaryYoY > 0).length },
    { name: "Flat", value: rows.filter((crew) => crew.primaryYoY === 0).length },
    { name: "Declining", value: rows.filter((crew) => crew.primaryYoY < 0).length },
  ];
  renderBars("growthBars", growth);
  renderBars("councilBars", aggregate(rows, "council", "primaryYouth").sort((a, b) => b.value - a.value), "value", 10);
  const renewal = ["Past", "Next 120", "Later", "Unavailable"].map((name) => ({ name, value: rows.filter((crew) => renewalLabel(crew) === name).length }));
  renderBars("renewalBars", renewal);
}

function renderNav() {
  const groups = groupRows(state.data.crews, "cst").sort((a, b) => Number(a.name) - Number(b.name));
  byId("nationalNavCount").textContent = `${fmt.format(state.data.crews.length)} crews`;
  byId("cstLinks").innerHTML = groups.map((group) => `<button class="cst-link${state.filters.cst === String(group.name) ? " active" : ""}" type="button" data-cst-nav="${escapeHtml(group.name)}"><strong>CST ${escapeHtml(group.name)}</strong><span>${fmt.format(group.rows.length)} crews · ${fmt.format(sumBy(group.rows, "primaryYouth"))} primary</span></button>`).join("");
  document.querySelector('[data-cst-nav="All"]').classList.toggle("active", state.filters.cst === "All");
}

function render() {
  const rows = state.data.crews.filter(matchesFilters);
  if (state.selectedId && !rows.some((crew) => crew.unitId === state.selectedId)) state.selectedId = null;
  renderSummary(rows);
  renderBoard(rows);
  renderDetail();
  renderDiagnostics(rows);
  renderNav();
}

function setCst(value) {
  state.filters.cst = value;
  byId("cstFilter").value = value;
  populateCouncilFilter();
  state.selectedId = null;
  render();
}

function bindControls() {
  byId("searchInput").addEventListener("input", (event) => { state.filters.search = event.target.value; render(); });
  byId("cstFilter").addEventListener("change", (event) => setCst(event.target.value));
  byId("councilFilter").addEventListener("change", (event) => { state.filters.council = event.target.value; state.selectedId = null; render(); });
  byId("metricFilter").addEventListener("change", (event) => { state.filters.metric = event.target.value; state.selectedId = null; render(); });
  document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-quick]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filters.quick = button.dataset.quick;
    state.selectedId = null;
    render();
  }));
  byId("collapseAll").addEventListener("click", () => { state.openCsts.clear(); state.openCouncils.clear(); state.selectedId = null; render(); });
  byId("expandAll").addEventListener("click", () => {
    const rows = state.data.crews.filter(matchesFilters);
    rows.forEach((crew) => { state.openCsts.add(crew.cst); state.openCouncils.add(`${crew.cst}|${crew.council}`); });
    render();
  });
  byId("closeDetail").addEventListener("click", () => { state.selectedId = null; render(); });
  byId("groupRows").addEventListener("click", (event) => {
    const crew = event.target.closest("[data-crew-id]");
    const council = event.target.closest("[data-council-key]");
    const cst = event.target.closest("[data-cst-key]");
    if (crew) { state.selectedId = crew.dataset.crewId; renderDetail(); document.querySelectorAll(".crew-row.selected").forEach((row) => row.classList.remove("selected")); crew.classList.add("selected"); return; }
    if (council) { const key = council.dataset.councilKey; state.openCouncils.has(key) ? state.openCouncils.delete(key) : state.openCouncils.add(key); render(); return; }
    if (cst) { const key = cst.dataset.cstKey; state.openCsts.has(key) ? state.openCsts.delete(key) : state.openCsts.add(key); render(); }
  });
  document.querySelector(".cst-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cst-nav]");
    if (button) setCst(button.dataset.cstNav);
  });
  byId("themeButton").addEventListener("click", () => {
    const themes = ["system", "light", "dark"];
    const current = document.documentElement.dataset.theme || "system";
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    document.documentElement.dataset.theme = next;
    byId("themeButton").textContent = `Theme: ${next[0].toUpperCase()}${next.slice(1)}`;
    try { localStorage.setItem("venturing-dashboard-theme", next); } catch (_) {}
  });
}

async function init() {
  const response = await fetch("../data/dashboard-data.json");
  if (!response.ok) throw new Error(`Data request failed with ${response.status}`);
  state.data = await response.json();
  const csts = unique(state.data.crews.map((crew) => crew.cst));
  byId("cstFilter").innerHTML = `<option value="All">All CSTs</option>${csts.map((value) => `<option value="${escapeHtml(value)}">CST ${escapeHtml(value)}</option>`).join("")}`;
  populateCouncilFilter();
  const date = new Date(`${state.data.meta.asOf}T12:00:00`);
  byId("updatedAt").textContent = `Workbook snapshot · ${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date)}`;
  byId("sourceText").textContent = `${state.data.meta.source}. Health progress uses six workbook signals: size, growth, youth leadership, outdoor activity, complete unit-leader and committee-chair training, and a unit metric of 3 or higher. Missing measurements remain unavailable and are excluded from rates and averages.`;
  byId("privacyText").textContent = `${state.data.meta.privacy} Source gaps: ${fmt.format(state.data.meta.missingPrimaryYouth)} crew rows have no primary-youth value, and ${fmt.format(state.data.meta.missingUnitMetric)} has no Unit Metric value.`;
  const theme = document.documentElement.dataset.theme || "system";
  byId("themeButton").textContent = `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}`;
  bindControls();
  render();
}

init().catch((error) => {
  byId("updatedAt").textContent = "Dashboard data could not be loaded";
  byId("updatedAt").classList.add("loading-error");
  byId("groupRows").innerHTML = `<div class="empty-state loading-error">${escapeHtml(error.message)}</div>`;
});
