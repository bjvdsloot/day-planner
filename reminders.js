/**
 * reminders.js
 * Free, zero-backend reminders: instead of standing up a push server, we
 * hand scheduled tasks off to the calendar app already on your phone (which
 * has reliable native notifications for free). Two ways in:
 *   1. Download an .ics file (works with Apple Calendar, Outlook, etc.)
 *   2. One-click "Add to Google Calendar" links.
 */
const Reminders = (() => {

  function pad(n) { return String(n).padStart(2, "0"); }

  // dateStr: "YYYY-MM-DD", timeStr: "HH:MM" -> "YYYYMMDDTHHMMSS" (floating local time)
  function toICSDateTime(dateStr, timeStr) {
    const [y, m, d] = dateStr.split("-");
    const [hh, mm] = timeStr.split(":");
    return `${y}${m}${d}T${hh}${mm}00`;
  }

  // For Google Calendar template links Google wants UTC ("Z") form; since we don't
  // know the user's UTC offset reliably server-side, we compute it client-side
  // from the browser's own timezone offset at that moment.
  function toGCalUTC(dateStr, timeStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    const local = new Date(y, m - 1, d, hh, mm, 0);
    const utc = new Date(local.getTime() - local.getTimezoneOffset() * 60000);
    return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}00Z`;
  }

  function googleCalendarLink(task, dateStr) {
    const start = toGCalUTC(dateStr, task.start);
    const end = toGCalUTC(dateStr, task.end || task.start);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: task.title,
      dates: `${start}/${end}`,
      details: `Added from Day Planner (${task.category || "task"})`
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function buildICS(tasks, dateStr) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Day Planner//EN",
      "CALSCALE:GREGORIAN"
    ];
    tasks.filter(t => t.start && !t.unscheduled).forEach(t => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${t.id}@day-planner`,
        `DTSTART:${toICSDateTime(dateStr, t.start)}`,
        `DTEND:${toICSDateTime(dateStr, t.end || t.start)}`,
        `SUMMARY:${escapeICS(t.title)}`,
        `DESCRIPTION:${escapeICS((t.category || "task") + " task from Day Planner")}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT10M",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeICS(t.title)}`,
        "END:VALARM",
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function escapeICS(str) {
    return String(str).replace(/[,;]/g, "\\$&").replace(/\n/g, "\\n");
  }

  function downloadICS(tasks, dateStr) {
    const ics = buildICS(tasks, dateStr);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `day-planner-${dateStr}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Best-effort in-app notification while this tab/PWA is open (a nice extra,
  // not a replacement for the calendar-based reminders above).
  function scheduleInAppNotifications(tasks, dateStr) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    if (dateStr !== todayStr) return;
    tasks.filter(t => t.start && !t.unscheduled && !t.done).forEach(t => {
      const [hh, mm] = t.start.split(":").map(Number);
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      const msUntil = target.getTime() - Date.now();
      if (msUntil > 0 && msUntil < 24 * 60 * 60 * 1000) {
        setTimeout(() => {
          try { new Notification(`Day Planner: ${t.title}`, { body: `Starting now (${t.start})` }); } catch (e) {}
        }, msUntil);
      }
    });
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.requestPermission();
  }

  return { buildICS, downloadICS, googleCalendarLink, scheduleInAppNotifications, requestNotificationPermission };
})();
