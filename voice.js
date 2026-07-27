/**
 * voice.js
 * Free, browser-native voice task creation — no paid API, no key.
 * Uses the Web Speech API: SpeechRecognition to listen, SpeechSynthesis to
 * talk back. Parsing is a plain pattern-matcher (not true language
 * understanding), so the result is always shown in an editable confirm step
 * rather than saved blind.
 */
const Voice = (() => {
  function supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function speechOutputSupported() {
    return "speechSynthesis" in window;
  }

  function listen() {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { reject(new Error("Speech recognition isn't supported in this browser — try Chrome.")); return; }
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let settled = false;
      rec.onresult = (e) => {
        settled = true;
        resolve(e.results[0][0].transcript);
      };
      rec.onerror = (e) => {
        if (settled) return;
        settled = true;
        reject(new Error(e.error === "not-allowed" ? "Microphone access was blocked — allow it and try again." : (e.error || "Didn't catch that — try again.")));
      };
      rec.onend = () => {
        if (!settled) { settled = true; reject(new Error("Didn't hear anything — try again.")); }
      };
      try { rec.start(); } catch (err) { reject(err); }
    });
  }

  // Best-effort — speech synthesis failing for any reason should never
  // block or error out the rest of the voice-add flow.
  function speak(text) {
    return new Promise((resolve) => {
      try {
        if (!speechOutputSupported()) { resolve(); return; }
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.0;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      } catch (err) {
        resolve();
      }
    });
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function addDaysLocal(dateStr, delta) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  const FILLER_STARTS = [
    /^(please\s+)?(create|add|make|schedule|set up|book)\s+(a\s+|an\s+)?(new\s+)?task(\s+(named|called|to|for))?\s*/i,
    /^(please\s+)?(create|add|make|schedule|set up|book)\s+/i
  ];

  function stripAfterStopwords(str) {
    const patterns = [
      /\band\s+(set|schedule|book|put|make)\b/i,
      /\bat\b/i,
      /\bfor\b/i,
      /\bon\b/i,
      /\btomorrow\b/i,
      /\btoday\b/i
    ];
    let cutIdx = str.length;
    patterns.forEach((re) => {
      const m = re.exec(str);
      if (m && m.index < cutIdx) cutIdx = m.index;
    });
    return str.slice(0, cutIdx).trim();
  }

  function extractTitle(text) {
    let candidate;
    const m = text.match(/\b(named|called)\s+(.+)/i);
    if (m) {
      candidate = m[2];
    } else {
      candidate = text;
      FILLER_STARTS.forEach((re) => { candidate = candidate.replace(re, ""); });
    }
    candidate = stripAfterStopwords(candidate);
    candidate = candidate.replace(/[.,!?]+$/, "").trim();
    return candidate || text.trim();
  }

  function extractTime(text) {
    const lower = text.toLowerCase();
    let m = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/);
    if (m) {
      let hour = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const isPM = /p/.test(m[3]);
      if (hour === 12) hour = isPM ? 12 : 0;
      else if (isPM) hour += 12;
      return { start: `${pad2(hour)}:${pad2(min)}`, assumed: false };
    }
    m = lower.match(/(\d{1,2})\s*o'?clock/);
    if (m) {
      let hour = parseInt(m[1], 10);
      if (hour >= 1 && hour <= 7) hour += 12; // casual "at 8 o'clock" usually means evening
      return { start: `${pad2(hour % 24)}:00`, assumed: true };
    }
    m = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/) || lower.match(/\bfor\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(minute|min|hour))/);
    if (m) {
      let hour = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      if (hour < 13 && hour >= 1 && hour <= 7) hour += 12;
      return { start: `${pad2(hour % 24)}:${pad2(min)}`, assumed: true };
    }
    return { start: null, assumed: false };
  }

  function extractDuration(text) {
    const lower = text.toLowerCase();
    if (/for\s+(an|a)\s+hour\b/.test(lower)) return 60;
    let m = lower.match(/for\s+(\d+)\s*hours?\b/);
    if (m) return parseInt(m[1], 10) * 60;
    m = lower.match(/for\s+(\d+)\s*(minutes|minute|mins|min)\b/);
    if (m) return parseInt(m[1], 10);
    return 30;
  }

  function guessCategory(text) {
    const lower = text.toLowerCase();
    if (/(gym|workout|exercise|run|walk|sleep|doctor|health|meditat|dentist)/.test(lower)) return "health";
    if (/(pay|bill|budget|bank|invoice|money|invest|savings?|expense|rent)/.test(lower)) return "financial";
    if (/(meeting|call|deep work|project|email|standup|report)/.test(lower)) return "schedule";
    return "personal";
  }

  function extractDate(text, referenceDateStr) {
    const lower = text.toLowerCase();
    if (/\btomorrow\b/.test(lower)) return addDaysLocal(referenceDateStr, 1);
    if (/\btoday\b/.test(lower)) return referenceDateStr;
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < weekdays.length; i++) {
      if (new RegExp(`\\b${weekdays[i]}\\b`).test(lower)) {
        const refDow = new Date(referenceDateStr + "T00:00:00").getDay();
        let delta = (i - refDow + 7) % 7;
        if (delta === 0) delta = 7;
        return addDaysLocal(referenceDateStr, delta);
      }
    }
    return referenceDateStr;
  }

  /**
   * @param {string} transcript - raw recognized speech
   * @param {string} referenceDateStr - the date currently being viewed, used as the default
   * @returns {{title, start, timeAssumed, duration_min, category, dateStr, raw}}
   */
  function parse(transcript, referenceDateStr) {
    return {
      title: extractTitle(transcript),
      ...extractTimeWrapped(transcript),
      duration_min: extractDuration(transcript),
      category: guessCategory(transcript),
      dateStr: extractDate(transcript, referenceDateStr),
      raw: transcript
    };
  }
  function extractTimeWrapped(text) {
    const t = extractTime(text);
    return { start: t.start, timeAssumed: t.assumed };
  }

  function describeForSpeech(parsed, isToday) {
    const dayPart = isToday ? "today" : `on ${parsed.dateStr}`;
    const timePart = parsed.start ? `at ${to12Hour(parsed.start)}` : "with no set time — I'll auto-schedule it";
    return `I heard: create a task called "${parsed.title}", ${dayPart}, ${timePart}, for ${parsed.duration_min} minutes. Please review and confirm.`;
  }

  function to12Hour(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    let hour = h % 12; if (hour === 0) hour = 12;
    return `${hour}:${pad2(m)} ${period}`;
  }

  return { supported, speechOutputSupported, listen, speak, parse, describeForSpeech, to12Hour };
})();
