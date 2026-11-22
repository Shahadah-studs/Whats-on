import Peer, { DataConnection } from "peerjs";

interface StrokePacket {
  boardType: "stroke" | "clear";
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  color?: string;
  size?: number;
}

const boardId = "board-" + Math.floor(1000 + Math.random() * 9000);
const peer = new Peer(boardId);
let activeConn: DataConnection | null = null;

// Drawing State
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = "#004e7c";
let isEraser = false;

// DOM Elements
const myIdInput = document.getElementById("board-my-id") as HTMLInputElement;
const copyBtn = document.getElementById("board-copy-btn") as HTMLButtonElement;
const peerInput = document.getElementById("board-peer-input") as HTMLInputElement;
const connectBtn = document.getElementById("board-connect-btn") as HTMLButtonElement;
const statusBadge = document.getElementById("board-status") as HTMLElement;

const swatchesContainer = document.getElementById("color-swatches") as HTMLDivElement;
const eraserBtn = document.getElementById("eraser-btn") as HTMLButtonElement;
const brushSizeInput = document.getElementById("brush-size") as HTMLInputElement;
const savePngBtn = document.getElementById("save-png-btn") as HTMLButtonElement;
const clearBoardBtn = document.getElementById("clear-board-btn") as HTMLButtonElement;

const canvas = document.getElementById("wave-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

// Fill white background initially so PNG exports aren't transparent
function fillWhiteCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
fillWhiteCanvas();

// PeerJS Connection Setup
peer.on("open", (id) => {
  myIdInput.value = id;
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
  statusBadge.textContent = "Linking...";

  conn.on("open", () => {
    statusBadge.textContent = "🟢 Linked with " + conn.peer;
    statusBadge.classList.add("linked");
  });

  conn.on("data", (raw) => {
    const pkt = raw as StrokePacket;
    if (!pkt || typeof pkt.boardType !== "string") return;

    if (pkt.boardType === "clear") {
      fillWhiteCanvas();
    } else if (
      pkt.boardType === "stroke" &&
      typeof pkt.x0 === "number" &&
      typeof pkt.y0 === "number" &&
      typeof pkt.x1 === "number" &&
      typeof pkt.y1 === "number"
    ) {
      drawLine(
        pkt.x0,
        pkt.y0,
        pkt.x1,
        pkt.y1,
        pkt.color || "#004e7c",
        pkt.size || 4
      );
    }
  });

  conn.on("close", () => {
    statusBadge.textContent = "Disconnected";
    statusBadge.classList.remove("linked");
    activeConn = null;
  });
}

// Toolbar Controls
swatchesContainer.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains("swatch")) return;

  isEraser = false;
  eraserBtn.classList.remove("active");
  currentColor = target.getAttribute("data-color") || "#004e7c";

  const allSwatches = swatchesContainer.querySelectorAll(".swatch");
  allSwatches.forEach((s) => s.classList.remove("active"));
  target.classList.add("active");
});

eraserBtn.addEventListener("click", () => {
  isEraser = true;
  eraserBtn.classList.add("active");
  const allSwatches = swatchesContainer.querySelectorAll(".swatch");
  allSwatches.forEach((s) => s.classList.remove("active"));
});

clearBoardBtn.addEventListener("click", () => {
  fillWhiteCanvas();
  if (activeConn && activeConn.open) {
    activeConn.send({ boardType: "clear" });
  }
});

savePngBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "whatson-waveboard-" + Date.now() + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// Canvas Coordinate & Drawing Logic
function getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function drawLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  size: number
) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.closePath();
}

function startStroke(x: number, y: number) {
  isDrawing = true;
  lastX = x;
  lastY = y;
}

function moveStroke(x: number, y: number) {
  if (!isDrawing) return;

  const strokeColor = isEraser ? "#ffffff" : currentColor;
  const strokeSize = isEraser ? Number(brushSizeInput.value) * 3 : Number(brushSizeInput.value);

  drawLine(lastX, lastY, x, y, strokeColor, strokeSize);

  if (activeConn && activeConn.open) {
    activeConn.send({
      boardType: "stroke",
      x0: lastX,
      y0: lastY,
      x1: x,
      y1: y,
      color: strokeColor,
      size: strokeSize
    });
  }

  lastX = x;
  lastY = y;
}

function endStroke() {
  isDrawing = false;
}

// Mouse Events
canvas.addEventListener("mousedown", (e) => {
  const pos = getCanvasCoords(e.clientX, e.clientY);
  startStroke(pos.x, pos.y);
});

canvas.addEventListener("mousemove", (e) => {
  const pos = getCanvasCoords(e.clientX, e.clientY);
  moveStroke(pos.x, pos.y);
});

window.addEventListener("mouseup", endStroke);

// Touch Events (Mobile & Tablet)
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    const touch = e.touches.item(0);
    if (!touch) return;
    const pos = getCanvasCoords(touch.clientX, touch.clientY);
    startStroke(pos.x, pos.y);
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touch = e.touches.item(0);
    if (!touch) return;
    const pos = getCanvasCoords(touch.clientX, touch.clientY);
    moveStroke(pos.x, pos.y);
  },
  { passive: false }
);

window.addEventListener("touchend", endStroke);
