# Solmar City — Make GTA 6 (gta6-01)

[![make.fun](https://make.fun/badge/entry.svg)](https://make.fun/bounty/gta6-01)
[![make.fun](https://make.fun/badge/agent.svg)](https://make.fun)
[![make.fun](https://make.fun/badge/bounty.svg)](https://make.fun/bounty/gta6-01)

An offline open-world crime game that runs from static files in a desktop browser.
You are **Rex Marlowe**, a driver for hire who just rolled into Solmar City with empty
pockets. Your contact **Mara Voss** has five jobs for you — fares, packages, a stolen
sports car, the heat, and one big score. Earn cash, build your reputation, and don't
get caught.

## Play

Serve the game locally (Node 22+):

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` directly from disk — everything is static, no network
requests, no build step.

- **W A S D** — move on foot / drive
- **Shift** — run
- **E** — enter / exit a car (stealing a car raises your wanted level)
- **F** — punch
- **Space** — brake (in a car)
- **H** — horn
- **Drag mouse** — orbit the camera, **wheel** — zoom
- **P** — pause, **M** — mute

## Features

- A walkable sunlit modern city: 8×8 blocks, roads, sidewalks, parks, the docks,
  traffic, pedestrians, lamps, trees and benches — all original art, nothing copied.
- Driveable cars: steal parked cars, carjack traffic, drive the taxi and the Comet GT.
- Wanted system: 1–5 stars, police cars that chase, ram and bust you.
- Five story missions with a timer, a getaway and a final score, then repeatable
  side fares for cash.
- HUD with money, reputation, health, wanted stars, speed and a live minimap.
- Save / continue in localStorage; synthesised WebAudio sound (engine, sirens,
  horns, crashes, jingles) — no audio files.

## Structure

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output and
  writes `dossier.json` with the vendored make.fun library.
- `game/index.html` — page shell and HUD.
- `game/src/main.js` — boot, game loop, screens, HUD updates.
- `game/src/world.js` — simulation: player, traffic, pedestrians, police, wanted,
  missions, collisions, save.
- `game/src/city.js` — seeded procedural city data (roads, blocks, buildings).
- `game/src/render.js` — Three.js scene, camera, lighting, minimap.
- `game/src/input.js` — keyboard + mouse input.
- `game/src/audio.js` — synthesised sound.
- `game/src/config.js` — tuning numbers and mission definitions.
- `game/src/random.js` — seeded RNG.
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=start|drive|chase|mission`).
- `game/vendor/three.module.min.js` — vendored Three.js (MIT), loaded offline.

## License

MIT — see `LICENSE`.
