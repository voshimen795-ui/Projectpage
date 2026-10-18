/**
 * procedural-watch.js
 * ---------------------------------------------------------------------------
 * A fully procedural, high-fidelity stand-in for the Richard Mille RM 11,
 * built when `models/richard_mille_rm11.glb` is not available.
 *
 * It reproduces the defining design cues — the tonneau (barrel) case in three
 * stacked parts, the 12 spline screws through the bezel, the skeletonised
 * movement with visible gear train and balance, the oversized date at 12,
 * chronograph pushers, a knurled crown and an integrated rubber strap — and
 * returns the same `parts` registry the GLB loader produces, so every other
 * system (swatches, clock, exploded view) works identically on either model.
 *
 * Axes: +Z faces the viewer (dial side), +Y is 12 o'clock, +X is 3 o'clock.
 */
import * as THREE from 'three';
import { EXPLODE, SCENE } from './config.js';

// Local build units: the model measures ~5.1 units strap tip to strap tip.
const BUILD_HEIGHT = 5.1;
import { createDigitTexture, createLabelTexture } from './textures.js';

// --- Geometry helpers --------------------------------------------------------

/**
 * Points along a tapered super-ellipse — the RM tonneau silhouette.
 * n controls squareness, taper pinches the top/bottom edges slightly.
 */
function tonneauPoints(a, b, { n = 3.4, taper = 0.07, segments = 160 } = {}) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const y = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (1 - taper * (y / b) ** 2);
    pts.push(new THREE.Vector2(x, y));
  }
  return pts;
}

/** Point on the tonneau outline along a clock-face polar angle (radians, 0 = 3 o'clock). */
function tonneauPolar(a, b, theta, n = 3.4) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const r = 1 / Math.pow(Math.abs(c / a) ** n + Math.abs(s / b) ** n, 1 / n);
  return new THREE.Vector2(r * c, r * s);
}

const tonneauShape = (a, b, opts) => new THREE.Shape(tonneauPoints(a, b, opts));

function tonneauRing(oa, ob, ia, ib) {
  const shape = tonneauShape(oa, ob);
  shape.holes.push(new THREE.Path(tonneauPoints(ia, ib)));
  return shape;
}

/** Extrude a 2D shape along Z, centred on z = 0, with an optional soft bevel. */
function extrude(shape, depth, bevel = 0, curveSegments = 24) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Stadium / capsule outline between two points — used for movement bridges. */
function capsuleShape(x1, y1, x2, y2, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const r = width / 2;
  const shape = new THREE.Shape();
  shape.absarc(x2, y2, r, angle - Math.PI / 2, angle + Math.PI / 2, false);
  shape.absarc(x1, y1, r, angle + Math.PI / 2, angle + Math.PI * 1.5, false);
  shape.closePath();
  return shape;
}

