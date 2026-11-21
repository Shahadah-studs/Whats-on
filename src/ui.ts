import { buildReactionBar } from "./reactions";
import { WaverMessage } from "./wavers";

export interface ChatMessage {
  id: string;
  sender: "sent" | "received";
  senderName?: string;
  text: string;
  timestamp: string;
  status?: "sent" | "delivered" | "seen";
  fileName?: string;
  fileType?: string;
  fileDataUrl?: string;
  reactions?: Record<string, string[]>;
}

export function getTimeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function playDropPing(soundEnabled: boolean) {
  if (!soundEnabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch (e) {
    // Audio blocked until user interacts with page
  }
}

export function appendDmBubble(
  container: HTMLDivElement,
  msg: ChatMessage,
  myUsername: string,
  onReactionClick: (messageId: string, emoji: string) => void
) {
  const welcome = container.querySelector(".welcome-note");
  if (welcome) welcome.remove();

  const bubble = document.createElement("div");
  bubble.className = "msg " + msg.sender;

  if (msg.fileDataUrl && msg.fileType && msg.fileType.indexOf("image/") === 0) {
    const img = document.createElement("img");
    img.src = msg.fileDataUrl;
    img.alt = msg.fileName || "Shared image";
    img.className = "chat-image";
    img.addEventListener("click", () => window.open(msg.fileDataUrl, "_blank"));
    bubble.appendChild(img);
  } else if (msg.fileDataUrl) {
    const link = document.createElement("a");
    link.href = msg.fileDataUrl;
    link.download = msg.fileName || "download";
    link.className = "file-card";
    link.textContent = "📄 " + (msg.fileName || "Download File");
    bubble.appendChild(link);
  } else {
    const textSpan = document.createElement("span");
    textSpan.textContent = msg.text;
    bubble.appendChild(textSpan);
  }

  const meta = document.createElement("div");
  meta.className = "msg-meta";

  const timeSpan = document.createElement("span");
  timeSpan.textContent = msg.timestamp;
  meta.appendChild(timeSpan);

  if (msg.sender === "sent") {
    const receipt = document.createElement("span");
    receipt.className = "receipt-icon" + (msg.status === "seen" ? " seen" : "");
    if (msg.status === "seen") {
      receipt.textContent = "✓✓ Seen";
    } else if (msg.status === "delivered") {
      receipt.textContent = "✓✓";
    } else {
      receipt.textContent = "✓";
    }
    meta.appendChild(receipt);
  }

  bubble.appendChild(meta);
  bubble.appendChild(
    buildReactionBar(msg.id, msg.reactions || {}, myUsername, onReactionClick)
  );

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

export function appendWaverBubble(
  container: HTMLDivElement,
  msg: WaverMessage,
  myUsername: string,
  onReactionClick: (messageId: string, emoji: string) => void
) {
  const welcome = container.querySelector(".welcome-note");
  if (welcome) welcome.remove();

  const isMine = msg.senderName === myUsername;
  const bubble = document.createElement("div");
  bubble.className = "msg " + (isMine ? "sent" : "received");

  if (!isMine) {
    const senderTag = document.createElement("div");
    senderTag.className = "msg-sender-tag";
    senderTag.textContent = "🌊 " + msg.senderName;
    bubble.appendChild(senderTag);
  }

  const textSpan = document.createElement("span");
  textSpan.textContent = msg.text;
  bubble.appendChild(textSpan);

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = msg.timestamp;
  bubble.appendChild(meta);

  bubble.appendChild(
    buildReactionBar(msg.id, msg.reactions || {}, myUsername, onReactionClick)
  );

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

export function renderSavedContacts(
  listEl: HTMLUListElement,
  dmHistory: Record<string, ChatMessage[]>,
  unreadCounts: Record<string, number>,
  activePeerId: string | null,
  onSelectPeer: (peerId: string) => void,
  onDeletePeer: (peerId: string) => void
) {
  listEl.innerHTML = "";
  Object.keys(dmHistory).forEach((peerId) => {
    const msgs = dmHistory[peerId];
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1].text : "No messages yet";
    const unread = unreadCounts[peerId] || 0;

    const li = document.createElement("li");
    li.className = "contact-item" + (activePeerId === peerId ? " active" : "");

    const infoDiv = document.createElement("div");
    infoDiv.className = "contact-info";
    infoDiv.innerHTML =
      '<div class="contact-name">🌊 ' +
      escapeHtml(peerId) +
      '</div><div class="contact-preview">' +
      escapeHtml(lastMsg) +
      "</div>";

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "contact-actions";

    if (unread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = String(unread);
      actionsDiv.appendChild(badge);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "delete-contact-btn";
    delBtn.title = "Delete DM";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDeletePeer(peerId);
    });

    actionsDiv.appendChild(delBtn);
    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    li.addEventListener("click", () => onSelectPeer(peerId));
    listEl.appendChild(li);
  });
}
