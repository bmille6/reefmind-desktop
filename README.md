# ReefMind Electron App

Desktop app for Neptune Apex reef monitoring with built-in simulator.

## Features

✅ **Phase 1 Complete:**
- [x] Electron wrapper around existing frontend
- [x] Embedded Express server (localhost:8080)
- [x] Apex simulator with 30-day data story
- [x] Data source toggle (Simulator / Fusion / Local)
- [x] System tray with color-coded reef icon
- [x] Windows + Mac build configs
- [x] Simulator mode as default (no login needed)
- [x] Banner: "You're viewing simulated data → [Connect My Apex]"

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for current platform
npm run dist

# Build for specific platform
npm run dist:win   # Windows
npm run dist:mac   # macOS
npm run dist:linux # Linux
```

## Development

The app runs in **simulator mode** by default (see `.env`). No Firestore or Google Cloud credentials needed.

### Project Structure

```
electron/
├── main.js              — Electron main process (window, tray, server)
├── preload.js           — Bridge between main and renderer
├── tray.js              — System tray management
├── package.json         — Dependencies + electron-builder config
├── .env                 — Environment (REEFMIND_MODE=simulator)
├── public/              — Frontend files (from deploy/public/)
├── server/              — Embedded backend
│   ├── server.js        — Express server (modified for simulator mode)
│   ├── simulator-api.js — Standalone simulator endpoints
│   └── lib/             — Server modules
└── build/
    ├── icon.png         — Linux icon
    ├── icon.ico         — Windows icon (TODO)
    └── icon.icns        — macOS icon (TODO)
```

### Simulator Mode

- **REEFMIND_MODE=simulator** skips Firestore initialization
- **All API endpoints work standalone** (no external dependencies)
- **30 days of realistic data** pre-loaded
- **6 events** telling the alk crash story
- **Mock AI analysis** with diagnosis and recommendations

### API Endpoints (Simulator Mode)

All endpoints work without authentication:

```bash
# Status
GET /api/status

# Get simulated tank
GET /api/tanks
GET /api/tanks/sim-tank-1

# Get readings (30 days of alk crash data)
GET /api/tanks/sim-tank-1/readings?days=30

# Get events (6 pre-loaded)
GET /api/tanks/sim-tank-1/events

# Sync (generates new reading)
GET /api/tanks/sim-tank-1/sync

# AI analysis (mock diagnosis)
POST /api/tanks/sim-tank-1/analyze
```

### Testing

```bash
# Run the app
npm start

# In another terminal, test API
curl http://localhost:8080/api/status | jq .
curl http://localhost:8080/api/tanks | jq .
curl http://localhost:8080/api/tanks/sim-tank-1/readings | jq . | head -50
```

**Expected behavior:**
1. Electron window opens (1200x800)
2. Blue banner at top: "🔵 You're viewing simulated data → [Connect My Apex]"
3. Dashboard loads with simulated tank data
4. Charts show 30-day alk crash story
5. Events timeline shows 6 pre-loaded events
6. AI analysis button returns mock diagnosis
7. System tray icon appears (green fish)

## Building

```bash
# Windows (.exe NSIS installer)
npm run dist:win

# macOS (.dmg)
npm run dist:mac

# Linux (.AppImage + .deb)
npm run dist:linux
```

**Output:** `dist/` directory with installers.

### Build Requirements

- **Windows:** Build on Windows or use cross-compilation (wine)
- **macOS:** Build on macOS (code signing requires Apple Developer account)
- **Linux:** Build on Linux or macOS

## Data Source Toggle

Users can switch between:
- **🔵 Simulator** (default) — Built-in demo data
- **🔵 Apex Fusion** — Cloud API (requires login)
- **🔵 Local Apex** — Direct REST API on LAN (requires IP)

**Change data source:**
1. Right-click system tray icon
2. Hover over "Data Source"
3. Select new mode

## System Tray

**Left-click:** Open/hide dashboard window  
**Right-click:** Quick menu
- Current params (pH, Alk, Temp)
- "View Dashboard"
- "Data Source: Simulator" (click to change)
- "Quit ReefMind"

**Icon color:**
- 🟢 Green = All params in range, healthy
- 🟡 Yellow = Warning, trending wrong
- 🔴 Red = Critical alert

## Window Behavior

- **Default size:** 1200x800
- **Minimum size:** 375x600 (mobile testing)
- **Position:** Remembered between sessions
- **Dark title bar:** Match theme
- **No menu bar:** Clean look
- **Single instance:** Only one window allowed

## Simulator Data Story

The built-in simulator tells a realistic 30-day story (based on Brett's actual alk crash):

| Day | Event | Alk | Ca | Status |
|-----|-------|-----|-----|--------|
| 1-5 | Stable, all good | 8.2 | 440 | ✅ Healthy |
| 5 | Ammonium + urea dosing started | 8.2 | 440 | ⚠️ Beginning |
| 5-15 | Alk crashes, Ca rises | 8.2→7.4 | 440→470 | 🔴 Crashing |
| 15 | A4R reduced (Ca too high) | 7.4 | 470 | 🔴 Critical |
| 15-27 | Alk keeps falling | 7.4→7.0 | 470→510 | 🔴 Critical |
| 27 | Ammonium stopped, A4R increased | 7.0 | 510 | 🟡 Recovering |
| 27-30 | Recovery begins | 7.0→7.9 | 510→500 | 🟡 Recovering |

**AI diagnosis:** Nitrification from urea consuming alk (95% confidence)

## TODO (Phase 2)

- [ ] Auto-start on boot (checkbox in settings)
- [ ] Native OS notifications (critical alerts)
- [ ] Offline mode with SQLite cache
- [ ] Local network Apex discovery (scan for 192.168.x.x/rest/status)
- [ ] Auto-updater (electron-updater)
- [ ] Proper icon files (.ico, .icns with colored variants)
- [ ] Settings modal (data source toggle in UI)
- [ ] Apex Fusion login flow (from simulator banner)
- [ ] Local Apex IP entry

## Phase 3 (Future)

- [ ] Raspberry Pi headless mode (server only, no GUI)
- [ ] ARM64 build (.deb for Pi OS)
- [ ] mDNS (reefmind.local)
- [ ] systemd service for Pi
- [ ] Web dashboard accessible from any device

## Troubleshooting

**App won't start:**
```bash
rm -rf node_modules
npm install
npm start
```

**Blank window:**
- Check console logs (View → Toggle Developer Tools)
- Verify server started: `curl http://localhost:8080/api/status`
- Check simulator banner is visible (should be blue bar at top)

**No data on dashboard:**
- Check API: `curl http://localhost:8080/api/tanks`
- Verify REEFMIND_MODE=simulator in .env
- Check server logs in terminal

**Icons missing:**
- Icons are placeholders in Phase 1
- App uses default Electron icon for now
- Proper icons coming in Phase 2

## License

MIT

## Credits

Built by Sara for Brett's reef monitoring project.  
Based on the ReefMind cloud app (deploy/).

---

**Status:** Phase 1 complete ✅  
**Next:** Test on Windows, improve icons, add settings modal
