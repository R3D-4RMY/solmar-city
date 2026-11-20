// Solmar City — every tuning number and colour in one place.
// The city is a grid of blocks separated by roads; all distances are metres.
export const CITY = {
  pitch: 60, // block + road
  roadHalf: 7, // half the road width
  blocks: 4, // roads at -4..4 pitch, blocks between them
  bound: 272, // playable clamp
};

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 0.9,
  walkSpeed: 6,
  runSpeed: 9.5,
  health: 100,
};

export const CAR = {
  radius: 2.4,
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 1.9, // rad/s at full lock, scaled by speed
  grip: 8,
  health: 100,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 26;
export const MAX_POLICE = 4;

export const WANTED = {
  decayDelay: 18, // seconds without crime before stars start falling
  decayInterval: 9, // seconds per star lost while unseen
  bustSeconds: 2.2, // police within range this long on foot = busted
  bustRange: 4.5,
  chaseRange: 130,
};

export const SAVE_KEY = 'solmar-city.save.v1';

export const PALETTE = {
  sky: 0x87b5e0,
  fog: 0x9fc3e2,
  sun: 0xfff2d8,
  asphalt: 0x3a3f46,
  sidewalk: 0x9a9aa0,
  curb: 0x6f6f76,
  grass: 0x5d9b4a,
  plaza: 0xb8a88a,
  water: 0x2e6f8e,
  buildingTop: 0x555a63,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Missions: the story of Rex Marlowe, a driver for hire in Solmar City.
export const MISSIONS = [
  {
    id: 'fare',
    name: 'First Fare',
    brief: 'Mara needs a driver. Take the yellow taxi at the stand and drop the passenger at the Grand Solmar hotel.',
    reward: 150,
    startAt: 'taxi',
    target: 'hotel',
    targetLabel: 'Grand Solmar Hotel',
  },
  {
    id: 'package',
    name: 'Package Run',
    brief: 'Pick up the package at the docks and deliver it to Meridian Plaza. 90 seconds — the client hates waiting.',
    reward: 250,
    startAt: 'docks',
    target: 'plaza',
    targetLabel: 'Meridian Plaza',
    timeLimit: 90,
  },
  {
    id: 'hotwheels',
    name: 'Hot Wheels',
    brief: 'A collector wants the crimson Comet GT parked near the mall. Take it — the cops will notice — and bring it to the garage.',
    reward: 400,
    startAt: 'comet',
    target: 'garage',
    targetLabel: 'Rex’s Garage',
    stealCar: true,
  },
  {
    id: 'heat',
    name: 'Lose the Heat',
    brief: 'The heat is on. Get wanted, then shake the cops and reach the hideout with a clean slate.',
    reward: 300,
    target: 'hideout',
    targetLabel: 'Hideout',
    needWanted: 2,
  },
  {
    id: 'score',
    name: 'The Big Score',
    brief: 'Grab the cash from Solmar Bank and get to the docks. The whole force will be on you — drive like your life depends on it.',
    reward: 1000,
    startAt: 'bank',
    target: 'docks',
    targetLabel: 'The Docks',
    forceWanted: 3,
  },
];

export const SIDE_FARE_REWARD = [60, 80, 100];
