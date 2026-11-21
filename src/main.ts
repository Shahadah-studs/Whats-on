import Peer, { DataConnection, MediaConnection } from "peerjs";

interface ChatMessage {
  id: string;
  sender: "sent" | "received";
  kind: "text" | "image" | "file";
  text: string;
  fileData?: string;
  fileName?: string;
  timestamp: string;
  status?: "sent" | "delivered" | "read";
}

interface WirePacket {
  type: "chat" | "file" | "typing" | "ack" | "read";
  msgId?: string;
  text?: string;
  fileData?: string;
  fileName?: string;
  mimeType?: string;
  isTyping?: boolean;
}

const STORAGE_USER_KEY = "whatson_username";
const STORAGE_CHATS_KEY = "whatson_dm_history";
const STORAGE_SOUND_KEY = "whatson_sound_enabled";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB P2P cap

let peer: Peer | null = null;
let myUsername = localStorage.getItem(STORAGE_USER_KEY) || "";
let currentChatPeer: string | null = null;
let activeConn: DataConnection | null = null;
let activeCall: MediaConnection | null = null;
let pendingIncomingCall: MediaConnection | null = null;
let localStream: MediaStream | null = null;

let isMicEnabled = true;
let isCamEnabled = true;
let isSoundEnabled = localStorage.getItem(STORAGE_SOUND_KEY) !== "false";

let typingTimeout: number | null = null;
let remoteTypingTimeout: number | null = null;

let dmHistory: Record<string, ChatMessage[]> = JSON.parse(
  localStorage.getItem(STORAGE_CHATS_KEY) || "{}"
);
let unreadCounts: Record<string, number> = {};

// Layout & Sidebar DOM
const appShell = document.getElementById("app-shell") as HTMLDivElement;
const soundToggleBtn = document.getElementById("sound-toggle-btn") as HTMLButtonElement;
const usernameInput = document.getElementById("username-input") as HTMLInputElement;
const saveUserBtn = document.getElementById("save-user-btn") as HTMLButtonElement;
const myStatusBadge = document.getElementById("my-status-badge") as HTMLElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const peerIdInput = document.getElementById("peer-id-input") as HTMLInputElement;
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const contactList = document.getElementById("contact-list") as HTMLUListElement;

// Chat Header & Body DOM
const mobileBackBtn = document.getElementById("mobile-back-btn") as HTMLButtonElement;
const activePeerName = document.getElementById("active-peer-name") as HTMLHeadingElement;
const activePeerStatus = document.getElementById("active-peer-status") as HTMLElement;
const reconnectBtn = document.getElementById("reconnect-btn") as HTMLButtonElement;
const deleteDmBtn = document.getElementById("delete-dm-btn") as HTMLButtonElement;
const messagesDiv = document.getElementById("messages") as HTMLDivElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const attachBtn = document.getElementById("attach-btn") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const messageInput = document.getElementById("message-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

// Call & Media Controls DOM
const startCamToggle = document.getElementById("start-cam-toggle") as HTMLInputElement;
const startMicToggle = document.getElementById("start-mic-toggle") as HTMLInputElement;
const videoCallBtn = document.getElementById("video-call-btn") as HTMLButtonElement;
const videoGrid = document.getElementById("video-grid") as HTMLDivElement;
const localVideo = document.getElementById("local-video") as HTMLVideoElement;
const remoteVideo = document.getElementById("remote-video") as HTMLVideoElement;
const toggleMicLiveBtn = document.getElementById("toggle-mic-live-btn") as HTMLButtonElement;
const toggleCamLiveBtn = document.getElementById("toggle-cam-live-btn") as HTMLButtonElement;
const endCallBtn = document.getElementById("end-call-btn") as HTMLButtonElement;

// Incoming Call Modal DOM
const incomingCallModal = document.getElementById("incoming-call-modal") as HTMLDivElement;
const callerNameLabel = document.getElementById("caller-name-label") as HTMLParagraphElement;
const answerCamToggle = document.getElementById("answer-cam-toggle") as HTMLInputElement;
const answerMicToggle = document.getElementById("answer-mic-toggle") as HTMLInputElement;
const acceptCallBtn = document.getElementById("accept-call-btn") as HTMLButtonElement;
const declineCallBtn = document.getElementById("decline-call-btn") as HTMLButtonElement;

function updateSoundButtonUI() {
  soundToggleBtn.textContent = isSoundEnabled ? "🔔" : "🔕";
}
updateSoundButtonUI();

soundToggleBtn.addEventListener("click", () => {
  isSoundEnabled = !isSoundEnabled;
  localStorage.setItem(STORAGE_SOUND_KEY, String(isSoundEnabled));
  updateSoundButtonUI();
});

// Synthesized water-drop ping via Web Audio API (no external audio files needed)
function playWaterPing() {
  if (!isSoundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(580, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.19);
  } catch (e) {
    // Ignore autoplay restrictions before first click
  }
}

function sanitizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function generateMsgId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
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
    renderContactList();
    setupDataConnection(conn);
  });

  newPeer.on("call", (call) => {
    if (activeCall || pendingIncomingCall) {
      call.close();
      return;
    }
    playWaterPing();
    pendingIncomingCall = call;
    callerNameLabel.textContent = call.peer + " is calling you...";
    answerCamToggle.checked = startCamToggle.checked;
    answerMicToggle.checked = startMicToggle.checked;
    incomingCallModal.classList.remove("hidden");
  });
}

