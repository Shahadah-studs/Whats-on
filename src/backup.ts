const STORAGE_USER_KEY = "whatson_username";
const STORAGE_CHATS_KEY = "whatson_dm_history";
const STORAGE_SOUND_KEY = "whatson_sound_enabled";

interface BackupPayload {
  app: string;
  exportedAt: string;
  username: string;
  soundEnabled: boolean;
  dmHistory: Record<string, unknown[]>;
}

const statUsername = document.getElementById("stat-username") as HTMLElement;
const statContacts = document.getElementById("stat-contacts") as HTMLElement;
const statMessages = document.getElementById("stat-messages") as HTMLElement;

const exportJsonBtn = document.getElementById("export-json-btn") as HTMLButtonElement;
const importFileInput = document.getElementById("import-file-input") as HTMLInputElement;
const importMergeBtn = document.getElementById("import-merge-btn") as HTMLButtonElement;
const importReplaceBtn = document.getElementById("import-replace-btn") as HTMLButtonElement;
const wipeAllBtn = document.getElementById("wipe-all-btn") as HTMLButtonElement;
const vaultToast = document.getElementById("vault-toast") as HTMLDivElement;

let importMode: "merge" | "replace" = "merge";

function loadCurrentHistory(): Record<string, unknown[]> {
  try {
    const raw = localStorage.getItem(STORAGE_CHATS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown[]>) : {};
  } catch (e) {
    return {};
  }
}

function refreshStats() {
  const user = localStorage.getItem(STORAGE_USER_KEY) || "Not claimed yet";
  const history = loadCurrentHistory();
  const peers = Object.keys(history);
  let totalMsgs = 0;

  peers.forEach((p) => {
    if (Array.isArray(history[p])) {
      totalMsgs += history[p].length;
    }
  });

  statUsername.textContent = user;
  statContacts.textContent = String(peers.length);
  statMessages.textContent = String(totalMsgs);
}

function showToast(message: string) {
  vaultToast.textContent = message;
  vaultToast.classList.remove("hidden");
  setTimeout(() => {
    vaultToast.classList.add("hidden");
  }, 4000);
}

// Export JSON File
exportJsonBtn.addEventListener("click", () => {
  const payload: BackupPayload = {
    app: "What'sOn",
    exportedAt: new Date().toISOString(),
    username: localStorage.getItem(STORAGE_USER_KEY) || "",
    soundEnabled: localStorage.getItem(STORAGE_SOUND_KEY) !== "false",
    dmHistory: loadCurrentHistory()
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const dateTag = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = "whatson-backup-" + dateTag + ".json";
  a.click();
  URL.revokeObjectURL(url);

  showToast("✅ Backup downloaded! Keep this file safe.");
});

// Trigger Import File Picker
importMergeBtn.addEventListener("click", () => {
  importMode = "merge";
  importFileInput.click();
});

importReplaceBtn.addEventListener("click", () => {
  if (!confirm("Replace ALL current chats and username with this backup file?")) return;
  importMode = "replace";
  importFileInput.click();
});

importFileInput.addEventListener("change", () => {
  const file = importFileInput.files ? importFileInput.files.item(0) : null;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as Partial<BackupPayload>;
      if (!parsed || parsed.app !== "What'sOn" || typeof parsed.dmHistory !== "object") {
        alert("Invalid What'sOn backup file.");
        return;
      }

      if (importMode === "replace") {
        if (parsed.username) {
          localStorage.setItem(STORAGE_USER_KEY, String(parsed.username));
        }
        localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(parsed.dmHistory || {}));
        showToast("✅ Full backup restored! Return to Messenger to see your chats.");
      } else {
        const existing = loadCurrentHistory();
        const incoming = parsed.dmHistory || {};

        Object.keys(incoming).forEach((peerId) => {
          const oldList = Array.isArray(existing[peerId]) ? existing[peerId] : [];
          const newList = Array.isArray(incoming[peerId]) ? incoming[peerId] : [];

          const seenIds = new Set<string>();
          oldList.forEach((m) => {
            if (m && typeof m === "object" && "id" in m) {
              seenIds.add(String((m as { id: string }).id));
            }
          });

          const merged = oldList.slice();
          newList.forEach((m) => {
            const msgId =
              m && typeof m === "object" && "id" in m ? String((m as { id: string }).id) : "";
            if (!msgId || !seenIds.has(msgId)) {
              merged.push(m);
            }
          });

          existing[peerId] = merged;
        });

        if (!localStorage.getItem(STORAGE_USER_KEY) && parsed.username) {
          localStorage.setItem(STORAGE_USER_KEY, String(parsed.username));
        }

        localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(existing));
        showToast("✅ Backup merged cleanly with your existing DMs!");
      }

      refreshStats();
    } catch (err) {
      alert("Could not read JSON file. Make sure it is a valid What'sOn backup.");
    }
  };
  reader.readAsText(file);
  importFileInput.value = "";
});

// Wipe All Data
wipeAllBtn.addEventListener("click", () => {
  if (!confirm("Are you sure? This will delete your username and ALL Saved DMs permanently.")) {
    return;
  }
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_CHATS_KEY);
  refreshStats();
  showToast("🗑️ All local What'sOn data wiped.");
});

refreshStats();
