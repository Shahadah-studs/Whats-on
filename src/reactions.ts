export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🌊", "🔥", "🎉"];

export function buildReactionBar(
  messageId: string,
  reactions: Record<string, string[]>,
  myUsername: string,
  onToggleReaction: (messageId: string, emoji: string) => void
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "reaction-wrapper";

  const activeList = document.createElement("div");
  activeList.className = "active-reactions";

  Object.keys(reactions).forEach((emoji) => {
    const users = reactions[emoji] || [];
    if (users.length === 0) return;

    const pill = document.createElement("button");
    pill.type = "button";
    const iReacted = users.indexOf(myUsername) !== -1;
    pill.className = "reaction-pill" + (iReacted ? " mine" : "");
    pill.textContent = emoji + " " + users.length;
    pill.title = users.join(", ");
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleReaction(messageId, emoji);
    });
    activeList.appendChild(pill);
  });

  const picker = document.createElement("div");
  picker.className = "reaction-picker";

  QUICK_EMOJIS.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-choice-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleReaction(messageId, emoji);
    });
    picker.appendChild(btn);
  });

  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = "emoji-choice-btn";
  customBtn.textContent = "+";
  customBtn.title = "Custom emoji reaction";
  customBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const typed = prompt("Enter any emoji to react with:");
    if (typed && typed.trim()) {
      const firstToken = Array.from(typed.trim())[0];
      if (firstToken) {
        onToggleReaction(messageId, firstToken);
      }
    }
  });
  picker.appendChild(customBtn);

  wrapper.appendChild(activeList);
  wrapper.appendChild(picker);
  return wrapper;
}

export function applyReactionToggle(
  reactions: Record<string, string[]>,
  emoji: string,
  username: string
): Record<string, string[]> {
  const updated: Record<string, string[]> = {};
  Object.keys(reactions).forEach((k) => {
    updated[k] = reactions[k].slice();
  });

  if (!updated[emoji]) {
    updated[emoji] = [];
  }

  const idx = updated[emoji].indexOf(username);
  if (idx !== -1) {
    updated[emoji].splice(idx, 1);
  } else {
    updated[emoji].push(username);
  }

  return updated;
}
