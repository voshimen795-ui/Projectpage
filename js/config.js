/**
 * config.js
 * ---------------------------------------------------------------------------
 * Single source of truth for every tunable value in the configurator:
 * asset paths, camera presets, material finishes, strap colours and the
 * exploded-view choreography. Swap values here and the rest of the app follows.
 */

export const ASSETS = {
  // Primary model. Drop the GLB at this path (see models/README.md).
  // If it is missing, the app falls back to a procedurally built RM 11 replica.
  model: './models/richard_mille_rm11.glb',

  // Studio HDRI used for reflections on sapphire and metal. Tried in order;
  // if every URL fails, a procedural RoomEnvironment is generated instead.
  hdri: [
    './textures/studio.hdr',
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
  ],
};

export const SCENE = {
  background: 0x0a0a0c,
  fog: 0x12060a, // red-black, matches the CSS studio glow at the horizon
  exposure: 1.2,
  fov: 36,
  // Width (scene units) that must stay visible; narrow screens pull the camera back.
  frameWidth: 2.2,
  // Overall watch height (strap tip to strap tip) in scene units. Both the GLB
  // and the procedural model are fitted to this, so camera presets frame them alike.
  modelHeight: 3.2,
  // Floor sits just below the lowest point of the strap.
  floorY: -1.75,
};

export const CONTROLS = {
  dampingFactor: 0.05,
  minDistance: 1.8,
  maxDistance: 12,
  idleDelay: 2000, // ms of inactivity before auto-rotation resumes
  autoRotateSpeed: 0.9,
};

/** Preset camera views — positions straight from the creative brief. */
export const VIEWS = {
  front: { position: [0, 0, 5], target: [0, 0, 0], label: 'Front' },
  side: { position: [4, 0, 1], target: [0, 0, 0], label: 'Profile' },
  back: { position: [0, 0, -5], target: [0, 0, 0], label: 'Caseback' },
  mechanism: { position: [2, 1.5, 2], target: [0, 0, 0], label: 'Mechanism' },
};

/**
 * Case finishes.
 * `texture` selects the procedural surface map used on the built-in model
 * (GLB models keep their own textures and only receive colour/PBR values).
 */
export const CASE_FINISHES = {
  carbon: {
    label: 'Carbon / Titanium Black',
    color: '#181818',
    metalness: 0.55,
    roughness: 0.42,
    clearcoat: 0.6,
    texture: 'carbon',
  },
  rosegold: {
    label: 'Rose Gold',
    color: '#d4af37',
    metalness: 1.0,
    roughness: 0.18,
    clearcoat: 0.0,
    texture: 'brushed',
  },
  steel: {
    label: 'Silver / Steel',
    color: '#e0e0e0',
    metalness: 1.0,
    roughness: 0.22,
    clearcoat: 0.0,
    texture: 'brushed',
  },
};

/**
 * Strap colours. Each strap also drives the "Dial Accents / Crown Ring"
 * group — the signature Richard Mille colour-matching between strap,
 * flange and crown. A black strap pairs with a crisp white accent.
 */
export const STRAP_COLORS = {
  black: { label: 'Matte Black', color: '#111111', accent: '#f2f2f2', roughness: 0.78 },
  red: { label: 'Racing Red', color: '#e63946', accent: '#e63946', roughness: 0.62 },
  yellow: { label: 'Electric Yellow', color: '#f1c40f', accent: '#f1c40f', roughness: 0.62 },
  cyan: { label: 'Cyan', color: '#00f5d4', accent: '#00f5d4', roughness: 0.6 },
};

export const DEFAULTS = {
  caseFinish: 'carbon',
  strapColor: 'red',
  view: 'front',
};

/**
 * Exploded-view offsets, in scene units (independent of model scale).
 * Front bezel +1.5 Z, sapphire +2.0 Z, strap outwards, movement stationary.
 */
export const EXPLODE = {
  duration: 1.4,
  // Three-quarter angle the camera glides to when the explode toggle is switched on.
  cameraView: { position: [5.0, 1.9, 5.2], target: [0, 0, 0.1] },
  offsets: {
    crystal: [0, 0, 2.0],
    bezel: [0, 0, 1.5],
    hands: [0, 0, 1.05],
    dial: [0, 0, 0.6],
    movement: [0, 0, 0], // stays put — the heart of the piece
    caseband: [0, 0, -0.55],
    caseback: [0, 0, -1.35],
    crown: [0.85, 0, 0],
    strapTop: [0, 0.9, -0.2],
    strapBottom: [0, -0.9, -0.2],
  },
};

export const PRODUCT = {
  name: 'RM 11',
  subtitle: 'Automatic Flyback Chronograph',
  price: 185000,
  currency: 'USD',
};
