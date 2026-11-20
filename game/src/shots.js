// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real
// simulation forward from a fresh world for a fixed number of steps with scripted input,
// so the frame is what real play looks like and the same seed always gives the same frame.
import { STEP } from './config.js';

export function stageShot(name, world, cam) {
  const { state } = world;
  const player = state.player;

  if (name === 'drive') {
    // Put the player in the yellow taxi and drive east along the taxi-stand road.
    const taxi = state.cars.find((c) => c.kind === 'taxi');
    player.inCar = taxi;
    taxi.yours = true;
    taxi.heading = Math.PI / 2;
    taxi.x = -180;
    taxi.z = -180;
    player.x = taxi.x;
    player.z = taxi.z;
    // The fare is on: passenger aboard, heading for the hotel.
    state.mission.stage = 'deliver';
    state.mission.marker = { x: 75, z: -135, label: 'Grand Solmar Hotel' };
    state.mission.text = 'Passenger aboard — drop them at the Grand Solmar hotel.';
    cam.yaw = taxi.heading + Math.PI;
    cam.dist = 13;
    cam.height = 6.5;
    for (let i = 0; i < 7 / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 1 }, cam.yaw, 0, false);
      cam.yaw = taxi.heading + Math.PI;
    }
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // The player flees in the Comet with police cars on their tail.
    const comet = state.cars.find((c) => c.kind === 'comet');
    player.inCar = comet;
    comet.yours = true;
    comet.health = 500; // staged: the car must survive the chase for the shot
    comet.heading = Math.PI / 2;
    comet.x = -120;
    comet.z = 0;
    comet.speed = 20;
    player.x = comet.x;
    player.z = comet.z;
    player.health = 100;
    state.wanted.stars = 3;
    state.wanted.lastCrime = 0;
    state.mission.text = 'Lose the cops!';
    state.mission.marker = null;
    // Two police cars already in pursuit behind the Comet.
    for (const [px, pz] of [[-142, 3], [-154, -4]]) {
      const cop = {
        id: 900 + state.cars.length, kind: 'police', x: px, z: pz,
        heading: Math.PI / 2, speed: 22, color: 0x1a1a2e, health: 100,
        yours: false, driver: false, ix: 0, iz: 0, target: null, wreck: 0, smoke: 0,
      };
      state.cars.push(cop);
      state.police.push(cop);
    }
    cam.yaw = comet.heading + Math.PI;
    cam.dist = 14;
    cam.height = 7;
    for (let i = 0; i < 4 / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 1 }, cam.yaw, 0, false);
      cam.yaw = comet.heading + Math.PI;
    }
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // On foot north of the docks, facing south at the mission beacon.
    player.x = 0;
    player.z = 238;
    player.heading = 0;
    state.mission.marker = { x: 0, z: 257, label: 'The Docks' };
    state.mission.text = 'The Big Score — get to the docks!';
    cam.yaw = Math.PI;
    cam.dist = 11;
    cam.height = 5.5;
    for (let i = 0; i < 3 / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 0 }, cam.yaw, 0, false);
    }
    return { screen: 'play' };
  }

  // start: the title screen over a living city, camera high above downtown.
  cam.yaw = 0.7;
  cam.dist = 110;
  cam.height = 62;
  for (let i = 0; i < 6 / STEP; i += 1) {
    world.step(STEP, { x: 0, y: 0 }, cam.yaw, 0, false);
  }
  return { screen: 'title' };
}
