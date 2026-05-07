# 🔒 Privacy & Tracker Visualizer

A Chrome extension that scans websites and gives them a **Privacy Grade** (A–F) based on known tracking scripts, third-party hosts, cookies, storage keys, and network activity surfaced from the page.

## Setup (install in Chrome)

### Prerequisites

- **Google Chrome** (or another Chromium browser with Manifest V3 support), current version recommended.
- This repo cloned or downloaded on your machine.

### 1. Get the code

```bash
git clone https://github.com/navu3735/Privacy-Tracker-Extension.git
cd Privacy-Tracker-Extension
```

If you use a ZIP download instead, extract it and open the folder that contains `manifest.json`.

### 2. Load the unpacked extension

1. Open Chrome and go to `chrome://extensions/`.
2. Turn **Developer mode** **on** (top right).
3. Click **Load unpacked**.
4. Choose the project folder (the same folder as `manifest.json`).

Chrome will keep loading this folder until you remove the extension or delete/move the project.

### 3. Pin and run

1. Click the **puzzle** icon on the toolbar and **pin** “Privacy & Tracker Visualizer” if you want the icon always visible.
2. Open a normal `http://` or `https://` page (`chrome://` pages cannot be scanned).
3. Click the extension icon for the popup: grade, named trackers, third-party host list, scope stats, and scan log.

### Optional: quick test from a terminal (Windows)

Opens Chrome with the extension for that session:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" --load-extension="C:\full\path\to\Privacy-Tracker-Extension"
```

Use your real path. For a **persistent** install, use **Load unpacked** above.

### Chrome Web Store

Publishing is separate: zip the extension, use the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), and complete listing and privacy fields. This repo targets **developer (unpacked)** installs by default.

## 📊 How It Works (Simple Explanation)

Imagine your browser is a **detective** 🕵️ investigating websites:

1. **The Detective (content-script.js)** 🔍
   - Runs on every website you visit
   - Collects all scripts, cookies, and external connections
   - Reports findings to headquarters

2. **The Judge (background.js)** ⚖️
   - Receives the detective's report
   - Compares against list of known trackers
   - Calculates a privacy score
   - Assigns a letter grade (A-F)

3. **The Display (popup.html + popup.js)** 📺
   - Shows your privacy grade
   - Lists all trackers found
   - Shows countries where data is sent
   - Gives privacy tips

## 🏗️ Folder Structure

```
Privacy Visualizer Extension/
├── manifest.json          ← Extension config
├── icons/
│   └── logo.png           ← Toolbar & listing icons
├── src/
│   ├── content-script.js  ← Collects page & network signals
│   └── background.js      ← Tracker matching, grading, storage
├── ui/
│   ├── popup.html
│   └── popup.js
└── data/
    └── trackers.json      ← Known tracker signatures
