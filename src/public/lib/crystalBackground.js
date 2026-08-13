import { buildStarTetrahedron, sub, cross } from './metatron3d.js';

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function buildMesh() {
  const tris = buildStarTetrahedron().map((tri) => tri.v);
  const data = [];
  const centroids = [];
  for (const tri of tris) {
    const [a, b, c] = tri;
    const raw = cross(sub(b, a), sub(c, a));
    const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const outward = raw[0] * centroid[0] + raw[1] * centroid[1] + raw[2] * centroid[2] >= 0;
    const vertices = outward ? [a, b, c] : [a, c, b];
    const n = normalize(outward ? raw : [-raw[0], -raw[1], -raw[2]]);
    for (const p of vertices) data.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    centroids.push(centroid[0], centroid[1], centroid[2]);
  }
  return { mesh: new Float32Array(data), centroids: new Float32Array(centroids), triangleCount: tris.length };
}

const SOLID_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform vec2 uCenter;   // px
uniform float uSize;    // px
uniform float uT;       // tumble parameter
uniform vec2 uViewport; // px
varying vec3 vNormal;
const float PERSP = 3.4;
vec3 tumble(vec3 p, float t) {
  float ax = t * 0.83 + 0.35, ay = t, az = t * 0.47;
  float sx = sin(ax), cx = cos(ax), sy = sin(ay), cy = cos(ay), sz = sin(az), cz = cos(az);
  float x1 = p.x * cy + p.z * sy;
  float z1 = -p.x * sy + p.z * cy;
  float y2 = p.y * cx - z1 * sx;
  float z2 = p.y * sx + z1 * cx;
  return vec3(x1 * cz - y2 * sz, x1 * sz + y2 * cz, z2);
}
void main() {
  vec3 rp = tumble(aPos, uT);
  vNormal = tumble(aNormal, uT);
  float s = PERSP / (PERSP - rp.z);
  vec2 posPx = uCenter + vec2(rp.x, -rp.y) * (s * uSize * 0.34);
  vec2 clip = (posPx / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, -rp.z, 1.0);
}`;

const SOLID_FS = `
precision mediump float;
varying vec3 vNormal;
uniform vec3 uGold;
uniform float uAlpha;
const vec3 LIGHT = vec3(-0.5, 0.78, 0.62);
void main() {
  vec3 n = normalize(vNormal);
  if (n.z <= 0.001) discard;
  vec3 L = normalize(LIGHT);
  vec3 H = normalize(vec3(L.x, L.y, L.z + 1.0));
  float lam = max(0.0, dot(n, L));
  float spec = pow(max(0.0, dot(n, H)), 24.0) * 1.15;
  float lit = 0.28 + 0.72 * lam;
  vec3 col = uGold * (lit + 0.12) + vec3(spec);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), uAlpha);
}`;

const GLOW_VS = `
attribute vec2 aQuad;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec2 uViewport;
varying vec2 vUv;
void main() {
  vUv = aQuad;
  vec2 posPx = uCenter + aQuad * uRadius;
  vec2 clip = (posPx / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;
const GLOW_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uGold;
uniform vec3 uHalo;
uniform float uAlpha;
void main() {
  float d = length(vUv);
  float inner = exp(-d * d * 12.0);
  float middle = exp(-d * d * 4.5);
  float outer = exp(-d * d * 1.8);
  float a = (inner * 0.7 + middle * 0.24 + outer * 0.1) * uAlpha;
  vec3 col = uGold * (inner * 0.7 + middle * 0.24) + uHalo * (outer * 0.18);
  gl_FragColor = vec4(col * uAlpha, a);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
  return sh;
}
function link(gl, vs, fs) {
  const v = compile(gl, gl.VERTEX_SHADER, vs), f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null; }
  return p;
}

class Renderer {
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  ok = false;

  constructor(canvas, color, halo, glowAlpha = 0.72, glowRadius = 1.35) {
    this.canvas = canvas;
    this.color = color;
    this.halo = halo;
    this.glowAlpha = glowAlpha;
    this.glowRadius = glowRadius;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true, depth: true });
    if (!gl) { this.gl = null; return; }
    this.gl = gl;
    const solid = link(gl, SOLID_VS, SOLID_FS);
    const glow = link(gl, GLOW_VS, GLOW_FS);
    if (!solid || !glow) { this.gl = gl; return; }
    this.solid = solid; this.glow = glow;
    const built = buildMesh();
    this.vertexCount = built.mesh.length / 6;
    this.triangleCount = built.triangleCount;
    const mb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mb); gl.bufferData(gl.ARRAY_BUFFER, built.mesh, gl.STATIC_DRAW);
    this.meshBuf = mb;
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    this.quadBuf = qb;
    this.ok = true;
  }

  resize(w, h) {
    const cw = Math.round(w * this.dpr), ch = Math.round(h * this.dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
  }

  render(instances, w, h) {
    if (!this.ok) return;
    const gl = this.gl;
    this.resize(w, h);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    const vp = [w, h];

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.glow);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    const aQuad = gl.getAttribLocation(this.glow, 'aQuad');
    gl.enableVertexAttribArray(aQuad);
    gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2fv(gl.getUniformLocation(this.glow, 'uViewport'), vp);
    gl.uniform3fv(gl.getUniformLocation(this.glow, 'uGold'), this.color);
    gl.uniform3fv(gl.getUniformLocation(this.glow, 'uHalo'), this.halo);
    for (const it of instances) {
      gl.uniform2f(gl.getUniformLocation(this.glow, 'uCenter'), it.cx, it.cy);
      gl.uniform1f(gl.getUniformLocation(this.glow, 'uRadius'), it.size * this.glowRadius);
      gl.uniform1f(gl.getUniformLocation(this.glow, 'uAlpha'), it.alpha * this.glowAlpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    // Opaque geometry: write depth so nearer faces correctly occlude farther
    // ones. The star tetrahedron is a self-intersecting solid; with depth
    // writes on, the depth test resolves cross-section visibility per pixel
    // without needing triangle-level sorting.
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.solid);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    const aPos = gl.getAttribLocation(this.solid, 'aPos');
    const aNormal = gl.getAttribLocation(this.solid, 'aNormal');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aNormal); gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
    gl.uniform2fv(gl.getUniformLocation(this.solid, 'uViewport'), vp);
    gl.uniform3fv(gl.getUniformLocation(this.solid, 'uGold'), this.color);
    const uCenter = gl.getUniformLocation(this.solid, 'uCenter');
    const uSize = gl.getUniformLocation(this.solid, 'uSize');
    const uT = gl.getUniformLocation(this.solid, 'uT');
    const uAlpha = gl.getUniformLocation(this.solid, 'uAlpha');
    for (const it of instances) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(uCenter, it.cx, it.cy);
      gl.uniform1f(uSize, it.size);
      gl.uniform1f(uT, it.t);
      gl.uniform1f(uAlpha, it.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }
  }

  dispose() {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.meshBuf) gl.deleteBuffer(this.meshBuf);
    if (this.quadBuf) gl.deleteBuffer(this.quadBuf);
    if (this.solid) gl.deleteProgram(this.solid);
    if (this.glow) gl.deleteProgram(this.glow);
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}

