/**
 * materials.js — 4. MATERIAL SWATCH LOGIC
 * ---------------------------------------------------------------------------
 * Owns every PBR material on the watch and the logic that re-skins them.
 *
 * Swatch changes never create or recompile materials: they tween colour,
 * roughness, metalness and clearcoat on materials whose shader programs are
 * already compiled. Texture swaps only exchange one non-null map for another,
 * which keeps the same shader permutation — no frame hitches.
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { CASE_FINISHES, STRAP_COLORS } from './config.js';
import { createCarbonTexture, createBrushedTexture, createStrapBumpTexture } from './textures.js';

const textures = {
  carbon: null,
  brushed: null,
  strapBump: null,
};

function ensureTextures() {
  if (textures.carbon) return;
  textures.carbon = createCarbonTexture();
  textures.brushed = createBrushedTexture();
  textures.strapBump = createStrapBumpTexture();
}

/**
 * Shared material library for the procedural watch. A GLB model gets its own
 * per-mesh clones instead (see assets.js), registered through `registerMaterial`.
 */
export function createMaterialLibrary() {
  ensureTextures();

  const lib = {
    // Swappable — driven by the Case Finish swatches.
    case: new THREE.MeshPhysicalMaterial({
      color: '#181818',
      metalness: 0.55,
      roughness: 0.42,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      map: textures.carbon,
      envMapIntensity: 1.2,
    }),
    // Swappable — driven by the Strap swatches.
    strap: new THREE.MeshPhysicalMaterial({
      color: '#e63946',
      metalness: 0,
      roughness: 0.62,
      bumpMap: textures.strapBump,
      bumpScale: 1.2,
      // Rubber: weak, soft reflections so the specular haze doesn't wash out the colour.
      envMapIntensity: 0.35,
      specularIntensity: 0.25,
    }),
    // Swappable — Dial accents / crown ring, colour-matched to the strap.
    accent: new THREE.MeshPhysicalMaterial({
      color: '#e63946',
      metalness: 0.2,
      roughness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),

    // Fixed materials.
    screw: new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 1, roughness: 0.25 }),
    plate: new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.9, roughness: 0.38 }),
    bridge: new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 1, roughness: 0.32 }),
    gear: new THREE.MeshStandardMaterial({ color: '#c8a24a', metalness: 1, roughness: 0.28 }),
    ruby: new THREE.MeshPhysicalMaterial({
      color: '#b3001b',
      metalness: 0,
      roughness: 0.05,
      clearcoat: 1,
      emissive: '#3a0006',
    }),
    hand: new THREE.MeshStandardMaterial({ color: '#f2f2f2', metalness: 1, roughness: 0.15 }),
    lume: new THREE.MeshStandardMaterial({
      color: '#e8fff4',
      emissive: '#7dffc8',
      emissiveIntensity: 0.25,
      roughness: 0.5,
    }),
    dark: new THREE.MeshStandardMaterial({ color: '#0d0d10', metalness: 0.3, roughness: 0.6 }),
    // Sapphire: near-invisible, strongly reflective, faint anti-reflective blue cast.
    crystal: new THREE.MeshPhysicalMaterial({
      color: '#dcefff',
      metalness: 0,
      roughness: 0.02,
      transparent: true,
      opacity: 0.16,
      ior: 1.77,
      clearcoat: 1,
      clearcoatRoughness: 0,
      envMapIntensity: 2.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };

  // Tag the swappable ones so the swatch logic knows which may change maps.
  lib.case.userData.swappable = 'case';
  lib.case.userData.textureSwap = true;
  lib.strap.userData.swappable = 'strap';
  lib.accent.userData.swappable = 'accent';
  return lib;
}

/**
 * Registry of every material each swatch group controls.
 * Procedural model: one shared material per group.
 * GLB model: many per-mesh clones (so groups never bleed into each other).
 */
const registry = {
  case: new Set(),
  strap: new Set(),
  accent: new Set(),
};

export function registerMaterial(group, material) {
  registry[group]?.add(material);
}

export function clearRegistry() {
  Object.values(registry).forEach((set) => set.clear());
}

/** Tween a set of materials to a target colour + PBR values. */
function tweenMaterials(set, { color, roughness, metalness, clearcoat }, duration = 0.8) {
  const target = new THREE.Color(color);
  set.forEach((mat) => {
    gsap.to(mat.color, { r: target.r, g: target.g, b: target.b, duration, ease: 'power2.out' });
    const props = {};
    if (roughness !== undefined) props.roughness = roughness;
    if (metalness !== undefined) props.metalness = metalness;
    if (clearcoat !== undefined && 'clearcoat' in mat) props.clearcoat = clearcoat;
    gsap.to(mat, { ...props, duration, ease: 'power2.out' });
  });
}

/** Case / bezel finish swatch. */
export function applyCaseFinish(key, { instant = false } = {}) {
  const finish = CASE_FINISHES[key];
  if (!finish) return;
  ensureTextures();

  registry.case.forEach((mat) => {
    // Swap surface grain only on materials that started with one of ours,
    // so a GLB's authored textures are never overwritten.
    if (mat.userData.textureSwap) {
      // map -> map keeps the same shader permutation: no needsUpdate, no recompile.
      mat.map = textures[finish.texture];
    }
  });
  tweenMaterials(registry.case, finish, instant ? 0 : 0.9);
}

/** Strap swatch — also re-tints dial accents and the crown ring. */
export function applyStrapColor(key, { instant = false } = {}) {
  const strap = STRAP_COLORS[key];
  if (!strap) return;
  const d = instant ? 0 : 0.7;
  tweenMaterials(registry.strap, { color: strap.color, roughness: strap.roughness }, d);
  tweenMaterials(registry.accent, { color: strap.accent }, d);
}
