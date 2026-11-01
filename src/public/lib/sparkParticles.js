// Still twinkle field: one canvas, one requestAnimationFrame loop, DPR-aware,
// capped particle count, hard opt-out under prefers-reduced-motion.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

function spawn(w, h, colorCount) {
  const size = rand(0.7, 2);
  const ci = (Math.random() * colorCount) | 0;
  return { x: rand(0, w), y: rand(0, h), vx: rand(-3, 3), vy: rand(-3, 3), size, life: 0, ttl: rand(3, 7), seed: rand(0, TAU), ci };
}

// 粒子是 1~2px 的小点，内部渲染分辨率压到 0.75 倍肉眼几乎无差，
// 但每帧的"整屏 clear + 纹理上传"带宽会按面积平方下降（0.75² ≈ 0.56）。
const RENDER_SCALE = 0.75;

export function mountParticles(host, config) {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'cosmic-spark';
  canvas.setAttribute('aria-hidden', 'true');
  // 内部像素比可能小于 1，必须显式铺满，否则画布会按像素尺寸缩在左上角
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  host.appendChild(canvas);
  const remove = () => canvas.remove();
  if (reduce) return remove;

  const ctx = canvas.getContext('2d');
  if (!ctx) return remove;

  const dpr = Math.min(window.devicePixelRatio || 1, 1) * RENDER_SCALE;
  let w = 0, h = 0;
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const parts = [];
  for (let i = 0; i < config.density; i++) parts.push(spawn(w, h, config.colors.length));

  let raf = 0;
  let running = false;
  let last = performance.now();
  function frame(now) {
    if (!running) return;
    // 从后台切回来时时间差会很大，钳一下避免粒子瞬移
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      const t = p.life / p.ttl;
      if (t >= 1 || p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) {
        parts.splice(i, 1);
        continue;
      }
      drawParticle(ctx, p, config.colors[p.ci]);
    }
    while (parts.length < config.density) parts.push(spawn(w, h, config.colors.length));

    raf = requestAnimationFrame(frame);
  }

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibilityChange = () => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (!document.hidden) start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('resize', resize);
    remove();
  };
}

function drawParticle(ctx, p, color) {
  const t = p.life / p.ttl;
  const dt = 1 / 60;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  ctx.save();
  ctx.globalAlpha = Math.min(1, t / 0.1, (1 - t) / 0.15);
  ctx.fillStyle = color;
  ctx.translate(p.x, p.y);
  ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
  ctx.restore();
}
