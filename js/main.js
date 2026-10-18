/**
 * main.js — Orchestration + 5. ANIMATION LOOP
 * ---------------------------------------------------------------------------
 * Boot sequence:
 *   stage → loaders (HDRI + GLB in parallel, one progress bar) → materials &
 *   swatches → exploded-view controller → UI → shader pre-warm → reveal.
 * Then a single render loop updates the real-time clock, the movement,
 * orbit damping / auto-rotation and draws the frame.
 */
import * as THREE from 'three';
import { DEFAULTS, VIEWS } from './config.js';
import { createStage } from './scene.js';
import { createLoadingManager, loadEnvironment, loadWatch } from './assets.js';
import { createMaterialLibrary, applyCaseFinish, applyStrapColor } from './materials.js';
import { createExploder } from './explode.js';
import { updateWatch } from './clock.js';
import { createLoaderUI, revealInterface, initUI } from './ui.js';

async function boot() {
  const loaderUI = createLoaderUI();
  const canvas = document.getElementById('webgl');

  let stage;
  try {
    stage = createStage(canvas);
  } catch (err) {
    document.getElementById('loader-label').textContent = 'WebGL is not available on this device.';
    throw err;
  }
  const { renderer, scene, camera, controls } = stage;

  // --- Assets (parallel, one shared progress bar) ---------------------------
  const manager = createLoadingManager((f) => loaderUI.setProgress(f));
  const materials = createMaterialLibrary();
  const [envSource, watch] = await Promise.all([
    loadEnvironment(renderer, scene, manager),
    loadWatch(manager, materials),
  ]);
  scene.add(watch.root);
  document.documentElement.dataset.modelSource = watch.source;
  console.info(`[RM11] model: ${watch.source} · environment: ${envSource}`);

  // --- Initial configuration (instant, no tween) ----------------------------
  applyCaseFinish(DEFAULTS.caseFinish, { instant: true });
  applyStrapColor(DEFAULTS.strapColor, { instant: true });

  const exploder = createExploder(watch.parts);
  const { director } = initUI({
    stage,
    exploder,
    onCaseFinish: (key) => applyCaseFinish(key),
    onStrapColor: (key) => applyStrapColor(key),
  });

  // Pre-compile every shader now so the first swatch / camera move never hitches.
  updateWatch(watch.parts, new Date(), 0, 0);
  renderer.compile(scene, camera);

  // --- Animation loop --------------------------------------------------------
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1); // clamp after tab switches
    const elapsed = clock.elapsedTime;

    updateWatch(watch.parts, new Date(), elapsed, delta); // live time + movement
    controls.update(delta); // damping + idle auto-rotation
    renderer.render(scene, camera);
  });

  // --- Reveal -----------------------------------------------------------------
  await loaderUI.hide();
  revealInterface();
  director.flyTo(VIEWS[DEFAULTS.view], { duration: 2.6 });

  // Small debug handle for the console.
  window.__RM11__ = { stage, watch, exploder, director };
}

boot().catch((err) => console.error('[RM11] boot failed', err));
