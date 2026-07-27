/**
 * scheduler.js
 * A simple, transparent heuristic auto-scheduler — not a solver, but a
 * reasonable "optimal enough" first pass:
 *   1. Fixed-time tasks (already have a start) stay put and block the timeline.
 *   2. Everything else is sorted by priority, then matched to an energy
 *      window (high-energy work in the morning, low-energy in the evening).
 *   3. Tasks are greedily placed into the earliest free slot in their
 *      preferred window, spilling into other windows if it doesn't fit,
 *      with a small buffer between blocks.
 * Tasks that truly don't fit are returned unscheduled so the UI can flag them
 * rather than silently overlap things.
 */
const Scheduler = (() => {
  const BUFFER_MIN = 10;

  function timeToMin(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function minToTime(mins) {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function buildWindows(settings) {
    const wake = timeToMin(settings.wakeTime || "07:00");
    const sleep = timeToMin(settings.sleepTime || "23:00");
    const span = sleep - wake;
    const third = span / 3;
    return {
      wake, sleep,
      morning: [wake, wake + third],
      afternoon: [wake + third, wake + 2 * third],
      evening: [wake + 2 * third, sleep]
    };
  }

  const ENERGY_WINDOW = { high: "morning", medium: "afternoon", low: "evening" };

  /**
   * @param {Array} tasks - {id, title, duration_min, priority, energy, preferredWindow, start?, fixed?}
   * @param {Object} settings - {wakeTime, sleepTime}
   * @returns {Array} tasks with start/end filled in (unscheduled tasks get unscheduled:true)
   */
  function schedule(tasks, settings) {
    const windows = buildWindows(settings);
    const fixed = tasks.filter(t => t.fixed && t.start);
    const flexible = tasks.filter(t => !(t.fixed && t.start));

    // Busy blocks start as the fixed tasks (in minutes-from-midnight).
    const busy = fixed.map(t => {
      const start = timeToMin(t.start);
      return { start, end: start + (t.duration_min || 30), taskId: t.id };
    }).sort((a, b) => a.start - b.start);

    // Priority desc, then energy-window order (morning, afternoon, evening) so the day reads naturally.
    const windowOrder = { morning: 0, afternoon: 1, evening: 2, any: 1 };
    flexible.sort((a, b) => {
      if ((b.priority || 1) !== (a.priority || 1)) return (b.priority || 1) - (a.priority || 1);
      const aw = a.preferredWindow && a.preferredWindow !== "any" ? a.preferredWindow : ENERGY_WINDOW[a.energy] || "afternoon";
      const bw = b.preferredWindow && b.preferredWindow !== "any" ? b.preferredWindow : ENERGY_WINDOW[b.energy] || "afternoon";
      return windowOrder[aw] - windowOrder[bw];
    });

    function findSlot(durationNeeded, rangeStart, rangeEnd) {
      // candidate gaps between busy blocks (and day bounds), within [rangeStart, rangeEnd]
      const relevant = busy.filter(b => b.end > rangeStart && b.start < rangeEnd)
        .sort((a, b) => a.start - b.start);
      let cursor = rangeStart;
      for (const b of relevant) {
        if (b.start - cursor >= durationNeeded) return cursor;
        cursor = Math.max(cursor, b.end + BUFFER_MIN);
      }
      if (rangeEnd - cursor >= durationNeeded) return cursor;
      return null;
    }

    const scheduled = [];
    const unscheduled = [];

    for (const t of flexible) {
      const duration = t.duration_min || 30;
      const preferred = t.preferredWindow && t.preferredWindow !== "any"
        ? t.preferredWindow
        : (ENERGY_WINDOW[t.energy] || "afternoon");

      const tryOrder = [preferred, "morning", "afternoon", "evening"].filter((v, i, a) => a.indexOf(v) === i);
      let placedStart = null;
      for (const win of tryOrder) {
        const [ws, we] = windows[win];
        placedStart = findSlot(duration, ws, we);
        if (placedStart !== null) break;
      }
      // last resort: anywhere in the whole day
      if (placedStart === null) {
        placedStart = findSlot(duration, windows.wake, windows.sleep);
      }

      if (placedStart === null) {
        unscheduled.push({ ...t, unscheduled: true });
        continue;
      }
      const entry = { ...t, start: minToTime(placedStart), end: minToTime(placedStart + duration), unscheduled: false };
      scheduled.push(entry);
      busy.push({ start: placedStart, end: placedStart + duration, taskId: t.id });
      busy.sort((a, b) => a.start - b.start);
    }

    const all = [...fixed, ...scheduled, ...unscheduled];
    all.sort((a, b) => {
      if (a.unscheduled && !b.unscheduled) return 1;
      if (!a.unscheduled && b.unscheduled) return -1;
      return timeToMin(a.start || "23:59") - timeToMin(b.start || "23:59");
    });
    return all;
  }

  return { schedule, timeToMin, minToTime, buildWindows };
})();
