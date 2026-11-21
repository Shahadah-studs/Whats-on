import Peer, { DataConnection } from "peerjs";
import { CallManager } from "./calls";
import { createOceanPeer } from "./network";
import { applyReactionToggle } from "./reactions";
import {
  appendDmBubble,
  appendWaverBubble,
  ChatMessage,
  escapeHtml,
  getTimeNow,
  playDropPing,
  renderSavedContacts
} from "./ui";
import { WaverManager, WaverMessage } from "./wavers";

const STORAGE_USER_KEY = "whatson_username";
const STORAGE_CHATS_KEY = "whatson_dm_history";
const STORAGE_SOUND_KEY = "whatson_sound_enabled";

let peer: Peer | null = null;
let myUsername = localStorage.getItem(STORAGE_USER_KEY) || "";
let currentMode: "none" | "dm" | "waver" = "none";
let currentChatPeer: string | null = null;
let activeConn: DataConnection | null = null;

let soundEnabled = localStorage.getItem(STORAGE_SOUND_KEY) !== "false";
let typingTimeout: number | null = null;

let dmHistory: Record<string, ChatMessage[]> = JSON.parse(
  localStorage.getItem(STORAGE_CHATS_KEY) || "{}"
);
let unreadCounts: Record<string, number> = {};
let waverMessages: WaverMessage[] = [];

const appShell = document.getElementById("app-shell") as HTMLDivElement;
const usernameInput = document.getElementById("username-input") as HTMLInputElement;
const saveUserBtn = document.getElementById("save-user-btn") as HTMLButtonElement;
const myStatusBadge = document.getElementById("my-status-badge") as HTMLElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const soundToggleBtn = document.getElementById("sound-toggle-btn") as HTMLButtonElement;
const peerIdInput = document.getElementById("peer-id-input") as HTMLInputElement;
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const contactList = document.getElementById("contact-list") as HTMLUListElement;

const waverRoomInput = document.getElementById("waver-room-input") as HTMLInputElement;
const hostWaverBtn = document.getElementById("host-waver-btn") as HTMLButtonElement;
const joinWaverBtn = document.getElementById("join-waver-btn") as HTMLButtonElement;
const copyRoomBtn = document.getElementById("copy-room-btn") as HTMLButtonElement;
const leaveWaverBtn = document.getElementById("leave-waver-btn") as HTMLButtonElement;

const mobileBackBtn = document.getElementById("mobile-back-btn") as HTMLButtonElement;
const chatAvatar = document.getElementById("chat-avatar") as HTMLSpanElement;
const activePeerName = document.getElementById("active-peer-name") as HTMLHeadingElement;
const activePeerStatus = document.getElementById("active-peer-status") as HTMLElement;
const reconnectBtn = document.getElementById("reconnect-btn") as HTMLButtonElement;
const deleteDmBtn = document.getElementById("delete-dm-btn") as HTMLButtonElement;
const videoCallBtn = document.getElementById("video-call-btn") as HTMLButtonElement;
const camToggleWrap = document.getElementById("cam-toggle-wrap") as HTMLLabelElement;
const micToggleWrap = document.getElementById("mic-toggle-wrap") as HTMLLabelElement;

