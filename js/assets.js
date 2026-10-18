/**
 * assets.js — 2. ASSET LOADING & MESH CACHING
 * ---------------------------------------------------------------------------
 * - One THREE.LoadingManager drives the "Loading Experience… XX%" screen.
 * - The HDRI is loaded with RGBELoader and prefiltered through PMREM for
 *   physically correct sapphire/metal reflections (RoomEnvironment fallback).
 * - The RM 11 GLB is loaded with GLTFLoader (+ optional DRACO), normalised in
 *   size, and its hierarchy is traversed once to cache meshes by role:
 *   case/bezel, strap, dial accents/crown ring, crystal, hands, movement.
 * - If the GLB is missing, a procedural RM 11 is built instead, exposing the
 *   exact same `parts` registry.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ASSETS, EXPLODE, SCENE } from './config.js';
import { registerMaterial } from './materials.js';
import { buildProceduralRM11 } from './procedural-watch.js';

/**
 * Create the shared loading manager.
 * `onProgress(fraction)` receives a smoothed 0..1 value combining item counts
 * with byte-level progress of the (large) GLB download.
 */
export function createLoadingManager(onProgress) {
  const manager = new THREE.LoadingManager();
  const state = { loaded: 0, total: 0, modelFraction: 0 };

  const emit = () => {
    const items = state.total ? state.loaded / state.total : 0;
    // Weight the GLB bytes heavily — it dominates real load time.
    onProgress(Math.min(1, items * 0.4 + state.modelFraction * 0.6));
  };

  const track = (_url, loaded, total) => {
    Object.assign(state, { loaded, total });
    emit();
  };
  manager.onStart = track;
  manager.onProgress = track;

  manager.setModelFraction = (f) => {
    state.modelFraction = f;
    emit();
  };
  return manager;
}

// --- Environment -------------------------------------------------------------

/** Load the studio HDRI (first URL that works) → PMREM → scene.environment. */
export async function loadEnvironment(renderer, scene, manager) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const loader = new RGBELoader(manager);

  for (const url of ASSETS.hdri) {
    try {
      const hdr = await loader.loadAsync(url);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentIntensity = 0.9;
      hdr.dispose();
      pmrem.dispose();
      return 'hdri';
    } catch {
      /* try the next source */
    }
  }

  // Fallback: a procedural softbox studio, still gives crisp reflections.
  console.info('[RM11] HDRI unavailable — using procedural RoomEnvironment.');
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();
  return 'room';
}

// --- Watch model -------------------------------------------------------------

/** Name patterns used to identify GLB meshes (mesh name, parent names, material name). */
const MATCHERS = {
  crystal: /glass|crystal|sapphire|lens|verre/i,
  strap: /strap|(?<![a-z])band|bracelet|rubber|belt|leather/i,
  hourHand: /hour|hr_?hand|aiguille_?h/i,
  minuteHand: /minute|min_?hand/i,
  secondHand: /second|sec_?hand|seconde/i,
  hand: /hand|needle|aiguille/i,
  accent: /crown|(?<![a-z])ring|accent|flange|index|marker|pusher|button|rehaut/i,
  caseback: /case_?back|back_?case|fond/i,
  bezel: /bezel|lunette/i,
  case: /case|body|housing|carrure|lug|titan|frame|screw|carbon/i,
  movement: /movement|gear|wheel|bridge|plate|mechan|rotor|jewel|ruby|balance|calibre|caliber/i,
  dial: /dial|(?<![a-z])face|cadran/i,
};

/** Concatenate mesh, ancestor and material names for robust matching. */
function identity(mesh) {
  const names = [mesh.name];
  let p = mesh.parent;
  while (p && names.length < 4) {
    names.push(p.name);
    p = p.parent;
  }
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((m) => m && names.push(m.name));
  return names.join(' ');
}

function classify(mesh) {
  const id = identity(mesh);
  for (const [role, re] of Object.entries(MATCHERS)) if (re.test(id)) return role;
  return 'other';
}