/** Gear wheel outline with trapezoidal teeth and spoke cut-outs. */
function gearShape(radius, teeth, spokes = 5) {
  const shape = new THREE.Shape();
  const depth = Math.min(0.025, radius * 0.14);
  const root = radius - depth;
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [root, a],
      [radius, a + step * 0.2],
      [radius, a + step * 0.5],
      [root, a + step * 0.7],
    ];
    pts.forEach(([r, ang], j) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();

  // Skeletonised spokes: circular windows around the hub.
  if (radius > 0.08) {
    const holeR = radius * 0.24;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const hole = new THREE.Path();
      hole.absarc(Math.cos(a) * radius * 0.52, Math.sin(a) * radius * 0.52, holeR, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  }
  return shape;
}

/** Kite-shaped skeleton hand pointing to +Y from the pivot. */
function handShape(length, width, tail) {
  const outline = [
    [0, -tail],
    [width * 0.55, -tail * 0.4],
    [width, length * 0.12],
    [width * 0.45, length * 0.92],
    [0, length],
    [-width * 0.45, length * 0.92],
    [-width, length * 0.12],
    [-width * 0.55, -tail * 0.4],
  ];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const iw = width * 0.5;
  const hole = new THREE.Path(
    [
      [0, length * 0.2],
      [iw, length * 0.28],
      [iw * 0.45, length * 0.82],
      [0, length * 0.86],
      [-iw * 0.45, length * 0.82],
      [-iw, length * 0.28],
    ].map(([x, y]) => new THREE.Vector2(x, y))
  );
  shape.holes.push(hole);
  return shape;
}

/** Hairspring spiral for the balance wheel. */
class SpiralCurve extends THREE.Curve {
  constructor(r0, r1, turns) {
    super();
    Object.assign(this, { r0, r1, turns });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    const r = this.r0 + (this.r1 - this.r0) * t;
    return target.set(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
}

/**
 * Rubber strap: a subdivided box bent around a wrist-sized arc, tapering
 * towards the tip. Built pointing up from the case; rotate π for the bottom.
 */
function strapGeometry({ width = 1.34, length = 3.1, thickness = 0.16, straight = 0.32, radius = 1.6 }) {
  const geo = new THREE.BoxGeometry(width, length, thickness, 8, 120, 1);
  geo.translate(0, length / 2, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = v.y; // distance along the strap
    const tz = v.z; // offset through the thickness (+ = outer face)
    const x = v.x * (1 - 0.22 * (s / length)); // gentle taper to the tip
    let y;
    let z;
    if (s <= straight) {
      y = s;
      z = tz;
    } else {
      const theta = (s - straight) / radius;
      const r = radius + tz;
      y = straight + r * Math.sin(theta);
      z = -radius + r * Math.cos(theta);
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- Builder -----------------------------------------------------------------

/**
 * Build the procedural RM 11.
 * @param {object} mats material library from materials.js
 * @returns {{ root: THREE.Group, parts: object }}
 */
export function buildProceduralRM11(mats) {
  // `root` stays unscaled (scene units); `body` is scaled to SCENE.modelHeight.
  const root = new THREE.Group();
  root.name = 'RM11_Procedural';
  const scale = SCENE.modelHeight / BUILD_HEIGHT;
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);

  const parts = {
    groups: { case: [], strap: [], accent: [] }, // swatch-controlled meshes
    explode: [], // { object, offset: Vector3 } — consumed by explode.js
    hands: { hour: null, minute: null, second: null, sub: null },
    animated: { gears: [], balance: null, rotor: null },
    date: null,
  };

  // Convenience: create a mesh, enable shadows, file it under a swatch group.
  const mesh = (geo, mat, group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (group) parts.groups[group].push(m);
    return m;
  };

  // Register a top-level component for the exploded view.
  const component = (name, key) => {
    const g = new THREE.Group();
    g.name = name;
    body.add(g);
    // Offsets are in scene units; convert into the scaled body's local space.
    parts.explode.push({ object: g, offset: new THREE.Vector3(...EXPLODE.offsets[key]).divideScalar(scale) });
    return g;
  };

  // ======================= CASE BAND (middle case) ===========================
  const caseband = component('Caseband', 'caseband');
  const band = mesh(extrude(tonneauRing(0.95, 1.15, 0.78, 0.98), 0.36, 0.04), mats.case, 'case');
  band.position.z = -0.04;
  caseband.add(band);

  // Chronograph pushers at 2 & 4 o'clock, flyback / function pusher at 8.
  [Math.PI / 6, -Math.PI / 6, Math.PI + Math.PI / 6].forEach((theta) => {
    const p = tonneauPolar(0.97, 1.17, theta);
    const pusher = new THREE.Group();
    pusher.position.set(p.x, p.y, -0.04);
    pusher.rotation.z = theta - Math.PI / 2; // cylinder Y axis → radial direction
    const stem = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 24), mats.screw);
    stem.position.y = 0.04;
    const head = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.09, 32), mats.case, 'case');
    head.position.y = 0.13;
    const cap = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 32), mats.accent, 'accent');
    cap.position.y = 0.18;
    pusher.add(stem, head, cap);
    caseband.add(pusher);
  });

  // ============================ BEZEL + SCREWS ===============================
  const bezelGroup = component('Bezel', 'bezel');
  const bezel = mesh(extrude(tonneauRing(0.97, 1.17, 0.74, 0.94), 0.07, 0.03), mats.case, 'case');
  bezel.position.z = 0.22;
  bezelGroup.add(bezel);
  bezelGroup.add(createScrewRing(mats, 0.855, 1.055, 0.295, 1));

  // ========================== SAPPHIRE CRYSTAL ===============================
  const crystalGroup = component('Crystal', 'crystal');
  const crystal = new THREE.Mesh(extrude(tonneauShape(0.77, 0.97), 0.03, 0.015), mats.crystal);
  crystal.position.z = 0.215;
  crystal.renderOrder = 10; // draw after the dial for correct transparency
  crystalGroup.add(crystal);

  // ========================= CASEBACK + SCREWS ===============================
  const backGroup = component('Caseback', 'caseback');
  const back = mesh(extrude(tonneauRing(0.93, 1.13, 0.72, 0.92), 0.06, 0.025), mats.case, 'case');
  back.position.z = -0.28;
  backGroup.add(back);
  backGroup.add(createScrewRing(mats, 0.825, 1.025, -0.34, -1));
  const backCrystal = new THREE.Mesh(extrude(tonneauShape(0.75, 0.95), 0.02, 0.01), mats.crystal);
  backCrystal.position.z = -0.29;
  backCrystal.renderOrder = 10;
  backGroup.add(backCrystal);

  // ======================== SKELETONISED MOVEMENT ============================
  const movement = component('Movement', 'movement');
  buildMovement(movement, mats, mesh, parts);

  // =============================== DIAL ======================================
  const dial = component('Dial', 'dial');
  buildDial(dial, mats, mesh, parts);

  // =============================== HANDS =====================================
  const handsGroup = component('Hands', 'hands');
  buildHands(handsGroup, mats, mesh, parts);

  // =============================== CROWN =====================================
  const crown = component('Crown', 'crown');
  buildCrown(crown, mats, mesh);

  // =============================== STRAP =====================================
  const strapGeo = strapGeometry({});
  const strapTop = component('Strap_Top', 'strapTop');
  const top = mesh(strapGeo, mats.strap, 'strap');
  top.position.set(0, 0.92, -0.06);
  strapTop.add(top);

  const strapBottom = component('Strap_Bottom', 'strapBottom');
  const bottom = mesh(strapGeo, mats.strap, 'strap');
  bottom.position.set(0, -0.92, -0.06);
  bottom.rotation.z = Math.PI; // proper rotation keeps face winding intact
  strapBottom.add(bottom);

  return { root, parts };
}

