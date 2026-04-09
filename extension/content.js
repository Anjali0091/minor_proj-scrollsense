const STEPS_TEMPLATE = [
  {
    level: "gentle",
    title: "Quick check-in",
    text: "You have been scrolling continuously. Switch to one intentional action.",
  },
  {
    level: "strong",
    title: "Refocus alert",
    text: "This looks like a doomscroll streak. Pause and choose your next step consciously.",
  },
  {
    level: "hard-stop",
    title: "Strong reflection nudge",
    text: "Long scrolling streak detected. Take a short pause and intentionally return.",
  },
];

const REOPEN_WINDOW_MS = 30 * 60 * 1000;
const REOPEN_THRESHOLD = 3;
const LATE_NIGHT_START_HOUR = 23;
const LATE_NIGHT_END_HOUR = 6;
const ACTIVITY_GRACE_MS = 7000;

let settings = {
  enabled: true,
  setupComplete: false,
  isLoggedIn: false,
  fullName: "",
  focusReason: "",
  gentleSeconds: 10,
  strongSeconds: 20,
  hardStopSeconds: 30,
  cooldownSeconds: 20,
  allowDomains: [],
  blockDomains: [],
};

let sessionId = "";
let lastActivityAt = 0;
let liveActiveSeconds = 0;
let pendingActiveSeconds = 0;
let pendingScrollEvents = 0;
const triggered = new Set();
let hasActivityListeners = false;

const sendMessage = (payload) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false });
        return;
      }
      resolve(response || { ok: false });
    });
  });

const getThresholds = () => [
  { ...STEPS_TEMPLATE[0], seconds: settings.gentleSeconds },
  { ...STEPS_TEMPLATE[1], seconds: settings.strongSeconds },
  { ...STEPS_TEMPLATE[2], seconds: settings.hardStopSeconds },
];

const hostMatchesRule = (host, rule) => {
  const cleanRule = String(rule || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");

  if (!cleanRule) {
    return false;
  }

  if (host === cleanRule || host.endsWith(`.${cleanRule}`)) {
    return true;
  }

  // Accept shorthand rules like "youtube" to reduce silent mismatches.
  if (!cleanRule.includes(".")) {
    return host === cleanRule || host.includes(`.${cleanRule}.`) || host.endsWith(`.${cleanRule}`);
  }

  // Tolerate labels like "youtube app" by extracting usable tokens.
  const tokens = cleanRule
    .split(/[^a-z0-9.-]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (token.length < 3) {
      continue;
    }

    if (host === token || host.endsWith(`.${token}`)) {
      return true;
    }

    if (!token.includes(".") && (host.includes(`.${token}.`) || host.endsWith(`.${token}`))) {
      return true;
    }
  }

  return false;
};

const shouldRunOnHost = (host) => {
  const normalizedHost = host.toLowerCase();
  const allowDomains = Array.isArray(settings.allowDomains) ? settings.allowDomains : [];

  if (allowDomains.length === 0) {
    return true;
  }

  return allowDomains.some((rule) => hostMatchesRule(normalizedHost, rule));
};

const getLocal = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, (value) => resolve(value || {}));
  });

const setLocal = (value) =>
  new Promise((resolve) => {
    chrome.storage.local.set(value, () => resolve());
  });

const removeNudge = () => {
  const existing = document.getElementById("scrollsense-nudge");
  if (existing) {
    existing.remove();
  }
};

const showNudge = async (step) => {
  removeNudge();

  const panel = document.createElement("aside");
  panel.id = "scrollsense-nudge";

  const card = document.createElement("div");
  card.id = "scrollsense-nudge-card";

  const heading = document.createElement("h3");
  heading.textContent = step.title;

  const text = document.createElement("p");
  text.textContent = step.text;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Acknowledge";
  button.addEventListener("click", async () => {
    panel.remove();
    await sendMessage({
      type: "RECORD_NUDGE",
      sessionId,
      level: step.level,
      text: `${step.text} (acknowledged)`,
      elapsedSeconds: liveActiveSeconds,
      accepted: true,
    });
  });

  card.append(heading, text, button);
  panel.appendChild(card);
  document.documentElement.appendChild(panel);

  await sendMessage({
    type: "RECORD_NUDGE",
    sessionId,
    level: step.level,
    text: step.text,
    elapsedSeconds: liveActiveSeconds,
    accepted: false,
  });
};

const onInteractionActivity = () => {
  if (!settings.enabled) {
    return;
  }

  lastActivityAt = Date.now();
};

const onScrollLikeActivity = () => {
  onInteractionActivity();
  pendingScrollEvents += 1;
};

const maybeTriggerNudges = async () => {
  const steps = getThresholds();

  for (const step of steps) {
    if (liveActiveSeconds >= step.seconds && !triggered.has(step.level)) {
      triggered.add(step.level);
      await showNudge(step);
    }
  }
};

