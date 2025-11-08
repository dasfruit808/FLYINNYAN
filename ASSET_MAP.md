# Flyin Nyan Asset Map

This catalog lists every bundled asset in the Flyin Nyan web app. Use it to quickly locate files, understand their purpose, and identify the code that references them. All paths are relative to the repository root.

## Image Assets

### Logos & Interface

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/logo.png` | PNG | Primary application logo used for loading screen and icons | `index.html`, `manifest.webmanifest`, `service-worker.js`, `scripts/app.js`

### Backgrounds

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/background.png` | PNG | Static background layer cached for offline play | `service-worker.js`
| `assets/background1.png` | PNG | Parallax background frame A | `scripts/app.js`, `service-worker.js`
| `assets/background2.png` | PNG | Parallax background frame B | `scripts/app.js`, `service-worker.js`
| `assets/background3.png` | PNG | Parallax background frame C | `scripts/app.js`, `service-worker.js`

### Player Portraits

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/player.png` | PNG | Default pilot portrait and ship | `scripts/app.js`, `service-worker.js`
| `assets/player2.png` | PNG | Alternate "Midnight" pilot theme | `scripts/app.js`, `service-worker.js`
| `assets/player3.png` | PNG | Alternate "Sunrise" pilot theme | `scripts/app.js`, `service-worker.js`

### Enemies & Hazards

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/villain1.png` | PNG | Enemy type 1 sprite | `scripts/app.js`, `service-worker.js`
| `assets/villain2.png` | PNG | Enemy type 2 sprite | `scripts/app.js`, `service-worker.js`
| `assets/villain3.png` | PNG | Enemy type 3 sprite | `scripts/app.js`, `service-worker.js`
| `assets/boss1.png` | PNG | Boss encounter art | `scripts/app.js`, `service-worker.js`
| `assets/asteroid1.png` | PNG | Asteroid variant 1 | `scripts/app.js`, `service-worker.js`
| `assets/asteroid2.png` | PNG | Asteroid variant 2 | `scripts/app.js`, `service-worker.js`
| `assets/asteroid3.png` | PNG | Asteroid variant 3 | `scripts/app.js`, `service-worker.js`

### Characters & UI States

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/character-happy.png` | PNG | Pilot hub character portrait (happy) | `scripts/app.js`, `service-worker.js`
| `assets/character-cheering.png` | PNG | Pilot hub character portrait (cheering) | `scripts/app.js`, `service-worker.js`
| `assets/character-sad.png` | PNG | Pilot hub character portrait (sad) | `scripts/app.js`, `service-worker.js`

### Collectibles

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/point.png` | PNG | Point pickup tier 1 | `scripts/app.js`, `service-worker.js`
| `assets/point2.png` | PNG | Point pickup tier 2 | `scripts/app.js`, `service-worker.js`
| `assets/point3.png` | PNG | Point pickup tier 3 | `scripts/app.js`, `service-worker.js`

### Power-Ups & Weapons

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/powerbomb.png` | PNG | Power Bomb pickup art | `scripts/app.js`, `service-worker.js`
| `assets/powerburger.png` | PNG | Bullet Spread pickup art | `scripts/app.js`, `service-worker.js`
| `assets/powerpizza.png` | PNG | Missiles pickup art | `scripts/app.js`, `service-worker.js`
| `assets/pump.png` | PNG | Pump Drive pickup art | `scripts/app.js`, `service-worker.js`
| `assets/powerbeam.svg` | SVG | Hyper Beam ability icon | `scripts/app.js`, `service-worker.js`
| `assets/powerchrono.svg` | SVG | Time Dilation ability icon | `scripts/app.js`, `service-worker.js`
| `assets/powerdouble.svg` | SVG | Double Team ability icon | `scripts/app.js`, `service-worker.js`
| `assets/powerdoubler.svg` | SVG | Score Surge ability icon | `scripts/app.js`, `service-worker.js`
| `assets/powerember.svg` | SVG | Flame Whip ability icon | `scripts/app.js`, `service-worker.js`
| `assets/powermagnet.svg` | SVG | Starlight Magnet ability icon | `scripts/app.js`, `service-worker.js`
| `assets/weapon-pulse.svg` | SVG | Pulse Array weapon icon | `scripts/app.js`, `service-worker.js`
| `assets/weapon-scatter.svg` | SVG | Scatter Volley weapon icon | `scripts/app.js`, `service-worker.js`
| `assets/weapon-lance.svg` | SVG | Stellar Lance weapon icon | `scripts/app.js`, `service-worker.js`

## Audio Assets

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/audio/gameplay.mp3` | MP3 | Gameplay background music loop | `scripts/app.js`, `service-worker.js`
| `assets/audio/hyperbeam.mp3` | MP3 | Hyper Beam charge and fire SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/point.mp3` | MP3 | Point collection SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/projectile-standard.mp3` | MP3 | Pulse Array projectile SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/projectile-spread.mp3` | MP3 | Scatter Volley projectile SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/projectile-missile.mp3` | MP3 | Missile projectile SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/explosion-generic.mp3` | MP3 | General explosion SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/explosion-asteroid.mp3` | MP3 | Asteroid explosion SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/explosion-powerbomb.mp3` | MP3 | Power Bomb explosion SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/explosion-villain1.mp3` | MP3 | Villain 1 destruction SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/explosion-villain2.mp3` | MP3 | Villain 2 destruction SFX | `scripts/app.js`, `service-worker.js`
| `assets/audio/explosion-villain3.mp3` | MP3 | Villain 3 destruction SFX | `scripts/app.js`, `service-worker.js`

## Typography

| Asset | Type | Purpose | Referenced From |
| --- | --- | --- | --- |
| `assets/FlightTime.ttf` | TrueType font | Custom HUD typeface for timer and UI | `styles/main.css`, `scripts/app.js`, `service-worker.js`