```

## 🎓 Understanding Each File

### manifest.json
**The Passport** 🛂
- Tells Chrome: "I'm an extension named Privacy Visualizer"
- Lists permissions: what we're allowed to do
- Points to our main files (popup, content script, background)
- Defines where results go in the UI

### content-script.js
**The Detective** 🕵️
```javascript
// What it does:
1. Grabs all <script> tags from the page
2. Finds all external images and iframes
3. Collects cookies
4. Sends this intel to the background worker
```

**Key Functions:**
- `getPageScripts()` - Finds all JavaScript files
- `getExternalDomains()` - Finds where images/iframes come from
- `getPageCookies()` - Collects cookies
- `analyzePrivacy()` - Bundles data and sends to background

### background.js
**The Judge** ⚖️
```javascript
// What it does:
1. Receives data from content script
2. Loads tracker database from trackers.json
3. Compares scripts against known trackers
4. Calculates privacy grade
5. Stores results for popup
```

**Key Functions:**
- `loadTrackerDatabase()` - Loads list of known trackers
- `findTrackers()` - Matches found scripts to tracker list
- `calculateGrade()` - Turns tracker count into A-F grade
- `analyzeCookies()` - Finds tracking cookies

### popup.html & popup.js
**The Display** 📺
```javascript
// What it does:
1. Gets analysis results from background worker
2. Formats results nicely
3. Shows grade with color coding
4. Lists all trackers found
5. Shows countries where data goes
6. Provides privacy tips
```

### trackers.json
**The Bad Guys List** 📋
```json
{
  "trackers": [
    {
      "name": "Google Analytics",
      "domains": ["google-analytics.com"],
      "risk": "medium",
      "dataCollected": ["Page views", "User behavior"]
    }
  ]
}
```

## 🎮 Try different sites

| Website | Expected Grade | Why? |
|---------|----------------|------|
| amazon.com | D-F | Heavy tracking for ads |
| youtube.com | F | Google owns it (Google Analytics, Ads, etc.) |
| wikipedia.org | B-C | Non-profit, fewer trackers |
| duckduckgo.com | A-B | Privacy-focused, minimal tracking |

## 📊 Privacy Grades

Grading uses matched trackers (with risk weights), tracking-related cookies, third-party host volume, and storage-key heuristics—not a flat tracker count alone.

| Grade | Typical meaning |
|-------|-----------------|
| **A** | Very light tracking signals |
| **B** | Low |
| **C** | Moderate |
| **D** | Heavy |
| **F** | Very heavy |

## 🛠️ How to Customize

### Add More Trackers
Edit `data/trackers.json`:
```json
{
  "id": "tiktok-tracker",
  "name": "TikTok Analytics",
  "domains": ["tiktok.com"],
  "category": "social",
  "risk": "high",
  "dataCollected": ["Video interests", "User behavior"]
}
```

### Change Grade Thresholds
Edit `src/background.js`, find `calculateGrade()`:
```javascript
// Change these numbers to make grades easier/harder
if (trackerCount <= 2) return { grade: 'B', text: 'Good' };
if (trackerCount <= 4) return { grade: 'C', text: 'Fair' };
```

### Change Colors
Edit `ui/popup.html` (CSS variables such as `--accent`, `--glass-bg`, and related rules).

## 🧠 How It All Connects

```
USER VISITS WEBSITE
         ↓
CONTENT SCRIPT RUNS (detective.js)
  ↓ Collects scripts
  ↓ Collects cookies
  ↓ Finds external domains
         ↓
SENDS DATA TO BACKGROUND
         ↓
BACKGROUND SCRIPT PROCESSES (judge.js)
  ↓ Loads tracker database
  ↓ Finds matches
  ↓ Calculates grade
  ↓ Stores results
         ↓
USER CLICKS EXTENSION ICON
         ↓
POPUP LOADS (popup.js)
  ↓ Gets results from background
  ↓ Formats nicely
  ↓ Displays to user
         ↓
USER SEES PRIVACY GRADE!
```

## 🔍 Debugging

### Check Logs
1. Open DevTools: `F12`
2. Go to Console tab
3. Look for messages starting with:
   - 🔍 (from content script)
   - 📊 (from background)
   - ✅ (success messages)

### Extension Won't Load?
1. Go to `chrome://extensions/`
2. Scroll down to find your extension
3. Check the error message
4. Most common: wrong file path or syntax error

### Not Finding Trackers?
1. Make sure `data/trackers.json` has the tracker
2. Check the domain names match (case-insensitive)
3. Open Console (F12) and look for 🎯 message

## 📚 What You Learned Building This

✅ **How Chrome Extensions work**
- Manifest files
- Content scripts (run on websites)
- Background workers (background processing)
- Message passing between scripts

✅ **JavaScript Concepts**
- DOM manipulation (document.querySelectorAll)
- Asynchronous code (async/await, promises)
- JSON data handling
- Event listeners

✅ **How Tracking Works**
- Tracking scripts and pixels
- Cookies and their purpose
- Data collection patterns
- Where data flows

✅ **Real-World Skills**
- Git and GitHub
- File organization
- Debugging techniques
- Reading and understanding code

## 🚀 Next Steps (Ideas to Extend It)

1. **Interactive World Map**
   - Use leaflet.js to show data flows on a map
   - Animate lines from site to each country

2. **Privacy Policy Analyzer**
   - Auto-fetch privacy policy
   - Scan for risky phrases
   - Highlight dangerous clauses

3. **History & Reports**
   - Store analysis history
   - Export PDF reports
   - Compare privacy over time

4. **Settings Page**
   - Custom sensitivity levels
   - Whitelist/blacklist trackers
   - Theme options

5. **Block Trackers**
   - Add ability to block known trackers
   - Inject content blocker

## 📄 License

This project is open source. Use it, modify it, learn from it!

## 🎯 Remember

You just built a **real, working Chrome extension!** 🎉 This is something thousands of developers use. You now understand:
- How the internet tracks you
- How browsers work
- How extensions protect privacy
- Real JavaScript and Web APIs

Keep learning! 🚀