// Mobile Back Button
mobileBackBtn.addEventListener("click", () => {
  appShell.classList.remove("mobile-chat-open");
});

// Incoming Call Actions
acceptCallBtn.addEventListener("click", async () => {
  if (!pendingIncomingCall) return;
  const callToAnswer = pendingIncomingCall;
  pendingIncomingCall = null;
  incomingCallModal.classList.add("hidden");

  try {
    const stream = await prepareLocalMedia(answerCamToggle.checked, answerMicToggle.checked);
    callToAnswer.answer(stream);
    handleCallStream(callToAnswer);
  } catch (err) {
    alert("Could not access camera or microphone. Check browser permissions.");
    callToAnswer.close();
  }
});

declineCallBtn.addEventListener("click", () => {
  if (pendingIncomingCall) {
    pendingIncomingCall.close();
    pendingIncomingCall = null;
  }
  incomingCallModal.classList.add("hidden");
});

videoCallBtn.addEventListener("click", async () => {
  if (!activeConn || !peer) return;
  try {
    const stream = await prepareLocalMedia(startCamToggle.checked, startMicToggle.checked);
    const call = peer.call(activeConn.peer, stream);
    handleCallStream(call);
  } catch (err) {
    alert("Could not access camera or microphone. Check browser permissions.");
  }
});

async function prepareLocalMedia(camOn: boolean, micOn: boolean): Promise<MediaStream> {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  isCamEnabled = camOn;
  isMicEnabled = micOn;

  localStream.getVideoTracks().forEach((track) => {
    track.enabled = isCamEnabled;
  });
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = isMicEnabled;
  });

  updateLiveControlButtons();
  localVideo.srcObject = localStream;
  videoGrid.classList.remove("hidden");
  return localStream;
}

toggleMicLiveBtn.addEventListener("click", () => {
  if (!localStream) return;
  isMicEnabled = !isMicEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = isMicEnabled;
  });
  updateLiveControlButtons();
});

toggleCamLiveBtn.addEventListener("click", () => {
  if (!localStream) return;
  isCamEnabled = !isCamEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = isCamEnabled;
  });
  updateLiveControlButtons();
});

function updateLiveControlButtons() {
  toggleMicLiveBtn.textContent = isMicEnabled ? "🎤 Mic On" : "🔇 Mic Off";
  toggleMicLiveBtn.className = isMicEnabled ? "control-btn" : "control-btn off";

  toggleCamLiveBtn.textContent = isCamEnabled ? "📷 Cam On" : "🚫 Cam Off";
  toggleCamLiveBtn.className = isCamEnabled ? "control-btn" : "control-btn off";
}

function handleCallStream(call: MediaConnection) {
  activeCall = call;
  call.on("stream", (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
  });
  call.on("close", stopCall);
  call.on("error", stopCall);
}

endCallBtn.addEventListener("click", stopCall);