const messagesDiv = document.getElementById("messages") as HTMLDivElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const attachBtn = document.getElementById("attach-btn") as HTMLButtonElement;
const messageInput = document.getElementById("message-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

const callManager = new CallManager();

const waverManager = new WaverManager({
  onRoomJoined: (roomId, isHost, members) => {
    currentMode = "waver";
    currentChatPeer = null;
    waverMessages = [];
    appShell.classList.add("mobile-chat-open");

    chatAvatar.textContent = "👥";
    activePeerName.textContent = roomId + (isHost ? " (Hosting)" : "");
    activePeerStatus.classList.remove("typing-active");
    activePeerStatus.textContent = "Members (" + members.length + "): " + members.join(", ");

    setHeaderMode("waver");
    messageInput.disabled = false;
    sendBtn.disabled = false;
    attachBtn.disabled = true;

    messagesDiv.innerHTML =
      '<div class="welcome-note">Welcome to Waver room <strong>' +
      escapeHtml(roomId) +
      "</strong>! Share the room code so friends can join.</div>";
    refreshContacts();
  },
  onMembersUpdated: (members) => {
    if (currentMode === "waver") {
      activePeerStatus.textContent = "Members (" + members.length + "): " + members.join(", ");
    }
  },
  onMessageReceived: (msg) => {
    waverMessages.push(msg);
    if (currentMode === "waver") {
      appendWaverBubble(messagesDiv, msg, myUsername, handleReactionClick);
    }
    playDropPing(soundEnabled);
  },
  onReactionUpdated: (messageId, emoji, fromUser) => {
    const target = waverMessages.find((m) => m.id === messageId);
    if (target) {
      target.reactions = applyReactionToggle(target.reactions || {}, emoji, fromUser);
      if (currentMode === "waver") {
        renderWaverHistory();
      }
    }
  },
  onRoomClosed: (reason) => {
    if (currentMode === "waver") {
      activePeerStatus.textContent = reason;
      messageInput.disabled = true;
      sendBtn.disabled = true;
    }
  }
});

hostWaverBtn.addEventListener("click", () => {
  if (!myUsername) return;
  const name = waverRoomInput.value.trim() || "waver-" + Math.floor(1000 + Math.random() * 9000);
  waverRoomInput.value = "";
  waverManager.hostRoom(name, myUsername);
});

joinWaverBtn.addEventListener("click", () => {
  if (!peer || !myUsername) return;
  const code = waverRoomInput.value.trim();
  if (!code) {
    alert("Enter the Waver room code to join.");
    return;
  }
  waverRoomInput.value = "";
  waverManager.joinRoom(peer, code, myUsername);
});

copyRoomBtn.addEventListener("click", () => {
  if (!waverManager.activeRoomId) return;
  navigator.clipboard.writeText(waverManager.activeRoomId);
  copyRoomBtn.textContent = "Copied!";
  setTimeout(() => {
    copyRoomBtn.textContent = "📋 Copy Code";
  }, 1500);
});

leaveWaverBtn.addEventListener("click", () => {
  waverManager.leaveRoom();
  currentMode = "none";
  setHeaderMode("none");
  chatAvatar.textContent = "🌊";
  activePeerName.textContent = "No Active Chat";
  activePeerStatus.textContent = "Left Waver room";
  messageInput.disabled = true;
  sendBtn.disabled = true;
  messagesDiv.innerHTML = '<div class="welcome-note">Select a DM or join a Waver room.</div>';
});

function setHeaderMode(mode: "none" | "dm" | "waver") {
  copyRoomBtn.classList.toggle("hidden", mode !== "waver");
  leaveWaverBtn.classList.toggle("hidden", mode !== "waver");

  deleteDmBtn.classList.toggle("hidden", mode !== "dm");
  videoCallBtn.classList.toggle("hidden", mode !== "dm");
  camToggleWrap.classList.toggle("hidden", mode !== "dm");
  micToggleWrap.classList.toggle("hidden", mode !== "dm");
  reconnectBtn.classList.add("hidden");
}

soundToggleBtn.textContent = soundEnabled ? "🔔" : "🔕";
soundToggleBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem(STORAGE_SOUND_KEY, String(soundEnabled));
  soundToggleBtn.textContent = soundEnabled ? "🔔" : "🔕";
});

mobileBackBtn.addEventListener("click", () => {
  appShell.classList.remove("mobile-chat-open");
});

videoCallBtn.addEventListener("click", () => {
  if (!activeConn || !peer || currentMode !== "dm") return;
  callManager.startOutgoingCall(peer, activeConn.peer);
});

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

  const newPeer = createOceanPeer(cleanId);

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
      if (currentMode === "dm") {
        activePeerStatus.textContent = "User is offline right now";
        reconnectBtn.classList.remove("hidden");
      }
    } else {
      console.error("PeerJS Error:", err);
    }
  });

  newPeer.on("connection", (conn) => {
    ensureContactExists(conn.peer);
    setupDataConnection(conn);
  });

  newPeer.on("call", (call) => {
    callManager.handleIncomingCall(call);
  });
}