/** 12 titanium spline screws around a tonneau ring (instanced: 2 draw calls). */
function createScrewRing(mats, a, b, z, facing) {
  const group = new THREE.Group();
  const count = 12;
  const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.042, 0.046, 0.03, 32), mats.screw, count);
  const splines = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 5), mats.dark, count);
  heads.castShadow = true;
  heads.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    // Spread screws evenly in angle, offset so none sit exactly at 12/6.
    const theta = Math.PI / 2 - (i / count) * Math.PI * 2 + Math.PI / count;
    const p = tonneauPolar(a, b, theta);
    // Spin about the cylinder's own Y axis first (so spline slots don't all
    // align), then tip that axis onto ±Z to face out of the bezel / caseback.
    q.setFromEuler(new THREE.Euler(facing * Math.PI / 2, theta * 0.6 + i, 0, 'XYZ'));
    m.compose(new THREE.Vector3(p.x, p.y, z), q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(p.x, p.y, z + facing * 0.016), q, new THREE.Vector3(1, 1, 1));
    splines.setMatrixAt(i, m);
  }
  group.add(heads, splines);
  return group;
}

/** Baseplate, bridges, gear train, balance wheel, jewels and rotor. */
function buildMovement(group, mats, mesh, parts) {
  // Gear layout: [x, y, radius, teeth, angular speed (rad/s)]
  const gears = [
    [0, 0, 0.2, 60, 0.12],
    [0.32, 0.3, 0.17, 48, -0.35],
    [-0.3, 0.32, 0.14, 40, 0.5],
    [0.35, -0.3, 0.15, 44, -0.8],
    [0.02, -0.45, 0.09, 15, 2.6], // escape wheel
  ];
  const balancePos = [-0.35, -0.38, 0.17];

  // Baseplate with skeleton windows behind every wheel.
  const plateShape = tonneauShape(0.77, 0.97);
  [...gears.map(([x, y, r]) => [x, y, r + 0.02]), [balancePos[0], balancePos[1], balancePos[2] + 0.02]].forEach(
    ([x, y, r]) => {
      const hole = new THREE.Path();
      hole.absarc(x, y, r, 0, Math.PI * 2, true);
      plateShape.holes.push(hole);
    }
  );
  const plate = mesh(extrude(plateShape, 0.04, 0, 32), mats.plate);
  plate.position.z = -0.12;
  group.add(plate);

  // Gear train.
  gears.forEach(([x, y, r, teeth, speed]) => {
    const gear = mesh(extrude(gearShape(r, teeth), 0.02, 0, 12), mats.gear);
    gear.position.set(x, y, -0.065);
    group.add(gear);
    parts.animated.gears.push({ object: gear, speed });

    const jewel = mesh(new THREE.SphereGeometry(0.022, 16, 12), mats.ruby);
    jewel.position.set(x, y, -0.035);
    group.add(jewel);
  });

  // Bridges — the openworked titanium frame.
  [
    [-0.3, 0.32, 0.32, 0.3, 0.06],
    [0.32, 0.3, 0.35, -0.3, 0.06],
    [-0.3, 0.32, -0.35, -0.38, 0.06],
    [-0.35, -0.38, -0.58, -0.62, 0.07],
    [0.02, -0.45, 0.35, -0.3, 0.05],
  ].forEach(([x1, y1, x2, y2, w]) => {
    const bridge = mesh(extrude(capsuleShape(x1, y1, x2, y2, w), 0.025, 0.006, 16), mats.bridge);
    bridge.position.z = -0.02;
    group.add(bridge);
  });

  // Balance wheel + hairspring — oscillates at 4 Hz in the render loop.
  const balance = new THREE.Group();
  balance.position.set(balancePos[0], balancePos[1], -0.06);
  balance.add(mesh(new THREE.TorusGeometry(balancePos[2] - 0.02, 0.014, 12, 64), mats.gear));
  for (let i = 0; i < 4; i++) {
    const spoke = mesh(new THREE.BoxGeometry(0.012, (balancePos[2] - 0.02) * 2, 0.01), mats.gear);
    spoke.rotation.z = (i * Math.PI) / 4;
    balance.add(spoke);
  }
  const spring = mesh(new THREE.TubeGeometry(new SpiralCurve(0.02, 0.1, 5), 200, 0.0035, 6), mats.screw);
  spring.position.z = 0.012;
  balance.add(spring);
  group.add(balance);
  parts.animated.balance = balance;

  // Skeletonised winding rotor — visible through the sapphire caseback.
  const rotor = new THREE.Group();
  rotor.position.z = -0.19;
  const sector = new THREE.Shape();
  sector.absarc(0, 0, 0.62, -Math.PI / 3, Math.PI / 3, false);
  sector.absarc(0, 0, 0.48, Math.PI / 3, -Math.PI / 3, true);
  sector.closePath();
  rotor.add(mesh(extrude(sector, 0.03, 0.005), mats.gear));
  [-0.45, 0.45].forEach((a) => {
    rotor.add(mesh(extrude(capsuleShape(0, 0, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.05), 0.02, 0.004), mats.bridge));
  });
  rotor.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 32).rotateX(Math.PI / 2), mats.screw));
  group.add(rotor);
  parts.animated.rotor = rotor;
}