function stopCall() {
  activeCall?.close();
  activeCall = null;
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  videoGrid.classList.add("hidden");
}

// Username & Chat Controls
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

deleteDmBtn.addEventListener("click", () => {
  if (currentChatPeer) {
    deleteDmHistory(currentChatPeer);
  }
});

function deleteDmHistory(peerId: string) {
  const confirmed = confirm('Delete your DM history with "' + peerId + '"?');
  if (!confirmed) return;

  delete dmHistory[peerId];
  delete unreadCounts[peerId];
  localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(dmHistory));

  if (currentChatPeer === peerId) {
    if (activeConn) {
      activeConn.close();
      activeConn = null;
    }
    currentChatPeer = null;
    appShell.classList.remove("mobile-chat-open");
    activePeerName.textContent = "No Active Chat";
    activePeerStatus.textContent = "Select a DM or enter a username";
    activePeerStatus.classList.remove("typing");
    messageInput.disabled = true;
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    videoCallBtn.disabled = true;
    reconnectBtn.classList.add("hidden");
    deleteDmBtn.classList.add("hidden");
    messagesDiv.innerHTML =
      '<div class="welcome-note">DM deleted. Select another contact or start a new chat!</div>';
  }

  renderContactList();
}

function openChatWithPeer(targetId: string) {
  currentChatPeer = targetId;
  unreadCounts[targetId] = 0;
  appShell.classList.add("mobile-chat-open");

  ensureContactExists(targetId);
  renderContactList();
  renderChatHistory(targetId);

  activePeerName.textContent = targetId;
  activePeerStatus.textContent = "Connecting...";
  activePeerStatus.classList.remove("typing");
  reconnectBtn.classList.add("hidden");
  deleteDmBtn.classList.remove("hidden");

  if (!peer) return;
  const conn = peer.connect(targetId, { reliable: true });
  setupDataConnection(conn);
}

function setupDataConnection(conn: DataConnection) {
  if (!currentChatPeer) {
    currentChatPeer = conn.peer;
    appShell.classList.add("mobile-chat-open");
  }

  conn.on("open", () => {
    if (currentChatPeer === conn.peer) {
      activeConn = conn;
      activePeerName.textContent = conn.peer;
      activePeerStatus.textContent = "Online (P2P Connected)";
      activePeerStatus.classList.remove("typing");
      messageInput.disabled = false;
      sendBtn.disabled = false;
      attachBtn.disabled = false;
      videoCallBtn.disabled = false;
      reconnectBtn.classList.add("hidden");
      deleteDmBtn.classList.remove("hidden");
      sendReadReceipts(conn);
    }
  });

  conn.on("data", (raw) => {
    const packet = parsePacket(raw);

    if (packet.type === "typing") {
      if (currentChatPeer === conn.peer) {
        if (packet.isTyping) {
          activePeerStatus.textContent = conn.peer + " is typing...";
          activePeerStatus.classList.add("typing");
          if (remoteTypingTimeout) window.clearTimeout(remoteTypingTimeout);
          remoteTypingTimeout = window.setTimeout(() => {
            activePeerStatus.textContent = "Online (P2P Connected)";
            activePeerStatus.classList.remove("typing");
          }, 3000);
        } else {
          activePeerStatus.textContent = "Online (P2P Connected)";
          activePeerStatus.classList.remove("typing");
        }
      }
      return;
    }

    if (packet.type === "ack" && packet.msgId) {
      updateMessageStatus(conn.peer, packet.msgId, "delivered");
      return;
    }

    if (packet.type === "read") {
      markAllSentAsRead(conn.peer);
      return;
    }

    if (packet.type === "chat" || packet.type === "file") {
      const msgId = packet.msgId || generateMsgId();
      const isImage =
        packet.type === "file" &&
        typeof packet.mimeType === "string" &&
        packet.mimeType.startsWith("image/");

      const incomingMsg: ChatMessage = {
        id: msgId,
        sender: "received",
        kind: packet.type === "file" ? (isImage ? "image" : "file") : "text",
        text: packet.text || packet.fileName || "Attachment",
        fileData: packet.fileData,
        fileName: packet.fileName,
        timestamp: getTimeNow()
      };

      saveMessageObject(conn.peer, incomingMsg);
      playWaterPing();

      // Send delivery receipt immediately
      conn.send({ type: "ack", msgId: msgId } as WirePacket);

      if (currentChatPeer === conn.peer) {
        activePeerStatus.textContent = "Online (P2P Connected)";
        activePeerStatus.classList.remove("typing");
        appendMessageBubble(incomingMsg);
        conn.send({ type: "read" } as WirePacket);
      } else {
        unreadCounts[conn.peer] = (unreadCounts[conn.peer] || 0) + 1;
      }

      renderContactList();
    }
  });

  conn.on("close", () => {
    if (currentChatPeer === conn.peer) {
      activePeerStatus.textContent = "Disconnected";
      activePeerStatus.classList.remove("typing");
      messageInput.disabled = true;
      sendBtn.disabled = true;
      attachBtn.disabled = true;
      videoCallBtn.disabled = true;
      reconnectBtn.classList.remove("hidden");
    }
  });
}

