// Drawing only: the city data and the world's state in, pixels out. Three.js builds the
// sunlit city once; per frame it moves the player, cars and pedestrians, follows the
// camera, and paints the 2D minimap. No game rules live here.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function makeCanvasTexture(size, draw, repeatX, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX || 1, repeatY || 1);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function facadeTexture(base, lit, floors) {
  return makeCanvasTexture(128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const cols = 5;
    const rows = Math.max(3, Math.min(14, floors));
    const cw = s / cols;
    const ch = s / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const litWindow = ((r * 7 + c * 3 + Math.floor(lit * 13)) % 10) < 4;
        ctx.fillStyle = litWindow ? '#ffd98a' : '#2c3a4a';
        ctx.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
      }
    }
  });
}

function roadTexture() {
  return makeCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#43484f';
    for (let i = 0; i < 400; i += 1) {
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(s / 2 - 2, 0, 4, 40);
    ctx.fillRect(s / 2 - 2, 128, 4, 40);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(8, 0, 3, s);
    ctx.fillRect(s - 11, 0, 3, s);
  });
}

function crosswalkTexture() {
  return makeCanvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8e8e8';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(6 + i * 24, 8, 12, s - 16);
    }
  });
}

function carMesh(color, kind) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.55, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2733, metalness: 0.4, roughness: 0.15 }),
  );
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xfff2a0, emissiveIntensity: 0.8 });
  for (const x of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    head.position.set(x, 0.6, 2.22);
    group.add(head);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xcc0000, emissiveIntensity: 0.6 });
  for (const x of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tail.position.set(x, 0.6, -2.22);
    group.add(tail);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.48, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 }));
    red.position.set(-0.32, 1.56, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 2 }));
    blue.position.set(0.32, 1.56, -0.2);
    group.add(blue);
    group.userData.lightBar = { red, blue };
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xf1c40f, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.5, -0.2);
    group.add(sign);
  }
  if (kind === 'comet') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.4), paint);
    spoiler.position.set(0, 1.05, -2.1);
    group.add(spoiler);
  }
  return group;
}

