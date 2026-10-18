/**
 * ui.js — 3. UI EVENT LISTENERS & GSAP TWEENS
 * ---------------------------------------------------------------------------
 * Wires the DOM to the 3D experience:
 *  - loading screen progress + reveal
 *  - case / strap swatches
 *  - perspective presets (spherical GSAP camera flights)
 *  - exploded-view switch + slider
 *  - Add to Cart morphing button
 *  - live time readout and mobile sheet
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { VIEWS, EXPLODE, CASE_FINISHES, STRAP_COLORS, DEFAULTS, PRODUCT } from './config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// --- Loading screen ----------------------------------------------------------

export function createLoaderUI() {
  const pctEl = $('#loader-pct');
  const barEl = $('#loader-bar');
  const shown = { value: 0 };

  const render = () => {
    const pct = Math.round(shown.value * 100);
    pctEl.textContent = `${pct}%`;
    barEl.style.transform = `scaleX(${shown.value})`;
  };

  return {
    /** Ease the displayed percentage towards the real one — never jumps. */
    setProgress(fraction) {
      gsap.to(shown, { value: Math.max(shown.value, fraction), duration: 0.6, ease: 'power2.out', onUpdate: render, overwrite: true });
    },
    /** Complete the bar, then lift the curtain. */
    hide() {
      return new Promise((resolve) => {
        gsap
          .timeline({ onComplete: resolve })
          .to(shown, { value: 1, duration: 0.5, ease: 'power2.out', onUpdate: render, overwrite: true })
          .to('#loader-inner', { opacity: 0, y: -16, duration: 0.6, ease: 'power2.in' }, '+=0.15')
          .to('#loader', { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, '-=0.2')
          .set('#loader', { display: 'none' });
      });
    },
  };
}

/** Stagger the interface in after the loader lifts. */
export function revealInterface() {
  gsap.set('[data-reveal]', { visibility: 'visible' });
  gsap.from('[data-reveal]', {
    opacity: 0,
    y: 24,
    duration: 1.1,
    ease: 'power3.out',
    stagger: 0.08,
    clearProps: 'transform',
  });
}

// --- Camera flights ----------------------------------------------------------

/**
 * Fly the camera to a preset. Interpolates in spherical coordinates around
 * the target so front → back sweeps around the watch instead of plunging
 * through it, then GSAP tweens both camera position and controls.target.
 */
export function createCameraDirector(stage) {
  const { camera, controls } = stage;
  const from = new THREE.Spherical();
  const to = new THREE.Spherical();
  const tmp = new THREE.Vector3();
  let flight = null;

  function flyTo({ position, target }, { duration = 1.8 } = {}) {
    controls.pauseAutoRotate();
    controls.enabled = false;

    const endTarget = new THREE.Vector3(...target);
    const endPos = new THREE.Vector3(...position).multiplyScalar(stage.frameScale);

    from.setFromVector3(tmp.copy(camera.position).sub(controls.target));
    to.setFromVector3(tmp.copy(endPos).sub(endTarget));
    to.phi = THREE.MathUtils.clamp(to.phi, 0.0001, Math.PI - 0.0001);
    // Shortest way round the azimuth.
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));

    const proxy = { t: 0 };
    const startTarget = controls.target.clone();
    const s = new THREE.Spherical();

    flight?.kill(); // a new request always wins over a flight in progress
    flight = gsap.to(proxy, {
      t: 1,
      duration,
      ease: 'power3.inOut',
      overwrite: true,
      onUpdate: () => {
        const k = proxy.t;
        controls.target.lerpVectors(startTarget, endTarget, k);
        s.set(
          THREE.MathUtils.lerp(from.radius, to.radius, k),
          THREE.MathUtils.lerp(from.phi, to.phi, k),
          from.theta + dTheta * k
        );
        camera.position.setFromSpherical(s).add(controls.target);
        camera.lookAt(controls.target);
      },
      onComplete: () => {
        controls.enabled = true;
        controls.update();
        controls.scheduleAutoRotate();
      },
    });
    return flight;
  }

  return { flyTo };
}

// --- Main UI wiring ----------------------------------------------------------

export function initUI({ stage, exploder, onCaseFinish, onStrapColor }) {
  const director = createCameraDirector(stage);

  initSwatches('case', CASE_FINISHES, DEFAULTS.caseFinish, onCaseFinish);
  initSwatches('strap', STRAP_COLORS, DEFAULTS.strapColor, onStrapColor);
  initViews(director);
  stage.controls.addEventListener('start', () => director.clearActive?.());
  initExplode(director, exploder);
  initCart();
  initLiveTime();
  initSheet();
  initHint(stage.controls);

  return { director };
}