function parsePacket(raw: unknown): WirePacket {
  if (typeof raw === "object" && raw !== null && "type" in raw) {
    return raw as WirePacket;
  }
  return { type: "chat", text: String(raw) };
}

function sendReadReceipts(conn: DataConnection) {
  if (conn.open) {
    conn.send({ type: "read" } as WirePacket);
  }
}

// Live Typing Indicator Emission
messageInput.addEventListener("input", () => {
  if (!activeConn || !activeConn.open) return;
  activeConn.send({ type: "typing", isTyping: true } as WirePacket);

  if (typingTimeout) window.clearTimeout(typingTimeout);
  typingTimeout = window.setTimeout(() => {
    if (activeConn && activeConn.open) {
      activeConn.send({ type: "typing", isTyping: false } as WirePacket);
    }
  }, 1500);
});

// Send Text Message
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeConn || !currentChatPeer) return;

  const msgId = generateMsgId();
  const msgObj: ChatMessage = {
    id: msgId,
    sender: "sent",
    kind: "text",
    text: text,
    timestamp: getTimeNow(),
    status: "sent"
  };

  activeConn.send({ type: "typing", isTyping: false } as WirePacket);
  activeConn.send({ type: "chat", msgId: msgId, text: text } as WirePacket);

  saveMessageObject(currentChatPeer, msgObj);
  appendMessageBubble(msgObj);
  renderContactList();
  messageInput.value = "";
});

// P2P Image & File Attachment
attachBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file || !activeConn || !currentChatPeer) return;

  if (file.size > MAX_FILE_BYTES) {
    alert("File is too large for direct P2P transfer (Max 10MB).");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (!activeConn || !currentChatPeer) return;
    const base64Data = String(reader.result);
    const isImage = file.type.startsWith("image/");
    const msgId = generateMsgId();

    const msgObj: ChatMessage = {
      id: msgId,
      sender: "sent",
      kind: isImage ? "image" : "file",
      text: file.name,
      fileData: base64Data,
      fileName: file.name,
      timestamp: getTimeNow(),
      status: "sent"
    };

    activeConn.send({
      type: "file",
      msgId: msgId,
      fileData: base64Data,
      fileName: file.name,
      mimeType: file.type
    } as WirePacket);

    saveMessageObject(currentChatPeer, msgObj);
    appendMessageBubble(msgObj);
    renderContactList();
  };
  reader.readAsDataURL(file);
});

// History, Receipts & Contact Helpers
function ensureContactExists(peerId: string) {
  if (!dmHistory[peerId]) {
    dmHistory[peerId] = [];
    saveStorageSafe();
  }
}

function saveMessageObject(peerId: string, msg: ChatMessage) {
  ensureContactExists(peerId);
  dmHistory[peerId].push(msg);
  saveStorageSafe();
}

function saveStorageSafe() {
  try {
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(dmHistory));
  } catch (e) {
    // Trim oldest media payloads if localStorage quota is full
    Object.keys(dmHistory).forEach((pid) => {
      dmHistory[pid] = dmHistory[pid].slice(-30);
    });
    try {
      localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(dmHistory));
    } catch (inner) {
      console.warn("Storage quota reached.");
    }
  }
}

