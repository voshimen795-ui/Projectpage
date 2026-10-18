/**
 * scene.js — 1. SCENE / RENDERER SETUP
 * ---------------------------------------------------------------------------
 * Builds the dark studio: high-DPI renderer with ACES tone mapping and soft
 * shadows, perspective camera, damped OrbitControls with idle auto-rotation,
 * key/rim/fill lighting and a shadow-catching floor with a soft glow.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCENE, CONTROLS, VIEWS, DEFAULTS } from './config.js';
import { createFloorGlowTexture } from './textures.js';

export function createStage(canvas) {
  // --- Renderer ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true, // transparent: the red studio glow is painted by CSS behind the canvas
    powerPreference: 'high-performance',
  });
  // Cap DPR at 2: crisp on retina without melting mobile GPUs.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = SCENE.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // --- Scene ---------------------------------------------------------------
  const scene = new THREE.Scene();
  renderer.setClearColor(0x000000, 0);
  // Fog melts the floor edge into the backdrop for an infinite-studio feel.
  scene.fog = new THREE.Fog(SCENE.fog, 9, 20);

  // --- Camera --------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(SCENE.fov, window.innerWidth / window.innerHeight, 0.1, 100);
  const start = VIEWS[DEFAULTS.view];
  // Start pulled back; the intro tween in main.js glides into the hero view.
  camera.position.set(start.position[0] * 2.2, start.position[1] + 1.5, start.position[2] * 2.2);

  // --- Orbit controls ------------------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = CONTROLS.dampingFactor;
  controls.minDistance = CONTROLS.minDistance;
  controls.maxDistance = CONTROLS.maxDistance;
  controls.enablePan = false;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.autoRotateSpeed = CONTROLS.autoRotateSpeed;
  controls.target.set(...start.target);
  controls.update();

  setupIdleAutoRotate(controls);
  const lights = setupLighting(scene);
  setupFloor(scene);

  // --- Responsive framing --------------------------------------------------
  // The control panel covers part of the viewport, so we shift the projection
  // centre (setViewOffset) to keep the watch optically centred in free space.
  // On narrow/portrait screens `frameScale` > 1 pushes every camera preset
  // further out so the full case width always fits.
  const stage = { renderer, scene, camera, controls, lights, frameScale: 1 };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    const visibleWidthAt5 = 2 * 5 * Math.tan(THREE.MathUtils.degToRad(SCENE.fov / 2)) * camera.aspect;
    const prevScale = stage.frameScale;
    stage.frameScale = Math.max(1, SCENE.frameWidth / visibleWidthAt5);
    controls.minDistance = CONTROLS.minDistance * stage.frameScale;
    controls.maxDistance = CONTROLS.maxDistance * stage.frameScale;
    // Keep the current shot consistent when crossing breakpoints / rotating devices.
    camera.position.sub(controls.target).multiplyScalar(stage.frameScale / prevScale).add(controls.target);

    // Desktop: the info column (left) and drawer (right) are about equally
    // wide, so the free space is already centred. Phones in landscape have only
    // the drawer, so the watch is nudged left. Portrait needs no shift.
    const offsetX = w < 1280 && w > h && h <= 520 ? 160 : 0;
    camera.setViewOffset(w, h, offsetX, 0, w, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  stage.resize = resize;

  return stage;
}

/**
 * Idle auto-rotation: stop instantly on any user input ("start"), and resume
 * after CONTROLS.idleDelay ms of inactivity ("end").
 */
function setupIdleAutoRotate(controls) {
  let idleTimer = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  controls.pauseAutoRotate = () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  };
  controls.scheduleAutoRotate = () => {
    clearTimeout(idleTimer);
    if (reduceMotion) return;
    idleTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, CONTROLS.idleDelay);
  };

  controls.addEventListener('start', controls.pauseAutoRotate);
  controls.addEventListener('end', controls.scheduleAutoRotate);
}

/** Overhead key light + cyan/orange rim lights + soft fill. */
function setupLighting(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  // Overhead soft key — the only shadow caster.
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(0.6, 8, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  // Rim lights — cool steel-blue from back-left, racing red from back-right.
  // They carve the tonneau silhouette and drop coloured specular streaks on metal.
  const rimCool = new THREE.SpotLight(0x9fc8ff, 40, 20, Math.PI / 6, 0.6, 1.6);
  rimCool.position.set(-5, 2.5, -4);
  scene.add(rimCool);

  const rimRed = new THREE.SpotLight(0xff2340, 75, 20, Math.PI / 6, 0.6, 1.6);
  rimRed.position.set(5, 1.5, -4);
  scene.add(rimRed);

  // Low frontal fill so the dial never falls into pure black.
  const fill = new THREE.DirectionalLight(0xdfe7ff, 0.45);
  fill.position.set(-2, -1, 6);
  scene.add(fill);

  return { ambient, key, rimCool, rimRed, fill };
}

/** Shadow-catcher floor + radial glow pool ("ambient floor reflection"). */
function setupFloor(scene) {
  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.4 })
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = SCENE.floorY;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      map: createFloorGlowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = SCENE.floorY - 0.001;
  scene.add(glow);
}
