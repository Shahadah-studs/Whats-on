import Peer, { DataConnection, MediaConnection } from "peerjs";

interface ChatMessage {
  sender: "sent" | "received";
  text: string;
  timestamp: string;
}

const STORAGE_USER_KEY = "whatson_username";
const STORAGE_CHATS_KEY = "whatson_dm_history";

let peer: Peer | null = null;
let myUsername = localStorage.getItem(STORAGE_USER_KEY) || "";
let currentChatPeer: string | null = null;
let activeConn: DataConnection | null = null;
let activeCall: MediaConnection | null = null;
let localStream: MediaStream | null = null;

let dmHistory: Record<string, ChatMessage[]> = JSON.parse(
  localStorage.getItem(STORAGE_CHATS_KEY) || "{}"
);

const usernameInput = document.getElementById("username-input") as HTMLInputElement;
const saveUserBtn = document.getElementById("save-user-btn") as HTMLButtonElement;
const myStatusBadge = document.getElementById("my-status-badge") as HTMLElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const peerIdInput = document.getElementById("peer-id-input") as HTMLInputElement;
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const contactList = document.getElementById("contact-list") as HTMLUListElement;

const activePeerName = document.getElementById("active-peer-name") as HTMLHeadingElement;
const activePeerStatus = document.getElementById("active-peer-status") as HTMLElement;
const reconnectBtn = document.getElementById("reconnect-btn") as HTMLButtonElement;
const messagesDiv = document.getElementById("messages") as HTMLDivElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const messageInput = document.getElementById("message-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const videoCallBtn = document.getElementById("video-call-btn") as HTMLButtonElement;
const videoGrid = document.getElementById("video-grid") as HTMLDivElement;
const localVideo = document.getElementById("local-video") as HTMLVideoElement;
const remoteVideo = document.getElementById("remote-video") as HTMLVideoElement;
const endCallBtn = document.getElementById("end-call-btn") as HTMLButtonElement;

function sanitizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function initPeer(requestedId: string) {
  const cleanId = sanitizeUsername(requestedId);
  if (!cleanId) {
    alert("Please enter a valid username (letters, numbers, hyphens).");
    return;
  }

  if (peer) {
    peer.destroy();
  }

  myStatusBadge.textContent = "Checking ID...";
  myStatusBadge.className = "badge offline";

  const newPeer = new Peer(cleanId);

  newPeer.on("open", (id) => {
    peer = newPeer;
    myUsername = id;
    usernameInput.value = id;
    localStorage.setItem(STORAGE_USER_KEY, id);
    myStatusBadge.textContent = "Online";
    myStatusBadge.className = "badge online";
  });

  newPeer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      alert('The username "' + cleanId + '" is currently taken! Please choose another one.');
      myStatusBadge.textContent = "ID Taken";
      myStatusBadge.className = "badge offline";
      usernameInput.focus();
    } else if (err.type === "peer-unavailable") {
      activePeerStatus.textContent = "User is offline right now";
      reconnectBtn.classList.remove("hidden");
    } else {
      console.error("PeerJS Error:", err);
    }
  });

  newPeer.on("connection", (conn) => {
    ensureContactExists(conn.peer);
    setupDataConnection(conn);
  });

  newPeer.on("call", async (call) => {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    videoGrid.classList.remove("hidden");
    call.answer(localStream);
    handleCallStream(call);
  });
}

saveUserBtn.addEventListener("click", () => {
  initPeer(usernameInput.value);
});

copyBtn.addEventListener("click", () => {
  if (!myUsername) return;
  navigator.clipboard.writeText(myUsername);
  copyBtn.textContent = "Copied!";
  setTimeout(() => {
    copyBtn.textContent = "Copy ID";
  }, 1500);
});

connectBtn.addEventListener("click", () => {
  const targetId = sanitizeUsername(peerIdInput.value);
  if (!targetId || !peer) return;
  if (targetId === myUsername) {
    alert("You cannot DM yourself!");
    return;
  }
  peerIdInput.value = "";
  openChatWithPeer(targetId);
});

reconnectBtn.addEventListener("click", () => {
  if (currentChatPeer) {
    openChatWithPeer(currentChatPeer);
  }
});

