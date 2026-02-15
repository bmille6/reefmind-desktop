# ReefMind Electron — Quick Start

## Install & Run (30 seconds)

```bash
# 1. Go to the electron directory
cd /Users/brett/.openclaw/workspace/reefmind-project/electron

# 2. Install dependencies (first time only)
npm install

# 3. Run the app
npm start
```

**That's it!** The app will:
1. Start the embedded server on port 8080
2. Open a window with the dashboard
3. Load simulated tank data automatically
4. Show a blue banner: "You're viewing simulated data"

---

## What You Should See

### 1. Blue Banner (Top of Page)
```
🔵 You're viewing simulated data → [Connect My Apex]
```

### 2. Dashboard with Charts
- **Current Parameters** — pH 8.32, Alk 7.9, Temp 77.8°F
- **Alkalinity Chart** — 30-day timeline showing crash from 8.2 → 7.0 → 7.9
- **Calcium Chart** — Rise from 440 → 510 → 500
- **Timeline** — 6 events (ammonium dosing, alk crash, recovery)

### 3. System Tray Icon
- Look in your menu bar (macOS) or system tray (Windows)
- Reef icon should appear
- Left-click to show/hide window
- Right-click for quick menu

### 4. Console Output
```
Settings loaded: { dataSource: 'simulator', ... }
Starting embedded server on port 8080...
Mode: simulator
🔵 SIMULATOR MODE - Firestore and external APIs disabled
✅ Simulator API routes loaded
✅ Server running at http://localhost:8080
```

---

## Quick Tests

### Test 1: API is Working
```bash
curl http://localhost:8080/api/status | jq .
```
**Expected:** `{ "status": "ok", "demo_mode": true }`

### Test 2: Tank Data Loads
```bash
curl http://localhost:8080/api/tanks | jq .
```
**Expected:** Tank named "Simulated Reef" with 240gal volume

### Test 3: Readings Have the Alk Crash Story
```bash
curl http://localhost:8080/api/tanks/sim-tank-1/readings | jq '.readings[0:5]'
```
**Expected:** Recent alk ~7.8, older alk ~7.0 (crash), oldest alk ~8.2

### Test 4: Run the Full Test Suite
```bash
./test-simulator.sh
```
**Expected:** All 5 tests pass ✅

---

## Features to Try

### 1. Click "Analyze My Tank"
- Opens AI diagnosis panel
- Shows mock diagnosis: "Alkalinity crash from nitrification..."
- 95% confidence
- 4 recommendations
- 1 citation from Randy Holmes-Farley

### 2. View Timeline
- Scroll down to "Timeline" section
- See 6 events with dates and details
- Events tell the story of the alk crash

### 3. Hover Over Charts
- Charts are interactive
- Hover to see exact values
- Zoom in/out with scroll

### 4. System Tray Menu
- Right-click the reef icon in menu bar
- See current pH, Alk, Temp
- Try "Data Source" submenu (Simulator is checked)
- "Quit ReefMind" closes the app

### 5. Close and Reopen
- Close the window (X button)
- App stays running in tray
- Click tray icon to reopen
- Window position/size remembered

---

## Troubleshooting

### App Won't Start
```bash
rm -rf node_modules
npm install
npm start
```

### Blank Window
1. Open DevTools: `View → Toggle Developer Tools` (or Cmd+Option+I)
2. Check console for errors
3. Verify server started: `curl http://localhost:8080/api/status`

### No Data on Dashboard
1. Check API: `curl http://localhost:8080/api/tanks`
2. Verify `.env` has `REEFMIND_MODE=simulator`
3. Restart the app

### Port 8080 in Use
```bash
# Find what's using port 8080
lsof -i :8080

# Kill it
kill -9 <PID>

# Or use a different port in .env
PORT=8081
```

### Electron Won't Install
```bash
# macOS/Linux
rm -rf node_modules/electron
npm install electron --save-dev

# Rebuild
npm rebuild electron
```

---

## File Locations

### macOS
- **Settings:** `~/Library/Application Support/reefmind/settings.json`
- **Logs:** Console output (terminal)

### Windows
- **Settings:** `%APPDATA%\reefmind\settings.json`
- **Logs:** Console output (terminal)

### Linux
- **Settings:** `~/.config/reefmind/settings.json`
- **Logs:** Console output (terminal)

---

## Next Steps

### For Testing
1. Run `npm start` and verify the app loads
2. Check that the blue simulator banner appears
3. Click through all tabs and charts
4. Try the AI analysis
5. Test system tray menu
6. Close/reopen to verify persistence

### For Distribution
1. Build installers:
   ```bash
   npm run dist:mac   # macOS .dmg
   npm run dist:win   # Windows .exe
   ```
2. Test installers on clean machines
3. Get feedback from Mike or other testers

### For Deployment
- This is a **local desktop app** — no Cloud Run deployment
- Users download the installer and run it
- No server infrastructure needed

---

## Support

- **Docs:** See `README.md` for full documentation
- **Issues:** Check `PHASE1-COMPLETE.md` for known issues
- **Contact:** Ask Sara for help

---

**You're all set!** Run `npm start` and the app should just work. 🐠