const DRIFT_SLOTS = 4;
const HEIGHT_MIN_VH = 4, HEIGHT_MAX_VH = 88;
const WOBBLE_MAX_VH = 18;
const SIZE_MIN = 96, SIZE_MAX = 224;
const DURATION_MIN_S = 30, DURATION_MAX_S = 64;
const COLLISION_SAMPLES = 12;
const COLLISION_PADDING_PX = 96;
const COLLISION_RETRY_CAP = 8;
const COLLISION_RETRY_DELAY_MS = 220;
const INITIAL_STAGGER_BASE_MS = 900;
const INITIAL_STAGGER_JITTER_MS = 600;

function randomDrift(opacity) {
  return {
    top: HEIGHT_MIN_VH + Math.random() * (HEIGHT_MAX_VH - HEIGHT_MIN_VH),
    midOffset: (Math.random() - 0.5) * 2 * WOBBLE_MAX_VH,
    endOffset: (Math.random() - 0.5) * 2 * WOBBLE_MAX_VH,
    size: Math.round(SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN)),
    durationS: DURATION_MIN_S + Math.random() * (DURATION_MAX_S - DURATION_MIN_S),
    spinSeconds: 18 + Math.random() * 22,
    phase: Math.random(),
    opacity: opacity[0] + Math.random() * (opacity[1] - opacity[0]),
  };
}