function openChatWithPeer(targetId: string) {
  currentChatPeer = targetId;
  ensureContactExists(targetId);
  renderContactList();
  renderChatHistory(targetId);

  activePeerName.textContent = targetId;
  activePeerStatus.textContent = "Connecting...";
  reconnectBtn.classList.add("hidden");

  if (!peer) return;
  const conn = peer.connect(targetId);
  setupDataConnection(conn);
}

function setupDataConnection(conn: DataConnection) {
  if (!currentChatPeer) {
    currentChatPeer = conn.peer;
  }

  conn.on("open", () => {
    if (currentChatPeer === conn.peer) {
      activeConn = conn;
      activePeerName.textContent = conn.peer;
      activePeerStatus.textContent = "Online (P2P Connected)";
      messageInput.disabled = false;
      sendBtn.disabled = false;
      videoCallBtn.disabled = false;
      reconnectBtn.classList.add("hidden");
    }
  });

  conn.on("data", (data) => {
    const text = String(data);
    saveMessage(conn.peer, "received", text);
    if (currentChatPeer === conn.peer) {
      appendMessageBubble("received", text, getTimeNow());
    }
    renderContactList();
  });

  conn.on("close", () => {
    if (currentChatPeer === conn.peer) {
      activePeerStatus.textContent = "Disconnected";
      messageInput.disabled = true;
      sendBtn.disabled = true;
      videoCallBtn.disabled = true;
      reconnectBtn.classList.remove("hidden");
    }
  });
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeConn || !currentChatPeer) return;

  activeConn.send(text);
  saveMessage(currentChatPeer, "sent", text);
  appendMessageBubble("sent", text, getTimeNow());
  renderContactList();
  messageInput.value = "";
});

function ensureContactExists(peerId: string) {
  if (!dmHistory[peerId]) {
    dmHistory[peerId] = [];
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(dmHistory));
  }
}

function saveMessage(peerId: string, sender: "sent" | "received", text: string) {
  ensureContactExists(peerId);
  dmHistory[peerId].push({ sender: sender, text: text, timestamp: getTimeNow() });
  localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(dmHistory));
}

function renderChatHistory(peerId: string) {
  messagesDiv.innerHTML = "";
  const history = dmHistory[peerId] || [];
  if (history.length === 0) {
    messagesDiv.innerHTML =
      '<div class="welcome-note">Start of your encrypted DM with <strong>' +
      escapeHtml(peerId) +
      "</strong></div>";
    return;
  }
  history.forEach((msg) => appendMessageBubble(msg.sender, msg.text, msg.timestamp));
}

function appendMessageBubble(sender: "sent" | "received", text: string, time: string) {
  const welcome = messagesDiv.querySelector(".welcome-note");
  if (welcome) welcome.remove();

  const bubble = document.createElement("div");
  bubble.className = "msg " + sender;
  bubble.innerHTML =
    "<span>" + escapeHtml(text) + '</span><span class="msg-time">' + time + "</span>";
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderContactList() {
  contactList.innerHTML = "";
  Object.keys(dmHistory).forEach((peerId) => {
    const msgs = dmHistory[peerId];
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1].text : "No messages yet";

    const li = document.createElement("li");
    li.className = "contact-item" + (currentChatPeer === peerId ? " active" : "");
    li.innerHTML =
      '<div><div class="contact-name">🌊 ' +
      escapeHtml(peerId) +
      '</div><div class="contact-preview">' +
      escapeHtml(lastMsg) +
      "</div></div>";
    li.addEventListener("click", () => openChatWithPeer(peerId));
    contactList.appendChild(li);
  });
}

function getTimeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

videoCallBtn.addEventListener("click", async () => {
  if (!activeConn || !peer) return;
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  videoGrid.classList.remove("hidden");

  const call = peer.call(activeConn.peer, localStream);
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

renderContactList();
if (myUsername) {
  usernameInput.value = myUsername;
  initPeer(myUsername);
} else {
  const starterName = "wave-" + Math.floor(1000 + Math.random() * 9000);
  usernameInput.value = starterName;
  initPeer(starterName);
}