saveUserBtn.addEventListener("click", () => initPeer(usernameInput.value));

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
  if (currentChatPeer) openChatWithPeer(currentChatPeer);
});

deleteDmBtn.addEventListener("click", () => {
  if (currentChatPeer) deleteDmHistory(currentChatPeer);
});

function deleteDmHistory(targetId: string) {
  if (!confirm('Delete all chat history with "' + targetId + '"?')) return;

  delete dmHistory[targetId];
  delete unreadCounts[targetId];
  saveHistoryToStorage();

  if (currentChatPeer === targetId) {
    if (activeConn && activeConn.peer === targetId) {
      activeConn.close();
      activeConn = null;
    }
    currentChatPeer = null;
    currentMode = "none";
    setHeaderMode("none");
    appShell.classList.remove("mobile-chat-open");
    activePeerName.textContent = "No Active Chat";
    activePeerStatus.textContent = "Select a DM or join a Waver";
    messageInput.disabled = true;
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    videoCallBtn.disabled = true;
    messagesDiv.innerHTML =
      '<div class="welcome-note">Conversation with <strong>' +
      escapeHtml(targetId) +
      "</strong> was deleted.</div>";
  }

  refreshContacts();
}

function openChatWithPeer(targetId: string) {
  if (currentMode === "waver") {
    waverManager.leaveRoom();
  }

  currentMode = "dm";
  currentChatPeer = targetId;
  unreadCounts[targetId] = 0;
  ensureContactExists(targetId);
  refreshContacts();
  renderChatHistory(targetId);

  appShell.classList.add("mobile-chat-open");
  chatAvatar.textContent = "🌊";
  activePeerName.textContent = targetId;
  activePeerStatus.classList.remove("typing-active");
  activePeerStatus.textContent = "Connecting...";
  setHeaderMode("dm");

  if (!peer) return;
  const conn = peer.connect(targetId, { reliable: true });
  setupDataConnection(conn);
}

function setupDataConnection(conn: DataConnection) {
  if (currentMode === "none" && !currentChatPeer) {
    currentMode = "dm";
    currentChatPeer = conn.peer;
    setHeaderMode("dm");
  }

  conn.on("open", () => {
    if (currentMode === "dm" && currentChatPeer === conn.peer) {
      activeConn = conn;
      activePeerName.textContent = conn.peer;
      activePeerStatus.classList.remove("typing-active");
      activePeerStatus.textContent = "Online (P2P Connected)";
      messageInput.disabled = false;
      sendBtn.disabled = false;
      attachBtn.disabled = false;
      videoCallBtn.disabled = false;
      reconnectBtn.classList.add("hidden");
      conn.send({ type: "seen" });
    }
  });

  conn.on("data", (raw) => handleIncomingPacket(conn, raw));

  conn.on("close", () => {
    if (currentMode === "dm" && currentChatPeer === conn.peer) {
      activePeerStatus.classList.remove("typing-active");
      activePeerStatus.textContent = "Disconnected";
      messageInput.disabled = true;
      sendBtn.disabled = true;
      attachBtn.disabled = true;
      videoCallBtn.disabled = true;
      reconnectBtn.classList.remove("hidden");
    }
  });
}