/** Circular swatch rings — click / keyboard selectable radio group. */
function initSwatches(group, options, initial, onChange) {
  const buttons = $$(`[data-swatch-group="${group}"]`);
  const label = $(`[data-swatch-label="${group}"]`);

  const select = (key, fire = true) => {
    buttons.forEach((b) => {
      const active = b.dataset.key === key;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', String(active));
      b.tabIndex = active ? 0 : -1;
    });
    if (label) {
      gsap.fromTo(label, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
      label.textContent = options[key].label;
    }
    if (fire) onChange(key);
  };

  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => select(btn.dataset.key));
    // Arrow keys move through the radio group.
    btn.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = buttons[(i + dir + buttons.length) % buttons.length];
      next.focus();
      select(next.dataset.key);
    });
  });
  select(initial, false);
}

/** Perspective switcher. */
function initViews(director) {
  const buttons = $$('[data-view]');
  const setActive = (key) =>
    buttons.forEach((b) => {
      b.classList.toggle('is-active', b.dataset.view === key);
      b.setAttribute('aria-pressed', String(b.dataset.view === key));
    });

  buttons.forEach((btn) =>
    btn.addEventListener('click', () => {
      setActive(btn.dataset.view);
      director.flyTo(VIEWS[btn.dataset.view]);
    })
  );
  // Manual orbiting means no preset is "current" any more.
  director.clearActive = () => setActive(null);
  setActive(DEFAULTS.view);
}

/** Exploded view: switch animates fully; slider scrubs. Both stay in sync. */
function initExplode(director, exploder) {
  const toggle = $('#explode-toggle');
  const slider = $('#explode-slider');
  const readout = $('#explode-readout');

  const syncSlider = (v) => {
    slider.value = String(Math.round(v * 100));
    slider.style.setProperty('--val', `${v * 100}%`);
    readout.textContent = `${Math.round(v * 100)}%`;
  };
  const setToggle = (on) => {
    toggle.setAttribute('aria-checked', String(on));
    toggle.classList.toggle('is-on', on);
  };

  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-checked') !== 'true';
    setToggle(on);
    exploder.to(on ? 1 : 0, { onUpdate: syncSlider });
    // Glide to a three-quarter angle so the layers read clearly.
    director.flyTo(on ? EXPLODE.cameraView : VIEWS.front, { duration: 1.6 });
    $$('[data-view]').forEach((b) => {
      const active = !on && b.dataset.view === 'front';
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  });

  slider.addEventListener('input', () => {
    const v = Number(slider.value) / 100;
    slider.style.setProperty('--val', `${v * 100}%`);
    readout.textContent = `${Math.round(v * 100)}%`;
    exploder.to(v, { duration: 0.35 });
    setToggle(v > 0.5);
  });
  syncSlider(0);
}

/** Add to Cart: idle → processing → added ✓ → idle, with a badge bump. */
function initCart() {
  const btn = $('#cart-btn');
  const badge = $('#cart-count');
  let count = 0;
  let busy = false;

  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    btn.dataset.state = 'loading';
    btn.setAttribute('aria-busy', 'true');

    setTimeout(() => {
      btn.dataset.state = 'done';
      btn.setAttribute('aria-busy', 'false');
      $('#cart-status').textContent = `${PRODUCT.name} added to cart`;
      count += 1;
      badge.textContent = String(count);
      badge.classList.remove('opacity-0', 'scale-50');
      gsap.fromTo(badge, { scale: 1.8 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.45)' });
      gsap.fromTo('#cart-icon', { rotate: -14 }, { rotate: 0, duration: 0.7, ease: 'elastic.out(1, 0.35)' });

      setTimeout(() => {
        btn.dataset.state = 'idle';
        busy = false;
      }, 2400);
    }, 750);
  });
}

/** Live local time readout next to the price — same clock the hands use. */
function initLiveTime() {
  const el = $('#live-time');
  const fmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tick = () => (el.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 1000);
}

/** Mobile bottom sheet tabs — one compact section visible at a time. */
function initSheet() {
  const tabs = $$('[data-tab]');
  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      $$('[data-section]').forEach((s) => s.classList.toggle('is-current', s.dataset.section === tab.dataset.tab));
      const current = $(`[data-section="${tab.dataset.tab}"]`);
      gsap.fromTo(current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
    })
  );
}

/** "Drag to rotate" hint fades after the first interaction. */
function initHint(controls) {
  const hint = $('#interaction-hint');
  const hide = () => {
    gsap.to(hint, { opacity: 0, y: 8, duration: 0.6, ease: 'power2.out' });
    controls.removeEventListener('start', hide);
  };
  controls.addEventListener('start', hide);
}
