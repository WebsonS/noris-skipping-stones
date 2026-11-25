# Nori's Skipping Stones

Nori, a little black sticker cat, skips stones across a painted lake. You hunt for the perfect throw, watch every bounce play out like a highlight reel, and collect 14 magical stones.

## How to run

**Quickest:** double-click `index.html`. It opens in Chrome, Edge or Firefox. There's no build step and no install.

**Recommended (works the same in every browser, and lets you open it on your phone):**

```bash
cd game
python -m http.server 8123
```

Then open <http://localhost:8123>. For a phone on the same Wi-Fi, open `http://<your-computer's-IP>:8123`.

**To share it:** upload the whole `game` folder to any static host, such as Netlify Drop, GitHub Pages or itch.io (as an HTML5 game).

Fonts come from Google Fonts when you're online. Offline, the game falls back to system fonts. Music and sound effects are generated live in the browser.

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Tilt the stone | Mouse **wheel**, **↑ ↓** / **W S**, or drag the angle dial | Slide your thumb up/down on the **left half** (or drag the dial) |
| Wind up & throw | **Hold click** anywhere (or **Space**), release at the top of the ring | **Hold the paw button**, let go |
| Bonus tap | **Click / Space** as the shrinking ring closes on the water | **Tap** anywhere as the ring closes |
| Throw again | **Space / Enter** | Tap **Throw again** |
| Stone pouch | **R**, or the stone button (top right) | Stone button (top right) |

## Tests

```bash
node tools/test.js        # core rules: instant sinks, 1-3 skips, rare 7+, energy loss, scoring, unlocks, save memory
node tools/tune.js glass  # skip table (angle × power) for any stone
```
