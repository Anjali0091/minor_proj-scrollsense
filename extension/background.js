const DEFAULT_API_BASE = "http://localhost:5000";
const sessionByTab = new Map();

const getApiBase = async () => {
  const data = await chrome.storage.sync.get(["apiBase"]);
  return data.apiBase || DEFAULT_API_BASE;
};

const postJson = async (path, body) => {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  (async () => {
    try {
      if (message.type === "START_SESSION") {
        const session = await postJson("/api/focus/session/start", {
          source: message.source || "extension_feed",
        });

        if (typeof tabId === "number") {
          sessionByTab.set(tabId, session.id);
        }

        sendResponse({ ok: true, sessionId: session.id });
        return;
      }

      if (message.type === "PING_SESSION") {
        const sessionId = message.sessionId || sessionByTab.get(tabId);
        if (!sessionId) {
          sendResponse({ ok: false });
          return;
        }

        await postJson("/api/focus/session/ping", {
          sessionId,
          activeSeconds: message.activeSeconds || 0,
          scrollEvents: message.scrollEvents || 0,
        });

        sendResponse({ ok: true });
        return;
      }

      if (message.type === "RECORD_NUDGE") {
        const sessionId = message.sessionId || sessionByTab.get(tabId);
        if (!sessionId) {
          sendResponse({ ok: false });
          return;
        }

        await postJson("/api/focus/nudge", {
          sessionId,
          level: message.level,
          message: message.text,
          elapsedSeconds: message.elapsedSeconds || 0,
          accepted: Boolean(message.accepted),
        });

        sendResponse({ ok: true });
        return;
      }

      if (message.type === "END_SESSION") {
        const sessionId = message.sessionId || sessionByTab.get(tabId);
        if (!sessionId) {
          sendResponse({ ok: false });
          return;
        }

        await postJson("/api/focus/session/end", {
          sessionId,
          endReason: message.reason || "tab_leave",
        });

        if (typeof tabId === "number") {
          sessionByTab.delete(tabId);
        }

        sendResponse({ ok: true });
        return;
      }

      if (message.type === "GET_SETTINGS") {
        const data = await chrome.storage.sync.get([
          "gentleSeconds",
          "strongSeconds",
          "hardStopSeconds",
          "cooldownSeconds",
          "apiBase",
          "enabled",
          "allowDomains",
          "blockDomains",
        ]);

        sendResponse({
          ok: true,
          settings: {
            gentleSeconds: Number(data.gentleSeconds || 10),
            strongSeconds: Number(data.strongSeconds || 20),
            hardStopSeconds: Number(data.hardStopSeconds || 30),
            cooldownSeconds: Number(data.cooldownSeconds || 20),
            apiBase: data.apiBase || DEFAULT_API_BASE,
            enabled: data.enabled !== false,
            allowDomains: Array.isArray(data.allowDomains) ? data.allowDomains : [],
            blockDomains: Array.isArray(data.blockDomains) ? data.blockDomains : [],
          },
        });
        return;
      }

      sendResponse({ ok: false });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sessionByTab.delete(tabId);
});
