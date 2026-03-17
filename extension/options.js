const defaults = {
  enabled: true,
  apiBase: "http://localhost:5000",
  gentleSeconds: 10,
  strongSeconds: 20,
  hardStopSeconds: 30,
  cooldownSeconds: 20,
  allowDomains: [],
  blockDomains: [],
};

const form = document.getElementById("settings-form");
const status = document.getElementById("status");

const fields = {
  enabled: document.getElementById("enabled"),
  apiBase: document.getElementById("apiBase"),
  gentleSeconds: document.getElementById("gentleSeconds"),
  strongSeconds: document.getElementById("strongSeconds"),
  hardStopSeconds: document.getElementById("hardStopSeconds"),
  cooldownSeconds: document.getElementById("cooldownSeconds"),
  allowDomains: document.getElementById("allowDomains"),
  blockDomains: document.getElementById("blockDomains"),
};

const parseDomainList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

const load = async () => {
  const data = await chrome.storage.sync.get(Object.keys(defaults));
  const values = { ...defaults, ...data };

  fields.enabled.checked = values.enabled;
  fields.apiBase.value = values.apiBase;
  fields.gentleSeconds.value = values.gentleSeconds;
  fields.strongSeconds.value = values.strongSeconds;
  fields.hardStopSeconds.value = values.hardStopSeconds;
  fields.cooldownSeconds.value = values.cooldownSeconds;
  fields.allowDomains.value = values.allowDomains.join(", ");
  fields.blockDomains.value = values.blockDomains.join(", ");
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    enabled: fields.enabled.checked,
    apiBase: fields.apiBase.value.trim() || defaults.apiBase,
    gentleSeconds: Number(fields.gentleSeconds.value || defaults.gentleSeconds),
    strongSeconds: Number(fields.strongSeconds.value || defaults.strongSeconds),
    hardStopSeconds: Number(fields.hardStopSeconds.value || defaults.hardStopSeconds),
    cooldownSeconds: Number(fields.cooldownSeconds.value || defaults.cooldownSeconds),
    allowDomains: parseDomainList(fields.allowDomains.value),
    blockDomains: parseDomainList(fields.blockDomains.value),
  };

  await chrome.storage.sync.set(payload);
  status.textContent = "Saved. Reload distracting tabs to apply new settings.";
});

load();
