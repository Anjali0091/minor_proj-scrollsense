const status = document.getElementById("status");
const syncButton = document.getElementById("syncButton");
const deactivateButton = document.getElementById("deactivateButton");
const openAppButton = document.getElementById("openAppButton");
const toast = document.getElementById("toast");

const DEFAULT_API_BASE = "http://localhost:5000";
const LAST_SYNC_KEY = "lastSeenSetupUpdatedAt";

let toastTimer;

const setStatusText = (message) => {
  if (status) {
    status.textContent = message;
  }
};

const getApiBase = async () => {
  const data = await chrome.storage.sync.get(["apiBase"]);
  return data.apiBase || DEFAULT_API_BASE;
};

const syncFromBackend = async () => {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/extension/setup`);

  if (!response.ok) {
    throw new Error("Could not reach backend setup endpoint");
  }

  const payload = await response.json();
  if (!payload?.config) {
    throw new Error("No setup found yet");
  }

  await chrome.storage.sync.set(payload.config);
  return payload;
};

const deactivateFromBackend = async () => {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/extension/deactivate`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Could not deactivate from backend");
  }

  const payload = await response.json();
  if (!payload?.config) {
    throw new Error("No setup found to deactivate");
  }

  await chrome.storage.sync.set(payload.config);
  return payload;
};

const showToast = (message) => {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
};

const rememberSyncVersion = async (updatedAt) => {
  if (!updatedAt) {
    return;
  }

  await chrome.storage.local.set({ [LAST_SYNC_KEY]: updatedAt });
};

const getRememberedSyncVersion = async () => {
  const data = await chrome.storage.local.get([LAST_SYNC_KEY]);
  return data[LAST_SYNC_KEY] || "";
};

const loadState = async () => {
  const values = await chrome.storage.sync.get([
    "setupComplete",
    "isLoggedIn",
    "loginEmail",
    "fullName",
    "blockDomains",
  ]);

  if (values.setupComplete && values.isLoggedIn) {
    setStatusText(`Active for ${values.loginEmail || "user"}. Profile: ${values.fullName || "n/a"}.`);
    return;
  }

  setStatusText("Not activated yet. Use the frontend app and click Activate Protection.");
};

if (syncButton) {
  syncButton.addEventListener("click", async () => {
    try {
      setStatusText("Syncing from backend...");
      const payload = await syncFromBackend();
      await rememberSyncVersion(payload.updatedAt);
      if (payload.activated) {
        setStatusText(`Synced successfully. Updated at ${new Date(payload.updatedAt).toLocaleString()}.`);
        showToast("Activation successful. Latest setup synced.");
      } else {
        setStatusText(`Protection is deactivated. Updated at ${new Date(payload.updatedAt).toLocaleString()}.`);
        showToast("Protection deactivated.");
      }
    } catch (error) {
      setStatusText(`Sync failed: ${error.message}`);
    }
  });
}

if (deactivateButton) {
  deactivateButton.addEventListener("click", async () => {
    try {
      setStatusText("Deactivating...");
      const payload = await deactivateFromBackend();
      await rememberSyncVersion(payload.updatedAt);
      await loadState();
      setStatusText("Protection deactivated. You can reactivate from the web app anytime.");
      showToast("Protection deactivated.");
    } catch (error) {
      setStatusText(`Deactivation failed: ${error.message}`);
    }
  });
}

if (openAppButton) {
  openAppButton.addEventListener("click", async () => {
    const apiBase = await getApiBase();
    const frontendBase = apiBase.replace(":5000", ":5173");
    chrome.tabs.create({ url: frontendBase });
  });
}

const bootstrap = async () => {
  await loadState();

  try {
    const previousVersion = await getRememberedSyncVersion();
    const payload = await syncFromBackend();

    if (payload.updatedAt && payload.updatedAt !== previousVersion) {
      await rememberSyncVersion(payload.updatedAt);
      if (payload.activated) {
        setStatusText(`Synced successfully. Updated at ${new Date(payload.updatedAt).toLocaleString()}.`);
        showToast("Activation successful. New setup detected.");
      } else {
        setStatusText(`Protection is deactivated. Updated at ${new Date(payload.updatedAt).toLocaleString()}.`);
        showToast("Protection deactivated.");
      }
    }
  } catch (_error) {
    // Keep options page usable even when backend is offline.
  }
};

bootstrap();
