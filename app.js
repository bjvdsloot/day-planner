/**
 * app.js — main application: state, views, and wiring.
 */
(() => {
  const LS_LOCAL_ONLY = "dp_local_only";

  let state = null;
  let selectedDate = null; // the date currently shown on the Today/Day view — set in init()

  // ---------- helpers ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dayOfWeek(dateStr) { return new Date(dateStr + "T00:00:00").getDay(); }
  function addDays(dateStr, delta) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function formatDayHeader(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const nice = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    return dateStr === todayStr() ? `Today — ${nice}` : nice;
  }

  function emptyState() {
    return {
      version: 1,
      goals: { financial: [], health: [], schedule: [] },
      recurringTasks: [],
      days: {},
      settings: { wakeTime: "07:00", sleepTime: "23:00", workStart: "09:00", workEnd: "17:00" }
    };
  }

  function ensureDay(dateStr) {
    if (!state.days[dateStr]) {
      const dow = dayOfWeek(dateStr);
      const seeded = state.recurringTasks
        .filter(r => r.active && r.daysOfWeek.includes(dow))
        .map(r => ({
          id: uid(), title: r.title, category: r.category, duration_min: r.duration_min,
          priority: r.priority, energy: r.energy, preferredWindow: r.preferredWindow,
          start: null, end: null, done: false, fixed: false, unscheduled: true, sourceRecurringId: r.id
        }));
      state.days[dateStr] = {
        tasks: seeded,
        log: { financial: {}, health: {} }
      };
    }
    if (!state.days[dateStr].log) state.days[dateStr].log = { financial: {}, health: {} };
    if (!state.days[dateStr].log.financial) state.days[dateStr].log.financial = {};
    if (!state.days[dateStr].log.health) state.days[dateStr].log.health = {};
    return state.days[dateStr];
  }

  let saveTimer = null;
  function persist() {
    const statusEl = document.getElementById("sync-status");
    statusEl.textContent = "● saving…";
    statusEl.className = "sync-status";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const result = await GistSync.push(state);
      if (!GistSync.isConfigured()) {
        statusEl.textContent = "● local only";
        statusEl.className = "sync-status";
      } else if (result.remote) {
        statusEl.textContent = "● synced";
        statusEl.className = "sync-status ok";
      } else {
        statusEl.textContent = "● local (sync failed)";
        statusEl.className = "sync-status err";
      }
    }, 400);
  }

  // ---------- generic modal ----------
  function openModal(title, fields, onSave) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:50;padding:1rem;";
    const card = document.createElement("div");
    card.style.cssText = "background:var(--surface-1);border-radius:12px;padding:1.5rem;max-width:420px;width:100%;max-height:85vh;overflow:auto;";
    card.innerHTML = `<h3 style="margin-top:0">${title}</h3>`;
    const inputs = {};
    fields.forEach(f => {
      const label = document.createElement("label");
      label.style.cssText = "display:block;margin:0.7rem 0 0.25rem;font-size:0.85rem;color:var(--text-secondary)";
      label.textContent = f.label;
      card.appendChild(label);
      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        f.options.forEach(o => {
          const opt = document.createElement("option");
          opt.value = o.value; opt.textContent = o.label;
          input.appendChild(opt);
        });
        if (f.value !== undefined) input.value = f.value;
      } else if (f.type === "checkboxgroup") {
        input = document.createElement("div");
        input.style.cssText = "display:flex;gap:0.4rem;flex-wrap:wrap;";
        input._checks = [];
        f.options.forEach(o => {
          const wrap = document.createElement("label");
          wrap.style.cssText = "display:flex;align-items:center;gap:0.25rem;font-size:0.8rem;background:var(--page-plane);padding:0.3rem 0.5rem;border-radius:6px;";
          const cb = document.createElement("input");
          cb.type = "checkbox"; cb.value = o.value;
          cb.checked = (f.value || []).includes(o.value);
          wrap.appendChild(cb);
          wrap.appendChild(document.createTextNode(o.label));
          input.appendChild(wrap);
          input._checks.push(cb);
        });
      } else if (f.type === "checkbox") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!f.value;
      } else if (f.type === "textarea") {
        input = document.createElement("textarea");
        input.rows = 3;
        input.style.width = "100%";
        input.value = f.value || "";
      } else {
        input = document.createElement("input");
        input.type = f.type || "text";
        input.style.width = "100%";
        if (f.step) input.step = f.step;
        input.value = f.value !== undefined ? f.value : "";
      }
      card.appendChild(input);
      inputs[f.key] = input;
    });
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:0.5rem;margin-top:1.2rem;justify-content:flex-end;";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn-ghost"; cancelBtn.textContent = "Cancel";
    const saveBtn = document.createElement("button");
    saveBtn.className = "btn-primary"; saveBtn.textContent = "Save";
    actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    cancelBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    saveBtn.onclick = () => {
      const values = {};
      fields.forEach(f => {
        const input = inputs[f.key];
        if (f.type === "checkboxgroup") values[f.key] = input._checks.filter(c => c.checked).map(c => c.value);
        else if (f.type === "checkbox") values[f.key] = input.checked;
        else if (f.type === "number") values[f.key] = input.value === "" ? null : parseFloat(input.value);
        else values[f.key] = input.value;
      });
      onSave(values);
      overlay.remove();
    };
  }

  // ---------- Today / Day view ----------
  function renderDayStrip() {
    const strip = document.getElementById("day-strip");
    strip.innerHTML = "";
    const start = addDays(selectedDate, -3);
    for (let i = 0; i < 12; i++) {
      const d = addDays(start, i);
      const existing = state.days[d];
      const hasTasks = existing && existing.tasks && existing.tasks.length > 0;
      const dt = new Date(d + "T00:00:00");
      const chip = document.createElement("button");
      chip.className = "day-chip" + (d === selectedDate ? " selected" : "") + (d === todayStr() ? " is-today" : "");
      chip.innerHTML = `<span class="chip-dow">${dt.toLocaleDateString(undefined, { weekday: "short" })}</span><span class="chip-num">${dt.getDate()}</span>${hasTasks ? '<span class="chip-dot"></span>' : ""}`;
      chip.onclick = () => { selectedDate = d; renderToday(); };
      strip.appendChild(chip);
    }
  }

  function renderTimeline(day) {
    const wrap = document.getElementById("timeline-wrap");
    const el = document.getElementById("timeline");
    el.innerHTML = "";
    const windows = Scheduler.buildWindows(state.settings);
    const pxPerMin = 1;
    const totalMin = Math.max(60, windows.sleep - windows.wake);
    el.style.height = (totalMin * pxPerMin) + "px";

    for (let m = 0; m <= totalMin; m += 30) {
      const absMin = windows.wake + m;
      const hour = Math.floor(absMin / 60) % 24;
      const isHour = absMin % 60 === 0;
      const line = document.createElement("div");
      line.className = "timeline-hour" + (isHour ? "" : " hour-half");
      line.style.top = (m * pxPerMin) + "px";
      if (isHour) {
        const label = document.createElement("span");
        label.className = "hour-label";
        label.textContent = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
        line.appendChild(label);
      }
      el.appendChild(line);
    }

    const clickTarget = document.createElement("div");
    clickTarget.className = "timeline-click-target";
    clickTarget.style.top = "0px";
    clickTarget.style.height = (totalMin * pxPerMin) + "px";
    clickTarget.onclick = (e) => {
      const rect = clickTarget.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      let minuteFromWake = Math.round((offsetY / pxPerMin) / 15) * 15;
      minuteFromWake = Math.max(0, Math.min(totalMin - 15, minuteFromWake));
      const startStr = Scheduler.minToTime(windows.wake + minuteFromWake);
      openModal(`Add task at ${startStr}`, [
        { key: "title", label: "Title", type: "text" },
        { key: "category", label: "Category", type: "select", options: [
          { value: "schedule", label: "Schedule" }, { value: "financial", label: "Financial" },
          { value: "health", label: "Health" }, { value: "personal", label: "Personal" }
        ] },
        { key: "duration_min", label: "Duration (minutes)", type: "number", value: 30 }
      ], (values) => {
        if (!values.title || !values.title.trim()) return;
        const duration_min = parseInt(values.duration_min, 10) || 30;
        day.tasks.push({
          id: uid(), title: values.title.trim(), category: values.category,
          duration_min, priority: 2, energy: "medium", preferredWindow: "any",
          start: startStr, end: Scheduler.minToTime(Scheduler.timeToMin(startStr) + duration_min),
          done: false, fixed: true, unscheduled: false
        });
        persist(); renderToday();
      });
    };
    el.appendChild(clickTarget);

    if (selectedDate === todayStr()) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= windows.wake && nowMin <= windows.sleep) {
        const nowLine = document.createElement("div");
        nowLine.className = "timeline-now-line";
        nowLine.style.top = ((nowMin - windows.wake) * pxPerMin) + "px";
        el.appendChild(nowLine);
      }
    }

    const timed = day.tasks.filter(t => t.start && !t.unscheduled).map(t => ({
      ...t, startMin: Scheduler.timeToMin(t.start), endMin: Scheduler.timeToMin(t.end || t.start)
    })).sort((a, b) => a.startMin - b.startMin);

    const columnsEnd = [];
    timed.forEach(t => {
      let col = columnsEnd.findIndex(endMin => endMin <= t.startMin);
      if (col === -1) { col = columnsEnd.length; columnsEnd.push(t.endMin); }
      else columnsEnd[col] = t.endMin;
      t._col = col;
    });
    timed.forEach(t => {
      const overlapping = timed.filter(o => o.startMin < t.endMin && o.endMin > t.startMin);
      t._totalCols = Math.max(...overlapping.map(o => o._col)) + 1;
    });

    timed.forEach(t => {
      const top = Math.max(0, (t.startMin - windows.wake) * pxPerMin);
      const height = Math.max(18, (t.endMin - t.startMin) * pxPerMin - 2);
      const widthPct = 100 / t._totalCols;
      const leftPct = widthPct * t._col;
      const block = document.createElement("div");
      block.className = `timeline-task ${t.category}` + (t.done ? " done" : "");
      block.style.top = top + "px";
      block.style.height = height + "px";
      block.style.left = `calc(${leftPct}% + 2px)`;
      block.style.width = `calc(${widthPct}% - 6px)`;
      block.title = `${t.title} (${t.start}–${t.end})`;
      block.innerHTML = `<span class="tt-title">${escapeHTML(t.title)}</span><span class="tt-time">${t.start}–${t.end}</span>`;
      el.appendChild(block);
    });

    if (selectedDate === todayStr()) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      wrap.scrollTop = Math.max(0, (nowMin - windows.wake - 60) * pxPerMin);
    } else {
      wrap.scrollTop = 0;
    }
  }

  function renderToday() {
    document.getElementById("today-date").textContent = formatDayHeader(selectedDate);
    document.getElementById("day-picker").value = selectedDate;
    renderDayStrip();
    const day = ensureDay(selectedDate);
    renderTimeline(day);
    const list = document.getElementById("task-list");
    list.innerHTML = "";
    if (!day.tasks.length) {
      list.innerHTML = `<p class="muted">No tasks yet for this day — add one above, or set up a recurring routine on the Goals tab.</p>`;
    }
    day.tasks.forEach(t => {
      const row = document.createElement("div");
      row.className = "task-item" + (t.done ? " done" : "");
      row.innerHTML = `
        <input type="checkbox" ${t.done ? "checked" : ""} data-action="toggle" data-id="${t.id}" />
        <span class="task-time">${t.unscheduled ? "unscheduled" : (t.start || "") + "–" + (t.end || "")}</span>
        <span class="task-title">${escapeHTML(t.title)}</span>
        <span class="task-cat ${t.category}">${t.category}</span>
        <span class="task-actions">
          <button data-action="settime" data-id="${t.id}" title="Set exact time">🕐</button>
          <button data-action="ics" data-id="${t.id}" title="Add to calendar">📅</button>
          <button data-action="delete" data-id="${t.id}" title="Delete">✕</button>
        </span>`;
      list.appendChild(row);
    });

    list.querySelectorAll('[data-action="toggle"]').forEach(el => el.onchange = () => {
      const t = day.tasks.find(t => t.id === el.dataset.id);
      t.done = el.checked;
      persist(); renderToday();
    });
    list.querySelectorAll('[data-action="delete"]').forEach(el => el.onclick = () => {
      day.tasks = day.tasks.filter(t => t.id !== el.dataset.id);
      persist(); renderToday();
    });
    list.querySelectorAll('[data-action="ics"]').forEach(el => el.onclick = () => {
      const t = day.tasks.find(t => t.id === el.dataset.id);
      if (!t.start) { alert("Set an exact time (🕐) or auto-schedule this day first, before adding it to your calendar."); return; }
      window.open(Reminders.googleCalendarLink(t, selectedDate), "_blank");
    });
    list.querySelectorAll('[data-action="settime"]').forEach(el => el.onclick = () => {
      const t = day.tasks.find(t => t.id === el.dataset.id);
      openModal("Set exact time", [
        { key: "start", label: "Start time", type: "time", value: t.start || "09:00" },
        { key: "duration_min", label: "Duration (minutes)", type: "number", value: t.duration_min || 30 }
      ], (values) => {
        const durationMin = parseInt(values.duration_min, 10) || 30;
        t.start = values.start;
        t.duration_min = durationMin;
        t.end = Scheduler.minToTime(Scheduler.timeToMin(values.start) + durationMin);
        t.fixed = true;
        t.unscheduled = false;
        persist(); renderToday();
      });
    });

    const scheduledMin = day.tasks.filter(t => t.start).reduce((s, t) => s + (t.duration_min || 0), 0);
    const windows = Scheduler.buildWindows(state.settings);
    const totalMin = windows.sleep - windows.wake;
    const doneCount = day.tasks.filter(t => t.done).length;
    document.getElementById("stat-completion").textContent = day.tasks.length ? Math.round((doneCount / day.tasks.length) * 100) + "%" : "—";
    document.getElementById("stat-scheduled-time").textContent = (scheduledMin / 60).toFixed(1) + "h";
    document.getElementById("stat-free-time").textContent = Math.max(0, (totalMin - scheduledMin) / 60).toFixed(1) + "h";

    day.log.scheduleAdherencePct = day.tasks.length ? Math.round((doneCount / day.tasks.length) * 100) : null;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Goals view ----------
  const GOAL_FIELD_SPECS = {
    financial: [
      { key: "title", label: "Goal title", type: "text" },
      { key: "type", label: "Type", type: "select", options: [
        { value: "savings", label: "Savings target" }, { value: "debt", label: "Debt payoff" },
        { value: "income", label: "Income target" }, { value: "budget", label: "Monthly budget" }
      ] },
      { key: "target", label: "Target amount ($)", type: "number" },
      { key: "current", label: "Current amount ($)", type: "number" },
      { key: "deadline", label: "Deadline (optional)", type: "date" },
      { key: "notes", label: "Notes", type: "textarea" }
    ],
    health: [
      { key: "title", label: "Goal title", type: "text" },
      { key: "type", label: "Type", type: "select", options: [
        { value: "workout", label: "Workout frequency/minutes" }, { value: "sleep", label: "Sleep" },
        { value: "weight", label: "Weight" }, { value: "nutrition", label: "Nutrition" }, { value: "habit", label: "Habit" }
      ] },
      { key: "target", label: "Target value", type: "number" },
      { key: "unit", label: "Unit (e.g. min/day, hrs, lbs)", type: "text" },
      { key: "current", label: "Current value", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" }
    ],
    schedule: [
      { key: "title", label: "Goal title", type: "text" },
      { key: "target", label: "Target (e.g. 80 for 80% adherence)", type: "number" },
      { key: "current", label: "Current", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" }
    ]
  };

  function renderGoals() {
    ["financial", "health", "schedule"].forEach(cat => {
      const el = document.getElementById(`goals-${cat}`);
      el.innerHTML = "";
      state.goals[cat].forEach(g => {
        const pct = g.target ? Math.min(100, Math.round(((g.current || 0) / g.target) * 100)) : null;
        const div = document.createElement("div");
        div.className = "goal-item";
        div.innerHTML = `
          <div style="display:flex;justify-content:space-between;">
            <span class="goal-title">${escapeHTML(g.title)}</span>
            <button class="item-remove" data-id="${g.id}" data-cat="${cat}">remove</button>
          </div>
          <div class="muted" style="font-size:0.8rem">${g.type ? g.type + " · " : ""}${g.current ?? "—"}${g.unit ? " " + g.unit : ""} of ${g.target ?? "—"}${g.unit ? " " + g.unit : ""}${g.deadline ? " · by " + g.deadline : ""}</div>
          ${pct !== null ? `<div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${pct}%"></div></div>` : ""}
          ${g.notes ? `<div class="muted" style="font-size:0.8rem;margin-top:0.3rem">${escapeHTML(g.notes)}</div>` : ""}
        `;
        el.appendChild(div);
      });
      el.querySelectorAll(".item-remove").forEach(btn => btn.onclick = () => {
        state.goals[cat] = state.goals[cat].filter(g => g.id !== btn.dataset.id);
        persist(); renderGoals();
      });
    });

    const recList = document.getElementById("recurring-list");
    recList.innerHTML = "";
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    state.recurringTasks.forEach(r => {
      const div = document.createElement("div");
      div.className = "recurring-item";
      div.innerHTML = `
        <span class="rec-title">${escapeHTML(r.title)}</span>
        <span class="task-cat ${r.category}">${r.category}</span>
        <span class="muted" style="font-size:0.8rem">${r.duration_min}min · ${r.daysOfWeek.map(d => dayNames[d]).join(",")}</span>
        <label style="font-size:0.8rem;display:flex;gap:0.3rem;align-items:center"><input type="checkbox" data-action="active" data-id="${r.id}" ${r.active ? "checked" : ""}/> active</label>
        <button class="item-remove" data-id="${r.id}">remove</button>
      `;
      recList.appendChild(div);
    });
    recList.querySelectorAll('[data-action="active"]').forEach(cb => cb.onchange = () => {
      const r = state.recurringTasks.find(r => r.id === cb.dataset.id);
      r.active = cb.checked;
      persist();
    });
    recList.querySelectorAll(".item-remove").forEach(btn => btn.onclick = () => {
      state.recurringTasks = state.recurringTasks.filter(r => r.id !== btn.dataset.id);
      persist(); renderGoals();
    });
  }

  function wireGoalButtons() {
    document.querySelectorAll(".add-goal-btn").forEach(btn => {
      btn.onclick = () => {
        const cat = btn.dataset.cat;
        openModal(`Add ${cat} goal`, GOAL_FIELD_SPECS[cat], (values) => {
          state.goals[cat].push({ id: uid(), ...values });
          persist(); renderGoals();
        });
      };
    });
    document.getElementById("add-recurring-btn").onclick = () => {
      openModal("Add recurring task", [
        { key: "title", label: "Title", type: "text" },
        { key: "category", label: "Category", type: "select", options: [
          { value: "schedule", label: "Schedule" }, { value: "financial", label: "Financial" },
          { value: "health", label: "Health" }, { value: "personal", label: "Personal" }
        ] },
        { key: "duration_min", label: "Duration (minutes)", type: "number", value: 30 },
        { key: "priority", label: "Priority", type: "select", options: [
          { value: "1", label: "Low" }, { value: "2", label: "Medium" }, { value: "3", label: "High" }
        ] },
        { key: "energy", label: "Energy needed", type: "select", options: [
          { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }
        ] },
        { key: "preferredWindow", label: "Preferred time of day", type: "select", options: [
          { value: "any", label: "Any" }, { value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" }, { value: "evening", label: "Evening" }
        ] },
        { key: "daysOfWeek", label: "Days", type: "checkboxgroup", options: [
          { value: "1", label: "Mon" }, { value: "2", label: "Tue" }, { value: "3", label: "Wed" }, { value: "4", label: "Thu" },
          { value: "5", label: "Fri" }, { value: "6", label: "Sat" }, { value: "0", label: "Sun" }
        ], value: ["1", "2", "3", "4", "5"] }
      ], (values) => {
        state.recurringTasks.push({
          id: uid(), title: values.title, category: values.category,
          duration_min: parseInt(values.duration_min, 10) || 30,
          priority: parseInt(values.priority, 10) || 2,
          energy: values.energy, preferredWindow: values.preferredWindow,
          daysOfWeek: values.daysOfWeek.map(Number), active: true
        });
        persist(); renderGoals();
      });
    };
  }

  // ---------- Log view ----------
  function renderLog(dateStr) {
    const day = ensureDay(dateStr);
    document.getElementById("log-spend").value = day.log.financial.spend ?? "";
    document.getElementById("log-income").value = day.log.financial.income ?? "";
    document.getElementById("log-networth").value = day.log.financial.networth ?? "";
    document.getElementById("log-workout").value = day.log.health.workoutMin ?? "";
    document.getElementById("log-sleep").value = day.log.health.sleepHours ?? "";
    document.getElementById("log-weight").value = day.log.health.weight ?? "";
    document.getElementById("log-mood").value = day.log.health.mood ?? 3;
    document.getElementById("log-notes").value = day.log.notes ?? "";
    document.getElementById("log-saved-msg").classList.add("hidden");
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const range = parseInt(document.getElementById("dashboard-range").value, 10);
    const stats = DashboardCharts.render(state, range);
    const statRow = document.getElementById("dashboard-stats");
    statRow.innerHTML = `
      <div class="stat-tile"><div class="stat-label">Net worth (est.)</div><div class="stat-value">$${(stats.currentNetworth || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
      <div class="stat-tile"><div class="stat-label">Avg. schedule adherence</div><div class="stat-value">${stats.avgAdherence !== null ? stats.avgAdherence + "%" : "—"}</div></div>
      <div class="stat-tile"><div class="stat-label">Workout streak</div><div class="stat-value">${stats.workoutStreak} day${stats.workoutStreak === 1 ? "" : "s"}</div></div>
    `;
  }

  // ---------- Settings ----------
  function renderSettings() {
    document.getElementById("setting-wake").value = state.settings.wakeTime;
    document.getElementById("setting-sleep").value = state.settings.sleepTime;
    document.getElementById("setting-work-start").value = state.settings.workStart;
    document.getElementById("setting-work-end").value = state.settings.workEnd;
    document.getElementById("sync-detail").textContent = GistSync.isConfigured()
      ? "Syncing to a private GitHub Gist — open this same URL on any device and connect with the same token + Gist ID to see your data everywhere."
      : "Not connected to a Gist — data is only stored in this browser. Use Reconfigure below to add sync.";
  }

  // ---------- View switching ----------
  function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(`view-${name}`).classList.add("active");
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    if (name === "today") renderToday();
    if (name === "goals") renderGoals();
    if (name === "log") renderLog(document.getElementById("log-date").value || todayStr());
    if (name === "dashboard") renderDashboard();
    if (name === "settings") renderSettings();
  }

  // ---------- Init ----------
  async function init() {
    document.getElementById("tabs").querySelectorAll(".tab").forEach(tab => {
      tab.onclick = () => showView(tab.dataset.view);
    });

    document.getElementById("add-task-btn").onclick = () => {
      const title = document.getElementById("new-task-title").value.trim();
      if (!title) return;
      const duration_min = parseInt(document.getElementById("new-task-duration").value, 10) || 30;
      const exactTime = document.getElementById("new-task-time").value; // "" if not set
      const day = ensureDay(selectedDate);
      day.tasks.push({
        id: uid(), title,
        category: document.getElementById("new-task-category").value,
        duration_min,
        priority: parseInt(document.getElementById("new-task-priority").value, 10),
        energy: document.getElementById("new-task-energy").value,
        preferredWindow: "any",
        start: exactTime || null,
        end: exactTime ? Scheduler.minToTime(Scheduler.timeToMin(exactTime) + duration_min) : null,
        done: false,
        fixed: !!exactTime,
        unscheduled: !exactTime
      });
      document.getElementById("new-task-title").value = "";
      document.getElementById("new-task-time").value = "";
      persist(); renderToday();
    };

    document.getElementById("auto-schedule-btn").onclick = () => {
      const day = ensureDay(selectedDate);
      day.tasks = Scheduler.schedule(day.tasks, state.settings);
      persist(); renderToday();
      Reminders.requestNotificationPermission().then(() => {
        Reminders.scheduleInAppNotifications(day.tasks, selectedDate);
      });
    };

    document.getElementById("day-prev").onclick = () => { selectedDate = addDays(selectedDate, -1); renderToday(); };
    document.getElementById("day-next").onclick = () => { selectedDate = addDays(selectedDate, 1); renderToday(); };
    document.getElementById("day-today-btn").onclick = () => { selectedDate = todayStr(); renderToday(); };
    document.getElementById("day-picker").onchange = (e) => { if (e.target.value) { selectedDate = e.target.value; renderToday(); } };
    document.getElementById("export-ics-btn").onclick = () => {
      const day = ensureDay(selectedDate);
      const scheduledCount = day.tasks.filter(t => t.start && !t.unscheduled).length;
      if (!scheduledCount) { alert("No tasks with a set time yet on this day — set exact times or auto-schedule first."); return; }
      Reminders.downloadICS(day.tasks, selectedDate);
    };

    document.getElementById("log-date").value = todayStr();
    document.getElementById("log-date").onchange = (e) => renderLog(e.target.value);
    document.getElementById("save-log-btn").onclick = () => {
      const dateStr = document.getElementById("log-date").value || todayStr();
      const day = ensureDay(dateStr);
      day.log.financial = {
        spend: numOrUndef("log-spend"), income: numOrUndef("log-income"), networth: numOrUndef("log-networth")
      };
      day.log.health = {
        workoutMin: numOrUndef("log-workout"), sleepHours: numOrUndef("log-sleep"),
        weight: numOrUndef("log-weight"), mood: parseInt(document.getElementById("log-mood").value, 10)
      };
      day.log.notes = document.getElementById("log-notes").value;
      persist();
      document.getElementById("log-saved-msg").classList.remove("hidden");
    };

    document.getElementById("dashboard-range").onchange = renderDashboard;

    document.getElementById("save-settings-btn").onclick = () => {
      state.settings.wakeTime = document.getElementById("setting-wake").value;
      state.settings.sleepTime = document.getElementById("setting-sleep").value;
      state.settings.workStart = document.getElementById("setting-work-start").value;
      state.settings.workEnd = document.getElementById("setting-work-end").value;
      persist();
    };
    document.getElementById("sync-now-btn").onclick = async () => {
      const pulled = await GistSync.pull();
      if (pulled) { state = pulled; showView(currentView()); }
      persist();
    };
    document.getElementById("reconfigure-sync-btn").onclick = () => {
      localStorage.removeItem(LS_LOCAL_ONLY);
      document.getElementById("app").classList.add("hidden");
      document.getElementById("setup-screen").classList.remove("hidden");
    };
    document.getElementById("export-json-btn").onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `day-planner-backup-${todayStr()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    };

    wireGoalButtons();
    wireSetupScreen();

    // PWA install
    let deferredPrompt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById("install-pwa-btn").classList.remove("hidden");
    });
    document.getElementById("install-pwa-btn").onclick = async () => {
      if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }

    // Decide: setup screen vs app
    if (GistSync.isConfigured() || localStorage.getItem(LS_LOCAL_ONLY)) {
      await boot();
    } else {
      document.getElementById("setup-screen").classList.remove("hidden");
    }
  }

  function numOrUndef(id) {
    const v = document.getElementById(id).value;
    return v === "" ? undefined : parseFloat(v);
  }

  function currentView() {
    const active = document.querySelector(".tab.active");
    return active ? active.dataset.view : "today";
  }

  async function boot() {
    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    const pulled = await GistSync.pull();
    state = pulled || emptyState();
    if (!state.settings) state.settings = emptyState().settings;
    if (!state.goals) state.goals = emptyState().goals;
    if (!state.recurringTasks) state.recurringTasks = [];
    if (!state.days) state.days = {};
    selectedDate = todayStr();
    showView("today");
  }

  function wireSetupScreen() {
    document.getElementById("setup-connect").onclick = async () => {
      const token = document.getElementById("setup-token").value.trim();
      const gistId = document.getElementById("setup-gist").value.trim();
      const errEl = document.getElementById("setup-error");
      errEl.classList.add("hidden");
      if (!token || !gistId) { errEl.textContent = "Enter both a token and a Gist ID."; errEl.classList.remove("hidden"); return; }
      try {
        await GistSync.testConnection(token, gistId);
        GistSync.setCredentials(token, gistId);
        await boot();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
      }
    };
    document.getElementById("setup-local").onclick = async () => {
      localStorage.setItem(LS_LOCAL_ONLY, "1");
      await boot();
    };
  }

  init();
})();
