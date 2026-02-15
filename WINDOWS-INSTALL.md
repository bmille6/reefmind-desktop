# ReefMind — Windows Quick Setup

## One-Time Setup (2 minutes)

1. **Install Node.js** — Download from https://nodejs.org (click the big green LTS button)
2. **Download ReefMind** — Get the zip from the link Brett sends you
3. **Unzip** to any folder (Desktop is fine)
4. **Open Command Prompt** — Press Win+R, type `cmd`, press Enter
5. **Navigate to folder:**
   ```
   cd Desktop\reefmind-electron
   ```
6. **Install dependencies:**
   ```
   npm install
   ```
7. **Run ReefMind:**
   ```
   npm start
   ```

## After First Setup

Just double-click `start.bat` in the ReefMind folder.

## What You'll See

- ReefMind desktop app opens with simulated reef data
- 30 days of alkalinity crash + recovery story
- Charts, AI diagnosis, event timeline
- System tray icon (🐠) in your taskbar

## Troubleshooting

- **"npm is not recognized"** → Restart your computer after installing Node.js
- **Blank screen** → Wait 5 seconds, the server is starting up
- **Port in use** → Close any other ReefMind instances first