function personMesh(color) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants);
  legL.position.set(-0.16, 0.36, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants);
  legR.position.set(0.16, 0.36, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), shirt);
  armL.position.set(-0.42, 1.12, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), shirt);
  armR.position.set(0.42, 1.12, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export function createRenderer(canvas, city, minimapCanvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 480);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // Ground: grass base, roads, sidewalks, crosswalks, water.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshStandardMaterial({ color: 0x6fae56, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadTex = roadTexture();
  const roadLen = CITY.bound * 2 + 20;
  for (const r of city.roads) {
    // North-south road (constant x): long in z, dashes run along z.
    const texV = roadTex.clone();
    texV.needsUpdate = true;
    texV.repeat.set(1, roadLen / 14);
    const roadV = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.roadHalf * 2, roadLen),
      new THREE.MeshStandardMaterial({ map: texV, roughness: 0.95 }),
    );
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(r, 0.01, 0);
    roadV.receiveShadow = true;
    scene.add(roadV);
    // East-west road (constant z): long in x, dashes run along x.
    const texH = roadTex.clone();
    texH.needsUpdate = true;
    texH.center.set(0.5, 0.5);
    texH.rotation = Math.PI / 2;
    texH.repeat.set(roadLen / 14, 1);
    const roadH = new THREE.Mesh(
      new THREE.PlaneGeometry(roadLen, CITY.roadHalf * 2),
      new THREE.MeshStandardMaterial({ map: texH, roughness: 0.95 }),
    );
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(0, 0.01, r);
    roadH.receiveShadow = true;
    scene.add(roadH);
  }

  const crossTex = crosswalkTexture();
  const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, roughness: 0.95 });
  for (const rx of city.roads) {
    for (const rz of city.roads) {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadHalf * 2, CITY.roadHalf * 2), crossMat);
      cross.rotation.x = -Math.PI / 2;
      cross.position.set(rx, 0.02, rz);
      cross.receiveShadow = true;
      scene.add(cross);
    }
  }

  // Sidewalks: one raised slab per block.
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  const plazaMat = new THREE.MeshStandardMaterial({ color: PALETTE.plaza, roughness: 1 });
  const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 });
  for (const block of city.blocks) {
    const mat = block.type === 'park' ? grassMat : block.type === 'plaza' ? plazaMat : sidewalkMat;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(CITY.pitch - CITY.roadHalf * 2 + 4, 0.24, CITY.pitch - CITY.roadHalf * 2 + 4), mat);
    slab.position.set(block.cx, 0.1, block.cz);
    slab.receiveShadow = true;
    scene.add(slab);
  }

  // Water at the south edge.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 70),
    new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.2, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.03, city.water.z);
  scene.add(water);

  // Buildings, with windowed facades.
  const facadeCache = new Map();
  function facade(colorHex, floors, lit) {
    const key = `${colorHex}|${floors}|${lit}`;
    if (!facadeCache.has(key)) {
      const base = `#${colorHex.toString(16).padStart(6, '0')}`;
      facadeCache.set(key, facadeTexture(base, lit, floors));
    }
    return facadeCache.get(key);
  }
  const buildingGroup = new THREE.Group();
  for (const block of city.blocks) {
    for (const b of block.buildings) {
      const side = new THREE.MeshStandardMaterial({ map: facade(b.color, b.floors, b.lit), roughness: 0.85 });
      const roof = new THREE.MeshStandardMaterial({ color: b.roof, roughness: 1 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [side, side, roof, roof, side, side]);
      mesh.position.set(b.x, b.h / 2 + 0.2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      buildingGroup.add(mesh);
    }
  }
  scene.add(buildingGroup);

  // Trees and lamps, instanced.
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(1.5, 3.4, 8);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7d33, roughness: 1 });
  const treeCount = city.trees.length;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeCount);
  const dummy = new THREE.Object3D();
  city.trees.forEach((t, i) => {
    dummy.position.set(t.x, 1.0 * t.s, t.z);
    dummy.scale.setScalar(t.s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, (1.6 + 1.7) * t.s, t.z);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true;
  leaves.castShadow = true;
  scene.add(trunks);
  scene.add(leaves);

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.8 });
  const lampHeadGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, city.lamps.length);
  const heads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, city.lamps.length);
  city.lamps.forEach((lamp, i) => {
    dummy.position.set(lamp.x, 2.6, lamp.z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(lamp.x, 5.3, lamp.z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);

  // Benches.
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  for (const bench of city.benches) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.7), benchMat);
    b.position.set(bench.x, 0.5, bench.z);
    b.rotation.y = bench.rot;
    b.castShadow = true;
    scene.add(b);
  }

  // The player, cars and pedestrians are created once and moved each frame.
  const playerMesh = personMesh(0x1f8a70);
  playerMesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(playerMesh);

  const carMeshes = new Map();
  function carMeshFor(car) {
    if (!carMeshes.has(car.id)) {
      const mesh = carMesh(car.color, car.kind);
      scene.add(mesh);
      carMeshes.set(car.id, mesh);
    }
    return carMeshes.get(car.id);
  }

  const pedMeshes = new Map();
  function pedMeshFor(ped, index) {
    if (!pedMeshes.has(index)) {
      const mesh = personMesh(ped.color);
      scene.add(mesh);
      pedMeshes.set(index, mesh);
    }
    return pedMeshes.get(index);
  }

  // Mission beacon: a column of light and a bouncing arrow.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 16, 1, true), beaconMat);
  scene.add(beacon);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 1.6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  arrow.rotation.x = Math.PI;
  scene.add(arrow);
  const beaconLight = new THREE.PointLight(0xffd23e, 12, 40);
  scene.add(beaconLight);

  // Explosion smoke puffs.
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x666666, transparent: true, opacity: 0.45, roughness: 1 });
  const smokeMeshes = [];
  for (let i = 0; i < 6; i += 1) {
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), smokeMat.clone());
    smoke.visible = false;
    scene.add(smoke);
    smokeMeshes.push(smoke);
  }

  const minimapCtx = minimapCanvas.getContext('2d');
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let shake = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function drawMinimap(worldState) {
    const size = minimapCanvas.width;
    const scale = size / (CITY.bound * 2 + 20);
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    minimapCtx.fillStyle = 'rgba(10, 16, 24, 0.85)';
    minimapCtx.fillRect(0, 0, size, size);
    minimapCtx.strokeStyle = '#4a5058';
    minimapCtx.lineWidth = Math.max(2, CITY.roadHalf * 2 * scale);
    for (const r of city.roads) {
      const [x1, y1] = toMap(r, -CITY.bound);
      const [x2, y2] = toMap(r, CITY.bound);
      minimapCtx.beginPath();
      minimapCtx.moveTo(x1, y1);
      minimapCtx.lineTo(x2, y2);
      minimapCtx.stroke();
      const [x3, y3] = toMap(-CITY.bound, r);
      const [x4, y4] = toMap(CITY.bound, r);
      minimapCtx.beginPath();
      minimapCtx.moveTo(x3, y3);
      minimapCtx.lineTo(x4, y4);
      minimapCtx.stroke();
    }
    minimapCtx.fillStyle = '#5a636e';
    for (const block of city.blocks) {
      for (const b of block.buildings) {
        const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
        minimapCtx.fillRect(x, y, Math.max(1.5, b.w * scale), Math.max(1.5, b.d * scale));
      }
    }
    // Traffic dots.
    minimapCtx.fillStyle = '#9aa3ad';
    for (const car of worldState.cars) {
      if (car.kind !== 'traffic' || car.wreck > 0) continue;
      const [x, y] = toMap(car.x, car.z);
      minimapCtx.fillRect(x - 1, y - 1, 2, 2);
    }
    // Police dots.
    minimapCtx.fillStyle = '#3b82f6';
    for (const cop of worldState.police) {
      if (cop.wreck > 0) continue;
      const [x, y] = toMap(cop.x, cop.z);
      minimapCtx.beginPath();
      minimapCtx.arc(x, y, 3, 0, Math.PI * 2);
      minimapCtx.fill();
    }
    // Mission marker.
    const marker = worldState.mission.marker;
    if (marker) {
      const pulse = 4 + Math.sin(performance.now() / 300) * 1.5;
      const [x, y] = toMap(marker.x, marker.z);
      minimapCtx.fillStyle = '#ffd23e';
      minimapCtx.beginPath();
      minimapCtx.arc(x, y, pulse, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.strokeStyle = '#7a5c00';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.stroke();
    }
    // Player arrow.
    const [px, py] = toMap(worldState.player.x, worldState.player.z);
    minimapCtx.save();
    minimapCtx.translate(px, py);
    minimapCtx.rotate(Math.atan2(Math.sin(worldState.player.heading), Math.cos(worldState.player.heading)) + Math.PI);
    minimapCtx.fillStyle = '#ffffff';
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, -6);
    minimapCtx.lineTo(4.5, 5);
    minimapCtx.lineTo(-4.5, 5);
    minimapCtx.closePath();
    minimapCtx.fill();
    minimapCtx.restore();
  }

  function render(worldState, cam, time, dt) {
    // Move the sun's shadow frustum with the player.
    const px = worldState.player.x;
    const pz = worldState.player.z;
    sun.position.set(px + 120, 180, pz + 60);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();

    // Player figure.
    const player = worldState.player;
    if (player.inCar) {
      playerMesh.visible = false;
    } else {
      playerMesh.visible = true;
      playerMesh.position.set(player.x, 0.24, player.z);
      playerMesh.rotation.y = player.heading;
      const moving = worldState._moving || false;
      const swing = moving ? Math.sin(time * 10) * 0.5 : 0;
      const u = playerMesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
    }

    // Cars.
    for (const car of worldState.cars) {
      const mesh = carMeshFor(car);
      if (car.wreck <= -5) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(car.x, 0.02, car.z);
      mesh.rotation.y = car.heading;
      if (car.wreck > 0) {
        mesh.rotation.z = 0.35;
        mesh.position.y = 0.4;
      } else {
        mesh.rotation.z = 0;
      }
      if (car.kind === 'police' && mesh.userData.lightBar) {
        const on = Math.floor(time * 3) % 2 === 0;
        mesh.userData.lightBar.red.material.emissiveIntensity = on ? 2.5 : 0.3;
        mesh.userData.lightBar.blue.material.emissiveIntensity = on ? 0.3 : 2.5;
      }
      // Wheel spin.
      const spin = car.speed * dt * 2.4;
      mesh.children.forEach((child) => {
        if (child.geometry && child.geometry.type === 'CylinderGeometry') child.rotation.x += spin;
      });
    }

    // Pedestrians.
    worldState.peds.forEach((ped, index) => {
      const mesh = pedMeshFor(ped, index);
      mesh.position.set(ped.x, 0.24, ped.z);
      mesh.rotation.y = ped.heading;
      const u = mesh.userData;
      if (ped.down > 0) {
        mesh.rotation.x = -Math.PI / 2 + 0.2;
        mesh.position.y = 0.5;
      } else {
        mesh.rotation.x = 0;
        const swing = Math.sin(ped.walkPhase) * 0.45;
        u.legL.rotation.x = swing;
        u.legR.rotation.x = -swing;
        u.armL.rotation.x = -swing * 0.7;
        u.armR.rotation.x = swing * 0.7;
      }
    });

    // Beacon.
    const marker = worldState.mission.marker;
    if (marker) {
      beacon.visible = true;
      arrow.visible = true;
      beaconLight.visible = true;
      beacon.position.set(marker.x, 20, marker.z);
      arrow.position.set(marker.x, 8 + Math.sin(time * 3) * 0.8, marker.z);
      beaconLight.position.set(marker.x, 6, marker.z);
    } else {
      beacon.visible = false;
      arrow.visible = false;
      beaconLight.visible = false;
    }

    // Explosions.
    worldState.explosions.forEach((ex, i) => {
      if (i >= smokeMeshes.length) return;
      const smoke = smokeMeshes[i];
      smoke.visible = true;
      smoke.position.set(ex.x, 1.5 + (1.2 - ex.t) * 0.8, ex.z);
      smoke.scale.setScalar(0.6 + (1.2 - ex.t) * 1.1);
      smoke.material.opacity = Math.max(0, ex.t / 1.2) * 0.45;
    });
    for (let i = worldState.explosions.length; i < smokeMeshes.length; i += 1) smokeMeshes[i].visible = false;

    // Camera: follow behind the player/car, smoothed.
    const target = player.inCar || player;
    camTarget.set(target.x, 0, target.z);
    const dist = cam.dist;
    const cx = camTarget.x + Math.sin(cam.yaw) * dist;
    const cz = camTarget.z + Math.cos(cam.yaw) * dist;
    const cy = cam.height;
    camPos.x += (cx - camPos.x) * Math.min(1, dt * 5);
    camPos.y += (cy - camPos.y) * Math.min(1, dt * 5);
    camPos.z += (cz - camPos.z) * Math.min(1, dt * 5);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.2);
      camPos.x += (Math.random() - 0.5) * shake;
      camPos.y += (Math.random() - 0.5) * shake * 0.5;
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget.x, 1.6, camTarget.z);

    drawMinimap(worldState);
    renderer.render(scene, camera);
  }

  function snapCamera(cam, worldState) {
    const target = worldState.player.inCar || worldState.player;
    camPos.set(target.x + Math.sin(cam.yaw) * cam.dist, cam.height, target.z + Math.cos(cam.yaw) * cam.dist);
  }

  function addShake(amount) {
    shake = Math.min(1.2, shake + amount);
  }

  function setRenderScale(scale) {
    renderer.setPixelRatio(scale);
    resize();
  }

  function setShadows(enabled) {
    sun.castShadow = enabled;
  }

  return { render, snapCamera, addShake, resize, setRenderScale, setShadows };
}
