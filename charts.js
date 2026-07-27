/**
 * charts.js
 * Dashboard rendering with Chart.js, following the house data-viz rules:
 * one axis per chart, a single hue per series, legends only when there are
 * 2+ series, recessive gridlines, no dual-axis charts.
 */
const DashboardCharts = (() => {
  let instances = {};

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette() {
    return {
      s1: cssVar("--series-1"), s2: cssVar("--series-2"), s3: cssVar("--series-3"),
      s4: cssVar("--series-4"), s5: cssVar("--series-5"), s6: cssVar("--series-6"),
      s7: cssVar("--series-7"), s8: cssVar("--series-8"),
      grid: cssVar("--gridline"), axis: cssVar("--baseline"),
      text: cssVar("--text-secondary"), muted: cssVar("--text-muted")
    };
  }

  function baseOptions(p, opts = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: !!opts.showLegend,
          position: "top",
          align: "start",
          labels: { color: p.text, boxWidth: 12, usePointStyle: true }
        },
        tooltip: {
          backgroundColor: cssVar("--surface-1"),
          titleColor: p.text, bodyColor: p.text,
          borderColor: p.grid, borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: p.grid, drawTicks: false },
          border: { color: p.axis },
          ticks: { color: p.muted, maxRotation: 0, autoSkip: true }
        },
        y: {
          beginAtZero: opts.beginAtZero !== false,
          grid: { color: p.grid, drawTicks: false },
          border: { color: p.axis },
          ticks: { color: p.muted }
        }
      }
    };
  }

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  function lastNDays(n) {
    const days = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return days;
  }

  function shortLabel(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function render(state, rangeDays) {
    const p = palette();
    const days = lastNDays(rangeDays);
    const labels = days.map(shortLabel);
    const dayData = days.map(d => state.days[d] || null);

    // ---- Net worth trend ----
    const networthVals = [];
    let cumulative = 0;
    let haveSnapshot = false;
    dayData.forEach(d => {
      const fin = d && d.log && d.log.financial;
      if (fin && typeof fin.networth === "number") {
        haveSnapshot = true;
        cumulative = fin.networth;
      } else if (fin) {
        cumulative += (fin.income || 0) - (fin.spend || 0);
      }
      networthVals.push(cumulative);
    });
    destroy("networth");
    instances.networth = new Chart(document.getElementById("chart-networth"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: haveSnapshot ? "Net worth" : "Cumulative savings (est.)",
          data: networthVals,
          borderColor: p.s1, backgroundColor: p.s1 + "22",
          fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2
        }]
      },
      options: baseOptions(p, { showLegend: false, beginAtZero: false })
    });

    // ---- Spending vs budget (weekly) ----
    const budgetGoal = (state.goals.financial || []).find(g => g.type === "budget");
    const weeklyBudget = budgetGoal ? (budgetGoal.target || 0) / 4.345 : null;
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const weekLabels = weeks.map(w => shortLabel(w[0]));
    const weekSpend = weeks.map(w => w.reduce((sum, d) => sum + ((state.days[d] && state.days[d].log.financial && state.days[d].log.financial.spend) || 0), 0));
    destroy("budget");
    const budgetDatasets = [{
      type: "bar",
      label: "Spent",
      data: weekSpend,
      backgroundColor: p.s2, borderRadius: 4, maxBarThickness: 36
    }];
    if (weeklyBudget) {
      budgetDatasets.push({
        type: "line",
        label: "Budget",
        data: weekLabels.map(() => weeklyBudget),
        borderColor: p.s1, borderDash: [6, 4], pointRadius: 0, borderWidth: 2
      });
    }
    instances.budget = new Chart(document.getElementById("chart-budget"), {
      data: { labels: weekLabels, datasets: budgetDatasets },
      options: baseOptions(p, { showLegend: !!weeklyBudget })
    });

    // ---- Schedule adherence ----
    const adherence = dayData.map(d => {
      if (!d || !d.tasks || !d.tasks.length) return null;
      const done = d.tasks.filter(t => t.done).length;
      return Math.round((done / d.tasks.length) * 100);
    });
    destroy("adherence");
    instances.adherence = new Chart(document.getElementById("chart-adherence"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Completion %", data: adherence,
          borderColor: p.s1, backgroundColor: p.s1 + "22",
          fill: true, tension: 0.25, pointRadius: 2, borderWidth: 2, spanGaps: true
        }]
      },
      options: { ...baseOptions(p, { showLegend: false }), scales: { ...baseOptions(p).scales, y: { ...baseOptions(p).scales.y, max: 100 } } }
    });

    // ---- Workout minutes ----
    const workoutVals = dayData.map(d => (d && d.log && d.log.health && d.log.health.workoutMin) || 0);
    destroy("workout");
    instances.workout = new Chart(document.getElementById("chart-workout"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Minutes", data: workoutVals, backgroundColor: p.s3, borderRadius: 4, maxBarThickness: 20 }] },
      options: baseOptions(p, { showLegend: false })
    });

    // ---- Sleep hours ----
    const sleepVals = dayData.map(d => (d && d.log && d.log.health && d.log.health.sleepHours) || null);
    destroy("sleep");
    instances.sleep = new Chart(document.getElementById("chart-sleep"), {
      type: "line",
      data: { labels, datasets: [{ label: "Hours", data: sleepVals, borderColor: p.s7, backgroundColor: p.s7 + "22", fill: true, tension: 0.25, pointRadius: 2, borderWidth: 2, spanGaps: true }] },
      options: baseOptions(p, { showLegend: false })
    });

    // ---- Mood ----
    const moodVals = dayData.map(d => (d && d.log && d.log.health && d.log.health.mood) || null);
    destroy("mood");
    instances.mood = new Chart(document.getElementById("chart-mood"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Mood (1–5)", data: moodVals, backgroundColor: p.s5, borderRadius: 4, maxBarThickness: 20 }] },
      options: { ...baseOptions(p, { showLegend: false }), scales: { ...baseOptions(p).scales, y: { ...baseOptions(p).scales.y, max: 5 } } }
    });

    return computeStats(state, dayData, networthVals, adherence);
  }

  function computeStats(state, dayData, networthVals, adherence) {
    const validAdherence = adherence.filter(v => v !== null);
    const avgAdherence = validAdherence.length ? Math.round(validAdherence.reduce((a, b) => a + b, 0) / validAdherence.length) : null;

    // Workout streak: consecutive days (ending today) with workoutMin > 0
    let streak = 0;
    for (let i = dayData.length - 1; i >= 0; i--) {
      const d = dayData[i];
      if (d && d.log && d.log.health && d.log.health.workoutMin > 0) streak++;
      else break;
    }

    const currentNetworth = networthVals.length ? networthVals[networthVals.length - 1] : 0;

    return {
      currentNetworth,
      avgAdherence,
      workoutStreak: streak
    };
  }

  return { render };
})();
