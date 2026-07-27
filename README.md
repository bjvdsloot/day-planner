# Day Planner

A free, personal web app for scheduling your day, tracking finances/health/schedule progress, and getting reminders — usable on your phone and computer from the same URL.

## How it works (and why it's free)

- **Hosting:** a static site on **GitHub Pages** (free forever for public repos).
- **Data sync across devices:** your data is stored as one JSON file inside a **private GitHub Gist** that only you can read/write, using a personal access token scoped to *just* gists. No database, no server, no monthly cost.
- **Reminders:** instead of a push-notification server (which isn't free to run reliably), the app hands scheduled tasks to your phone's own calendar app — via a "add to calendar" button (Google Calendar) or a downloadable `.ics` file (Apple/Outlook/anything else). Your calendar app's native notifications are free and rock-solid.
- **Charts:** rendered client-side with Chart.js from the tasks and daily log entries you enter.

You can also skip the sync setup entirely and use it on a single device — everything still works from your browser's local storage, you just won't see the same data on your phone and computer.

## One-time setup (about 5 minutes)

### 1. Put the app on GitHub Pages

1. Create a free GitHub account if you don't have one: https://github.com/signup
2. Create a new **public** repository (e.g. `day-planner`).
3. Upload all the files in this folder to that repository (drag-and-drop on the GitHub website works, or use `git push` if you're comfortable with git).
4. In the repo, go to **Settings → Pages**, set "Source" to your main branch (root), and save.
5. GitHub gives you a URL like `https://yourusername.github.io/day-planner/` — that's your app, on any device.

### 2. Create the private Gist that will hold your data

1. Go to https://gist.github.com/
2. Filename: `day-planner-data.json`
3. Content: `{}`
4. Click **Create secret gist** (secret = not listed publicly; still readable by anyone with the exact link and your token controls write access).
5. Copy the Gist ID from the URL — it's the string after your username, e.g. `https://gist.github.com/yourusername/3f1b2c...` → the Gist ID is `3f1b2c...`.

### 3. Create a personal access token (scoped to Gists only)

1. Go to https://github.com/settings/personal-access-tokens (fine-grained tokens).
2. Click **Generate new token**.
3. Under **Account permissions**, set **Gists** to **Read and write**. Leave everything else as "No access."
4. Generate the token and copy it (it starts with `github_pat_...`). You won't be able to see it again, so store it somewhere safe (e.g. a password manager) — you'll need to paste it into the app on each new device.

### 4. First run

1. Open your GitHub Pages URL on your computer.
2. Paste the token and Gist ID into the setup screen and click **Connect**.
3. Open the same URL on your phone's browser and enter the *same* token + Gist ID — now both devices share the same data.
4. On your phone, use "Add to Home Screen" (Safari) or the install prompt (Chrome/Android) to make it feel like a native app.

## Using it day to day

- **Today tab:** add tasks, then click **Auto-schedule this day** — it time-blocks everything around your wake/sleep times and each task's priority and energy level (set these in Settings and when adding tasks). Want a task at an exact time instead of letting the scheduler pick? Fill in the time field when adding it, or click the 🕐 icon on any existing task to lock in (or change) its exact time — auto-schedule will always leave locked-time tasks alone. Click the 📅 icon on any scheduled task to add it straight to Google Calendar so you get a real phone notification, or use **Export this day (.ics)** to grab the whole day at once.
- **Voice add:** click **🎤 Add task by voice** and just say something like "create a task named do the dishes and set it for 8 pm." The app listens, reads back what it understood, and opens an editable confirmation box — nothing gets saved until you hit Save, so it's easy to fix anything it misheard. This uses your browser's free built-in speech recognition (works best in Chrome; support is spottier in Safari and it isn't available in every browser).
- **Planning ahead:** use the ‹ › arrows, the day-strip, or the date picker at the top of the Today tab to jump to any past or future date — each day keeps its own tasks and log entries, so you can build out tomorrow, next week, or further ahead whenever you like.
- **Timeline view:** the hour-by-hour timeline under the day-strip shows your scheduled tasks as blocks at their actual time, colored by category, with a red line marking the current time on today's view. Click any empty spot on it to add a task starting at that exact time — no need to use the form below unless you want more control (priority/energy for auto-scheduling).
- **Goals tab:** set financial, health, and schedule goals, and set up recurring tasks (workouts, budgeting time, deep work blocks) that auto-populate each day they're active.
- **Log tab:** a 30-second daily check-in — money spent/earned, workout minutes, sleep, mood, notes. This is what feeds the Dashboard charts.
- **Dashboard tab:** net worth trend, spending vs. budget, schedule adherence, workout minutes, sleep, and mood over the last 7/30/90 days.
- **Settings tab:** wake/sleep times (used by the auto-scheduler), plus a **Export all data (.json backup)** button — use this occasionally as a backup, independent of the Gist.

## Get double reminders (1 hour and 30 minutes before) for free

Every task you export as an `.ics` file (per-task or the whole-day export) already carries two alarms — 60 minutes before and 30 minutes before — built into the file, so Apple Calendar/Outlook/etc. will show both automatically.

For the one-click **"Add to Google Calendar"** button, Google doesn't let a quick-add link set custom reminders — but you can set this up **once** in your own Google Calendar so it applies to every event from then on:
1. Open Google Calendar → **Settings** (gear icon) → click on your calendar's name under "Settings for my calendars."
2. Find **Event notifications**, click **Add notification**, set it to **1 hour** before, then click **Add another notification** and set the second one to **30 minutes** before.
3. That's it — from now on, every task you quick-add to that calendar (from this app or anywhere else) automatically gets both reminders.

## If you don't see your latest update after re-uploading files

This app caches itself for offline use, which can mean a fresh upload doesn't show up on the very next reload. If that happens: do a hard refresh (**Ctrl+Shift+R** on Windows/Linux, **Cmd+Shift+R** on Mac) once on your computer. On your phone, fully close the tab (or close the installed app from your app switcher) and reopen it. This should only ever take one extra refresh — the app now fetches fresh files first and only falls back to the cache when you're offline.

## Honest limitations (v1)

- The auto-scheduler is a simple, transparent heuristic (priority + energy-window matching), not a full optimizer — it's meant to give you a sensible first draft you can adjust, not a perfect plan.
- True background push notifications (reminders that fire even with your phone locked and the app fully closed, without touching your calendar) would require a paid always-on server or a more involved web-push setup — the calendar-based approach here avoids that cost entirely while still being reliable.
- Voice add uses simple pattern-matching to pull out the title/time/date/duration from what you say — not true language understanding. It handles clear phrasing well (see the example above) but can misfire on more complex sentences, which is exactly why it always shows an editable confirmation box rather than saving straight away.
- This is a single-user tool by design (one Gist = one person's data). Don't share your token.

## Ideas for later (not built yet)

- Weekly/monthly review view that compares actuals to goals automatically.
- Recurring bill tracking with due-date reminders.
- Import bank transactions (CSV) to auto-fill the financial log.
- A "why" prompt when you miss a scheduled task, to learn your real patterns over time.