function updateMessageStatus(peerId: string, msgId: string, status: "delivered" | "read") {
  const list = dmHistory[peerId];
  if (!list) return;
  const target = list.find((m) => m.id === msgId);
  if (target && target.status !== "read") {
    target.status = status;
    saveStorageSafe();
    if (currentChatPeer === peerId) {
      renderChatHistory(peerId);
    }
  }
}

function markAllSentAsRead(peerId: string) {
  const list = dmHistory[peerId];
  if (!list) return;
  let changed = false;
  list.forEach((m) => {
    if (m.sender === "sent" && m.status !== "read") {
      m.status = "read";
      changed = true;
    }
  });
  if (changed) {
    saveStorageSafe();
    if (currentChatPeer === peerId) {
      renderChatHistory(peerId);
    }
  }
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
  history.forEach((msg) => appendMessageBubble(msg));
}

function getReceiptHtml(msg: ChatMessage): string {
  if (msg.sender !== "sent") return "";
  if (msg.status === "read") {
    return '<span class="receipt-icon read" title="Read">✓✓ Seen</span>';
  }
  if (msg.status === "delivered") {
    return '<span class="receipt-icon" title="Delivered">✓✓</span>';
  }
  return '<span class="receipt-icon" title="Sent">✓</span>';
}

function appendMessageBubble(msg: ChatMessage) {
  const welcome = messagesDiv.querySelector(".welcome-note");
  if (welcome) welcome.remove();

  const bubble = document.createElement("div");
  bubble.className = "msg " + msg.sender;

  let bodyHtml = "";
  if (msg.kind === "image" && msg.fileData) {
    bodyHtml =
      '<img src="' +
      msg.fileData +
      '" alt="' +
      escapeHtml(msg.fileName || "Image") +
      '" class="shared-image" />';
  } else if (msg.kind === "file" && msg.fileData) {
    bodyHtml =
      '<div class="file-card"><span>📄 ' +
      escapeHtml(msg.fileName || "File") +
      '</span><a href="' +
      msg.fileData +
      '" download="' +
      escapeHtml(msg.fileName || "download") +
      '" class="file-download-link">Download</a></div>';
  } else {
    bodyHtml = "<span>" + escapeHtml(msg.text) + "</span>";
  }

  bubble.innerHTML =
    bodyHtml +
    '<div class="msg-meta"><span>' +
    msg.timestamp +
    "</span>" +
    getReceiptHtml(msg) +
    "</div>";

  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderContactList() {
  contactList.innerHTML = "";
  Object.keys(dmHistory).forEach((peerId) => {
    const msgs = dmHistory[peerId];
    const lastMsgObj = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const lastPreview = lastMsgObj
      ? lastMsgObj.kind === "image"
        ? "📷 Photo"
        : lastMsgObj.kind === "file"
        ? "📎 " + lastMsgObj.text
        : lastMsgObj.text
      : "No messages yet";

    const unread = unreadCounts[peerId] || 0;

    const li = document.createElement("li");
    li.className = "contact-item" + (currentChatPeer === peerId ? " active" : "");

    const infoDiv = document.createElement("div");
    infoDiv.className = "contact-info";

    const badgeHtml =
      unread > 0 ? '<span class="unread-badge">' + String(unread) + "</span>" : "";

    infoDiv.innerHTML =
      '<div class="contact-name-row"><div class="contact-name">🌊 ' +
      escapeHtml(peerId) +
      "</div>" +
      badgeHtml +
      '</div><div class="contact-preview">' +
      escapeHtml(lastPreview) +
      "</div>";

    const delBtn = document.createElement("button");
    delBtn.className = "delete-contact-btn";
    delBtn.title = "Delete DM";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDmHistory(peerId);
    });

    li.appendChild(infoDiv);
    li.appendChild(delBtn);
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

renderContactList();
if (myUsername) {
  usernameInput.value = myUsername;
  initPeer(myUsername);
} else {
  const starterName = "wave-" + Math.floor(1000 + Math.random() * 9000);
  usernameInput.value = starterName;
  initPeer(starterName);
}
