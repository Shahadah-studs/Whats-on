import Peer, { DataConnection, MediaConnection } from "peerjs";

// Generate a clean ocean-themed ID
const randomNum = Math.floor(1000 + Math.random() * 9000);
const customId = `whatson-wave-${randomNum}`;

const peer = new Peer(customId);
let activeConn: DataConnection | null = null;
let activeCall: MediaConnection | null = null;
let localStream: MediaStream | null = null;

// DOM Elements
const myIdInput = document.getElementById("my-id") as HTMLInputElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const peerIdInput = document.getElementById("peer-id-input") as HTMLInputElement;
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const statusText = document.getElementById("status-text") as HTMLDivElement;
const activePeerName = document.getElementById("active-peer-name") as HTMLHeadingElement;
const activePeerStatus = document.getElementById("active-peer-status") as HTMLElement;
const messagesDiv = document.getElementById("messages") as HTMLDivElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const messageInput = document.getElementById("message-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const videoCallBtn = document.getElementById("video-call-btn") as HTMLButtonElement;
const videoGrid = document.getElementById("video-grid") as HTMLDivElement;
const localVideo = document.getElementById("local-video") as HTMLVideoElement;
const remoteVideo = document.getElementById("remote-video") as HTMLVideoElement;
const endCallBtn = document.getElementById("end-call-btn") as HTMLButtonElement;

// 1. Initialize Peer
peer.on("open", (id) => {
  myIdInput.value = id;
  statusText.textContent = "Ready to connect";
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(myIdInput.value);
  copyBtn.textContent = "Copied!";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
});

// 2. Handle Outgoing Connection
connectBtn.addEventListener("click", () => {
  const targetId = peerIdInput.value.trim();
  if (!targetId) return;
  const conn = peer.connect(targetId);
  setupDataConnection(conn);
});

// 3. Handle Incoming Connection
peer.on("connection", (conn) => {
  setupDataConnection(conn);
});

function setupDataConnection(conn: DataConnection) {
  activeConn = conn;

  conn.on("open", () => {
    activePeerName.textContent = conn.peer;
    activePeerStatus.textContent = "Connected (P2P)";
    statusText.textContent = `Connected to ${conn.peer}`;
    messageInput.disabled = false;
    sendBtn.disabled = false;
    videoCallBtn.disabled = false;
    messagesDiv.innerHTML = "";
  });

  conn.on("data", (data) => {
    appendMessage(String(data), "received");
  });

  conn.on("close", () => {
    activePeerStatus.textContent = "Disconnected";
    messageInput.disabled = true;
    sendBtn.disabled = true;
    videoCallBtn.disabled = true;
  });
}

// 4. Send & Render Messages
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeConn) return;

  activeConn.send(text);
  appendMessage(text, "sent");
  messageInput.value = "";
});

function appendMessage(text: string, type: "sent" | "received") {
  const bubble = document.createElement("div");
  bubble.className = `msg ${type}`;
  bubble.textContent = text;
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 5. Video Calling
videoCallBtn.addEventListener("click", async () => {
  if (!activeConn) return;
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  videoGrid.classList.remove("hidden");

  const call = peer.call(activeConn.peer, localStream);
  handleCallStream(call);
});

peer.on("call", async (call) => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  videoGrid.classList.remove("hidden");

  call.answer(localStream);
  handleCallStream(call);
});

function handleCallStream(call: MediaConnection) {
  activeCall = call;
  call.on("stream", (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
  });
  call.on("close", stopCall);
}

endCallBtn.addEventListener("click", stopCall);

function stopCall() {
  activeCall?.close();
  localStream?.getTracks().forEach((track) => track.stop());
  videoGrid.classList.add("hidden");
}