function driftPathAt(m, tMs, motion = 'ltr') {
  const frac = Math.max(0, Math.min(1, tMs / (m.durationS * 1000)));
  const wob = frac <= 0.5 ? m.midOffset * (frac * 2) : m.midOffset + (m.endOffset - m.midOffset) * ((frac - 0.5) * 2);
  const vw = window.innerWidth || 1280, vh = window.innerHeight || 900;
  const extent = m.size * 1.35 + 2;
  let x, y;
  if (motion === 'rise' || motion === 'fall') {
    const p = motion === 'rise' ? 1 - frac : frac; // 0(top)→1(bottom)
    y = -extent + p * (vh + extent * 2);
    x = (((m.top / 88) * 100 + wob) * vw) / 100;
  } else if (motion === 'diagonal') {
    x = -extent + frac * (vw + extent * 2);
    y = ((m.top + (frac - 0.5) * 36 + wob) * vh) / 100;
  } else if (motion === 'rtl') {
    x = vw + extent - frac * (vw + extent * 2);
    y = ((m.top + wob) * vh) / 100;
  } else {
    x = -extent + frac * (vw + extent * 2);
    y = ((m.top + wob) * vh) / 100;
  }
  return { x, y, half: m.size / 2 };
}

function driftCollides(candidate, candidateStart, slots, excludeSlot, motion) {
  const candEnd = candidateStart + candidate.durationS * 1000;
  for (let idx = 0; idx < slots.length; idx++) {
    if (idx === excludeSlot) continue;
    const o = slots[idx];
    if (!o) continue;
    const otherEnd = o.startedAt + o.durationS * 1000;
    const start = Math.max(candidateStart, o.startedAt);
    const end = Math.min(candEnd, otherEnd);
    if (end <= start) continue;
    for (let s = 0; s <= COLLISION_SAMPLES; s++) {
      const tMs = start + ((end - start) * s) / COLLISION_SAMPLES;
      const p1 = driftPathAt(candidate, tMs - candidateStart, motion);
      const p2 = driftPathAt(o, tMs - o.startedAt, motion);
      const dx = p1.x - p2.x, dy = p1.y - p2.y;
      const minDist = p1.half + p2.half + COLLISION_PADDING_PX;
      if (dx * dx + dy * dy < minDist * minDist) return true;
    }
  }
  return false;
}