const detectRepeatedReopen = async () => {
  const key = "scrollsenseOpenHistoryByHost";
  const data = await getLocal([key]);
  const historyByHost = data[key] || {};
  const host = location.hostname.toLowerCase();
  const now = Date.now();

  const recent = Array.isArray(historyByHost[host])
    ? historyByHost[host].filter((timestamp) => now - Number(timestamp) <= REOPEN_WINDOW_MS)
    : [];

  recent.push(now);
  historyByHost[host] = recent;
  await setLocal({ [key]: historyByHost });

  if (recent.length >= REOPEN_THRESHOLD) {
    await showNudge({
      level: "strong",
      title: "Repeated reopen pattern",
      text: `You reopened ${host} ${recent.length} times in a short period. Consider a planned break before returning.`,
    });
  }
};

const detectLateNightUsage = async () => {
  const hour = new Date().getHours();
  const isLateNight = hour >= LATE_NIGHT_START_HOUR || hour < LATE_NIGHT_END_HOUR;
  if (!isLateNight) {
    return;
  }

  const key = "scrollsenseLateNightNudges";
  const dateKey = new Date().toISOString().slice(0, 10);
  const host = location.hostname.toLowerCase();
  const stamp = `${host}:${dateKey}`;
  const data = await getLocal([key]);
  const sent = Array.isArray(data[key]) ? data[key] : [];

  if (sent.includes(stamp)) {
    return;
  }

  sent.push(stamp);
  await setLocal({ [key]: sent.slice(-200) });

  await showNudge({
    level: "gentle",
    title: "Late-night usage detected",
    text: "It is late night. A short wind-down now can protect tomorrow's focus.",
  });
};

const startLoops = () => {
  setInterval(async () => {
    try {
      if (!settings.enabled) {
        return;
      }

      if (Date.now() - lastActivityAt < ACTIVITY_GRACE_MS) {
        liveActiveSeconds += 1;
        pendingActiveSeconds += 1;
        await maybeTriggerNudges();
      }
    } catch (_error) {
      // Prevent interval exceptions from stopping future nudge checks.
    }
  }, 1000);

  setInterval(async () => {
    try {
      if (!sessionId) {
        return;
      }

      if (pendingActiveSeconds === 0 && pendingScrollEvents === 0) {
        return;
      }

      const activeSeconds = pendingActiveSeconds;
      const scrollEvents = pendingScrollEvents;
      pendingActiveSeconds = 0;
      pendingScrollEvents = 0;

      await sendMessage({
        type: "PING_SESSION",
        sessionId,
        activeSeconds,
        scrollEvents,
      });
    } catch (_error) {
      // Ignore transient ping failures and continue accumulating locally.
    }
  }, 5000);
};

const endSession = async (reason) => {
  if (!sessionId) {
    return;
  }

  await sendMessage({
    type: "END_SESSION",
    sessionId,
    reason,
  });

  sessionId = "";
  liveActiveSeconds = 0;
  pendingActiveSeconds = 0;
  pendingScrollEvents = 0;
  triggered.clear();
};

const startSessionIfNeeded = async () => {
  if (sessionId) {
    return;
  }

  if (!settings.enabled || !settings.setupComplete || !settings.isLoggedIn) {
    return;
  }

  if (!shouldRunOnHost(location.hostname)) {
    return;
  }

  const startResponse = await sendMessage({
    type: "START_SESSION",
    source: `extension:${location.hostname}`,
  });

  if (startResponse?.ok) {
    sessionId = startResponse.sessionId;
  }
};

const refreshSettingsAndSession = async () => {
  const settingsResponse = await sendMessage({ type: "GET_SETTINGS" });
  if (settingsResponse?.ok && settingsResponse.settings) {
    settings = settingsResponse.settings;
  }

  const shouldBeActive =
    settings.enabled && settings.setupComplete && settings.isLoggedIn && shouldRunOnHost(location.hostname);

  if (!shouldBeActive) {
    removeNudge();
    await endSession("settings_disabled");
    return;
  }

  await startSessionIfNeeded();
};

const initialize = async () => {
  await refreshSettingsAndSession();

  if (settings.enabled && settings.setupComplete && settings.isLoggedIn && shouldRunOnHost(location.hostname)) {
    await detectRepeatedReopen();
    await detectLateNightUsage();
  }

  if (!hasActivityListeners) {
    window.addEventListener("scroll", onScrollLikeActivity, { passive: true });
    window.addEventListener("wheel", onScrollLikeActivity, { passive: true });
    window.addEventListener("touchmove", onScrollLikeActivity, { passive: true });
    window.addEventListener("keydown", onInteractionActivity);
    window.addEventListener("mousedown", onInteractionActivity);
    window.addEventListener("pointerdown", onInteractionActivity);
    hasActivityListeners = true;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      endSession("visibility_hidden");
    }
  });

  window.addEventListener("beforeunload", () => {
    endSession("beforeunload");
  });

  startLoops();

  // Keep extension state in sync so frontend deactivation takes effect in open tabs.
  setInterval(async () => {
    try {
      await refreshSettingsAndSession();
    } catch (_error) {
      // Ignore transient backend/runtime issues and retry on next cycle.
    }
  }, 5000);
};

initialize();