function handleIncomingPacket(conn: DataConnection, raw: unknown) {
  const peerId = conn.peer;

  if (typeof raw === "object" && raw !== null && "type" in raw) {
    const packet = raw as Record<string, unknown>;

    if (packet.type === "typing") {
      if (currentMode === "dm" && currentChatPeer === peerId) {
        if (packet.isTyping) {
          activePeerStatus.textContent = peerId + " is typing...";
          activePeerStatus.classList.add("typing-active");
        } else {
          activePeerStatus.textContent = "Online (P2P Connected)";
          activePeerStatus.classList.remove("typing-active");
        }
      }
      return;
    }

    if (packet.type === "ack") {
      updateMessageStatus(peerId, String(packet.id), "delivered");
      return;
    }

    if (packet.type === "seen") {
      markAllMessagesSeen(peerId);
      return;
    }

    if (packet.type === "reaction") {
      toggleDmReactionLocal(peerId, String(packet.messageId), String(packet.emoji), peerId);
      return;
    }

    if (packet.type === "file") {
      receiveMessageObject(conn, {
        id: String(packet.id || Date.now()),
        sender: "received",
        text: String(packet.fileName || "Shared File"),
        timestamp: getTimeNow(),
        fileName: String(packet.fileName || "file"),
        fileType: String(packet.fileType || "application/octet-stream"),
        fileDataUrl: String(packet.fileDataUrl || ""),
        reactions: {}
      });
      return;
    }

    if (packet.type === "chat") {
      receiveMessageObject(conn, {
        id: String(packet.id || Date.now()),
        sender: "received",
        text: String(packet.text || ""),
        timestamp: getTimeNow(),
        reactions: {}
      });
      return;
    }
  }

  receiveMessageObject(conn, {
    id: String(Date.now()),
    sender: "received",
    text: String(raw),
    timestamp: getTimeNow(),
    reactions: {}
  });
}

function receiveMessageObject(conn: DataConnection, msg: ChatMessage) {
  const peerId = conn.peer;
  ensureContactExists(peerId);
  dmHistory[peerId].push(msg);
  saveHistoryToStorage();

  if (conn.open) {
    conn.send({ type: "ack", id: msg.id });
  }

  if (currentMode === "dm" && currentChatPeer === peerId) {
    activePeerStatus.textContent = "Online (P2P Connected)";
    activePeerStatus.classList.remove("typing-active");
    appendDmBubble(messagesDiv, msg, myUsername, handleReactionClick);
    if (conn.open) conn.send({ type: "seen" });
  } else {
    unreadCounts[peerId] = (unreadCounts[peerId] || 0) + 1;
    playDropPing(soundEnabled);
  }

  refreshContacts();
}

messageInput.addEventListener("input", () => {
  if (currentMode !== "dm" || !activeConn || !activeConn.open) return;

  activeConn.send({ type: "typing", isTyping: true });
  if (typingTimeout) window.clearTimeout(typingTimeout);
  typingTimeout = window.setTimeout(() => {
    if (activeConn && activeConn.open) {
      activeConn.send({ type: "typing", isTyping: false });
    }
  }, 1500);
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  if (currentMode === "waver") {
    const wMsg = waverManager.sendWaverMessage(text, getTimeNow());
    if (wMsg) {
      waverMessages.push(wMsg);
      appendWaverBubble(messagesDiv, wMsg, myUsername, handleReactionClick);
    }
    messageInput.value = "";
    return;
  }

  if (currentMode !== "dm" || !activeConn || !currentChatPeer) return;

  const msgId = "msg-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const msg: ChatMessage = {
    id: msgId,
    sender: "sent",
    text: text,
    timestamp: getTimeNow(),
    status: "sent",
    reactions: {}
  };

  activeConn.send({ type: "chat", id: msgId, text: text });
  activeConn.send({ type: "typing", isTyping: false });

  ensureContactExists(currentChatPeer);
  dmHistory[currentChatPeer].push(msg);
  saveHistoryToStorage();
  appendDmBubble(messagesDiv, msg, myUsername, handleReactionClick);
  refreshContacts();
  messageInput.value = "";
});

