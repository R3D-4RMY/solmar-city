// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, the renderer paints what is there and the DOM HUD is updated. The game moves
// between title, play, paused, busted and wasted screens. Progress saves to localStorage.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_HORN, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const minimap = document.getElementById('minimap');
const city = createCity(createRandom(seed));
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const save = readSave();
const world = createWorld(city, createRandom(seed + 1), save);
const renderer = createRenderer(canvas, city, minimap);

// Debug/test hook: lets automated tests inspect and steer the game.
window.__solmar = { world, city, cam: null };

const cam = { yaw: 0.6, height: 7, dist: 12 };
window.__solmar.cam = cam;
let lastDragAt = 0;
let toastTimer = null;

const el = {
  money: document.getElementById('money'),
  rep: document.getElementById('rep'),
  wanted: document.getElementById('wanted'),
  healthFill: document.getElementById('health-fill'),
  healthText: document.getElementById('health-text'),
  speed: document.getElementById('speed'),
  missionTitle: document.getElementById('mission-title'),
  missionText: document.getElementById('mission-text'),
  missionDist: document.getElementById('mission-dist'),
  prompt: document.getElementById('prompt'),
  toast: document.getElementById('toast'),
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  end: document.getElementById('end-screen'),
  endTitle: document.getElementById('end-title'),
  endText: document.getElementById('end-text'),
  titleButtons: document.getElementById('title-buttons'),
  continueBtn: document.getElementById('continue-btn'),
  newBtn: document.getElementById('new-btn'),
  titleSave: document.getElementById('title-save'),
};

function showToast(message, seconds) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), (seconds || 3) * 1000);
}

function announce(message) {
  status.textContent = message;
}

function fmtMoney(value) {
  return `$${Math.floor(value).toLocaleString('en-US')}`;
}

function updateHud() {
  const { player, wanted, mission } = world.state;
  el.money.textContent = fmtMoney(player.money);
  el.rep.textContent = `REP ${player.rep}`;
  el.wanted.textContent = '★'.repeat(wanted.stars) + '☆'.repeat(5 - wanted.stars);
  el.wanted.classList.toggle('hot', wanted.stars > 0);
  const health = Math.max(0, Math.round(player.health));
  el.healthFill.style.width = `${health}%`;
  el.healthText.textContent = `${health}`;
  el.healthFill.classList.toggle('low', health < 30);
  if (player.inCar) {
    const kmh = Math.round(Math.abs(player.inCar.speed) * 3.6);
    el.speed.textContent = `${kmh} km/h`;
    el.speed.classList.remove('hidden');
  } else {
    el.speed.classList.add('hidden');
  }
  const m = mission.done ? null : MISSIONS[mission.index];
  el.missionTitle.textContent = mission.done ? 'Free Roam' : m ? `${mission.index + 1}/5 — ${m.name}` : '';
  el.missionText.textContent = mission.text;
  if (mission.marker) {
    const d = Math.hypot(player.x - mission.marker.x, player.z - mission.marker.z);
    el.missionDist.textContent = `${Math.round(d)}m — ${mission.marker.label}`;
    const activeMission = MISSIONS[mission.index];
    if (activeMission && activeMission.timeLimit && mission.stage === 'deliver') {
      const left = Math.max(0, Math.ceil(activeMission.timeLimit - mission.timer));
      el.missionDist.textContent += `  •  ${left}s left`;
    }
  } else {
    el.missionDist.textContent = '';
  }
  // Interaction prompt.
  let prompt = '';
  if (!player.inCar) {
    const near = world.state.cars.find((c) => c.kind !== 'police' && c.wreck <= 0 && Math.hypot(c.x - player.x, c.z - player.z) < 3.6);
    if (near) {
      prompt = near.kind === 'traffic' ? 'E — Carjack' : near.kind === 'parked' ? 'E — Steal car' : near.kind === 'taxi' ? 'E — Get in the taxi' : near.kind === 'comet' ? 'E — Get in the Comet' : 'E — Enter car';
    }
  } else {
    prompt = 'E — Get out   •   Space — Brake   •   H — Horn';
  }
  el.prompt.textContent = prompt;
  el.prompt.classList.toggle('show', prompt !== '');
}

function handleEvents() {
  for (const event of world.drainEvents()) {
    if (event.type === 'crash') {
      audio.crash();
      renderer.addShake(event.hard ? 0.7 : 0.3);
    } else if (event.type === 'mission') {
      audio.mission();
      showToast(`${event.name} complete — +${fmtMoney(event.reward)}`, 4);
      announce(`${event.name} complete. Earned ${fmtMoney(event.reward)}.`);
    } else if (event.type === 'missionFail') {
      showToast(`${event.name} failed — try again.`, 4);
    } else if (event.type === 'pickup') {
      audio.pickup();
    } else if (event.type === 'punch') {
      audio.punch();
      renderer.addShake(0.25);
    } else if (event.type === 'horn') {
      audio.horn();
    } else if (event.type === 'crime') {
      // No extra sound; the siren starts with the stars.
    } else if (event.type === 'enter') {
      audio.click();
    } else if (event.type === 'carjack') {
      showToast('Carjacked! The driver ran off — the cops noticed.', 3);
    } else if (event.type === 'busted') {
      audio.busted();
      showEnd('BUSTED', `The Solmar PD caught you. You lost ${fmtMoney(event.loss)} in bail.`);
    } else if (event.type === 'wasted') {
      audio.busted();
      showEnd('WASTED', `You woke up at the hideout, ${fmtMoney(event.loss)} lighter.`);
    }
  }
}

function showEnd(title, text) {
  el.endTitle.textContent = title;
  el.endText.textContent = text;
  el.end.classList.remove('hidden');
  announce(`${title}. ${text}`);
}