/** Ensure a mesh has its own PBR material we can safely re-tint. */
function ownMaterial(mesh, group) {
  const convert = (mat) => {
    let m = mat;
    if (!m.isMeshStandardMaterial) {
      m = new THREE.MeshPhysicalMaterial({ color: mat.color ?? 0xffffff, map: mat.map ?? null });
    } else {
      m = mat.clone(); // never mutate a material shared with another group
    }
    registerMaterial(group, m);
    return m;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
}

/**
 * Express a model-space offset in an object's parent space, so exploding
 * works no matter how deeply a GLB node is nested or how it is scaled.
 */
function offsetInParentSpace(object, modelRoot, offset) {
  const toParent = new THREE.Matrix4().copy(object.parent.matrixWorld).invert().multiply(modelRoot.matrixWorld);
  const a = new THREE.Vector3().applyMatrix4(toParent);
  const b = offset.clone().applyMatrix4(toParent);
  return b.sub(a);
}

/**
 * Wrap a hand mesh in a pivot group placed at the dial centre so that
 * rotation.z spins it around the watch axis (GLB hands rarely have their
 * origin at the arbor).
 */
function makeHandPivot(handMesh, watchRoot, centre) {
  const pivot = new THREE.Group();
  pivot.name = `${handMesh.name}_pivot`;
  const box = new THREE.Box3().setFromObject(handMesh);
  const c = box.getCenter(new THREE.Vector3());
  pivot.position.set(centre.x, centre.y, watchRoot.worldToLocal(c.clone()).z);
  watchRoot.add(pivot);
  pivot.updateMatrixWorld(true);
  pivot.attach(handMesh); // re-parent while preserving world transform
  return pivot;
}

/** Normalise and index a loaded GLTF scene into the shared `parts` registry. */
function prepareGLTF(gltf) {
  const watchRoot = new THREE.Group();
  watchRoot.name = 'RM11_GLB';
  const model = gltf.scene;

  // Fit: centre at origin and scale so the tallest dimension (usually strap
  // tip to strap tip) matches SCENE.modelHeight.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = SCENE.modelHeight / Math.max(size.x, size.y, size.z);
  model.scale.setScalar(scale);
  model.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-scale));
  watchRoot.add(model);
  watchRoot.updateMatrixWorld(true);

  const parts = {
    groups: { case: [], strap: [], accent: [] },
    explode: [],
    hands: { hour: null, minute: null, second: null, sub: null },
    animated: { gears: [], balance: null, rotor: null },
    date: null,
  };

  // Mesh cache — one traversal, everything filed by role.
  const byRole = {};
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const role = classify(obj);
    (byRole[role] ||= []).push(obj);

    if (role === 'case' || role === 'bezel' || role === 'caseback') ownMaterial(obj, 'case');
    if (role === 'strap') ownMaterial(obj, 'strap');
    if (role === 'accent') ownMaterial(obj, 'accent');
    if (role === 'crystal') {
      // Make sure authored glass actually reads as sapphire.
      const m = obj.material.clone();
      Object.assign(m, { transparent: true, opacity: Math.min(m.opacity ?? 1, 0.25), depthWrite: false, roughness: 0.02 });
      obj.material = m;
      obj.renderOrder = 10;
    }
    if (['case', 'bezel', 'caseback'].includes(role)) parts.groups.case.push(obj);
    else if (role === 'strap' || role === 'accent') parts.groups[role].push(obj);
  });

  // Hands → pivots at the dial centre.
  const centre = new THREE.Vector3(0, 0, 0);
  const pick = (role) => byRole[role]?.[0];
  const fallbackHands = byRole.hand || [];
  const hour = pick('hourHand') || fallbackHands[0];
  const minute = pick('minuteHand') || fallbackHands[1];
  const second = pick('secondHand') || fallbackHands[2];
  if (hour) parts.hands.hour = makeHandPivot(hour, watchRoot, centre);
  if (minute) parts.hands.minute = makeHandPivot(minute, watchRoot, centre);
  if (second) parts.hands.second = makeHandPivot(second, watchRoot, centre);
  watchRoot.updateMatrixWorld(true);

  // Exploded-view choreography per role (model-space offsets → parent space).
  const roleOffsets = {
    crystal: EXPLODE.offsets.crystal,
    bezel: EXPLODE.offsets.bezel,
    dial: EXPLODE.offsets.dial,
    caseback: EXPLODE.offsets.caseback,
    movement: EXPLODE.offsets.movement,
  };
  Object.entries(byRole).forEach(([role, meshes]) => {
    meshes.forEach((m) => {
      let offset = roleOffsets[role];
      if (role === 'strap') {
        // Straps move outward along ±Y depending on which side they sit.
        const cy = watchRoot.worldToLocal(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())).y;
        offset = cy >= 0 ? EXPLODE.offsets.strapTop : EXPLODE.offsets.strapBottom;
      }
      if (role === 'accent' && /crown/i.test(identity(m))) offset = EXPLODE.offsets.crown;
      if (!offset) return;
      parts.explode.push({ object: m, offset: offsetInParentSpace(m, watchRoot, new THREE.Vector3(...offset)) });
    });
  });
  // Hand pivots live directly under watchRoot, so model space == parent space.
  ['hour', 'minute', 'second'].forEach((k) => {
    if (parts.hands[k]) parts.explode.push({ object: parts.hands[k], offset: new THREE.Vector3(...EXPLODE.offsets.hands) });
  });

  console.info('[RM11] GLB mesh roles:', Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, v.length])));
  return { root: watchRoot, parts, source: 'glb' };
}

/**
 * Load the RM 11. Resolves with `{ root, parts, source }` where source is
 * 'glb' or 'procedural'. Never rejects — a missing asset falls back gracefully.
 */
export function loadWatch(manager, materialLibrary) {
  const loader = new GLTFLoader(manager);
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/');
  loader.setDRACOLoader(draco);

  const buildFallback = () => {
    console.info(`[RM11] ${ASSETS.model} not found — building the procedural RM 11.`);
    manager.setModelFraction(1);
    // Register the shared procedural materials with the swatch system.
    registerMaterial('case', materialLibrary.case);
    registerMaterial('strap', materialLibrary.strap);
    registerMaterial('accent', materialLibrary.accent);
    return { ...buildProceduralRM11(materialLibrary), source: 'procedural' };
  };

  return new Promise((resolve) => {
    loader.load(
      ASSETS.model,
      (gltf) => {
        manager.setModelFraction(1);
        try {
          resolve(prepareGLTF(gltf));
        } catch (err) {
          console.warn('[RM11] GLB could not be prepared, using procedural model.', err);
          resolve(buildFallback());
        }
      },
      (xhr) => {
        if (xhr.lengthComputable && xhr.total) manager.setModelFraction(xhr.loaded / xhr.total);
      },
      () => resolve(buildFallback())
    );
  });
}