attachBtn.addEventListener("click", () => {
  if (!activeConn || currentMode !== "dm") return;
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files ? fileInput.files[0] : null;
  if (!file || !activeConn || !currentChatPeer) return;

  if (file.size > 10 * 1024 * 1024) {
    alert("Please pick a file smaller than 10 MB for fast P2P transfer.");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (!activeConn || !currentChatPeer) return;
    const dataUrl = String(reader.result);
    const msgId = "file-" + Date.now();

    const msg: ChatMessage = {
      id: msgId,
      sender: "sent",
      text: file.name,
      timestamp: getTimeNow(),
      status: "sent",
      fileName: file.name,
      fileType: file.type,
      fileDataUrl: dataUrl,
      reactions: {}
    };

    activeConn.send({
      type: "file",
      id: msgId,
      fileName: file.name,
      fileType: file.type,
      fileDataUrl: dataUrl
    });

    ensureContactExists(currentChatPeer);
    dmHistory[currentChatPeer].push(msg);
    saveHistoryToStorage();
    appendDmBubble(messagesDiv, msg, myUsername, handleReactionClick);
    refreshContacts();
  };
  reader.readAsDataURL(file);
  fileInput.value = "";
});

function handleReactionClick(msgId: string, emoji: string) {
  if (!myUsername) return;

  if (currentMode === "waver") {
    const target = waverMessages.find((m) => m.id === msgId);
    if (target) {
      target.reactions = applyReactionToggle(target.reactions || {}, emoji, myUsername);
      waverManager.sendWaverReaction(msgId, emoji);
      renderWaverHistory();
    }
    return;
  }

  if (currentMode === "dm" && currentChatPeer) {
    toggleDmReactionLocal(currentChatPeer, msgId, emoji, myUsername);
    if (activeConn && activeConn.open) {
      activeConn.send({ type: "reaction", messageId: msgId, emoji: emoji });
    }
  }
}

function toggleDmReactionLocal(peerId: string, msgId: string, emoji: string, actor: string) {
  const list = dmHistory[peerId];
  if (!list) return;
  const target = list.find((m) => m.id === msgId);
  if (!target) return;

  target.reactions = applyReactionToggle(target.reactions || {}, emoji, actor);
  saveHistoryToStorage();
  if (currentMode === "dm" && currentChatPeer === peerId) {
    renderChatHistory(peerId);
  }
}

function updateMessageStatus(peerId: string, msgId: string, newStatus: "delivered" | "seen") {
  const list = dmHistory[peerId];
  if (!list) return;
  const target = list.find((m) => m.id === msgId);
  if (target && target.status !== "seen") {
    target.status = newStatus;
    saveHistoryToStorage();
    if (currentMode === "dm" && currentChatPeer === peerId) renderChatHistory(peerId);
  }
}

function markAllMessagesSeen(peerId: string) {
  const list = dmHistory[peerId];
  if (!list) return;
  let changed = false;
  list.forEach((m) => {
    if (m.sender === "sent" && m.status !== "seen") {
      m.status = "seen";
      changed = true;
    }
  });
  if (changed) {
    saveHistoryToStorage();
    if (currentMode === "dm" && currentChatPeer === peerId) renderChatHistory(peerId);
  }
}

function ensureContactExists(peerId: string) {
  if (!dmHistory[peerId]) {
    dmHistory[peerId] = [];
    saveHistoryToStorage();
  }
}

function saveHistoryToStorage() {
  const cleanCopy: Record<string, ChatMessage[]> = {};
  Object.keys(dmHistory).forEach((k) => {
    cleanCopy[k] = dmHistory[k].map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.fileDataUrl ? "[File] " + m.text : m.text,
      timestamp: m.timestamp,
      status: m.status,
      reactions: m.reactions || {}
    }));
  });
  localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(cleanCopy));
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
  history.forEach((msg) => appendDmBubble(messagesDiv, msg, myUsername, handleReactionClick));
}

function renderWaverHistory() {
  messagesDiv.innerHTML = "";
  waverMessages.forEach((m) => appendWaverBubble(messagesDiv, m, myUsername, handleReactionClick));
}

function refreshContacts() {
  renderSavedContacts(
    contactList,
    dmHistory,
    unreadCounts,
    currentMode === "dm" ? currentChatPeer : null,
    openChatWithPeer,
    deleteDmHistory
  );
}

refreshContacts();
if (myUsername) {
  usernameInput.value = myUsername;
  initPeer(myUsername);
} else {
  const starterName = "wave-" + Math.floor(1000 + Math.random() * 9000);
  usernameInput.value = starterName;
  initPeer(starterName);
}
