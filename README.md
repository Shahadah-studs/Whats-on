# What'sOn

A browser-based peer-to-peer messenger for direct messages, group rooms, file sharing, and audio/video calls.

**Live demo:** https://shahadah-studs.github.io/Whats-on/

## Overview

What'sOn uses [PeerJS](https://peerjs.com/) and WebRTC to connect browsers directly without an application database or chat server. It includes persistent local chat history, shareable direct-message invite links, and temporary Waver group rooms.

> Keep the app open while you want to be reachable. Clearing browser site data removes your claimed username and saved chat history.

## Features

- Claim a custom username or PeerJS ID
- Start direct messages with other online users
- Share direct-message invite links
- Send text messages, images, and files up to 10 MB
- Host or join named **Waver** peer-to-peer group rooms
- Share room codes with friends
- View typing indicators, delivery receipts, seen receipts, and unread counts
- React to direct-message and Waver messages
- Start browser audio/video calls
- Accept or decline incoming calls
- Toggle the camera and microphone before or during calls
- Save direct-message history locally
- Export and import data through **WaveVault**
- Delete saved DM history
- Switch between light and dark themes
- Enable or disable notification sounds
- Use the responsive interface on desktop and mobile
- Install the app as a Progressive Web App

## Technology

- **TypeScript** — Application logic and PeerJS integration
- **HTML** — Main messenger and supporting pages
- **CSS** — Responsive light/dark interface
- **Vite** — Development server and production bundler
- **PeerJS** — Peer discovery and WebRTC signaling
- **WebRTC** — Direct data and media connections
- **Local Storage** — Username, theme, sound preference, and chat history
- **Service Worker** — Progressive web app support

### Language Composition

- TypeScript — 54.7%
- CSS — 27.1%
- HTML — 18%
- JavaScript — 0.2%

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm
- A modern browser with WebRTC and media permission support

### Installation

```bash
git clone https://github.com/Shahadah-studs/Whats-on.git
cd Whats-on
npm install
```

### Development

```bash
npm run dev
```

Open the local URL printed by Vite.

### Production

```bash
npm run build
npm run preview
```

The production files are created in `dist/`.

## Usage

### Direct Messages

1. Open What'sOn and enter a username.
2. Select **Claim** to make the username your PeerJS ID.
3. Share the username or copy the invite link.
4. Enter the friend's username under **New Direct Message**.
5. Select **Chat** to connect.
6. Send text, files, or an image once the connection is open.

### Wavers

1. Enter a room name in **Wavers**.
2. Select **Host Room** to create it, or enter a code and select **Join Room**.
3. Share the displayed room code with friends.
4. Room participants can exchange text messages and reactions.

Waver availability depends on the host staying online and PeerJS signaling remaining reachable.

### Calls

1. Open a direct-message conversation.
2. Choose camera and microphone settings.
3. Select **Call**.
4. The recipient can accept or decline the incoming call.
5. Use the live controls to mute the microphone, disable the camera, or end the call.

Browser camera and microphone permissions are required for calls.

## WaveVault

Open `backup.html` from the app to export or import What'sOn data.

The backup may include:

- The configured username
- Notification sound preference
- Saved direct-message history
- Export timestamp

Keep exported backups private because they can contain message history.

## Project Structure

```text
.
├── public/
│   ├── manifest.json
│   └── sw.js
├── src/
│   ├── main.ts       # Application state and direct messaging
│   ├── calls.ts      # WebRTC call management
│   ├── wavers.ts     # Peer-to-peer group room management
│   ├── ui.ts         # Message and contact rendering
│   ├── reactions.ts  # Reaction state helpers
│   └── style.css     # Application styles
├── about.html        # About page
├── about.css         # About page styles
├── backup.html       # WaveVault backup and restore page
├── index.html        # Main application page
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Privacy and Connectivity

What'sOn is a local-first, peer-to-peer application:

- Messages and media are transferred over WebRTC connections.
- Browser local storage keeps usernames and conversation metadata on the current device.
- Direct-message file data is subject to browser storage limits and the 10 MB transfer limit.
- Strict firewalls or restrictive networks may block peer connections.
- PeerJS signaling is used to discover and establish peers.
- Active chat and media connections do not use an application database.

WebRTC provides encrypted media and DTLS/SRTP transport. This project should not be used for highly sensitive information without an independent security and signaling review.

## Deployment

The app is a Vite static site and can be hosted by GitHub Pages or another static hosting provider.

For GitHub Pages:

1. Run `npm run build`.
2. Deploy the contents of `dist/` through your Pages workflow or hosting configuration.
3. Ensure HTTPS is enabled; camera, microphone, and service-worker features require a secure context.

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a descriptive feature branch.
3. Run `npm run build` and verify the app in a browser.
4. Open a pull request with a clear summary and testing notes.

## License

No license has been specified for this repository. All rights are retained by the repository owner unless a license is added.

## Official Waver

> `waver-what-son-official`
