/**
 * textures.js
 * ---------------------------------------------------------------------------
 * Procedural canvas textures, generated once at start-up so the project ships
 * with zero image dependencies:
 *  - forged/layered carbon (the striated Richard Mille "TPT" look)
 *  - brushed metal grain
 *  - ribbed rubber strap bump map
 *  - oversized date discs
 *  - soft floor glow
 */
import * as THREE from 'three';

function makeCanvas(w, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, { repeat = [1, 1], srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Layered carbon: wavy horizontal strata of near-black tones. */
export function createCarbonTexture() {
  const [c, ctx] = makeCanvas(512);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 512, 512);

  let y = 0;
  while (y < 560) {
    const band = 2 + Math.random() * 6;
    const tone = 18 + Math.floor(Math.random() * 46);
    ctx.fillStyle = `rgb(${tone},${tone},${tone + 2})`;
    ctx.beginPath();
    const amp = 3 + Math.random() * 7;
    const freq = 0.008 + Math.random() * 0.01;
    const phase = Math.random() * Math.PI * 2;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 8) ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    for (let x = 512; x >= 0; x -= 8) ctx.lineTo(x, y + band + Math.sin(x * freq + phase) * amp);
    ctx.closePath();
    ctx.fill();
    y += band * (0.6 + Math.random() * 0.8);
  }
  // Fine sparkle of exposed fibres.
  for (let i = 0; i < 1800; i++) {
    const v = 70 + Math.random() * 70;
    ctx.fillStyle = `rgba(${v},${v},${v},0.25)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 1);
  }
  return toTexture(c, { repeat: [1.6, 1.6] });
}

/** Brushed metal: light base with long horizontal grain lines. */
export function createBrushedTexture() {
  const [c, ctx] = makeCanvas(512);
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 205 + Math.random() * 50;
    ctx.strokeStyle = `rgba(${v},${v},${v},0.35)`;
    ctx.lineWidth = Math.random() * 1.2;
    const y = Math.random() * 512;
    const x = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 60 + Math.random() * 200, y);
    ctx.stroke();
  }
  return toTexture(c, { repeat: [2, 2] });
}

/** Ribbed rubber: greyscale bump map with transverse grooves. */
export function createStrapBumpTexture() {
  const [c, ctx] = makeCanvas(64, 256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) {
    const g = ctx.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#9a9a9a');
    g.addColorStop(0.5, '#3a3a3a');
    g.addColorStop(1, '#9a9a9a');
    ctx.fillStyle = g;
    ctx.fillRect(6, y + 4, 52, 8);
  }
  return toTexture(c, { repeat: [1, 6], srgb: false });
}

/** A single big-date numeral disc (white on black, like the RM 11 window). */
export function createDigitTexture(digit) {
  const [c, ctx] = makeCanvas(128, 160);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = '#f5f5f5';
  ctx.font = '600 128px "Space Grotesk", "Inter", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(digit), 64, 86);
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Small printed dial text (model reference). */
export function createLabelTexture(text, { width = 512, height = 96, color = '#d8d8d8', size = 52 } = {}) {
  const [c, ctx] = makeCanvas(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px "Space Grotesk", "Inter", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText(text, width / 2, height / 2 + 2);
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Radial glow for the studio floor ("ambient floor reflection"). */
export function createFloorGlowTexture() {
  const [c, ctx] = makeCanvas(512);
  const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, 'rgba(200,40,58,0.55)');
  g.addColorStop(0.35, 'rgba(110,18,30,0.28)');
  g.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
