/**
 * explode.js — Exploded view controller
 * ---------------------------------------------------------------------------
 * Drives every registered component from its assembled position to
 * `base + offset` with a single 0..1 progress value. GSAP tweens that value;
 * each component reads it with a small stagger (outermost parts lift first,
 * and settle back last), which gives the explosion a mechanical, choreographed feel.
 */
import { gsap } from 'gsap';
import { EXPLODE } from './config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = gsap.parseEase('power2.inOut');

export function createExploder(parts) {
  // Cache assembled positions; sort so the biggest travel moves first.
  const entries = parts.explode
    .map((e) => ({ ...e, base: e.object.position.clone(), travel: e.offset.length() }))
    .filter((e) => e.travel > 0)
    .sort((a, b) => b.travel - a.travel);

  const STAGGER = 0.28; // fraction of the timeline spread across components
  entries.forEach((e, i) => {
    e.delay = entries.length > 1 ? (i / (entries.length - 1)) * STAGGER : 0;
  });

  const state = { value: 0 };

  /** Write positions for the current progress (cheap: a few vector ops). */
  const apply = () => {
    const v = state.value;
    for (const e of entries) {
      const local = easeInOut(clamp01((v - e.delay) / (1 - STAGGER)));
      e.object.position.copy(e.base).addScaledVector(e.offset, local);
    }
  };

  return {
    state,
    get value() {
      return state.value;
    },
    /** Animate to a progress value (0 = assembled, 1 = fully exploded). */
    to(value, { duration = EXPLODE.duration, onUpdate } = {}) {
      return gsap.to(state, {
        value: clamp01(value),
        duration,
        ease: 'power1.inOut',
        overwrite: true,
        onUpdate: () => {
          apply();
          onUpdate?.(state.value);
        },
      });
    },
  };
}
