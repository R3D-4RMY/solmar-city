// The city of Solmar: pure data, no drawing and no browser in it. A seeded generator lays
// out a road grid, blocks with buildings, parks, the docks and named story locations, and
// returns the colliders (building AABBs) the simulation uses. The renderer turns the same
// data into meshes.
import { CITY } from './config.js';
import { pick, range, rangeInt } from './random.js';

const { pitch, roadHalf } = CITY;
const ROADS = [];
for (let i = -CITY.blocks; i <= CITY.blocks; i += 1) ROADS.push(i * pitch);

const BUILDING_COLORS = [
  0xd8c9a8, 0xc9b8a3, 0xb8c4cc, 0xcfd6da, 0xe0d3c0, 0xbfae94, 0xa8b8c8, 0xd0b8a0,
];
const ROOF_COLORS = [0x4a4f57, 0x5a5148, 0x3f4a44, 0x6b5a4a];

function blockCenter(i, j) {
  return { x: (i + 0.5) * pitch, z: (j + 0.5) * pitch };
}

export function createCity(random) {
  const blocks = [];
  const colliders = [];
  const lamps = [];
  const trees = [];
  const benches = [];

  // Named story locations, placed on the map first so missions always have a spot.
  const locations = {
    hideout: { x: -3 * pitch - roadHalf - 6, z: 3 * pitch + roadHalf + 6, label: 'Hideout' },
    hotel: { x: 1 * pitch + roadHalf + 8, z: -2 * pitch - roadHalf - 8, label: 'Grand Solmar Hotel' },
    docks: { x: 0, z: 4 * pitch + roadHalf + 10, label: 'The Docks' },
    plaza: { x: -1 * pitch - roadHalf - 10, z: 1 * pitch + roadHalf + 10, label: 'Meridian Plaza' },
    garage: { x: 2 * pitch + roadHalf + 8, z: 2 * pitch + roadHalf + 8, label: 'Garage' },
    bank: { x: 0, z: -1 * pitch - roadHalf - 8, label: 'Solmar Bank' },
    mall: { x: -2 * pitch - roadHalf - 8, z: -1 * pitch - roadHalf - 8, label: 'Solmar Mall' },
    taxi: { x: -3 * pitch, z: -3 * pitch, label: 'Taxi Stand' },
    comet: { x: -2 * pitch + roadHalf + 6, z: -1 * pitch, label: 'Comet GT' },
  };

  // Lamps along every road, trees in parks and along sidewalks.
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      lamps.push({ x: rx + roadHalf + 1.2, z: rz + roadHalf + 1.2 });
      lamps.push({ x: rx - roadHalf - 1.2, z: rz - roadHalf - 1.2 });
    }
  }

  for (let i = -CITY.blocks; i < CITY.blocks; i += 1) {
    for (let j = -CITY.blocks; j < CITY.blocks; j += 1) {
      const c = blockCenter(i, j);
      const dist = Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5));
      let type = 'residential';
      if (dist <= 1.5) type = 'downtown';
      else if (dist >= 3.5 && random() < 0.25) type = 'park';
      // The docks sit on the south edge; the plaza block stays open.
      if (j === CITY.blocks - 1 && Math.abs(i) <= 1) type = 'docks';
      if (i === -1 && j === 1) type = 'plaza';

      const block = { cx: c.x, cz: c.z, type, buildings: [], trees: [] };
      const inset = roadHalf + 3;

      if (type === 'park') {
        for (let t = 0; t < 9; t += 1) {
          const tree = { x: c.x + range(random, -20, 20), z: c.z + range(random, -20, 20), s: range(random, 0.8, 1.4) };
          block.trees.push(tree);
          trees.push(tree);
        }
        benches.push({ x: c.x - 8, z: c.z, rot: 0 });
        benches.push({ x: c.x + 8, z: c.z, rot: Math.PI });
      } else if (type === 'plaza') {
        benches.push({ x: c.x - 10, z: c.z - 6, rot: 0.4 });
        benches.push({ x: c.x + 10, z: c.z + 6, rot: Math.PI + 0.4 });
        for (let t = 0; t < 4; t += 1) {
          const tree = { x: c.x + range(random, -16, 16), z: c.z + range(random, -16, 16), s: range(random, 0.9, 1.3) };
          block.trees.push(tree);
          trees.push(tree);
        }
      } else {
        const tall = type === 'downtown';
        const count = tall ? rangeInt(random, 1, 2) : rangeInt(random, 2, 4);
        for (let b = 0; b < count; b += 1) {
          const w = tall ? range(random, 20, 30) : range(random, 12, 22);
          const d = tall ? range(random, 20, 30) : range(random, 12, 22);
          const h = tall ? range(random, 26, 62) : type === 'docks' ? range(random, 8, 12) : range(random, 8, 20);
          const bx = c.x + range(random, -1, 1) * (pitch / 2 - inset - w / 2) * (count === 1 ? 0 : 1);
          const bz = c.z + range(random, -1, 1) * (pitch / 2 - inset - d / 2) * (count === 1 ? 0 : 1);
          const building = {
            x: count === 1 ? c.x : bx,
            z: count === 1 ? c.z : bz,
            w, d, h,
            color: pick(random, BUILDING_COLORS),
            roof: pick(random, ROOF_COLORS),
            floors: Math.max(2, Math.floor(h / 3.4)),
            lit: random(),
          };
          block.buildings.push(building);
          colliders.push({ x: building.x, z: building.z, hw: w / 2, hd: d / 2 });
        }
        if (random() < 0.6) {
          const tree = { x: c.x + range(random, -20, 20), z: c.z + range(random, -20, 20), s: range(random, 0.8, 1.2) };
          block.trees.push(tree);
          trees.push(tree);
        }
      }
      blocks.push(block);
    }
  }

  // Water at the south edge, well past the docks.
  const water = { z: 4 * pitch + roadHalf + 60, width: 560, depth: 40 };

  return {
    roads: ROADS,
    blocks,
    colliders,
    lamps,
    trees,
    benches,
    locations,
    water,
    spawn: { x: locations.hideout.x + 4, z: locations.hideout.z + 4 },
  };
}

/** Push a circle (x, z, radius) out of every building AABB it overlaps. Returns true on hit. */
export function collideCircle(city, pos, radius) {
  let hit = false;
  for (let i = 0; i < city.colliders.length; i += 1) {
    const c = city.colliders[i];
    const dx = pos.x - Math.max(c.x - c.hw, Math.min(pos.x, c.x + c.hw));
    const dz = pos.z - Math.max(c.z - c.hd, Math.min(pos.z, c.z + c.hd));
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Dead centre: push out along the smaller penetration axis.
        const px = c.hw + radius - Math.abs(pos.x - c.x);
        const pz = c.hd + radius - Math.abs(pos.z - c.z);
        if (px < pz) pos.x += (pos.x > c.x ? px : -px);
        else pos.z += (pos.z > c.z ? pz : -pz);
      }
    }
  }
  return hit;
}

export function clampToCity(pos, margin) {
  const b = CITY.bound - (margin || 0);
  pos.x = Math.max(-b, Math.min(b, pos.x));
  pos.z = Math.max(-b, Math.min(b, pos.z));
}