export function mountCrystalBackground(host, options) {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bg = document.createElement('div');
  bg.className = 'cosmic-sky';
  bg.setAttribute('aria-hidden', 'true');
  const bgCanvas = document.createElement('canvas');
  bgCanvas.className = 'cosmic-canvas';
  bg.appendChild(bgCanvas);
  host.appendChild(bg);

  const fxLayer = document.createElement('div');
  fxLayer.className = 'cosmic-fall';
  fxLayer.setAttribute('aria-hidden', 'true');
  const fxCanvas = document.createElement('canvas');
  fxCanvas.className = 'cosmic-canvas';
  fxLayer.appendChild(fxCanvas);
  // Mounted into the same host as the sky layer (inside #app), not
  // document.body: #app is its own stacking context (position:relative +
  // z-index:1), so a body-level sibling here would compare its z-index
  // against #app as a whole and paint over the fixed navbar inside it
  // regardless of the navbar's own (higher) z-index.
  host.appendChild(fxLayer);

  const cleanupDom = () => { bg.remove(); fxLayer.remove(); };
  if (reduce) return cleanupDom; // CSS also hides the sky layer; nothing animates

  const bgRenderer = new Renderer(bgCanvas, options.color, options.halo);
  // Falling click-burst pieces are small and short-lived; the drift layer's
  // full glow blooms too hard on them, so the fx renderer gets a dimmer,
  // tighter halo.
  const fxRenderer = new Renderer(fxCanvas, options.color, options.halo, 0.3, 0.85);
  if (!bgRenderer.ok) return () => { bgRenderer.dispose(); fxRenderer.dispose(); cleanupDom(); };

  const slots = Array.from({ length: DRIFT_SLOTS }, () => null);
  let keySeq = 0;
  const timers = [];

  function scheduleSlot(slot) {
    let attempts = 0;
    const attempt = () => {
      const now = performance.now();
      const candidate = randomDrift(options.opacity);
      if (driftCollides(candidate, now, slots, slot, options.motion ?? 'ltr') && ++attempts < COLLISION_RETRY_CAP) {
        timers.push(window.setTimeout(attempt, COLLISION_RETRY_DELAY_MS));
        return;
      }
      slots[slot] = { ...candidate, key: ++keySeq, startedAt: now };
      timers.push(window.setTimeout(() => scheduleSlot(slot), candidate.durationS * 1000));
    };
    attempt();
  }
  for (let slot = 0; slot < DRIFT_SLOTS; slot++) {
    timers.push(window.setTimeout(() => scheduleSlot(slot), slot * INITIAL_STAGGER_BASE_MS + Math.random() * INITIAL_STAGGER_JITTER_MS));
  }

  const falling = [];
  let fallSeq = 0;
  function onClick(e) {
    falling.push({
      id: ++fallSeq,
      x: e.clientX + (Math.random() - 0.5) * 36,
      y: e.clientY,
      size: Math.round(24 + Math.random() * 14),
      durationMs: (1.1 + Math.random() * 0.6) * 1000,
      delayMs: Math.random() * 140,
      drift: Math.round((Math.random() - 0.5) * 90),
      spinSeconds: 0.9 + Math.random() * 0.8,
      phase: Math.random(),
      startedAt: performance.now(),
    });
  }
  window.addEventListener('click', onClick);

  let raf = 0;
  const frame = () => {
    const now = performance.now();
    const w = window.innerWidth, h = window.innerHeight;

    const driftInstances = [];
    for (const m of slots) {
      if (!m) continue;
      const p = driftPathAt(m, now - m.startedAt, options.motion ?? 'ltr');
      driftInstances.push({ cx: p.x, cy: p.y, size: m.size, t: (now / (m.spinSeconds * 1000) + m.phase) * Math.PI * 2, alpha: m.opacity });
    }
    bgRenderer.render(driftInstances, w, h);

    const fxInstances = [];
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      const prog = (now - f.startedAt - f.delayMs) / f.durationMs;
      if (prog >= 1) { falling.splice(i, 1); continue; }
      const p = Math.max(0, prog);
      const alpha = p < 0.8 ? 1 : Math.max(0, 1 - (p - 0.8) / 0.2);
      fxInstances.push({ cx: f.x + f.drift * p, cy: f.y + 190 * p, size: f.size, t: (now / (f.spinSeconds * 1000) + f.phase) * Math.PI * 2, alpha });
    }
    fxRenderer.render(fxInstances, w, h);

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener('click', onClick);
    bgRenderer.dispose();
    fxRenderer.dispose();
    cleanupDom();
  };
}
