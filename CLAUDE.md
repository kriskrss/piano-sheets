# Piano Sheets

## Overview
Single-page web app of one-finger piano tunes, built for two instruments: Gigglescape and Casio CT-X700 (per commit message and in-page piano switcher). Dark Spotify-like UI (black canvas, green accent) with searchable tune cards. Everything — markup, styles, and tune data — lives in one HTML file.

## Tech Stack
- Single static `index.html` (~32 KB), vanilla HTML/CSS/JS, no build step, no dependencies, no framework
- Inter/system font stack; CSS custom properties for the dark theme

## Architecture / Project Structure
- `index.html` — only file in the repo. Sticky header (brand, piano segmented switch Gigglescape/Casio, search), card grid (2→3→4 columns responsive), per-tune view/playback in the same file's `<script>`.
- `.gitignore`; branch `main`, single commit `5ca2582 Piano Sheets: one-finger tunes for Gigglescape and Casio CT-X700`.

## Key Files
`index.html` (the entire app).

## Entry Points
Open `index.html` in a browser (double-click / `file://` works; no server required).

## Build / Run / Test
```bash
open index.html        # macOS; or: python3 -m http.server 8000 and visit localhost:8000
node test-cadence.mjs  # rhythm/tempo/playback wiring
node test-tablet.mjs   # tablet breakpoints / safe-area / touch targets
```
- Build: none. Lint: none configured.

## Rhythm, Playback & Tutorial
- Each note token may carry `:beats` (e.g. `G:2` hold, `C:0.5` quick; default 1) and each tune a `bpm`. This is the cadence — do not strip suffixes.
- Play button: WebAudio playback (`playTune`/`tokenBeats`/`buildSequence`) scheduled by beats at the tempo slider, highlighting notes in sync. Casio pitches parse directly; Gigglescape pitches use nearest-key tracking from `startKey`.
- Follow-along sounds each note for its full beat length, and the small number under each note shows its beats, so holds/quicks are taught, not just pitches.
- Tablet layout targets iPad Pro 11" and Galaxy Tab S10 in both orientations: ≥700px breakpoints, 3/4-column grids, centred ≤920–980px focus view, `env(safe-area-inset-*)`, 44px touch targets, `@media (hover:none)`.

## Configuration / Env
None.

## Dependencies
None (no CDN calls needed for core function; fully self-contained file).

## Data / API Notes
Tune/note data is embedded in `index.html`'s script. No API, no storage backend.

## Conventions & Gotchas
- Keep it one file — the single-file shape is the delivery mechanism (easy to share/open on the piano tablet). Do not split into modules without a reason.
- The piano switcher (Gigglescape vs Casio CT-X700) changes the tune presentation; preserve both modes when editing tune data.

## Status
Complete single-file app (branch `main`). No README — this file is the documentation. No roadmap in repo.
