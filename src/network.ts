import Peer from "peerjs";

export function createOceanPeer(peerId: string): Peer {
  return new Peer(peerId, {
    debug: 1,
    config: {
      iceServers: [
        { urls: "stun:://google.com" },
        { urls: "stun:://google.com" },
        { urls: "stun:://google.com" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ],
      iceCandidatePoolSize: 10
    }
  });
}
