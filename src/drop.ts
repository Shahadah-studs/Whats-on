import Peer, { DataConnection } from "peerjs";

const CHUNK_SIZE = 64 * 1024; // 64 KB per WebRTC chunk
const dropId = "drop-" + Math.floor(1000 + Math.random() * 9000);
const peer = new Peer(dropId);

let activeConn: DataConnection | null = null;

// Incoming chunk reassembly state
let incomingMeta: { name: string; size: number; mime: string } | null = null;
let incomingChunks: ArrayBuffer[] = [];
let receivedBytes = 0;

// DOM Elements
const myIdInput = document.getElementById("drop-my-id") as HTMLInputElement;
const copyBtn = document.getElementById("drop-copy-btn") as HTMLButtonElement;
const statusPill = document.getElementById("drop-status") as HTMLElement;
const peerInput = document.getElementById("drop-peer-input") as HTMLInputElement;
const connectBtn = document.getElementById("drop-connect-btn") as HTMLButtonElement;
const connLabel = document.getElementById("drop-conn-label") as HTMLElement;

const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const fileInput = document.getElementById("drop-file-input") as HTMLInputElement;
const progressBox = document.getElementById("progress-box") as HTMLDivElement;
const progressName = document.getElementById("progress-file-name") as HTMLSpanElement;
const progressPercent = document.getElementById("progress-percent") as HTMLSpanElement;
const progressFill = document.getElementById("progress-fill") as HTMLDivElement;
const receivedList = document.getElementById("received-list") as HTMLUListElement;

peer.on("open", (id) => {
  myIdInput.value = id;
  statusPill.textContent = "Ready to Drop";
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(myIdInput.value);
  copyBtn.textContent = "Copied!";
  setTimeout(() => {
    copyBtn.textContent = "Copy";
  }, 1500);
});

connectBtn.addEventListener("click", () => {
  const target = peerInput.value.trim().toLowerCase();
  if (!target) return;
  const conn = peer.connect(target, { reliable: true });
  setupConnection(conn);
});

peer.on("connection", (conn) => {
  setupConnection(conn);
});

function setupConnection(conn: DataConnection) {
  activeConn = conn;
  connLabel.textContent = "Connecting to " + conn.peer + "...";

  conn.on("open", () => {
    connLabel.textContent = "Connected to " + conn.peer;
    dropZone.classList.remove("disabled");
  });

  conn.on("data", (raw) => {
    if (typeof raw === "object" && raw !== null && "dropType" in raw) {
      const msg = raw as Record<string, unknown>;
      if (msg.dropType === "meta") {
        incomingMeta = {
          name: String(msg.name || "file"),
          size: Number(msg.size || 0),
          mime: String(msg.mime || "application/octet-stream")
        };
        incomingChunks = [];
        receivedBytes = 0;
        showProgress("Receiving: " + incomingMeta.name, 0);
      } else if (msg.dropType === "done" && incomingMeta) {
        const blob = new Blob(incomingChunks, { type: incomingMeta.mime });
        const url = URL.createObjectURL(blob);
        addDownloadRow(incomingMeta.name, incomingMeta.size, url);
        showProgress("Completed: " + incomingMeta.name, 100);
        incomingMeta = null;
        incomingChunks = [];
      }
      return;
    }

    if (raw instanceof ArrayBuffer && incomingMeta) {
      incomingChunks.push(raw);
      receivedBytes += raw.byteLength;
      const pct =
        incomingMeta.size > 0
          ? Math.min(100, Math.round((receivedBytes / incomingMeta.size) * 100))
          : 100;
      showProgress("Receiving: " + incomingMeta.name, pct);
    }
  });

  conn.on("close", () => {
    connLabel.textContent = "Disconnected";
    dropZone.classList.add("disabled");
    activeConn = null;
  });
}

// Drag & Drop + File Picker Handlers
dropZone.addEventListener("click", () => {
  if (!activeConn || !activeConn.open) return;
  fileInput.click();
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (activeConn && activeConn.open) {
    dropZone.classList.add("dragover");
  }
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (!activeConn || !activeConn.open) return;
  const files = e.dataTransfer ? e.dataTransfer.files : null;
  if (files && files[0]) {
    sendLargeFile(files[0]);
  }
});

fileInput.addEventListener("change", () => {
  const files = fileInput.files;
  if (files && files[0] && activeConn && activeConn.open) {
    sendLargeFile(files[0]);
  }
  fileInput.value = "";
});

async function sendLargeFile(file: File) {
  if (!activeConn || !activeConn.open) return;

  activeConn.send({
    dropType: "meta",
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream"
  });

  showProgress("Sending: " + file.name, 0);

  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    activeConn.send(buffer);
    offset += buffer.byteLength;

    const pct = Math.min(100, Math.round((offset / file.size) * 100));
    showProgress("Sending: " + file.name, pct);

    // Yield briefly so browser UI stays smooth on huge files
    await new Promise((r) => setTimeout(r, 5));
  }

  activeConn.send({ dropType: "done" });
  showProgress("Sent: " + file.name, 100);
}

function showProgress(label: string, percent: number) {
  progressBox.classList.remove("hidden");
  progressName.textContent = label;
  progressPercent.textContent = percent + "%";
  progressFill.style.width = percent + "%";
}

function addDownloadRow(name: string, bytes: number, url: string) {
  const empty = receivedList.querySelector(".empty-msg");
  if (empty) empty.remove();

  const li = document.createElement("li");
  li.className = "received-item";

  const info = document.createElement("div");
  const sizeMb = (bytes / (1024 * 1024)).toFixed(2);
  info.textContent = "📄 " + name + " (" + sizeMb + " MB)";

  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.className = "download-link";
  link.textContent = "Download";

  li.appendChild(info);
  li.appendChild(link);
  receivedList.appendChild(li);
}
