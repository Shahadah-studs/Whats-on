import Peer, { DataConnection } from "peerjs";
import { createOceanPeer } from "./network";

export interface WaverMessage {
  id: string;
  senderName: string;
  text: string;
  timestamp: string;
  reactions?: Record<string, string[]>;
}

export interface WaverCallbacks {
  onRoomJoined: (roomId: string, isHost: boolean, members: string[]) => void;
  onMembersUpdated: (members: string[]) => void;
  onMessageReceived: (msg: WaverMessage) => void;
  onReactionUpdated: (messageId: string, emoji: string, fromUser: string) => void;
  onRoomClosed: (reason: string) => void;
}

export class WaverManager {
  private hostPeer: Peer | null = null;
  private guestConnections: Map<string, DataConnection> = new Map();
  private memberNames: Map<string, string> = new Map();
  private hostConn: DataConnection | null = null;

  public activeRoomId: string | null = null;
  public isHost = false;
  private myDisplayName = "";
  private callbacks: WaverCallbacks;

  constructor(callbacks: WaverCallbacks) {
    this.callbacks = callbacks;
  }

  public hostRoom(customRoomCode: string, myUsername: string) {
    this.leaveRoom();
    this.myDisplayName = myUsername;

    const cleanRoom = customRoomCode
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");

    if (!cleanRoom) {
      alert("Please enter a valid Waver room name.");
      return;
    }

    const roomPeerId = cleanRoom.indexOf("waver-") === 0 ? cleanRoom : "waver-" + cleanRoom;
    const roomPeer = createOceanPeer(roomPeerId);

    roomPeer.on("open", (id) => {
      this.hostPeer = roomPeer;
      this.activeRoomId = id;
      this.isHost = true;
      this.memberNames.clear();
      this.memberNames.set(id, myUsername + " (Host)");
      this.callbacks.onRoomJoined(id, true, this.getMemberList());
    });

    roomPeer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        alert('Waver room "' + roomPeerId + '" already exists! Try joining it or pick another name.');
      } else {
        this.callbacks.onRoomClosed("Room error: " + err.type);
      }
    });

    roomPeer.on("connection", (conn) => {
      conn.on("data", (raw) => {
        const packet = raw as Record<string, unknown>;
        if (!packet || typeof packet.type !== "string") return;

        if (packet.type === "waver-hello") {
          const joinerName = String(packet.username || conn.peer);
          this.guestConnections.set(conn.peer, conn);
          this.memberNames.set(conn.peer, joinerName);
          this.broadcastRoster();
        } else if (packet.type === "waver-chat") {
          const msg: WaverMessage = {
            id: String(packet.id),
            senderName: String(packet.senderName),
            text: String(packet.text),
            timestamp: String(packet.timestamp),
            reactions: {}
          };
          this.callbacks.onMessageReceived(msg);
          this.broadcastToGuests(packet, conn.peer);
        } else if (packet.type === "waver-reaction") {
          this.callbacks.onReactionUpdated(
            String(packet.messageId),
            String(packet.emoji),
            String(packet.fromUser)
          );
          this.broadcastToGuests(packet, conn.peer);
        }
      });

      conn.on("close", () => {
        this.guestConnections.delete(conn.peer);
        this.memberNames.delete(conn.peer);
        this.broadcastRoster();
      });
    });
  }

  public joinRoom(mainUserPeer: Peer, roomCode: string, myUsername: string) {
    this.leaveRoom();
    this.myDisplayName = myUsername;

    const cleanRoom = roomCode
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");

    if (!cleanRoom) {
      alert("Enter a Waver room code to join.");
      return;
    }

    const targetRoomId = cleanRoom.indexOf("waver-") === 0 ? cleanRoom : "waver-" + cleanRoom;
    const conn = mainUserPeer.connect(targetRoomId, { reliable: true });
    this.hostConn = conn;

    conn.on("open", () => {
      this.activeRoomId = targetRoomId;
      this.isHost = false;
      conn.send({ type: "waver-hello", username: myUsername });
      this.callbacks.onRoomJoined(targetRoomId, false, [myUsername]);
    });

    conn.on("data", (raw) => {
      const packet = raw as Record<string, unknown>;
      if (!packet || typeof packet.type !== "string") return;

      if (packet.type === "waver-roster" && Array.isArray(packet.members)) {
        this.callbacks.onMembersUpdated(packet.members.map(String));
      } else if (packet.type === "waver-chat") {
        this.callbacks.onMessageReceived({
          id: String(packet.id),
          senderName: String(packet.senderName),
          text: String(packet.text),
          timestamp: String(packet.timestamp),
          reactions: {}
        });
      } else if (packet.type === "waver-reaction") {
        this.callbacks.onReactionUpdated(
          String(packet.messageId),
          String(packet.emoji),
          String(packet.fromUser)
        );
      }
    });

    conn.on("close", () => {
      this.callbacks.onRoomClosed("Host closed the Waver room.");
      this.activeRoomId = null;
    });

    conn.on("error", () => {
      this.callbacks.onRoomClosed("Could not connect to Waver room.");
      this.activeRoomId = null;
    });
  }

  public sendWaverMessage(text: string, time: string): WaverMessage | null {
    if (!this.activeRoomId) return null;

    const msg: WaverMessage = {
      id: "wv-" + Date.now() + "-" + Math.floor(Math.random() * 9999),
      senderName: this.myDisplayName,
      text: text,
      timestamp: time,
      reactions: {}
    };

    const packet = {
      type: "waver-chat",
      id: msg.id,
      senderName: msg.senderName,
      text: msg.text,
      timestamp: msg.timestamp
    };

    if (this.isHost) {
      this.broadcastToGuests(packet);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(packet);
    }

    return msg;
  }

  public sendWaverReaction(messageId: string, emoji: string) {
    if (!this.activeRoomId) return;

    const packet = {
      type: "waver-reaction",
      messageId: messageId,
      emoji: emoji,
      fromUser: this.myDisplayName
    };

    if (this.isHost) {
      this.broadcastToGuests(packet);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(packet);
    }
  }

  private broadcastToGuests(packet: unknown, excludePeerId?: string) {
    this.guestConnections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(packet);
      }
    });
  }

  private broadcastRoster() {
    const list = this.getMemberList();
    this.callbacks.onMembersUpdated(list);
    this.broadcastToGuests({ type: "waver-roster", members: list });
  }

  private getMemberList(): string[] {
    const list: string[] = [];
    this.memberNames.forEach((name) => list.push(name));
    return list;
  }

  public leaveRoom() {
    this.guestConnections.forEach((c) => c.close());
    this.guestConnections.clear();
    this.memberNames.clear();
    if (this.hostPeer) {
      this.hostPeer.destroy();
      this.hostPeer = null;
    }
    if (this.hostConn) {
      this.hostConn.close();
      this.hostConn = null;
    }
    this.activeRoomId = null;
    this.isHost = false;
  }
}