/** Chapter ring (flange), indices, oversized date, totalizer and print. */
function buildDial(group, mats, mesh, parts) {
  // Flange — part of the "Dial Accents" colour group.
  const flange = mesh(extrude(tonneauRing(0.775, 0.975, 0.64, 0.84), 0.05, 0.006), mats.accent, 'accent');
  flange.position.z = 0.1;
  group.add(flange);

  // Hour indices — luminous batons aligned to the tonneau flange.
  for (let i = 0; i < 12; i++) {
    if (i === 0) continue; // 12 o'clock is taken by the oversized date
    const theta = Math.PI / 2 - (i / 12) * Math.PI * 2;
    const p = tonneauPolar(0.705, 0.905, theta);
    const len = i % 3 === 0 ? 0.11 : 0.075;
    const marker = mesh(new THREE.BoxGeometry(0.032, len, 0.02), mats.lume);
    marker.position.set(p.x, p.y, 0.135);
    marker.rotation.z = theta - Math.PI / 2;
    group.add(marker);
  }

  // Oversized date at 12 — two numeral windows in an accent frame.
  const frameShape = new THREE.Shape();
  roundedRect(frameShape, -0.2, -0.11, 0.4, 0.22, 0.04);
  const frameHole = new THREE.Path();
  roundedRect(frameHole, -0.17, -0.085, 0.34, 0.17, 0.025);
  frameShape.holes.push(frameHole);
  const dateGroup = new THREE.Group();
  dateGroup.position.set(0, 0.6, 0.1);
  dateGroup.add(mesh(extrude(frameShape, 0.03, 0.004), mats.accent, 'accent'));

  const digitTextures = [];
  const digitMaterial = (d) =>
    new THREE.MeshStandardMaterial({ map: (digitTextures[d] ||= createDigitTexture(d)), roughness: 0.45 });
  const tens = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.165), digitMaterial(0));
  const ones = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.165), digitMaterial(0));
  tens.position.set(-0.08, 0, 0.0);
  ones.position.set(0.08, 0, 0.0);
  dateGroup.add(tens, ones);
  group.add(dateGroup);
  parts.date = {
    tens,
    ones,
    current: null,
    setDay(day) {
      if (this.current === day) return;
      this.current = day;
      const t = Math.floor(day / 10);
      const o = day % 10;
      tens.material.map = digitTextures[t] ||= createDigitTexture(t);
      ones.material.map = digitTextures[o] ||= createDigitTexture(o);
    },
  };

  // Totalizer at 6 o'clock: accent ring, minute track and a small hand.
  const sub = new THREE.Group();
  sub.position.set(0, -0.46, 0.115);
  sub.add(mesh(new THREE.TorusGeometry(0.16, 0.012, 12, 64), mats.accent, 'accent'));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = mesh(new THREE.BoxGeometry(0.008, 0.03, 0.008), mats.hand);
    tick.position.set(Math.sin(a) * 0.125, Math.cos(a) * 0.125, 0);
    tick.rotation.z = -a;
    sub.add(tick);
  }
  const subHand = new THREE.Group();
  const subNeedle = mesh(new THREE.BoxGeometry(0.014, 0.13, 0.008), mats.hand);
  subNeedle.position.y = 0.05;
  subHand.add(subNeedle);
  subHand.position.z = 0.012;
  sub.add(subHand);
  group.add(sub);
  parts.hands.sub = subHand;

  // Printed model reference floating on the open dial.
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.083),
    new THREE.MeshBasicMaterial({ map: createLabelTexture('RM 11 · FLYBACK'), transparent: true, depthWrite: false })
  );
  label.position.set(0, -0.2, 0.13);
  group.add(label);
}

