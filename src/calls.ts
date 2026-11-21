import Peer, { MediaConnection } from "peerjs";

export class CallManager {
  private activeCall: MediaConnection | null = null;
  private pendingIncomingCall: MediaConnection | null = null;
  private localStream: MediaStream | null = null;

  private isMicEnabled = true;
  private isCamEnabled = true;

  private startCamToggle = document.getElementById("start-cam-toggle") as HTMLInputElement;
  private startMicToggle = document.getElementById("start-mic-toggle") as HTMLInputElement;
  private videoGrid = document.getElementById("video-grid") as HTMLDivElement;
  private localVideo = document.getElementById("local-video") as HTMLVideoElement;
  private remoteVideo = document.getElementById("remote-video") as HTMLVideoElement;
  private toggleMicLiveBtn = document.getElementById("toggle-mic-live-btn") as HTMLButtonElement;
  private toggleCamLiveBtn = document.getElementById("toggle-cam-live-btn") as HTMLButtonElement;
  private endCallBtn = document.getElementById("end-call-btn") as HTMLButtonElement;

  private incomingCallModal = document.getElementById("incoming-call-modal") as HTMLDivElement;
  private callerNameLabel = document.getElementById("caller-name-label") as HTMLParagraphElement;
  private answerCamToggle = document.getElementById("answer-cam-toggle") as HTMLInputElement;
  private answerMicToggle = document.getElementById("answer-mic-toggle") as HTMLInputElement;
  private acceptCallBtn = document.getElementById("accept-call-btn") as HTMLButtonElement;
  private declineCallBtn = document.getElementById("decline-call-btn") as HTMLButtonElement;

  constructor() {
    this.bindEvents();
  }

  private bindEvents() {
    this.acceptCallBtn.addEventListener("click", async () => {
      if (!this.pendingIncomingCall) return;
      const callToAnswer = this.pendingIncomingCall;
      this.pendingIncomingCall = null;
      this.incomingCallModal.classList.add("hidden");

      try {
        const stream = await this.prepareLocalMedia(
          this.answerCamToggle.checked,
          this.answerMicToggle.checked
        );
        callToAnswer.answer(stream);
        this.handleCallStream(callToAnswer);
      } catch (err) {
        alert("Could not access camera or microphone. Check browser permissions.");
        callToAnswer.close();
      }
    });

    this.declineCallBtn.addEventListener("click", () => {
      if (this.pendingIncomingCall) {
        this.pendingIncomingCall.close();
        this.pendingIncomingCall = null;
      }
      this.incomingCallModal.classList.add("hidden");
    });

    this.toggleMicLiveBtn.addEventListener("click", () => {
      if (!this.localStream) return;
      this.isMicEnabled = !this.isMicEnabled;
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = this.isMicEnabled;
      });
      this.updateLiveControlButtons();
    });

    this.toggleCamLiveBtn.addEventListener("click", () => {
      if (!this.localStream) return;
      this.isCamEnabled = !this.isCamEnabled;
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = this.isCamEnabled;
      });
      this.updateLiveControlButtons();
    });

    this.endCallBtn.addEventListener("click", () => {
      this.stopCall();
    });
  }

  public handleIncomingCall(call: MediaConnection) {
    if (this.activeCall || this.pendingIncomingCall) {
      call.close();
      return;
    }
    this.pendingIncomingCall = call;
    this.callerNameLabel.textContent = call.peer + " is calling you...";
    this.answerCamToggle.checked = this.startCamToggle.checked;
    this.answerMicToggle.checked = this.startMicToggle.checked;
    this.incomingCallModal.classList.remove("hidden");
  }

  public async startOutgoingCall(peer: Peer, targetPeerId: string) {
    try {
      const stream = await this.prepareLocalMedia(
        this.startCamToggle.checked,
        this.startMicToggle.checked
      );
      const call = peer.call(targetPeerId, stream);
      this.handleCallStream(call);
    } catch (err) {
      alert("Could not access camera or microphone. Check browser permissions.");
    }
  }

  private async prepareLocalMedia(camOn: boolean, micOn: boolean): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    this.isCamEnabled = camOn;
    this.isMicEnabled = micOn;

    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = this.isCamEnabled;
    });
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = this.isMicEnabled;
    });

    this.updateLiveControlButtons();
    this.localVideo.srcObject = this.localStream;
    this.videoGrid.classList.remove("hidden");
    return this.localStream;
  }

  private updateLiveControlButtons() {
    this.toggleMicLiveBtn.textContent = this.isMicEnabled ? "🎤 Mic On" : "🔇 Mic Off";
    this.toggleMicLiveBtn.className = this.isMicEnabled ? "control-btn" : "control-btn off";

    this.toggleCamLiveBtn.textContent = this.isCamEnabled ? "📷 Cam On" : "🚫 Cam Off";
    this.toggleCamLiveBtn.className = this.isCamEnabled ? "control-btn" : "control-btn off";
  }

  private handleCallStream(call: MediaConnection) {
    this.activeCall = call;
    call.on("stream", (remoteStream) => {
      this.remoteVideo.srcObject = remoteStream;
    });
    call.on("close", () => this.stopCall());
    call.on("error", () => this.stopCall());
  }

  public stopCall() {
    this.activeCall?.close();
    this.activeCall = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteVideo.srcObject = null;
    this.localVideo.srcObject = null;
    this.videoGrid.classList.add("hidden");
  }
}
