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
    title: "Hard stop activated",
    text: "Scrolling is paused briefly so your attention can reset.",
  },
];

let settings = {
  enabled: true,
  gentleSeconds: 10,
  strongSeconds: 20,
  hardStopSeconds: 30,
  cooldownSeconds: 20,
  allowDomains: [],
  blockDomains: [],
};

let sessionId = "";
let lastScrollAt = 0;
let liveActiveSeconds = 0;
let pendingActiveSeconds = 0;
let pendingScrollEvents = 0;
let cooldownSecondsLeft = 0;
const triggered = new Set();

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

  return host === cleanRule || host.endsWith(`.${cleanRule}`);
};

const shouldRunOnHost = (host) => {
  const normalizedHost = host.toLowerCase();
  const allowDomains = Array.isArray(settings.allowDomains) ? settings.allowDomains : [];
  const blockDomains = Array.isArray(settings.blockDomains) ? settings.blockDomains : [];

  if (blockDomains.some((rule) => hostMatchesRule(normalizedHost, rule))) {
    return false;
  }

  if (allowDomains.length === 0) {
    return true;
  }

  return allowDomains.some((rule) => hostMatchesRule(normalizedHost, rule));
};

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

const updateBlocker = () => {
  let blocker = document.getElementById("scrollsense-blocker");

  if (cooldownSecondsLeft <= 0) {
    if (blocker) {
      blocker.remove();
    }
    return;
  }

  if (!blocker) {
    blocker = document.createElement("section");
    blocker.id = "scrollsense-blocker";

    const card = document.createElement("div");
    card.id = "scrollsense-blocker-card";

    const heading = document.createElement("h3");
    heading.textContent = "Hard stop active";

    const text = document.createElement("p");
    text.id = "scrollsense-blocker-text";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Unlock now";
    button.addEventListener("click", () => {
      cooldownSecondsLeft = 0;
      updateBlocker();
    });

    card.append(heading, text, button);
    blocker.appendChild(card);
    document.documentElement.appendChild(blocker);
  }

  const text = document.getElementById("scrollsense-blocker-text");
  if (text) {
    text.textContent = `Take a short reset. You can scroll again in ${cooldownSecondsLeft}s.`;
  }
};

const onActivity = () => {
  if (!settings.enabled || cooldownSecondsLeft > 0) {
    return;
  }

  lastScrollAt = Date.now();
  pendingScrollEvents += 1;
};

const maybeTriggerNudges = async () => {
  const steps = getThresholds();

  for (const step of steps) {
    if (liveActiveSeconds >= step.seconds && !triggered.has(step.level)) {
      triggered.add(step.level);
      await showNudge(step);

      if (step.level === "hard-stop") {
        cooldownSecondsLeft = settings.cooldownSeconds;
        updateBlocker();
      }
    }
  }
};

const startLoops = () => {
  setInterval(async () => {
    if (!settings.enabled) {
      return;
    }

    if (Date.now() - lastScrollAt < 2000 && cooldownSecondsLeft <= 0) {
      liveActiveSeconds += 1;
      pendingActiveSeconds += 1;
      await maybeTriggerNudges();
    }

    if (cooldownSecondsLeft > 0) {
      cooldownSecondsLeft -= 1;
      updateBlocker();
    }
  }, 1000);

  setInterval(async () => {
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
};

const initialize = async () => {
  const settingsResponse = await sendMessage({ type: "GET_SETTINGS" });
  if (settingsResponse?.ok && settingsResponse.settings) {
    settings = settingsResponse.settings;
  }

  if (!settings.enabled) {
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

  window.addEventListener("scroll", onActivity, { passive: true });
  window.addEventListener("wheel", onActivity, { passive: true });
  window.addEventListener("touchmove", onActivity, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      endSession("visibility_hidden");
    }
  });

  window.addEventListener("beforeunload", () => {
    endSession("beforeunload");
  });

  startLoops();
};

initialize();
