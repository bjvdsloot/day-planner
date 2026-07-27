/**
 * gistSync.js
 * Free, serverless cross-device sync using a private GitHub Gist as the
 * "database". The whole app state is one JSON file inside the gist.
 *
 * Local-only mode: if no token/gist is configured, everything still works
 * from localStorage on this one device.
 */
const GistSync = (() => {
  const LS_TOKEN = "dp_gh_token";
  const LS_GIST = "dp_gh_gist";
  const LS_DATA = "dp_data_cache";
  const GIST_FILENAME = "day-planner-data.json";
  const API = "https://api.github.com";

  function getToken() { return localStorage.getItem(LS_TOKEN) || ""; }
  function getGistId() { return localStorage.getItem(LS_GIST) || ""; }
  function isConfigured() { return !!(getToken() && getGistId()); }

  function setCredentials(token, gistId) {
    localStorage.setItem(LS_TOKEN, token.trim());
    localStorage.setItem(LS_GIST, gistId.trim());
  }

  function clearCredentials() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_GIST);
  }

  function loadLocal() {
    const raw = localStorage.getItem(LS_DATA);
    return raw ? JSON.parse(raw) : null;
  }

  function saveLocal(data) {
    localStorage.setItem(LS_DATA, JSON.stringify(data));
  }

  async function testConnection(token, gistId) {
    const res = await fetch(`${API}/gists/${gistId}`, {
      headers: authHeaders(token)
    });
    if (!res.ok) {
      throw new Error(`Could not reach that gist (HTTP ${res.status}). Check the token has "gist" scope and the Gist ID is correct.`);
    }
    return res.json();
  }

  function authHeaders(token) {
    return {
      "Authorization": `Bearer ${token || getToken()}`,
      "Accept": "application/vnd.github+json"
    };
  }

  /** Pull the latest state from the gist. Falls back to local cache on failure. */
  async function pull() {
    if (!isConfigured()) return loadLocal();
    try {
      const res = await fetch(`${API}/gists/${getGistId()}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const gist = await res.json();
      const file = gist.files && gist.files[GIST_FILENAME];
      if (!file) return loadLocal();
      let content = file.content;
      if (file.truncated) {
        const raw = await fetch(file.raw_url);
        content = await raw.text();
      }
      const data = JSON.parse(content);
      saveLocal(data);
      return data;
    } catch (err) {
      console.warn("Gist pull failed, using local cache:", err);
      return loadLocal();
    }
  }

  /** Push state to the gist (and always to local cache first, so nothing is lost offline). */
  async function push(data) {
    saveLocal(data);
    if (!isConfigured()) return { ok: true, remote: false };
    try {
      const res = await fetch(`${API}/gists/${getGistId()}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, remote: true };
    } catch (err) {
      console.warn("Gist push failed, saved locally only:", err);
      return { ok: false, remote: false, error: err };
    }
  }

  return {
    isConfigured,
    setCredentials,
    clearCredentials,
    testConnection,
    loadLocal,
    saveLocal,
    pull,
    push,
    GIST_FILENAME
  };
})();