function roundedRect(path, x, y, w, h, r) {
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
}

/** Hour / minute skeleton hands with lume, sweeping seconds, centre cap. */
function buildHands(group, mats, mesh, parts) {
  const makeHand = (length, width, tail, z) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    pivot.add(mesh(extrude(handShape(length, width, tail), 0.01, 0.002, 8), mats.hand));
    const lume = mesh(new THREE.BoxGeometry(width * 0.35, length * 0.45, 0.008), mats.lume);
    lume.position.y = length * 0.52;
    pivot.add(lume);
    group.add(pivot);
    return pivot;
  };

  parts.hands.hour = makeHand(0.46, 0.05, 0.1, 0.14);
  parts.hands.minute = makeHand(0.72, 0.042, 0.12, 0.155);

  // Seconds: needle + counterweight in the accent colour.
  const second = new THREE.Group();
  second.position.z = 0.17;
  const needle = mesh(new THREE.BoxGeometry(0.012, 0.98, 0.006), mats.accent, 'accent');
  needle.position.y = 0.33;
  const weight = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 32).rotateX(Math.PI / 2), mats.accent, 'accent');
  weight.position.y = -0.12;
  second.add(needle, weight);
  group.add(second);
  parts.hands.second = second;

  const cap = mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.03, 32).rotateX(Math.PI / 2), mats.hand);
  cap.position.z = 0.18;
  group.add(cap);
}

/** Knurled crown with accent crown ring. */
function buildCrown(group, mats, mesh) {
  group.position.set(0.96, 0, -0.04);
  const toX = (geo) => geo.rotateZ(-Math.PI / 2); // cylinder Y axis → +X

  const tube = mesh(toX(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 24)), mats.screw);
  tube.position.x = 0.06;
  group.add(tube);

  const body = mesh(toX(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 48)), mats.case, 'case');
  body.position.x = 0.19;
  group.add(body);

  // Knurling teeth — instanced around the crown circumference.
  const teeth = 30;
  const knurl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.03, 0.02), mats.case, teeth);
  knurl.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    m.makeRotationX(a);
    m.setPosition(0.19, Math.cos(a) * 0.172, Math.sin(a) * 0.172);
    knurl.setMatrixAt(i, m);
  }
  group.add(knurl); // shares the case material, so it follows the case finish

  // Crown ring — the accent band between case and crown.
  const ring = mesh(new THREE.TorusGeometry(0.14, 0.022, 16, 64).rotateY(Math.PI / 2), mats.accent, 'accent');
  ring.position.x = 0.115;
  group.add(ring);

  const capInlay = mesh(toX(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 48)), mats.accent, 'accent');
  capInlay.position.x = 0.265;
  group.add(capInlay);
}