function hideScreens() {
  el.title.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.end.classList.add('hidden');
}

function runShot(name) {
  const scene = stageShot(name, world, cam);
  renderer.snapCamera(cam, world.state);
  updateHud();
  let painted = 0;
  function paint() {
    renderer.render(world.state, cam, 6, STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  if (scene.screen === 'title') {
    el.title.classList.remove('hidden');
    el.continueBtn.classList.add('hidden');
    el.titleSave.textContent = 'A fresh city, ready to play.';
  } else {
    hideScreens();
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let muted = false;
  // Adaptive quality: software renderers (SwiftShader) crawl on a full 3D scene, so
  // drop the render scale — and then the shadows — when the frame rate stays low.
  // Real GPUs stay at full quality.
  let qualityLevel = 0;
  let qualityTimer = 0;
  let frameEma = 1 / 60;

  function adaptQuality(dt) {
    frameEma = frameEma * 0.95 + dt * 0.05;
    qualityTimer += dt;
    if (qualityTimer < 2.5 || qualityLevel >= 2) return;
    qualityTimer = 0;
    const fps = 1 / Math.max(frameEma, 0.001);
    if (fps < 18) {
      qualityLevel += 1;
      if (qualityLevel === 1) {
        renderer.setRenderScale(0.66);
      } else {
        renderer.setRenderScale(0.5);
        renderer.setShadows(false);
      }
    }
  }

  function startGame(fresh) {
    if (fresh) {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // ignore
      }
      world.reset(null);
    }
    audio.unlock();
    hideScreens();
    screen = 'play';
    renderer.snapCamera(cam, world.state);
    announce('Playing. Follow the yellow marker.');
  }

  function setupTitle() {
    if (save && save.missionIndex > 0 || (save && (save.money > 0 || save.rep > 0))) {
      el.titleSave.textContent = `Save found — ${fmtMoney(save.money)}, REP ${save.rep}, mission ${Math.min(save.missionIndex + 1, 5)}/5.`;
      el.continueBtn.classList.remove('hidden');
    } else {
      el.titleSave.textContent = 'A fresh start in Solmar City.';
      el.continueBtn.classList.add('hidden');
    }
  }

  el.continueBtn.addEventListener('click', () => {
    audio.unlock();
    startGame(false);
  });
  el.newBtn.addEventListener('click', () => {
    audio.unlock();
    startGame(true);
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    audio.unlock();
    el.end.classList.add('hidden');
    screen = 'play';
  });
  document.getElementById('pause-resume-btn').addEventListener('click', () => {
    audio.unlock();
    el.pause.classList.add('hidden');
    screen = 'play';
  });
  document.getElementById('pause-quit-btn').addEventListener('click', () => {
    world.saveGame();
    el.pause.classList.add('hidden');
    el.title.classList.remove('hidden');
    setupTitle();
    screen = 'title';
  });
  document.getElementById('mute-btn').addEventListener('click', () => {
    muted = !muted;
    audio.setMuted(muted);
    document.getElementById('mute-btn').textContent = muted ? '🔇 Unmute (M)' : '🔊 Mute (M)';
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM' && !event.repeat) {
      muted = !muted;
      audio.setMuted(muted);
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    adaptQuality(dt);

    // Camera orbit from mouse drag; wheel zooms.
    const drag = input.takeDrag();
    if (drag.x !== 0 || drag.y !== 0) {
      cam.yaw -= drag.x * 0.005;
      cam.height = Math.max(3.5, Math.min(60, cam.height + drag.y * 0.05));
      lastDragAt = now;
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) {
      cam.dist = Math.max(7, Math.min(26, cam.dist + wheel * 0.01));
    }

    const actions = input.takeActions();
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) startGame(false);
    } else if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        screen = 'paused';
        el.pause.classList.remove('hidden');
        announce('Paused.');
      }
    } else if (screen === 'paused') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        el.pause.classList.add('hidden');
        screen = 'play';
        announce('Playing.');
      }
    } else if (screen === 'end') {
      if (actions & ACTION_CONFIRM) {
        el.end.classList.add('hidden');
        screen = 'play';
      }
    }

    if (screen === 'play') {
      const move = input.move();
      const run = input.run();
      // Auto-align the camera behind a driven car when the player is not orbiting.
      const car = world.state.player.inCar;
      if (car && now - lastDragAt > 2500) {
        const targetYaw = car.heading + Math.PI;
        let diff = targetYaw - cam.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cam.yaw += diff * Math.min(1, dt * 1.4);
        cam.height += (6.5 - cam.height) * Math.min(1, dt * 1.5);
        cam.dist += (13 - cam.dist) * Math.min(1, dt * 1.5);
      }
      accumulator += dt;
      let guard = 0;
      while (accumulator >= STEP && guard < 8) {
        world.step(STEP, move, cam.yaw, actions, run);
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 8) accumulator = 0;
      world.state._moving = move.x !== 0 || move.y !== 0;
      handleEvents();
      const driving = !!world.state.player.inCar;
      audio.engine(driving ? Math.abs(world.state.player.inCar.speed) / 34 : 0, driving);
      audio.siren(dt, world.state.wanted.stars);
      updateHud();
      renderer.render(world.state, cam, now / 1000, dt);
    } else if (screen === 'title') {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= STEP && guard < 8) {
        world.step(STEP, { x: 0, y: 0 }, cam.yaw, 0, false);
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 8) accumulator = 0;
      renderer.render(world.state, cam, now / 1000, dt);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      el.pause.classList.remove('hidden');
      announce('Paused.');
    }
  });

  setupTitle();
  announce('Solmar City. Press Space or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
