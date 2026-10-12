// Charts and controls for the public statistics pages (`/stats`, `/stats/<board>`).
//
// The page inlines its default series as `window.statsPage` and loads Chart.js from
// cdnjs ahead of this script. The tables are rendered server-side, so a reader
// without JavaScript (or with the CDN blocked) still sees every number - this file
// draws the timeline chart, wires the Daily/Hourly + range controls (which refetch
// the series from `/stats[/<board>]/series.json`) and adds click-to-sort.
(function () {
  const data = window.statsPage;
  if (!data) return;

  const DAY = 86400;
  const nowSec = () => Math.floor(Date.now() / 1000);

  // ---------------------------------------------------------------------------
  // Chart colours come from the theme's CSS, so a theme styles the chart the same
  // way it styles the rest of the page. They are read with `getComputedStyle` on
  // every draw, and the chart is rebuilt when the theme stylesheet reloads:
  //
  //   --stats-chart-line            the line           (default: --name-color)
  //   --stats-chart-fill-top        fill under the line (default: line at 35%)
  //   --stats-chart-fill-bottom     fill at the axis    (default: line at 2%)
  //   --stats-chart-grid            guide lines        (default: --border-color)
  //   --stats-chart-text            tick labels        (default: --text-color)
  //   --stats-chart-tooltip-bg      tooltip background (default: --post-color)
  //   --stats-chart-tooltip-border  tooltip border     (default: --border-color)
  //   --stats-chart-tooltip-text    tooltip text       (default: --text-color)
  //
  // The `--stats-chart-*` defaults live in `global.css` and point at the theme's own
  // palette (the accent follows `--name-color`, then `--link-color`); a theme can
  // override any of them in its own file. The values below are the last-resort
  // fallback for when none of those resolve.
  // ---------------------------------------------------------------------------
  const DEFAULT_COLORS = {
    accent: '#00ffe5',
    fillTop: 'rgba(0, 255, 229, 0.35)',
    fillBottom: 'rgba(0, 255, 229, 0.02)',
    axisText: '#b7b7b7',
    grid: 'rgba(255, 255, 255, 0.08)',
    tooltipBackground: 'rgba(21, 21, 21, 0.95)',
    tooltipBorder: 'rgba(255, 255, 255, 0.15)',
    tooltipText: '#e0e0e0'
  };

  // The theme names one line colour, so the translucent fill under it is derived
  // from that colour. Handles `#rgb`, `#rrggbb` and `rgb()`/`rgba()`; anything else
  // (a named colour, `hsl()`) returns null and the caller keeps its default.
  function withAlpha(color, alpha) {
    const value = String(color || '').trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i.exec(value);
    if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
    return null;
  }

  function readChartColors() {
    const style = getComputedStyle(document.documentElement);
    const variable = (name) => style.getPropertyValue(name).trim();
    const line = variable('--stats-chart-line') || variable('--name-color') || variable('--link-color') || DEFAULT_COLORS.accent;
    return {
      accent: line,
      fillTop: variable('--stats-chart-fill-top') || withAlpha(line, 0.35) || DEFAULT_COLORS.fillTop,
      fillBottom: variable('--stats-chart-fill-bottom') || withAlpha(line, 0.02) || DEFAULT_COLORS.fillBottom,
      axisText: variable('--stats-chart-text') || variable('--text-color') || DEFAULT_COLORS.axisText,
      grid: variable('--stats-chart-grid') || variable('--border-color') || DEFAULT_COLORS.grid,
      tooltipBackground: variable('--stats-chart-tooltip-bg') || variable('--post-color') || DEFAULT_COLORS.tooltipBackground,
      tooltipBorder: variable('--stats-chart-tooltip-border') || variable('--border-color') || DEFAULT_COLORS.tooltipBorder,
      tooltipText: variable('--stats-chart-tooltip-text') || variable('--text-color') || DEFAULT_COLORS.tooltipText
    };
  }

  // The range presets, as seconds before now; `all` has no lower bound (the server
  // starts it at the first post). Kept in step with the route's own list.
  const PRESETS = {
    '5y': Math.round(5 * 365.25 * DAY),
    '3y': Math.round(3 * 365.25 * DAY),
    '1y': Math.round(365.25 * DAY),
    '6m': Math.round(182.5 * DAY),
    '4w': 28 * DAY,
    '1w': 7 * DAY,
    '3d': 3 * DAY
  };
  const RANGES_BY_MODE = { daily: ['all', '5y', '3y', '1y', '6m'], hourly: ['4w', '1w', '3d'] };

  const controls = document.getElementById('stats-controls');
  const board = controls ? controls.dataset.board || '' : '';
  const endpoint = board ? `/stats/${encodeURIComponent(board)}/series.json` : '/stats/series.json';

  const hasCharts = typeof window.Chart !== 'undefined';
  // The colours are set per chart below from the theme's CSS so they follow a
  // theme switch; only the inherited font is set once here.
  if (hasCharts) Chart.defaults.font.family = 'inherit';

  // Each mode remembers the range it last used, so switching Daily <-> Hourly keeps
  // a sensible one (the ranges differ: hours span weeks, days span years).
  const remembered = {
    daily: RANGES_BY_MODE.daily.includes(data.range) ? data.range : '1y',
    hourly: RANGES_BY_MODE.hourly.includes(data.range) ? data.range : '4w'
  };
  let mode = data.mode === 'hourly' ? 'hourly' : 'daily';
  let range = remembered[mode];
  let chart = null;
  let lastSeries = null;
  let requestId = 0;
  const state = { from: null, to: null };

  function presetFrom(name) {
    if (name === 'all') return null;
    const seconds = PRESETS[name];
    return seconds ? nowSec() - seconds : null;
  }

  function epochFromInput(value) {
    if (!value) return null;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 1000);
  }

  function inputFromEpoch(epoch) {
    if (epoch == null || !Number.isFinite(Number(epoch))) return '';
    return new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
  }

  function formatLabel(epoch, series) {
    const d = new Date(epoch * 1000);
    if (series.bucket === 3600) {
      const md = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return `${md} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
    }
    const spanDays = (series.labels.length * series.bucket) / DAY;
    const opts =
      spanDays > 400
        ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
        : { month: 'short', day: 'numeric', timeZone: 'UTC' };
    return d.toLocaleDateString(undefined, opts);
  }

  function renderChart(series) {
    const el = document.getElementById('stats-chart');
    if (!el) return;
    if (!hasCharts) {
      el.closest('.stats-chart-wrap')?.classList.add('stats-chart-missing');
      return;
    }
    const labels = series.labels.map((t) => formatLabel(t, series));
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = series.values;
      chart.update();
      return;
    }
    // Read the palette now, so a theme change is picked up on the next draw (the
    // chart is rebuilt when the theme stylesheet reloads - see `watchTheme`).
    const colors = readChartColors();
    const ctx = el.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, el.height || 220);
    gradient.addColorStop(0, colors.fillTop);
    gradient.addColorStop(1, colors.fillBottom);
    chart = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Posts',
            data: series.values,
            borderColor: colors.accent,
            backgroundColor: gradient,
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 8,
            fill: true,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        // Switching Daily/Hourly or a range redraws in place; the bars/line should
        // appear at once rather than tween between the two shapes.
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.tooltipBackground,
            borderColor: colors.tooltipBorder,
            titleColor: colors.tooltipText,
            bodyColor: colors.tooltipText,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: colors.axisText, maxRotation: 0, autoSkipPadding: 16 }
          },
          y: {
            beginAtZero: true,
            grid: { color: colors.grid },
            border: { color: colors.grid },
            ticks: { color: colors.axisText, precision: 0 }
          }
        }
      }
    });
  }

  function updateNote(series) {
    const note = document.getElementById('stats-series-note');
    if (!note) return;
    const unit = series.bucket === 3600 ? 'posts/hour' : 'posts/day';
    const total = Number(series.total || 0).toLocaleString();
    note.textContent =
      `${unit} · ${inputFromEpoch(series.from)} \u2192 ${inputFromEpoch(series.to)} · ${total} posts` +
      (series.truncated ? ' (trimmed to the most recent points)' : '');
  }

  function setInputs(from, to) {
    const fromInput = document.getElementById('stats-from');
    const toInput = document.getElementById('stats-to');
    if (fromInput) fromInput.value = inputFromEpoch(from);
    if (toInput) toInput.value = inputFromEpoch(to);
  }

  function markActive() {
    if (!controls) return;
    controls.querySelectorAll('button[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    controls.querySelectorAll('.stats-ranges').forEach((group) => {
      group.hidden = group.dataset.ranges !== mode;
    });
    controls.querySelectorAll('button[data-range]').forEach((b) => {
      b.classList.toggle('active', range != null && b.dataset.range === range);
    });
  }

  function showSeries(series) {
    lastSeries = series;
    renderChart(series);
    updateNote(series);
    setInputs(series.from, series.to);
  }

  function restyleChart() {
    if (!lastSeries || !chart) return;
    chart.destroy();
    chart = null;
    renderChart(lastSeries);
  }

  // Rebuild the chart when the reader switches theme: `themes.js` changes the
  // `#theme-css` link's href, and the new stylesheet fires `load` once it applies.
  // `window.statsChart.restyle` is a hook for anything else that changes the palette.
  function watchTheme() {
    const link = document.getElementById('theme-css');
    if (link) link.addEventListener('load', restyleChart);
    window.statsChart = { restyle: restyleChart };
  }

  async function load() {
    const params = new URLSearchParams({ mode });
    if (state.from != null) params.set('from', state.from);
    if (state.to != null) params.set('to', state.to);
    const id = ++requestId;
    let series;
    try {
      const res = await fetch(`${endpoint}?${params.toString()}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      series = await res.json();
    } catch (err) {
      const note = document.getElementById('stats-series-note');
      if (note) note.textContent = 'Could not load that range.';
      return;
    }
    if (id !== requestId) return; // a newer request has superseded this one
    showSeries(series);
  }

  function selectRange(name, { remember = true } = {}) {
    range = name;
    if (remember && name) remembered[mode] = name;
    state.from = presetFrom(name);
    state.to = null;
    markActive();
    return load();
  }

  function bindControls() {
    if (!controls) return;
    controls.addEventListener('click', (event) => {
      const modeBtn = event.target.closest('button[data-mode]');
      if (modeBtn) {
        mode = modeBtn.dataset.mode;
        selectRange(remembered[mode] || RANGES_BY_MODE[mode][0]);
        return;
      }
      const rangeBtn = event.target.closest('button[data-range]');
      if (rangeBtn) selectRange(rangeBtn.dataset.range);
    });

    const fromInput = document.getElementById('stats-from');
    const toInput = document.getElementById('stats-to');
    const onDate = () => {
      range = null;
      state.from = epochFromInput(fromInput ? fromInput.value : '');
      state.to = epochFromInput(toInput ? toInput.value : '');
      markActive();
      load();
    };
    if (fromInput) fromInput.addEventListener('change', onDate);
    if (toInput) toInput.addEventListener('change', onDate);
  }

  // Click a header to sort the board table. Rows carry `data-value` on their
  // numeric cells (the visible text is formatted), so sorting uses the real
  // number rather than a locale string.
  function makeSortable(table) {
    if (!table) return;
    const headers = [...table.querySelectorAll('th[data-sort]')];
    const tbody = table.tBodies[0];
    if (!tbody) return;

    let current = null;
    let asc = false;

    headers.forEach((th, index) => {
      th.classList.add('stats-sortable');
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        asc = current === key ? !asc : false;
        current = key;

        const rows = [...tbody.rows];
        rows.sort((a, b) => {
          const cellA = a.cells[index];
          const cellB = b.cells[index];
          let va;
          let vb;
          if (key === 'uri') {
            va = a.cells[0].querySelector('a')?.textContent || '';
            vb = b.cells[0].querySelector('a')?.textContent || '';
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
          }
          va = Number(cellA.dataset.value || 0);
          vb = Number(cellB.dataset.value || 0);
          return asc ? va - vb : vb - va;
        });
        rows.forEach((row) => tbody.appendChild(row));

        headers.forEach((h) => h.classList.remove('stats-sort-asc', 'stats-sort-desc'));
        th.classList.add(asc ? 'stats-sort-asc' : 'stats-sort-desc');
      });
    });
  }

  function stampTimes() {
    document.querySelectorAll('.stats-updated[data-epoch]').forEach((el) => {
      const epoch = Number(el.dataset.epoch) * 1000;
      if (!Number.isFinite(epoch)) return;
      el.textContent = new Date(epoch).toLocaleString();
    });
  }

  function init() {
    stampTimes();
    markActive();
    if (data.series) showSeries(data.series);
    bindControls();
    watchTheme();
    makeSortable(document.getElementById('stats-table'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
