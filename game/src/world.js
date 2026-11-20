// Solmar City simulation: no drawing, no browser in it. The player on foot or in a car,
// traffic that follows the road grid, pedestrians on the sidewalks, police that chase the
// player when wanted, the wanted system, and the mission story. step() advances one fixed
// step and queues events the caller reacts to (sounds, toasts, screen changes).
import { CAR, CITY, MAX_POLICE, MISSIONS, PED_COUNT, PLAYER, SIDE_FARE_REWARD, STEP, TRAFFIC_COUNT, WANTED } from './config.js';
import { clampToCity, collideCircle } from './city.js';
import { pick, range, rangeInt } from './random.js';

export const EVENT_CRASH = 1;
export const EVENT_MISSION = 2;
export const EVENT_BUSTED = 4;
export const EVENT_WASTED = 8;
export const EVENT_CRIME = 16;
export const EVENT_PICKUP = 32;

const CAR_COLORS = [0xc0392b, 0x2e86c1, 0x28b463, 0xf39c12, 0x8e44ad, 0xececec, 0x2c3e50, 0xd35400, 0x16a085, 0xb03a2e];
const PED_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c];

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function createWorld(city, random, save) {
  const events = [];
  const roads = city.roads;
  let carId = 0;

  const player = {
    x: city.spawn.x,
    z: city.spawn.z,
    heading: 0,
    health: PLAYER.health,
    money: save?.money ?? 0,
    rep: save?.rep ?? 0,
    inCar: null,
    enterCooldown: 0,
    punchCooldown: 0,
  };

  const mission = {
    index: save?.missionIndex ?? 0,
    stage: 'start',
    timer: 0,
    marker: null,
    text: '',
    done: save?.missionIndex >= MISSIONS.length,
  };

  const wanted = {
    stars: 0,
    lastCrime: -999,
    lastDecay: 0,
    bustTimer: 0,
  };

  const state = {
    time: 0,
    player,
    cars: [],
    peds: [],
    police: [],
    mission,
    wanted,
    sideFare: null,
    sideFareTimer: 20,
    best: save?.best ?? 0,
    explosions: [],
  };

  function addEvent(type, data) {
    events.push({ type, ...data });
  }

  function addWanted(stars) {
    if (stars <= 0) return;
    wanted.stars = Math.min(5, wanted.stars + stars);
    wanted.lastCrime = state.time;
    addEvent('crime', { stars: wanted.stars });
  }

  function nearestRoadIndex(value) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < roads.length; i += 1) {
      const d = Math.abs(roads[i] - value);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function randomIntersection() {
    return { ix: rangeInt(random, 0, roads.length - 1), iz: rangeInt(random, 0, roads.length - 1) };
  }

  function intersectionPoint(ix, iz) {
    return { x: roads[ix], z: roads[iz] };
  }

  function makeCar(kind, x, z, color) {
    const car = {
      id: carId++,
      kind,
      x, z,
      heading: range(random, 0, Math.PI * 2),
      speed: 0,
      color: color ?? pick(random, CAR_COLORS),
      health: CAR.health,
      yours: false,
      driver: kind === 'traffic',
      ix: nearestRoadIndex(x),
      iz: nearestRoadIndex(z),
      target: null,
      wreck: 0,
      smoke: 0,
    };
    state.cars.push(car);
    return car;
  }

  function pickTrafficTarget(car) {
    const options = [];
    if (car.ix > 0) options.push({ ix: car.ix - 1, iz: car.iz });
    if (car.ix < roads.length - 1) options.push({ ix: car.ix + 1, iz: car.iz });
    if (car.iz > 0) options.push({ ix: car.ix, iz: car.iz - 1 });
    if (car.iz < roads.length - 1) options.push({ ix: car.ix, iz: car.iz + 1 });
    const next = pick(random, options);
    const from = intersectionPoint(car.ix, car.iz);
    const to = intersectionPoint(next.ix, next.iz);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    // Right-hand lane: offset perpendicular to the direction of travel.
    const ox = (dz / len) * 3.4;
    const oz = (-dx / len) * 3.4;
    car.ix = next.ix;
    car.iz = next.iz;
    car.target = { x: to.x + ox, z: to.z + oz };
  }

  function spawnTrafficCar() {
    const inter = randomIntersection();
    const p = intersectionPoint(inter.ix, inter.iz);
    const car = makeCar('traffic', p.x + range(random, -4, 4), p.z + range(random, -4, 4));
    car.ix = inter.ix;
    car.iz = inter.iz;
    pickTrafficTarget(car);
    car.speed = range(random, 7, 11);
    return car;
  }

  function spawnPoliceCar() {
    // Appear on a road 45-70m from the player.
    let x = player.x;
    let z = player.z;
    for (let tries = 0; tries < 12; tries += 1) {
      const inter = randomIntersection();
      const p = intersectionPoint(inter.ix, inter.iz);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d > 45 && d < 80) {
        x = p.x;
        z = p.z;
        break;
      }
    }
    const car = makeCar('police', x, z, 0x1a1a2e);
    car.speed = 12;
    state.police.push(car);
    return car;
  }

  function spawnParkedCars() {
    for (let i = 0; i < 9; i += 1) {
      const inter = randomIntersection();
      const p = intersectionPoint(inter.ix, inter.iz);
      const alongRoad = random() < 0.5;
      const x = alongRoad ? p.x + range(random, -30, 30) : p.x + (random() < 0.5 ? -1 : 1) * (CITY.roadHalf + 1.6);
      const z = alongRoad ? p.z + (random() < 0.5 ? -1 : 1) * (CITY.roadHalf + 1.6) : p.z + range(random, -30, 30);
      const car = makeCar('parked', x, z);
      car.heading = alongRoad ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PED_COUNT; i += 1) {
      const block = pick(random, city.blocks);
      state.peds.push({
        block,
        t: random(),
        dir: random() < 0.5 ? 1 : -1,
        speed: range(random, 1.1, 1.9),
        color: pick(random, PED_COLORS),
        down: 0,
        flee: 0,
        x: block.cx,
        z: block.cz,
        heading: 0,
        walkPhase: random() * 6,
      });
    }
  }

  function pedPosition(ped) {
    // Walk the perimeter of the ped's block, just inside the sidewalk edge.
    const { cx, cz } = ped.block;
    const half = CITY.pitch / 2 - CITY.roadHalf - 2;
    const per = 8 * half;
    let d = ((ped.t % 1) + 1) % 1 * per;
    let x = cx - half;
    let z = cz - half;
    let heading = 0;
    if (d < 2 * half) {
      x = cx - half + d;
      heading = Math.PI / 2;
    } else if (d < 4 * half) {
      x = cx + half;
      z = cz - half + (d - 2 * half);
      heading = Math.PI;
    } else if (d < 6 * half) {
      x = cx + half - (d - 4 * half);
      z = cz + half;
      heading = -Math.PI / 2;
    } else {
      x = cx - half;
      z = cz + half - (d - 6 * half);
      heading = 0;
    }
    if (ped.dir < 0) heading += Math.PI;
    return { x, z, heading };
  }

  function missionLocation(key) {
    return city.locations[key];
  }

  function setMarker(key, label) {
    const loc = missionLocation(key);
    mission.marker = loc ? { x: loc.x, z: loc.z, label: label || loc.label } : null;
  }

  function startMission(index) {
    const m = MISSIONS[index];
    mission.index = index;
    mission.stage = 'start';
    mission.timer = 0;
    if (m.id === 'heat') {
      mission.text = 'Get wanted (steal a car or hit a cop), then lose the heat.';
      mission.marker = null;
    } else if (m.startAt) {
      setMarker(m.startAt);
      mission.text = m.brief;
    } else {
      mission.text = m.brief;
    }
  }

  function completeMission() {
    const m = MISSIONS[mission.index];
    player.money += m.reward;
    player.rep += 1;
    mission.index += 1;
    mission.done = mission.index >= MISSIONS.length;
    addEvent('mission', { name: m.name, reward: m.reward, done: mission.done });
    if (mission.done) {
      mission.text = 'Story complete! Free roam — side fares will appear around the city.';
      mission.marker = null;
      state.sideFareTimer = 8;
    } else {
      startMission(mission.index);
    }
    saveGame();
  }

  function saveGame() {
    try {
      window.localStorage.setItem('solmar-city.save.v1', JSON.stringify({
        money: player.money,
        rep: player.rep,
        missionIndex: mission.index,
        best: Math.max(state.best, player.money),
      }));
    } catch {
      // Storage off: progress lasts this visit only.
    }
  }

  function respawn(reason) {
    const loss = reason === 'busted' ? Math.min(player.money, 100) : Math.floor(player.money * 0.2);
    player.money = Math.max(0, player.money - loss);
    player.health = PLAYER.health;
    player.x = city.spawn.x;
    player.z = city.spawn.z;
    player.heading = 0;
    if (player.inCar) {
      player.inCar.yours = false;
      player.inCar = null;
    }
    wanted.stars = 0;
    wanted.bustTimer = 0;
    for (const cop of state.police) cop.wreck = 0.01;
    state.police = state.police.filter((c) => c.wreck === 0);
    addEvent(reason, { loss });
    saveGame();
  }

  function nearestCar(maxDist, excludePolice) {
    let bestCar = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (excludePolice && car.kind === 'police') continue;
      if (car.wreck > 0) continue;
      const d = dist2(player.x, player.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        bestCar = car;
      }
    }
    return bestCar;
  }

  function enterCar(car) {
    player.inCar = car;
    car.speed = 0;
    if (!car.yours) {
      car.yours = true;
      if (car.kind === 'traffic') {
        addWanted(1);
        addEvent('carjack', {});
      } else if (car.kind === 'parked') {
        addWanted(1);
      } else if (car.kind === 'comet' && mission.index === 2 && MISSIONS[2].id === 'hotwheels' && mission.stage === 'start') {
        addWanted(2);
      }
    }
    if (mission.index === 0 && car.kind === 'taxi' && mission.stage === 'start') {
      mission.stage = 'deliver';
      setMarker('hotel', 'Grand Solmar Hotel');
      mission.text = 'Passenger aboard — drop them at the Grand Solmar hotel.';
    }
    addEvent('enter', { kind: car.kind });
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    player.inCar = null;
    player.x = car.x + Math.cos(car.heading) * 3;
    player.z = car.z - Math.sin(car.heading) * 3;
    player.heading = car.heading;
    collideCircle(city, player, PLAYER.radius);
  }

  function punch() {
    player.punchCooldown = 0.45;
    let target = null;
    let bestD = 2.6 * 2.6;
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      const d = dist2(player.x, player.z, ped.x, ped.z);
      if (d < bestD) {
        bestD = d;
        target = ped;
      }
    }
    if (target) {
      target.down = 4;
      target.flee = 6;
      const copNear = state.police.some((c) => dist2(player.x, player.z, c.x, c.z) < 70 * 70);
      if (copNear) addWanted(1);
      addEvent('punch', {});
      return;
    }
    // Punching a cop car is a bad idea, but it is possible.
    for (const cop of state.police) {
      if (dist2(player.x, player.z, cop.x, cop.z) < 3 * 3) {
        addWanted(2);
        cop.health -= 10;
        addEvent('punch', {});
        return;
      }
    }
    addEvent('punch', {});
  }

  function updatePlayer(dt, move, camYaw, actions) {
    if (player.enterCooldown > 0) player.enterCooldown -= dt;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;

    if (actions & 4) { // ACTION_ENTER
      if (player.inCar) {
        if (player.enterCooldown <= 0) {
          exitCar();
          player.enterCooldown = 0.5;
        }
      } else if (player.enterCooldown <= 0) {
        const car = nearestCar(3.6, true);
        if (car) {
          enterCar(car);
          player.enterCooldown = 0.5;
        }
      }
    }
    if (actions & 8 && !player.inCar) punch(); // ACTION_PUNCH

    const car = player.inCar;
    if (car) {
      const throttle = move.y;
      const steer = move.x;
      if (throttle > 0) car.speed += CAR.accel * dt;
      else if (throttle < 0) {
        if (car.speed > 0.5) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.reverseAccel * dt;
      } else {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt);
      }
      if (actions & 16) addEvent('horn', {}); // ACTION_HORN
      car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
      const steerAmount = steer * CAR.steer * Math.min(1, Math.abs(car.speed) / 8) * (car.speed < 0 ? -1 : 1);
      car.heading += steerAmount * dt;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const prevX = car.x;
      const prevZ = car.z;
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      clampToCity(car, 2);
      if (collideCircle(city, car, CAR.radius)) {
        if (Math.abs(car.speed) > 9) {
          car.health -= (Math.abs(car.speed) - 9) * 1.2;
          addEvent('crash', { hard: true });
        }
        car.speed *= 0.45;
        car.x = prevX;
        car.z = prevZ;
        collideCircle(city, car, CAR.radius);
      }
      player.x = car.x;
      player.z = car.z;
      player.heading = car.heading;
      if (car.health <= 0 && car.wreck === 0) {
        car.wreck = 10;
        state.explosions.push({ x: car.x, z: car.z, t: 1.2 });
        addEvent('crash', { hard: true, exploded: true });
        player.inCar = null;
        player.x = car.x + 4;
        player.z = car.z + 4;
        player.health = Math.max(20, player.health - 25);
        collideCircle(city, player, PLAYER.radius);
      }
      return;
    }

    // On foot.
    const speed = move.y !== 0 || move.x !== 0 ? (move.y < 0 ? PLAYER.walkSpeed * 0.7 : PLAYER.walkSpeed) : 0;
    const runSpeed = PLAYER.runSpeed;
    const moving = move.x !== 0 || move.y !== 0;
    if (moving) {
      const mag = Math.hypot(move.x, move.y) || 1;
      const mx = move.x / mag;
      const my = move.y / mag;
      // Camera space: forward is -camYaw direction on the ground plane.
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      const rx = -fz;
      const rz = fx;
      const dx = fx * my + rx * mx;
      const dz = fz * my + rz * mx;
      const spd = move.y > 0 && !move.x ? (player.run ? runSpeed : speed) : speed;
      player.x += dx * spd * dt;
      player.z += dz * spd * dt;
      player.heading = Math.atan2(dx, dz);
      clampToCity(player, 1);
      collideCircle(city, player, PLAYER.radius);
    }
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      if (car.wreck > 0) continue;
      if (!car.target || dist2(car.x, car.z, car.target.x, car.target.z) < 6) pickTrafficTarget(car);
      const desired = Math.atan2(car.target.x - car.x, car.target.z - car.z);
      const diff = angleDiff(desired, car.heading);
      const turnRate = 2.2;
      car.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
      const targetSpeed = Math.abs(diff) > 0.7 ? 4 : 10;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      clampToCity(car, 2);
      collideCircle(city, car, CAR.radius);
    }
    // Keep the traffic count up near the player.
    const traffic = state.cars.filter((c) => c.kind === 'traffic' && c.wreck === 0);
    for (const car of traffic) {
      if (dist2(car.x, car.z, player.x, player.z) > 220 * 220) {
        const inter = randomIntersection();
        const p = intersectionPoint(inter.ix, inter.iz);
        car.x = p.x;
        car.z = p.z;
        car.ix = inter.ix;
        car.iz = inter.iz;
        pickTrafficTarget(car);
      }
    }
    if (traffic.length < TRAFFIC_COUNT) spawnTrafficCar();
  }

  function updatePeds(dt) {
    for (const ped of state.peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        continue;
      }
      if (ped.flee > 0) {
        ped.flee -= dt;
        const dx = ped.x - player.x;
        const dz = ped.z - player.z;
        const len = Math.hypot(dx, dz) || 1;
        ped.x += (dx / len) * 5 * dt;
        ped.z += (dz / len) * 5 * dt;
        ped.heading = Math.atan2(dx, dz);
        clampToCity(ped, 1);
        collideCircle(city, ped, 0.8);
        continue;
      }
      const per = 8 * (CITY.pitch / 2 - CITY.roadHalf - 2);
      ped.t += (ped.dir * ped.speed * dt) / per;
      const pos = pedPosition(ped);
      ped.x = pos.x;
      ped.z = pos.z;
      ped.heading = pos.heading;
      ped.walkPhase += dt * 6;
      // A speeding car nearby scares pedestrians.
      const car = player.inCar;
      if (car && Math.abs(car.speed) > 12 && dist2(ped.x, ped.z, car.x, car.z) < 14 * 14) {
        ped.flee = 3;
      }
    }
  }

  function updatePolice(dt) {
    const desired = wanted.stars === 0 ? 0 : Math.min(MAX_POLICE, wanted.stars);
    if (state.police.length < desired && state.time - (state.lastPoliceSpawn || 0) > 2.5) {
      spawnPoliceCar();
      state.lastPoliceSpawn = state.time;
    }
    for (const cop of state.police) {
      if (cop.wreck > 0) {
        cop.wreck -= dt;
        continue;
      }
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const d = Math.hypot(dx, dz);
      const desiredHeading = Math.atan2(dx, dz);
      const diff = angleDiff(desiredHeading, cop.heading);
      cop.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
      const targetSpeed = Math.min(24 + wanted.stars * 1.6, d < 10 ? 12 : 30);
      cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.2);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      clampToCity(cop, 2);
      collideCircle(city, cop, CAR.radius);
      // Ram the player.
      if (player.inCar) {
        const pc = player.inCar;
        if (dist2(cop.x, cop.z, pc.x, pc.z) < (CAR.radius + CAR.radius) * (CAR.radius + CAR.radius) * 0.7) {
          pc.health -= 14 * dt * 10 * 0.12;
          cop.speed *= 0.6;
          pc.speed *= 0.85;
          if (Math.random() < dt * 2) addEvent('crash', { hard: false });
        }
      } else if (d < WANTED.bustRange) {
        wanted.bustTimer += dt;
        if (wanted.bustTimer > WANTED.bustSeconds) {
          respawn('busted');
          return;
        }
      }
    }
    if (wanted.stars > 0) {
      const anyNear = state.police.some((c) => dist2(c.x, c.z, player.x, player.z) < 60 * 60);
      if (!anyNear) wanted.bustTimer = 0;
    } else {
      wanted.bustTimer = 0;
    }
    state.police = state.police.filter((c) => c.wreck > -5 || dist2(c.x, c.z, player.x, player.z) < 150 * 150);
  }

  function updateWanted(dt) {
    if (wanted.stars === 0) return;
    if (state.time - wanted.lastCrime < WANTED.decayDelay) return;
    const anyNear = state.police.some((c) => dist2(c.x, c.z, player.x, player.z) < 55 * 55);
    if (anyNear) return;
    if (state.time - wanted.lastDecay > WANTED.decayInterval) {
      wanted.stars -= 1;
      wanted.lastDecay = state.time;
    }
  }

  function updateCollisions(dt) {
    // Player car vs traffic / parked / police cars: separate overlapping circles.
    const pc = player.inCar;
    if (pc) {
      for (const car of state.cars) {
        if (car === pc || car.wreck > 0) continue;
        const d2 = dist2(pc.x, pc.z, car.x, car.z);
        const min = CAR.radius * 2 - 0.6;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.01;
          const push = (min - d) / 2;
          const nx = (car.x - pc.x) / d;
          const nz = (car.z - pc.z) / d;
          car.x += nx * push;
          car.z += nz * push;
          pc.x -= nx * push;
          pc.z -= nz * push;
          const impact = Math.abs(pc.speed);
          if (car.kind === 'police') {
            // A ram, not a crash: nudge apart and trade a little speed.
            pc.speed *= 0.92;
            car.speed *= 0.7;
            pc.health -= 2;
            continue;
          }
          if (impact > 10) {
            pc.health -= (impact - 10) * 0.5;
            car.health -= (impact - 10) * 0.5;
            addEvent('crash', { hard: true });
            pc.speed *= 0.6;
          }
          if (car.kind === 'traffic') {
            // The driver bails out.
            car.driver = false;
            car.kind = 'parked';
          }
        }
      }
      // Player car vs pedestrians.
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        if (dist2(pc.x, pc.z, ped.x, ped.z) < (CAR.radius + 0.9) * (CAR.radius + 0.9)) {
          if (Math.abs(pc.speed) > 4) {
            ped.down = 5;
            ped.flee = 8;
            addWanted(1);
            addEvent('crash', { hard: false });
            pc.speed *= 0.85;
          }
        }
      }
    }
  }

  function updateMission(dt) {
    if (mission.done) {
      updateSideFare(dt);
      return;
    }
    const m = MISSIONS[mission.index];
    if (m.timeLimit && mission.stage === 'deliver') {
      mission.timer += dt;
      if (mission.timer > m.timeLimit) {
        mission.stage = 'start';
        mission.timer = 0;
        setMarker(m.startAt);
        mission.text = `Too slow! ${m.brief}`;
        addEvent('missionFail', { name: m.name });
      }
    }
    const near = (loc, r) => dist2(player.x, player.z, loc.x, loc.z) < r * r;

    if (m.id === 'fare') {
      if (mission.stage === 'deliver' && player.inCar && player.inCar.kind === 'taxi') {
        const hotel = missionLocation('hotel');
        if (near(hotel, 10)) {
          mission.text = 'Fare complete.';
          completeMission();
        }
      }
    } else if (m.id === 'package') {
      if (mission.stage === 'start') {
        const docks = missionLocation('docks');
        if (near(docks, 7)) {
          mission.stage = 'deliver';
          mission.timer = 0;
          setMarker('plaza', 'Meridian Plaza');
          mission.text = 'Package picked up — deliver it to Meridian Plaza, fast!';
          addEvent('pickup', {});
        }
      } else if (mission.stage === 'deliver') {
        const plaza = missionLocation('plaza');
        if (near(plaza, 9)) completeMission();
      }
    } else if (m.id === 'hotwheels') {
      if (mission.stage === 'start' && player.inCar && player.inCar.kind === 'comet') {
        mission.stage = 'deliver';
        setMarker('garage', 'Rex’s Garage');
        mission.text = 'You have the Comet — get it to the garage in one piece.';
      } else if (mission.stage === 'deliver' && player.inCar && player.inCar.kind === 'comet') {
        const garage = missionLocation('garage');
        if (near(garage, 10)) completeMission();
      }
    } else if (m.id === 'heat') {
      if (mission.stage === 'start') {
        if (wanted.stars >= 2) {
          mission.stage = 'hide';
          setMarker('hideout', 'Hideout');
          mission.text = 'Heat is on! Lose the cops and reach the hideout with no stars.';
        }
      } else if (mission.stage === 'hide') {
        const hideout = missionLocation('hideout');
        if (wanted.stars === 0 && near(hideout, 10)) completeMission();
      }
    } else if (m.id === 'score') {
      if (mission.stage === 'start') {
        const bank = missionLocation('bank');
        if (near(bank, 7)) {
          mission.stage = 'deliver';
          wanted.stars = Math.max(wanted.stars, 3);
          wanted.lastCrime = state.time;
          setMarker('docks', 'The Docks');
          mission.text = 'Cash grabbed! The whole force is coming — get to the docks!';
          addEvent('pickup', {});
        }
      } else if (mission.stage === 'deliver') {
        const docks = missionLocation('docks');
        if (near(docks, 10)) completeMission();
      }
    }
  }

  function updateSideFare(dt) {
    if (!state.sideFare) {
      state.sideFareTimer -= dt;
      if (state.sideFareTimer <= 0) {
        const a = randomIntersection();
        const b = randomIntersection();
        const pa = intersectionPoint(a.ix, a.iz);
        const pb = intersectionPoint(b.ix, b.iz);
        if (Math.hypot(pa.x - pb.x, pa.z - pb.z) < 100) return;
        state.sideFare = {
          stage: 'pickup',
          pickup: pa,
          dropoff: pb,
          reward: pick(random, SIDE_FARE_REWARD),
        };
        mission.marker = { x: pa.x, z: pa.z, label: 'Passenger' };
        mission.text = `Side fare: pick up the passenger ($${state.sideFare.reward}).`;
      }
      return;
    }
    const fare = state.sideFare;
    if (fare.stage === 'pickup') {
      if (player.inCar && dist2(player.x, player.z, fare.pickup.x, fare.pickup.z) < 9 * 9) {
        fare.stage = 'deliver';
        mission.marker = { x: fare.dropoff.x, z: fare.dropoff.z, label: 'Drop-off' };
        mission.text = `Passenger aboard — drop them off ($${fare.reward}).`;
        addEvent('pickup', {});
      }
    } else if (fare.stage === 'deliver') {
      if (player.inCar && dist2(player.x, player.z, fare.dropoff.x, fare.dropoff.z) < 9 * 9) {
        player.money += fare.reward;
        player.rep += 1;
        addEvent('mission', { name: 'Side fare', reward: fare.reward, done: false });
        state.sideFare = null;
        state.sideFareTimer = 22;
        mission.marker = null;
        mission.text = 'Free roam — another fare will appear soon.';
        saveGame();
      } else if (!player.inCar && dist2(player.x, player.z, fare.pickup.x, fare.pickup.z) > 60 * 60 && fare.stage === 'deliver') {
        // Passenger waits in the car; nothing to do.
      }
    }
  }

  function updateExplosions(dt) {
    for (const ex of state.explosions) ex.t -= dt;
    state.explosions = state.explosions.filter((ex) => ex.t > 0);
    for (const car of state.cars) {
      if (car.wreck > 0) {
        car.wreck -= dt;
        if (car.wreck <= 0 && car.kind === 'police') {
          car.wreck = -10;
        }
      }
    }
  }

  function step(dt, move, camYaw, actions, run) {
    state.time += dt;
    player.run = run;
    updatePlayer(dt, move, camYaw, actions);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateWanted(dt);
    updateCollisions(dt);
    updateMission(dt);
    updateExplosions(dt);
    if (player.health <= 0) {
      respawn('wasted');
    }
    if (state.time % 10 < dt) saveGame();
  }

  function reset(newSave) {
    player.x = city.spawn.x;
    player.z = city.spawn.z;
    player.heading = 0;
    player.health = PLAYER.health;
    player.money = newSave?.money ?? 0;
    player.rep = newSave?.rep ?? 0;
    player.inCar = null;
    state.cars.length = 0;
    state.peds.length = 0;
    state.police.length = 0;
    state.explosions.length = 0;
    wanted.stars = 0;
    wanted.bustTimer = 0;
    state.time = 0;
    mission.index = newSave?.missionIndex ?? 0;
    mission.done = mission.index >= MISSIONS.length;
    spawnParkedCars();
    const taxi = makeCar('taxi', city.locations.taxi.x, city.locations.taxi.z, 0xf1c40f);
    taxi.heading = Math.PI / 2;
    const comet = makeCar('comet', city.locations.comet.x, city.locations.comet.z, 0xc0392b);
    comet.heading = -Math.PI / 2;
    spawnPeds();
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();
    if (mission.done) {
      mission.text = 'Free roam — side fares will appear around the city.';
      mission.marker = null;
    } else {
      startMission(mission.index);
    }
  }

  function drainEvents() {
    const out = events.splice(0, events.length);
    return out;
  }

  reset(save);
  return { state, step, reset, drainEvents, saveGame, addWanted };
}
