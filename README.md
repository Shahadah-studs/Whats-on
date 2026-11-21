# What'sOn

A browser-based peer-to-peer messaging app for direct conversations, file sharing, and video calls.

**Live demo:** https://shahadah-studs.github.io/Whats-on/

## Features

- Claim a persistent username/ID
- Send direct messages to other users
- View typing indicators and delivery/read receipts
- Share images and files up to 10 MB
- Start peer-to-peer audio and video calls
- Accept or decline incoming calls
- Toggle camera and microphone during calls
- Save conversation history and unread counts in the browser
- Delete DM history
- Responsive layout for desktop and mobile
- Optional synthesized notification sounds

## Tech Stack

- TypeScript
- HTML and CSS
- Vite
- PeerJS for WebRTC peer-to-peer connections

Language composition:

- TypeScript — Most of the site
- CSS — Styles the site
- HTML — Lands the site
## Getting Started

### Prerequisites

- Node.js
- npm

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

Open the local URL printed by Vite in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## Usage

1. Open the app and claim a username.
2. Share that username/ID with another user.
3. Enter the user's ID in **New Direct Message** and select **Chat**.
4. Send text, images, or files directly through the PeerJS connection.
5. Use the call button to start a camera and microphone call.

> Camera and microphone permissions are required for calls. Peer-to-peer messaging and calling depend on PeerJS signaling and the browser's WebRTC support.

## Project Structure

```text
.
├── index.html
├── src/
│   ├── main.ts
│   └── style.css
├── package.json
└── tsconfig.json
```

## Deployment

The project is configured as a Vite application and can be deployed to GitHub Pages or another static hosting provider.

## License

No license has been specified for this repository.
