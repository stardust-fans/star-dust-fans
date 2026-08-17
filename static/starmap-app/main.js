import * as THREE from "three";

/* ── 视口坐标层：触屏竖屏时 body 顺时针旋 90° 伪装横屏，
   逻辑视口宽高与指针坐标一律经此层换算 ── */
const fakeLandMq = matchMedia(
  "(max-width: 900px) and (orientation: portrait) and (pointer: coarse)");
function isFakeLand() { return fakeLandMq.matches; }
function vw() { return isFakeLand() ? innerHeight : innerWidth; }
function vh() { return isFakeLand() ? innerWidth : innerHeight; }
// rotate(90deg) translateY(-100%) 的逆：x' = y，y' = W - x
function toView(x, y) {
  return isFakeLand() ? { x: y, y: innerWidth - x } : { x, y };
}
function evPos(e) { return toView(e.clientX, e.clientY); }

document.body.classList.toggle("fake-land", isFakeLand());
fakeLandMq.addEventListener("change", () => {
  document.body.classList.toggle("fake-land", isFakeLand());
});

// 中心锁定指示器（#lock-dot）的半径要在这里先同步一次，不能等 resize()/
// updateMarker()：星表数据靠后面一次 await fetch 拉取，await 之前排在
// 后面的代码（含 resize()/frame() 循环）整段都不会执行——窄屏用户从首帧
// 到数据下载完这段真实网络耗时里，#lock-dot 只能靠这里写的初值撑着。
// CSS 断点里也留了一份等效的字面量 r 兜底，但实测这个 SVG 几何属性在
// 某些选择器形态下 CSS 覆盖不可靠（见 index.html 里 #lock-dot 的注释），
// 只有内联 style 每次都生效，所以用 JS 在此兜底、其余交给 updateMarker()
// 接手。
(() => {
  const dot = document.getElementById("lock-dot");
  const scale = parseFloat(
    getComputedStyle(document.body).getPropertyValue("--reticle-scale")) || 1;
  dot.style.r = `${(3.5 * scale).toFixed(2)}px`;
})();

/* 伪横屏提示浮窗：8s 自动淡出，点击立即消失，提示过一次不再弹 */
function showRotateToast() {
  const toast = document.getElementById("rotate-toast");
  if (!isFakeLand() || !toast.hidden) return;
  try {
    if (localStorage.getItem("hud.rotToast")) return;
    localStorage.setItem("hud.rotToast", "1");
  } catch { /* 隐私模式 */ }
  toast.hidden = false;
  // 双 rAF：等 display 变化先完成一次样式计算，淡入过渡才会触发
  requestAnimationFrame(() =>
    requestAnimationFrame(() => toast.classList.add("on")));
  const close = () => {
    toast.classList.remove("on");
    setTimeout(() => { toast.hidden = true; }, 700);
  };
  const timer = setTimeout(close, 8000);
  toast.addEventListener("click", () => { clearTimeout(timer); close(); }, { once: true });
}

const SCENE_SCALE = 1 / 12;      // ly -> scene units
const STAR_STRIDE = 6;           // gx, gy, gz, vt_mag, bv_color, label
const EDGE_BASE = 0.006;         // resting opacity of the similarity graph
const EDGE_LIT = 0.9;

const TRAIL_MAX = 0.87;      // 中档：相机全速时上一帧的保留比例（现在的强度，默认档）
const TRAIL_DEADZONE = 0.05; // 低于此角速度不留尾，免得自转也拖影
const TRAIL_EXP = 2 / 3;     // 尾长随角速度的次线性增长指数
const TRAIL_K = 0.75;        // 中档：使常规拖拽（约 1.3 rad/s）接近 TRAIL_MAX
// 拖尾强度四档：关＝k/max 都为 0，走同一条平滑公式衰减到 0，不用再特判
const TRAIL_LEVELS = {
  off: { k: 0, max: 0 },
  low: { k: TRAIL_K * 0.5, max: 0.65 },
  mid: { k: TRAIL_K, max: TRAIL_MAX },
  high: { k: TRAIL_K * 1.35, max: 0.95 },
};

const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
// 手机上 DPR 常到 3，配上 4x MSAA 和两块半浮点缓冲会直接拖垮帧率
const coarse = matchMedia("(pointer: coarse)").matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 20000);

/* ── 相机控制：轨道 + 推拉 + 平滑聚焦 ───────────────────── */
const cam = {
  target: new THREE.Vector3(),
  goalTarget: new THREE.Vector3(),
  // 起始视距放远，先看到整个盘的形状；场景总尺度约 335 单位
  theta: 0.7, phi: 1.22, radius: 160,
  goalTheta: 0.7, goalPhi: 1.22, goalRadius: 160,
  // 下限须留在固定逼近距离（8.12 ly ≈ 0.68 su）之下，否则辅助驾驶停稳后
  // 任意一次捏合缩放都会把半径钳向 minRadius，产生一次跳变式的镜头外甩
  minRadius: 0.5, maxRadius: 420,
};

/* 引擎绝对规格（场景单位 su，1 su = 12 ly）：矢量喷口（RCS）管转向与平移，
   主引擎管径向推进，前进与倒车上限不对称。手动与自动同一套引擎。 */
const ENGINE = {
  rcs: {
    angAccel: 1.05,               // rad/s²，半秒到角速度上限
    angMax: Math.PI / 6,          // rad/s（30°/s）
    panAccel: 2 * SCENE_SCALE,    // su/s²（2 ly/s²）
    panMax: 10 * SCENE_SCALE,     // su/s（10 ly/s）
  },
  main: {
    accel: 200 * SCENE_SCALE,     // su/s²（200 ly/s²）
    brake: 100 * SCENE_SCALE,     // su/s²（100 ly/s²）
    vFwd: 1000 * SCENE_SCALE,     // su/s（前进 1000 ly/s，半径减小）
    vRev: 100 * SCENE_SCALE,      // su/s（倒车 100 ly/s，半径增大）
  },
};
// 手动直控增益：只乘在手动路径（姿态角速率/角加速度、节流加减速），自动不乘
const MANUAL_BOOST = 1.5;
const vel = { r: 0, pan: 0 };
const panDelta = new THREE.Vector3();
const autoUp = new THREE.Vector3();
const autoFwd = new THREE.Vector3();

// 带加减速的抵达：期望速度取 sqrt(2*a*误差)，于是到点时速度正好归零
function approach(cur, v, goal, accel, maxV, dt) {
  const err = goal - cur;
  if (Math.abs(err) < 1e-6) return [goal, 0];
  const want = THREE.MathUtils.clamp(
    Math.sign(err) * Math.sqrt(2 * accel * Math.abs(err)), -maxV, maxV);
  const nv = v + THREE.MathUtils.clamp(want - v, -accel * dt, accel * dt);
  const next = cur + nv * dt;
  if ((goal - next) * err <= 0) return [goal, 0];   // 越过就吸附，免得来回抖
  return [next, nv];
}

// 径向不对称抵达：期望速度 sqrt(2*brake*|err|) 截到方向上限，
// 提速受 accel、降速受 brake 封顶
function approachRadial(cur, v, goal, dt) {
  const err = goal - cur;
  if (Math.abs(err) < 1e-6) return [goal, 0];
  const m = ENGINE.main;
  const cap = err < 0 ? m.vFwd : m.vRev;
  const want = Math.sign(err) * Math.min(Math.sqrt(2 * m.brake * Math.abs(err)), cap);
  const speedingUp = want * v >= 0 && Math.abs(want) > Math.abs(v);
  const lim = (speedingUp ? m.accel : m.brake) * dt;
  const nv = v + THREE.MathUtils.clamp(want - v, -lim, lim);
  const next = cur + nv * dt;
  if ((goal - next) * err <= 0) return [goal, 0];
  return [next, nv];
}

/* 双轨：自动驾驶的 goal 已按引擎时序生成，直接指数平滑跟随（τ≈0.1s），
   重锚（target/radius 大跳）不会卡住追赶；手动才走引擎追赶。
   手动模式的朝向由 attitudeStep 维护的机身基向量 bodyFwd/Right/Up 驱动
   （见该函数注释），这里只需在手动分支里推进半径/平移，姿态已经就位。 */
function applyCamera(dt) {
  if (auto.on || auto.assist) {
    const k = 1 - Math.pow(1e-4, dt);
    const pr = cam.radius;
    cam.theta += (cam.goalTheta - cam.theta) * k;   // theta 已解缠，可直接插
    cam.phi = THREE.MathUtils.clamp(
      cam.phi + (cam.goalPhi - cam.phi) * k, 0.04, Math.PI - 0.04);
    cam.radius += (cam.goalRadius - cam.radius) * k;
    cam.target.lerp(cam.goalTarget, k);
    vel.r = (cam.radius - pr) / dt;
    vel.pan = 0;
  } else {
    [cam.radius, vel.r] = approachRadial(cam.radius, vel.r, cam.goalRadius, dt);

    // 平移在绝对 su 空间限速
    panDelta.subVectors(cam.goalTarget, cam.target);
    const len = panDelta.length();
    if (len > 1e-6) {
      const [step, nv] = approach(0, vel.pan, len,
        ENGINE.rcs.panAccel, ENGINE.rcs.panMax, dt);
      vel.pan = nv;
      cam.target.addScaledVector(panDelta.divideScalar(len), Math.min(step, len));
    } else {
      vel.pan = 0;
    }
  }

  const sp = Math.sin(cam.phi);
  camera.position.set(
    cam.target.x + cam.radius * sp * Math.sin(cam.theta),
    cam.target.y + cam.radius * Math.cos(cam.phi),
    cam.target.z + cam.radius * sp * Math.cos(cam.theta),
  );
  // 自动模式以世界 up 为基准，再绕视线滚转 auto.roll（漫游的花样飞行用；
  // 巡游恒为 0）；手动模式用机身持久 up（含滚转历史）。lookAt 只是借用它
  // 稳定地把 up 正交化进相机四元数，朝向仍由 position 决定
  if (auto.on || auto.assist) {
    autoUp.copy(FLIP_UP);
    if (auto.roll) {
      autoFwd.subVectors(cam.target, camera.position);
      const l = autoFwd.length();
      if (l > 1e-6) {
        autoFwd.divideScalar(l);
        autoUp.addScaledVector(autoFwd, -autoUp.dot(autoFwd));
        if (autoUp.lengthSq() > 1e-8) autoUp.normalize().applyAxisAngle(autoFwd, auto.roll);
        else autoUp.copy(FLIP_UP);
      }
    }
    camera.up.copy(autoUp);
  } else {
    camera.up.copy(bodyUp);
  }
  camera.lookAt(cam.target);
}

/* 指针：单指/左键旋转，双指捏合缩放 + 同向拖动平移。
   触屏没有滚轮，缩放和平移只能靠手势，否则移动端完全无法推拉。 */
const pointers = new Map();
const canHover = matchMedia("(hover: hover)").matches;
const TAP_SLOP = { mouse: 5, touch: 14, pen: 8 };
let dragging = false;
let pinch = null;

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}
// 双指数变化时重设基准，否则抬起一指的瞬间会跳一大步
function resetPinch() { pinch = pointers.size === 2 ? pinchState() : null; }

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (e) => {
  // 鼠标：右键转视角，左键只用来选中；触摸：单指转、双指缩放平移
  const isMouse = e.pointerType === "mouse";
  if (isMouse && e.button !== 0 && e.button !== 2) return;
  const role = isMouse ? (e.button === 2 ? "orbit" : "pick") : "orbit";
  canvas.setPointerCapture(e.pointerId);
  const pos = evPos(e);
  pointers.set(e.pointerId,
    { x: pos.x, y: pos.y, moved: 0, type: e.pointerType, role, downAt: performance.now() });
  dragging = true;
  resetPinch();
  clearHover();                 // 拖拽期间不更新悬停，留着会是个跟错星的虚框
  elResults.classList.remove("on");
});

canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  const pos = evPos(e);
  if (!p) { if (canHover) hover(pos.x, pos.y); return; }
  const dx = pos.x - p.x, dy = pos.y - p.y;
  p.moved += Math.abs(dx) + Math.abs(dy);
  p.x = pos.x; p.y = pos.y;

  if (pointers.size === 1) {
    // 转向不再是拖拽增量：右键/单指按住即指向线操控，位置已在上面更新，
    // 每帧由 pointerSteerStep() 按当前位置与中心的距离转向（见下方）
  } else if (pointers.size === 2) {
    const s = pinchState();
    if (pinch) {
      if (s.d > 1 && pinch.d > 1) {
        cam.goalRadius = THREE.MathUtils.clamp(
          cam.goalRadius * (pinch.d / s.d), cam.minRadius, cam.maxRadius);
        leashRadius();
      }
      // 手势给的是像素，先换算成场景单位再喂平移
      const wpp = panWorldPerPixel();
      panScreen(-(s.mx - pinch.mx) * wpp, (s.my - pinch.my) * wpp);
    }
    pinch = s;
  }
});

function endPointer(e, tap) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  dragging = pointers.size > 0;
  resetPinch();
  // 鼠标只认左键选中，右键松开不该顺手选一颗；触摸轻点照常选中
  const canPick = p.type === "mouse" ? p.role === "pick" : true;
  if (tap && canPick && p.moved < (TAP_SLOP[p.type] ?? 8)) {
    const pos = evPos(e);
    pick(pos.x, pos.y, true);
  }
}
canvas.addEventListener("pointerup", (e) => endPointer(e, true));
canvas.addEventListener("pointercancel", (e) => endPointer(e, false));

/* 鼠标中键与触屏中键按钮：单按清速度；双击激活 steerCenterPersist（持续
   转向银心直至对齐）；长按 500ms 回到起始位置（距银心 160su、朝向银心）。
   两路独立状态，不共享计时器引用，不进 pointers 表。 */
let steerCenterPersist = false;   // 双击中键激活，对齐银心后自清

const MID_DBL_MS = 380;           // 双击判定窗口
const MID_LONG_MS = 500;          // 长按触发阈值

const midMouse = { held: false, timer: null, fired: false, clicks: 0, dblTimer: null };
const midTouch = { held: false, timer: null, fired: false, clicks: 0, dblTimer: null };

function resetHome() {
  // 必须走 setAuto 而不是直接写 auto.on：模式按钮高亮、body 的 auto/wander
  // 类（它管着搜索框与页脚的可见性）、背景音乐都只在 setAuto 里同步，
  // 绕过去会让这些状态永久卡在自动态，之后再点「手动」也因早退修不回来
  setAuto(false);
  auto.segs = null; auto.engine = '';
  auto.roll = 0; auto.rollRate = 0;   // 归位要摆正，不能带着漫游的滚转回来
  cam.target.set(0, 0, 0); cam.goalTarget.set(0, 0, 0);
  cam.theta = 0.7; cam.phi = 1.22; cam.radius = 160;
  cam.goalTheta = 0.7; cam.goalPhi = 1.22; cam.goalRadius = 160;
  vel.r = 0;
  syncBodyFromSpherical();
  throttle.gear = 0; throttle.v = 0;
  steerCenterPersist = false;
}

function midPress(st) {
  clearTimeout(st.timer); st.timer = null;
  st.held = true; st.fired = false;
  throttle.gear = 0; throttle.v = 0;

  clearTimeout(st.dblTimer);
  st.clicks = (st.clicks || 0) + 1;
  if (st.clicks >= 2) {
    st.clicks = 0;
    steerCenterPersist = true;
    return;
  }
  st.dblTimer = setTimeout(() => { st.clicks = 0; }, MID_DBL_MS);

  st.timer = setTimeout(() => {
    if (st.held) { st.fired = true; resetHome(); }
  }, MID_LONG_MS);
}
function midRelease(st) {
  st.held = false; st.fired = false;
  clearTimeout(st.timer); st.timer = null;
}
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse" || e.button !== 1) return;
  e.preventDefault();
  midPress(midMouse);
});
addEventListener("pointerup", (e) => {
  if (e.pointerType !== "mouse" || e.button !== 1) return;
  midRelease(midMouse);
});
addEventListener("blur", () => { midRelease(midMouse); midRelease(midTouch); });

// 银心方向在相机系里的左右/上下分量，接近时收窄输入，转到位就停，不来回摆
function steerCenterStep() {
  if (!steerCenterPersist) return;
  attLook.copy(camera.position).negate();
  const dist = attLook.length();
  if (dist < 1e-3) { steerCenterPersist = false; return; }
  attLook.divideScalar(dist);
  const right = attLook.dot(bodyRight), up = attLook.dot(bodyUp);
  const err = Math.hypot(right, up);
  if (err < 0.01) { steerCenterPersist = false; return; }
  const strength = Math.min(err / 0.15, 1);
  att.inYaw -= right * strength;
  att.inPitch += up * strength;
}

/* WASD 辅助平移（上下左右）、QE 滚转；俯仰/偏航交给右键指向线 */
const held = new Set();
const PAN_KEYS = { KeyW: "panU", KeyS: "panD", KeyA: "panL", KeyD: "panR" };
const ROLL_KEYS = { KeyQ: "rollL", KeyE: "rollR" };
const MOVE_KEYS = { ...PAN_KEYS, ...ROLL_KEYS };
const panRight = new THREE.Vector3();
const panUp = new THREE.Vector3();

addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (MOVE_KEYS[e.code]) { held.add(MOVE_KEYS[e.code]); e.preventDefault(); }
});
addEventListener("keyup", (e) => {
  if (MOVE_KEYS[e.code]) held.delete(MOVE_KEYS[e.code]);
});
// 任何会夺走键盘焦点的动作都可能让 keyup 丢失，键就永远卡在按下状态。
// 右键菜单是最容易触发的一种，这里把所有出口都兜住。
addEventListener("blur", () => held.clear());
addEventListener("contextmenu", () => held.clear());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) held.clear();
});

const panScratch = new THREE.Vector3();

// 屏幕中心处 1px 对应的场景距离，手势像素输入用它换算 su
function panWorldPerPixel() {
  return (2 * cam.radius * Math.tan((camera.fov * Math.PI) / 360)) / vh();
}

// 沿屏幕平面平移视点，dx/dy 为场景单位。
// goal 拴在引擎短时可达范围内，任何输入路径都甩不开机体
function panScreen(dx, dy) {
  if (dx === 0 && dy === 0) return;
  camera.matrixWorld.extractBasis(panRight, panUp, panScratch);
  cam.goalTarget.addScaledVector(panRight, dx);
  cam.goalTarget.addScaledVector(panUp, dy);
  panDelta.subVectors(cam.goalTarget, cam.target);
  const leash = ENGINE.rcs.panMax * 1.5;
  if (panDelta.length() > leash) {
    cam.goalTarget.copy(cam.target).addScaledVector(panDelta.normalize(), leash);
  }
}

// WASD 辅助平移：屏幕上下左右，速率与捏合平移同一挡（RCS 平移上限）
function panKeyStep(dt) {
  if (auto.on || auto.assist) return;   // 残留按住的键不能在自动/接敌航段里污染 goalTarget
  if (!held.has("panU") && !held.has("panD") && !held.has("panL") && !held.has("panR")) return;
  const step = ENGINE.rcs.panMax * MANUAL_BOOST * dt;
  const dx = (held.has("panR") ? step : 0) - (held.has("panL") ? step : 0);
  const dy = (held.has("panU") ? step : 0) - (held.has("panD") ? step : 0);
  if (dx || dy) panScreen(dx, dy);
}

// 半径 goal 同理拴住：倒车侧只有 100 ly/s，不拴会积累几十秒的橡皮筋
function leashRadius() {
  cam.goalRadius = THREE.MathUtils.clamp(cam.goalRadius,
    Math.max(cam.minRadius, cam.radius - ENGINE.main.vFwd * 2),
    Math.min(cam.maxRadius, cam.radius + ENGINE.main.vRev * 2));
}

/* ── 手动飞行模型：机身姿态 + 节流阀 ───────────────────
   朝向由三个持久正交向量 bodyFwd/bodyRight/bodyUp（机身系，camera→target
   为 fwd）维护：偏航绕当前 bodyUp 转、俯仰绕当前 bodyRight 转、滚转绕
   当前（俯仰后）bodyFwd 转，全部局部系增量合成——不像旧版每帧从「世界 Y +
   叉乘」重新反解参考基，滚转后俯仰/偏航仍是屏幕上的俯仰/偏航，极区也不
   会有参考基跳变。cam.theta/phi 只在帧末从 bodyFwd 反算，供自动驾驶体系
   （burnPlan/aimFrom/pivot 插值）读取，不再是手动姿态的驱动源；姿态旋转
   不触碰 radius/target，位置与朝向彻底解耦。
   节流阀：滚轮/方向簇上下改目标速度档位，v 收敛后沿视线平移 target。 */
const FLIP_UP = new THREE.Vector3(0, 1, 0);
const FLIP_RIGHT = new THREE.Vector3(1, 0, 0);
const bodyFwd = new THREE.Vector3();
const bodyRight = new THREE.Vector3();
const bodyUp = new THREE.Vector3();
const att = { yaw: 0, pitch: 0, roll: 0, inYaw: 0, inPitch: 0 };   // rad/s 与本帧杆量
// 闲置自转：绕随机挑选的世界轴整体转姿态（轴贴着世界 Y 轴小角度随机倾斜，
// 每次从"有操作"变回"闲置"才重新挑一次），比原来固定绕 bodyUp 偏航更有
// 变化；轴贴近世界 Y 是为了避免转出去的圆弧逼近极区触发钳制、显得卡顿。
const IDLE_SPIN_RATE = 0.012;                    // rad/s，全速自转速率
const IDLE_SPIN_TILT_MAX = (20 * Math.PI) / 180; // 随机轴相对世界 Y 的最大倾角
const idleSpinAxis = new THREE.Vector3(0, 1, 0);
let idleSpinRate = 0;
let wasIdle = false;

function randomizeIdleSpinAxis() {
  const tilt = Math.random() * IDLE_SPIN_TILT_MAX;
  const az = Math.random() * Math.PI * 2;
  const s = Math.sin(tilt);
  idleSpinAxis.set(s * Math.cos(az), Math.cos(tilt), s * Math.sin(az));
}
const throttle = { gear: 0, v: 0 };                        // su/s，带符号
// 低速段更密：档位间隔随速度增大，转向/巡航贴近的低速区能精细停靠
const GEAR_STEPS =
  [-100, -50, -20, 0, 10, 25, 50, 100, 175, 275, 400, 550, 775, 1000];  // ly/s
const GEAR_MIN = GEAR_STEPS[0] * SCENE_SCALE;
const GEAR_MAX = GEAR_STEPS[GEAR_STEPS.length - 1] * SCENE_SCALE;
const attDir = new THREE.Vector3();
const attLook = new THREE.Vector3();
const attPosPre = new THREE.Vector3();
const attPosPost = new THREE.Vector3();

function shiftGear(dir) {
  const g = throttle.gear / SCENE_SCALE;
  if (dir > 0) {
    const s = GEAR_STEPS.find((v) => v > g + 1e-3);
    if (s !== undefined) throttle.gear = s * SCENE_SCALE;
  } else {
    for (let i = GEAR_STEPS.length - 1; i >= 0; i--) {
      if (GEAR_STEPS[i] < g - 1e-3) { throttle.gear = GEAR_STEPS[i] * SCENE_SCALE; break; }
    }
  }
}

// 由 (theta, phi) 重建一组"中性"（滚转为 0）的机身基向量。只在从自动/
// 辅助驾驶交回手动的那一帧调用一次，不在逐帧路径上，因此这里的极区
// 分支不会像旧版一样造成逐帧跳变，只是一次性的、无感的初始化。
function syncBodyFromSpherical() {
  const sp = Math.sin(cam.phi);
  bodyFwd.set(-sp * Math.sin(cam.theta), -Math.cos(cam.phi), -sp * Math.cos(cam.theta));
  if (Math.abs(bodyFwd.y) < 0.999) bodyRight.crossVectors(bodyFwd, FLIP_UP).normalize();
  else bodyRight.copy(FLIP_RIGHT);
  bodyUp.crossVectors(bodyRight, bodyFwd).normalize();
}
syncBodyFromSpherical();

const PHI_MARGIN = 0.04;
const Y_LIMIT = Math.cos(PHI_MARGIN);   // |bodyFwd.y| 上限，对应 phi∈[0.04, π-0.04]
let wasAutoOrAssist = false;

function attitudeStep(dt) {
  const inAuto = auto.on || auto.assist;
  if (inAuto) {
    att.yaw = 0; att.pitch = 0; att.roll = 0; att.inYaw = 0; att.inPitch = 0;
    idleSpinRate = 0; wasIdle = false;
    wasAutoOrAssist = true;
    return;
  }
  // 自动/辅助刚交回手动：机身基从这一刻的朝向重新起步。自动段可能正带着
  // 滚转（漫游的花样飞行），把这个角折进机身基再清零——两处的"中性 up"
  // 都是世界 Y 对机头正交化的结果，折算是精确的，画面不会在切换那帧摆正
  if (wasAutoOrAssist) {
    syncBodyFromSpherical();
    if (auto.roll) {
      bodyRight.applyAxisAngle(bodyFwd, auto.roll);
      bodyUp.applyAxisAngle(bodyFwd, auto.roll);
      auto.roll = 0;
    }
    // 滚转角速度也一并交接：桶滚中途接管时若把它一帧清零，地平线会硬停，
    // 而引擎规格是刹住滚转需要半秒
    att.roll = THREE.MathUtils.clamp(auto.rollRate,
      -ENGINE.rcs.angMax * MANUAL_BOOST, ENGINE.rcs.angMax * MANUAL_BOOST);
    auto.rollRate = 0;
    wasAutoOrAssist = false;
  }

  const iy = THREE.MathUtils.clamp(att.inYaw, -1, 1);
  const ip = THREE.MathUtils.clamp(att.inPitch, -1, 1);
  const ir = (held.has("rollR") ? 1 : 0) - (held.has("rollL") ? 1 : 0);
  att.inYaw = 0; att.inPitch = 0;
  const idleNow = opt.spin && !dragging && held.size === 0 && pad.id < 0
    && !iy && !ip && !ir;

  if (idleNow) {
    if (!wasIdle) randomizeIdleSpinAxis();
    idleSpinRate += (IDLE_SPIN_RATE - idleSpinRate) * (1 - Math.pow(0.01, dt));
    att.yaw = 0; att.pitch = 0; att.roll = 0;
  } else {
    idleSpinRate *= Math.pow(0.01, dt);   // 一有操作就平滑收掉，不叠加到手动转向上
    const lim = ENGINE.rcs.angAccel * MANUAL_BOOST * dt;
    const cap = ENGINE.rcs.angMax * MANUAL_BOOST;
    att.yaw += THREE.MathUtils.clamp(iy * cap - att.yaw, -lim, lim);
    att.pitch += THREE.MathUtils.clamp(ip * cap - att.pitch, -lim, lim);
    att.roll += THREE.MathUtils.clamp(ir * cap - att.roll, -lim, lim);
  }
  wasIdle = idleNow;

  const yawA = att.yaw * dt, pitA = att.pitch * dt, rollA = att.roll * dt;
  const idleA = idleSpinRate * dt;
  if (!yawA && !pitA && !rollA && !idleA) return;

  // 纯转向不该挪机位：applyCamera 仍用「target + radius·球面偏移(theta,phi)」
  // 定位相机，只转 bodyFwd 不动 target 的话，反算出的 theta/phi 一变，
  // 这条公式算出的机位就会跟着在以 target 为心的球面上滑——记下转向前的
  // 隐含机位，转完后把这份漂移原样吃回 target，机位才真正钉死原地
  attPosPre.copy(stateCamPos(cam));

  // 闲置自转：绕固定世界轴整体转（不是机身局部轴），姿态引擎统一处理，
  // 与下面的手动偏航/俯仰/滚转互斥（idleNow 时 yaw/pitch/roll 恒为 0）
  if (idleA) {
    bodyFwd.applyAxisAngle(idleSpinAxis, idleA);
    bodyRight.applyAxisAngle(idleSpinAxis, idleA);
    bodyUp.applyAxisAngle(idleSpinAxis, idleA);
  }
  // 偏航/俯仰/滚转均绕机身"当前"轴转（局部系合成），滚转后俯仰/偏航
  // 仍是屏幕上的俯仰/偏航；三者依次作用在同一组持久向量上
  if (yawA) {
    bodyFwd.applyAxisAngle(bodyUp, yawA);
    bodyRight.applyAxisAngle(bodyUp, yawA);
  }
  if (pitA) {
    bodyFwd.applyAxisAngle(bodyRight, pitA);
    bodyUp.applyAxisAngle(bodyRight, pitA);
  }
  if (rollA) {
    bodyRight.applyAxisAngle(bodyFwd, rollA);
    bodyUp.applyAxisAngle(bodyFwd, rollA);
  }

  // 极区安全钳制 + 正交漂移校正一并做：夹住 bodyFwd.y，right/up 重新正交化
  if (Math.abs(bodyFwd.y) > Y_LIMIT) {
    const h = Math.hypot(bodyFwd.x, bodyFwd.z) || 1e-6;
    const s = Math.sqrt(Math.max(0, 1 - Y_LIMIT * Y_LIMIT)) / h;
    bodyFwd.set(bodyFwd.x * s, Math.sign(bodyFwd.y) * Y_LIMIT, bodyFwd.z * s);
  }
  bodyFwd.normalize();
  bodyRight.addScaledVector(bodyFwd, -bodyRight.dot(bodyFwd)).normalize();
  bodyUp.crossVectors(bodyRight, bodyFwd).normalize();

  // 反算 theta/phi 供自动驾驶体系读取；radius 不变，target 下面用漂移量补偿
  cam.theta = cam.goalTheta = unwrap(Math.atan2(-bodyFwd.x, -bodyFwd.z), cam.theta);
  cam.phi = cam.goalPhi = Math.acos(THREE.MathUtils.clamp(-bodyFwd.y, -1, 1));

  // target 还没动，此刻 stateCamPos 算出的就是"只转朝向"会漂到的机位；
  // 把这份漂移加回 target/goalTarget（同一个 delta，不吃掉在途的 pan 差值）
  attPosPost.copy(stateCamPos(cam));
  attPosPost.subVectors(attPosPre, attPosPost);
  cam.target.add(attPosPost);
  cam.goalTarget.add(attPosPost);
}

function throttleStep(dt) {
  // 自动接管时档位清零，前向动量指数泄放（一帧骤停太硬）
  if (auto.on || auto.assist) {
    throttle.gear = 0;
    if (Math.abs(throttle.v) > 0.01) {
      throttle.v *= Math.pow(0.02, dt);
      const sp0 = Math.sin(cam.phi);
      attDir.set(-sp0 * Math.sin(cam.theta), -Math.cos(cam.phi),
                 -sp0 * Math.cos(cam.theta));
      cam.target.addScaledVector(attDir, throttle.v * dt);
      cam.goalTarget.addScaledVector(attDir, throttle.v * dt);
    } else {
      throttle.v = 0;
    }
    return;
  }
  const m = ENGINE.main;
  const err = throttle.gear - throttle.v;
  if (err) {
    // 提速吃 accel、降速吃 brake，都带手动增益
    const speedingUp = throttle.gear * throttle.v >= 0
      && Math.abs(throttle.gear) > Math.abs(throttle.v);
    const cap = (speedingUp ? m.accel : m.brake) * MANUAL_BOOST * dt;
    throttle.v += THREE.MathUtils.clamp(err, -cap, cap);
  }
  if (!throttle.v) return;
  // 沿视线平移 target 与 goal：radius 不变即直线前飞；bodyFwd 由
  // attitudeStep 逐帧维护，手动模式下与 theta/phi 严格同步
  cam.target.addScaledVector(bodyFwd, throttle.v * dt);
  cam.goalTarget.addScaledVector(bodyFwd, throttle.v * dt);
}

/* ── 触屏操控：左侧四方向按钮簇（上下＝滚轮同职能的连续调速、左右＝翻滚，
   同 QE），簇心是中键；右侧只有一个空格键。按钮式而非自由拖拽的摇杆——
   拖拽杆的回中状态反复出问题，且手指滑动容易误触发方向。
   俯仰/偏航交给指向线（右键/触屏单指按住），方向簇不管这两个轴。
   仅触屏可见，frame 的 padStep 里集中消费。 */
const pad = { vx: 0, vy: 0, id: -1 };   // 方向簇：按住即满值，松开归零

{
  const KEYS = { "dpad-up": "up", "dpad-down": "down", "dpad-left": "left", "dpad-right": "right" };
  const down = { up: false, down: false, left: false, right: false };
  const apply = () => {
    pad.vy = (down.up ? -1 : 0) + (down.down ? 1 : 0);
    pad.vx = (down.left ? -1 : 0) + (down.right ? 1 : 0);
  };
  for (const [id, key] of Object.entries(KEYS)) {
    const el = document.getElementById(id);
    const press = (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      if (down[key]) return;
      down[key] = true;
      if (pad.id < 0) pad.id = e.pointerId;
      apply();
      setAuto(false);
    };
    const release = () => {
      if (!down[key]) return;
      down[key] = false;
      apply();
      if (!down.up && !down.down && !down.left && !down.right) {
        pad.id = -1;
        // 松开最后一个方向键才清 held 的滚转标记，否则 padStep 早退，
        // held 里的滚转标记会卡住
        held.delete("rollL"); held.delete("rollR");
      }
    };
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    addEventListener("blur", release);
  }
}

// 纵轴＝滚轮同职能的连续调速，横轴＝翻滚（同 QE，借用 held 那条既有输入
// 线路）；没按住方向键时零开销
function padStep(dt) {
  if (pad.id < 0) return;
  // 按住期间新启动的辅助驾驶也要被打断，否则按键量每帧被段插值覆盖
  if (pad.vx || pad.vy) setAuto(false);
  if (pad.vy) {
    // 按住每秒 400 ly/s
    throttle.gear = THREE.MathUtils.clamp(
      throttle.gear - pad.vy * dt * 400 * SCENE_SCALE, GEAR_MIN, GEAR_MAX);
  }
  if (pad.vx > 0) { held.add("rollR"); held.delete("rollL"); }
  else if (pad.vx < 0) { held.add("rollL"); held.delete("rollR"); }
  else { held.delete("rollL"); held.delete("rollR"); }
}

/* ── 指向线操控：右键/触屏单指按住不放，转向由「光标与屏幕中心的
   距离」决定，而不是拖拽增量——按住不动也会持续转，越靠边转得越快。
   俯仰/偏航现在只有这一条输入线路（方向簇只管油门与翻滚），每帧读
   当前指针位置。 */
const elSteerLine = document.getElementById("steer-line");
const elSteerDot = document.getElementById("steer-dot");
const STEER_DEAD = 10;    // px，中心附近的死区，免得手抖乱转
const STEER_GRACE = 180;  // ms，按下多久才开始转向，普通点按（约50-300ms）不会误转

function pointerSteerStep() {
  // 单指/右键持续按住时才转向；捏合（两指）与左键选中都不算
  let p = null;
  if (pointers.size === 1) {
    const only = pointers.values().next().value;
    if (only.role === "orbit") p = only;
  }
  if (!p) {
    if (hudSvg.classList.contains("steering")) hudSvg.classList.remove("steering");
    return;
  }
  const cx = vw() / 2, cy = vh() / 2;
  const dx = p.x - cx, dy = p.y - cy;
  const dist = Math.hypot(dx, dy);
  hudSvg.classList.add("steering");
  elSteerLine.setAttribute("x1", cx.toFixed(1)); elSteerLine.setAttribute("y1", cy.toFixed(1));
  elSteerLine.setAttribute("x2", p.x.toFixed(1)); elSteerLine.setAttribute("y2", p.y.toFixed(1));
  elSteerDot.setAttribute("cx", p.x.toFixed(1)); elSteerDot.setAttribute("cy", p.y.toFixed(1));
  // 宽限期内只显示指向线（给按住的反馈），不写入转向，靠近边缘的轻点才不会带出一次机身偏转
  if (dist < STEER_DEAD || performance.now() - p.downAt < STEER_GRACE) return;
  // 死区外线性爬升到量程半径的 35% 处封顶，方向即光标偏移方向
  const R = 0.35 * Math.min(vw(), vh());
  const f = Math.min((dist - STEER_DEAD) / (R - STEER_DEAD), 1);
  att.inYaw -= (dx / dist) * f;
  att.inPitch -= (dy / dist) * f;
}

// 滚轮切档：累计 deltaY 约一格换一档，触发即清零，触控板不会一次跳多档
let wheelAcc = 0;
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  wheelAcc += e.deltaY;
  if (wheelAcc <= -90) { shiftGear(1); wheelAcc = 0; }
  else if (wheelAcc >= 90) { shiftGear(-1); wheelAcc = 0; }
}, { passive: false });

/* ── 光谱型 -> 恒星颜色 ──────────────────────────────
   横轴与数据里的 sp_axis 一致：O=0, B=1, A=2, F=3, G=4, K=5, M=6，
   小数位是次型。取值来自黑体色度的常用近似。 */
const SPECTRAL_RAMP = [
  [0.5, 0.608, 0.690, 1.000],  // O5
  [1.0, 0.635, 0.725, 1.000],  // B0
  [1.5, 0.725, 0.800, 1.000],  // B5
  [2.0, 0.792, 0.847, 1.000],  // A0
  [2.5, 0.871, 0.910, 1.000],  // A5
  [3.0, 0.953, 0.965, 1.000],  // F0
  [3.5, 0.988, 0.988, 1.000],  // F5
  [4.0, 1.000, 0.965, 0.925],  // G0
  [4.5, 1.000, 0.941, 0.871],  // G5
  [5.0, 1.000, 0.894, 0.769],  // K0
  [5.5, 1.000, 0.804, 0.596],  // K5
  [6.0, 1.000, 0.745, 0.498],  // M0
  [6.9, 1.000, 0.588, 0.314],  // M9
];
// 真实恒星色差本就很弱，直接用会是一片白。绕亮度提饱和，把 O..M 的冷暖拉开。
const SATURATION = 2.1;

function spectralColor(axis, out) {
  let i = 0;
  while (i < SPECTRAL_RAMP.length - 2 && axis > SPECTRAL_RAMP[i + 1][0]) i++;
  const a = SPECTRAL_RAMP[i], b = SPECTRAL_RAMP[i + 1];
  const t = THREE.MathUtils.clamp((axis - a[0]) / (b[0] - a[0]), 0, 1);
  const r = a[1] + (b[1] - a[1]) * t;
  const g = a[2] + (b[2] - a[2]) * t;
  const bl = a[3] + (b[3] - a[3]) * t;
  const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
  out[0] = THREE.MathUtils.clamp(lum + (r - lum) * SATURATION, 0, 1);
  out[1] = THREE.MathUtils.clamp(lum + (g - lum) * SATURATION, 0, 1);
  out[2] = THREE.MathUtils.clamp(lum + (bl - lum) * SATURATION, 0, 1);
}

// 光度级 I..III 是巨星/超巨星，半径大得多，给更宽更软的光晕；IV/V 是矮星
const SPECTRAL_LETTER = "OBAFGKM";
function giantness(lumCode) {
  return lumCode >= 1 && lumCode <= 3 ? (4 - lumCode) / 3 : 0;
}

/* ── 载入 ───────────────────────────────────────────── */
const base = new URL(".", import.meta.url);
const ASSETS = ["stars.bin", "edges.bin", "edge_weights.bin", "tracks.json"];

const elBar = document.getElementById("load-bar");
const elPct = document.getElementById("load-pct");

// 响应头的 content-length 是 gzip 后的长度，而流里读到的是解压字节，
// 两者对不上；sizes.json 存的是解压后的真实大小，进度才准。
const assetSizes = await fetch(new URL("data/sizes.json", base))
  .then((r) => r.json())
  .catch(() => null);
const totalBytes = assetSizes
  ? ASSETS.reduce((sum, name) => sum + (assetSizes[name] || 0), 0) : 0;
let loadedBytes = 0;

function reportProgress() {
  if (!totalBytes) return;
  const pct = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
  elBar.style.width = `${pct}%`;
  elPct.textContent = `${pct}%`;
}

async function fetchTracked(name) {
  const res = await fetch(new URL(`data/${name}`, base));
  if (!res.body || !totalBytes) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    reportProgress();
  }
  return new Blob(chunks).arrayBuffer();
}

const [starBuf, edgeBuf, weightBuf, metaBuf] =
  await Promise.all(ASSETS.map(fetchTracked));
const meta = JSON.parse(new TextDecoder().decode(metaBuf));
elBar.style.width = "100%";
elPct.textContent = "100%";

const raw = new Float32Array(starBuf);
const N = meta.count;
const edgeIdx = new Uint16Array(edgeBuf);
const edgeW = new Float32Array(weightBuf);
const tracks = meta.tracks;

/* ── 恒星点云 ───────────────────────────────────────── */
const positions = new Float32Array(N * 3);
const colors = new Float32Array(N * 3);
const sizes = new Float32Array(N);
const giants = new Float32Array(N);
const spAxis = new Float32Array(N);
const rgb = [0, 0, 0];

for (let i = 0; i < N; i++) {
  const o = i * STAR_STRIDE;
  positions[i * 3] = raw[o] * SCENE_SCALE;
  positions[i * 3 + 1] = raw[o + 2] * SCENE_SCALE;   // 银道面法向 -> 场景 Y
  positions[i * 3 + 2] = -raw[o + 1] * SCENE_SCALE;
  spAxis[i] = raw[o + 4];
  spectralColor(spAxis[i], rgb);
  colors[i * 3] = rgb[0]; colors[i * 3 + 1] = rgb[1]; colors[i * 3 + 2] = rgb[2];
  giants[i] = giantness(raw[o + 5]);
  // 视星等 -> 相对光通量，开方后作为半径，避免亮星过分压倒暗星
  sizes[i] = Math.sqrt(Math.pow(10, -0.4 * (raw[o + 3] - 6.4))) * 1.5 + 0.7;
}

const starGeom = new THREE.BufferGeometry();
starGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
starGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
starGeom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
starGeom.setAttribute("giant", new THREE.BufferAttribute(giants, 1));
starGeom.setAttribute("flare", new THREE.BufferAttribute(new Float32Array(N), 1));

const starMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uScale: { value: 1 }, uGain: { value: 1 }, uDpr: { value: 1 },
    // 相机速度，已除以轨道半径，量纲近似 rad/s
    uCamVel: { value: new THREE.Vector3() },
  },
  vertexShader: `
    attribute float size;
    attribute float flare;
    attribute float giant;
    varying vec3 vColor;
    varying float vFlare;
    varying float vGiant;
    varying float vShift;
    uniform float uScale;
    uniform float uDpr;
    uniform vec3 uCamVel;
    void main() {
      vColor = color;
      vFlare = flare;
      vGiant = giant;
      // 视向相对速度决定这颗星的偏移量：相机朝它去为正（蓝移），离开为负（红移）
      vec4 world = modelMatrix * vec4(position, 1.0);
      vec3 toStar = normalize(world.xyz - cameraPosition);
      vShift = clamp(dot(uCamVel, toStar) / 1.2, -1.0, 1.0);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float d = max(-mv.z, 0.6);
      float s = size * (1.0 + giant * 0.45);
      // gl_PointSize 是设备像素（drawing buffer），先在 CSS 像素量纲下
      // clamp 出直径上下限，最后再乘 uDpr 换算——不然高 DPR 屏幕上同样的
      // clamp 上下限会先在设备像素里被夹住，视觉上（CSS 像素）就偏小
      gl_PointSize = clamp(s * uScale / d * 26.0, 1.3, 40.0) * (1.0 + flare * 2.0) * uDpr;
    }`,
  fragmentShader: `
    varying vec3 vColor;
    varying float vFlare;
    varying float vGiant;
    varying float vShift;
    uniform float uGain;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float r = length(p) * 2.0;
      if (r > 1.0) discard;
      // 窄核 + 收敛的晕：晕过宽会让密集区糊成一片白。
      // 巨星/超巨星半径大得多，给更宽更软的晕以示区别。
      float core = pow(1.0 - r, mix(2.8, 2.1, vGiant));
      float halo = pow(1.0 - r, mix(1.6, 1.0, vGiant)) * (0.18 + vGiant * 0.20);
      vec3 c = mix(vColor, vec3(1.0), core * 0.5 + vFlare * 0.4);
      // 逼近的星压红通道（蓝移），退行的星压蓝通道（红移）。
      // 只压不抬，避免加性混合下过曝。
      c *= mix(vec3(1.0), vec3(0.80, 0.93, 1.0), max(vShift, 0.0));
      c *= mix(vec3(1.0), vec3(1.0, 0.90, 0.76), max(-vShift, 0.0));
      gl_FragColor = vec4(c, (core + halo) * (0.88 + vFlare * 1.0) * uGain);
    }`,
});
starMat.vertexColors = true;
const stars = new THREE.Points(starGeom, starMat);
stars.frustumCulled = false;
scene.add(stars);

/* ── 相似度连线 ─────────────────────────────────────── */
const E = edgeIdx.length / 2;
const edgePos = new Float32Array(E * 6);
const edgeAlpha = new Float32Array(E * 2);
const edgeCol = new Float32Array(E * 6);
const neighbours = Array.from({ length: N }, () => []);

for (let e = 0; e < E; e++) {
  const a = edgeIdx[e * 2], b = edgeIdx[e * 2 + 1];
  neighbours[a].push(e); neighbours[b].push(e);
  for (let k = 0; k < 3; k++) {
    edgePos[e * 6 + k] = positions[a * 3 + k];
    edgePos[e * 6 + 3 + k] = positions[b * 3 + k];
  }
  // 相似度越高线越暖
  const w = THREE.MathUtils.clamp((edgeW[e] - 0.28) / 0.5, 0, 1);
  for (const v of [0, 3]) {
    edgeCol[e * 6 + v] = 0.30 + w * 0.62;
    edgeCol[e * 6 + v + 1] = 0.58 - w * 0.06;
    edgeCol[e * 6 + v + 2] = 0.74 - w * 0.26;
  }
  edgeAlpha[e * 2] = edgeAlpha[e * 2 + 1] = EDGE_BASE;
}

const edgeGeom = new THREE.BufferGeometry();
edgeGeom.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
edgeGeom.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
edgeGeom.setAttribute("alpha", new THREE.BufferAttribute(edgeAlpha, 1));

const edgeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uGain: { value: 1 } },
  vertexShader: `
    attribute float alpha;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      vColor = color; vAlpha = alpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vAlpha;
    uniform float uGain;
    void main() { gl_FragColor = vec4(vColor, vAlpha * uGain); }`,
});
edgeMat.vertexColors = true;
const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
edgeLines.frustumCulled = false;
scene.add(edgeLines);

/* ── 背景微尘，给推拉一点纵深参照 ─────────────────────── */
const dustCount = 2600;
const dust = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  const r = 400 + Math.random() * 900;
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  dust[i * 3] = r * s * Math.cos(a);
  dust[i * 3 + 1] = r * u * 0.42;
  dust[i * 3 + 2] = r * s * Math.sin(a);
}
const dustGeom = new THREE.BufferGeometry();
dustGeom.setAttribute("position", new THREE.BufferAttribute(dust, 3));
const DUST_OPACITY = 0.16;
const dustMat = new THREE.PointsMaterial({
  size: 0.9, sizeAttenuation: false, color: 0x93b6d4,
  transparent: true, opacity: DUST_OPACITY, depthWrite: false,
});
scene.add(new THREE.Points(dustGeom, dustMat));

/* ── 运动拖尾 ───────────────────────────────────────
   乒乓渲染目标做指数滑动平均：本帧 = 上一帧×decay + 场景×(1-decay)。
   总亮度守恒，静止画面不会越积越亮；decay 由相机角速度驱动，
   静止时归零，因此只有移动时才拖尾。 */
// samples 不能省：场景改渲染到离屏目标后就绕开了画布自带的 MSAA，
// 连线会重新出现锯齿，得让目标自己多重采样
const rtOpts = {
  type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  samples: coarse ? 2 : 4,
};
let rtPrev = new THREE.WebGLRenderTarget(2, 2, rtOpts);
let rtNext = new THREE.WebGLRenderTarget(2, 2, rtOpts);

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadMat = new THREE.ShaderMaterial({
  uniforms: { uTex: { value: null }, uDecay: { value: 0 } },
  depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  // 这里不再统一染色：偏移量已经逐星算过，尾迹自然继承各自的冷暖，
  // 全局染红会把蓝移那侧的尾巴也一起污染
  fragmentShader: `
    uniform sampler2D uTex; uniform float uDecay;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(uTex, vUv) * uDecay; }`,
});
const quadScene = new THREE.Scene();
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));

function setGain(g) {
  starMat.uniforms.uGain.value = g;
  edgeMat.uniforms.uGain.value = g;
  dustMat.opacity = DUST_OPACITY * g;
}

/* ── 选中与悬停 ─────────────────────────────────────── */
const flare = starGeom.getAttribute("flare");
const projected = new Float32Array(N * 2);
const visible = new Uint8Array(N);
const tmp = new THREE.Vector3();
let selected = -1, hovered = -1;

function project() {
  const w = vw() * 0.5, h = vh() * 0.5;
  for (let i = 0; i < N; i++) {
    tmp.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).project(camera);
    visible[i] = tmp.z > -1 && tmp.z < 1 ? 1 : 0;
    projected[i * 2] = (tmp.x + 1) * w;
    projected[i * 2 + 1] = (1 - tmp.y) * h;
  }
}

function nearest(x, y, maxDist) {
  let best = -1, bestD = maxDist * maxDist;
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    const dx = projected[i * 2] - x, dy = projected[i * 2 + 1] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const tooltip = document.getElementById("tooltip");

function clearHover() {
  hovered = -1;
  tooltip.style.opacity = "0";
}

function hover(x, y) {
  const i = nearest(x, y, 15);
  if (i === hovered) {
    if (i >= 0) { tooltip.style.left = `${x + 14}px`; tooltip.style.top = `${y + 14}px`; }
    return;
  }
  hovered = i;
  if (i < 0) { tooltip.style.opacity = "0"; canvas.style.cursor = "grab"; return; }
  canvas.style.cursor = "pointer";
  tooltip.textContent = tracks[i].t;
  tooltip.style.left = `${x + 14}px`;
  tooltip.style.top = `${y + 14}px`;
  tooltip.style.opacity = "1";
}

const panelLeft = document.getElementById("panel-left");
const panelRight = document.getElementById("panel-right");
const elTitle = document.getElementById("title");
const F = Object.fromEntries(["author", "date", "view", "tyc", "sp", "mag"]
  .map((k) => [k, document.getElementById(`f-${k}`)]));
const elLinks = document.getElementById("links");
const elLinkCount = document.getElementById("link-count");
const elLinkList = document.getElementById("link-list");
const elCover = document.getElementById("cover");

const fmt = new Intl.NumberFormat("zh-CN");

function select(i) {
  stopPlayer();
  // 任何路径改了选中目标，之前数字键留下的预选都作废
  if (pendingSlot >= 0 && targetSlots[pendingSlot]) {
    targetSlots[pendingSlot].classList.remove("pending");
    pendingSlot = -1;
  }
  if (selected >= 0) {
    flare.array[selected] = 0;
    for (const e of neighbours[selected]) {
      edgeAlpha[e * 2] = edgeAlpha[e * 2 + 1] = EDGE_BASE;
    }
  }
  selected = i;
  if (i < 0) {
    panelRight.classList.remove("on");   // 文本面板常驻，只收起播放器
    clearLinks();
    linkLayer.classList.remove("sel");
    flare.needsUpdate = true; edgeGeom.getAttribute("alpha").needsUpdate = true;
    requestAnimationFrame(syncSkew);     // 曲目行隐藏后左板高度骤变
    return;
  }

  flare.array[i] = 1;
  for (const e of neighbours[i]) {
    edgeAlpha[e * 2] = edgeAlpha[e * 2 + 1] = EDGE_LIT;
    const other = edgeIdx[e * 2] === i ? edgeIdx[e * 2 + 1] : edgeIdx[e * 2];
    flare.array[other] = Math.max(flare.array[other], 0.5);
  }
  flare.needsUpdate = true;
  edgeGeom.getAttribute("alpha").needsUpdate = true;

  const t = tracks[i];
  elTitle.textContent = t.t;

  // 自动模式（含漫游扫描）也照常挂播放器，靠 autoplay=0 让它停在首帧、
  // 不出声，于是背景音乐可以一直放
  panelRight.classList.add("on");
  mountPlayer(i);

  F.author.textContent = t.a || `UID ${t.u}`;
  F.date.textContent = t.d;
  F.view.textContent = fmt.format(t.v);
  F.tyc.textContent = t.s;
  F.sp.textContent = t.y || "—";
  // 选中标注里的恒星类型字母（O/B/A/F/G/K/M），用该星的光谱色着色
  const cls = (t.y || "").match(/[OBAFGKM]/);
  elRingCls.textContent = cls ? cls[0] : "";
  elRingCls.style.fill = cls
    ? `rgb(${(colors[i * 3] * 255) | 0},${(colors[i * 3 + 1] * 255) | 0},${(colors[i * 3 + 2] * 255) | 0})`
    : "";
  F.mag.textContent = t.m.toFixed(2);
  fillLinks(i);
  requestAnimationFrame(syncSkew);   // 内容高度变了要重算倾角
  // 点选只锁定目标，不再自动飞过去——按 Space（或触屏空格按钮）才接敌
}

// 接敌：手动模式下有锁定目标才出发，同一套辅助驾驶分段送达
// 已在接敌中则不再重入——长按/连按 Space 会反复用当前机位重规划航段，永远飞不到
function fireEngage() {
  if (selected >= 0 && !auto.on && !auto.assist) startAssist(selected);
}
// 触屏空格按钮：与键盘 Space 完全同路——先确认数字键预选，没有预选才接敌
const spcBtn = document.getElementById("spc-btn");
spcBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (confirmPending()) return;
  if (selected < 0) return;   // 没有锁定目标时不该打断巡游/漫游
  setAuto(false);
  fireEngage();
});

// 触屏中键按钮：与鼠标中键同职能、独立状态（见 midMouse/midTouch 定义处）
const midBtn = document.getElementById("mid-btn");
midBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  midBtn.setPointerCapture(e.pointerId);
  midPress(midTouch);
});
midBtn.addEventListener("pointerup", () => midRelease(midTouch));
midBtn.addEventListener("pointercancel", () => midRelease(midTouch));

const elTargets = document.getElementById("targets");
const TARGET_MAX = 8;        // 每侧四个槽位
const TARGET_SPREAD = 16;    // 槽位在弧上张开的角度（R 足够大时用这个）
const TARGET_GAP = 3;        // 相邻槽位间的最小像素安全间隙

const targetSlots = Array.from({ length: TARGET_MAX }, (_, k) => {
  const el = document.createElement("div");
  el.className = `target ${k < TARGET_MAX / 2 ? "left" : "right"}`;
  el.innerHTML = '<span class="t"></span><span class="w"></span>';
  el.addEventListener("click", () => {
    if (el.dataset.i) select(Number(el.dataset.i));
  });
  elTargets.appendChild(el);
  return el;
});

/* 面板剪影：就是平行四边形——左右两边保持原长度整体错开，顶边与底边
   互相平行（同一个倾角），不再分内外侧、不再收窄。内容（文字、播放器）
   跟着同一个角度斜切，天然与顶边、底边都平行。剪影和描边多边形共用
   同一组顶点；空板高度不足时收窄到极限会缩成三角形。 */
const PANEL_SKEW_DEG = 6;

function syncSkew() {
  for (const [el, innerRight] of [[panelLeft, true], [panelRight, false]]) {
    // rotateY 下 getBoundingClientRect 是投影包围盒，必须用 offset 尺寸
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) continue;
    const drop = Math.min(w * Math.tan((PANEL_SKEW_DEG * Math.PI) / 180), h);
    // 两条对角各自的一端整体下压 drop，顶边/底边因此同斜率、真正平行
    const pts = innerRight
      ? [[0, drop], [w, 0], [w, h - drop], [0, h]]
      : [[0, 0], [w, drop], [w, h], [0, h - drop]];
    el.style.clipPath =
      `polygon(${pts.map(([x, y]) => `${x}px ${y.toFixed(1)}px`).join(", ")})`;
    const edge = el.querySelector(".panel-edge");
    edge.setAttribute("viewBox", `0 0 ${w} ${h}`);
    edge.firstElementChild.setAttribute("points",
      pts.map(([x, y]) => `${x},${y.toFixed(1)}`).join(" "));
  }
  // 内容跟着同一个角度斜切：左板取负角，右板镜像取正，与顶边/底边都平行
  document.documentElement.style.setProperty("--skew-l", `${-PANEL_SKEW_DEG}deg`);
  document.documentElement.style.setProperty("--skew-r", `${PANEL_SKEW_DEG}deg`);
}
// 面板高度随内容增减，剪影要跟着重算
const panelRO = new ResizeObserver(() => syncSkew());
panelRO.observe(panelLeft);
panelRO.observe(panelRight);

// 触屏窄横屏时槽位弧向内收，给两侧边缘的按钮簇让位——比原来的量再
// 收紧一点，配合槽位本身缩小（.target 在这个断点下更窄更小字），
// 避免弧与两侧控件视觉重叠
function targetArcR() {
  const base = vw() * 0.25;
  return coarse && vw() <= 1100 && vw() > vh()
    ? Math.min(base, Math.max(vw() / 2 - 280, 70)) : base;
}

// 槽位间距只看角度会跟半径脱节：R 被按钮簇避让钳制得很小时，角度不变但
// 弧长（R·Δθ）会小于槽位实际高度，相邻槽位就会重叠。用槽位实际高度反推
// 不重叠所需的最小张开角，跟设计角度取较大者——R 足够大（桌面）时效果
// 不变，R 被压缩的触屏窄视口下自动放宽。装饰弧（layoutHud 里的内圈弧）
// 调这同一个函数取值，两处永远同步、不会再出现"改一处忘一处"。
function targetSpreadDeg(R) {
  const half = TARGET_MAX / 2;
  const slotH = (parseFloat(getComputedStyle(targetSlots[0]).minHeight) || 18) + TARGET_GAP;
  const minSpread = (((half - 1) * slotH) / R) * (180 / Math.PI);
  return Math.max(TARGET_SPREAD, minSpread);
}

// 槽位钉在以屏幕中心为圆心、半径约半个屏宽的弧上，与相机无关，只随窗口变化
function layoutTargets() {
  const cx = vw() / 2, cy = vh() / 2;
  const R = targetArcR() + 6;   // 贴在弧的外侧
  const spread = targetSpreadDeg(R);
  const half = TARGET_MAX / 2;
  targetSlots.forEach((el, k) => {
    const j = k % half;
    const off = -spread / 2 + (spread * j) / (half - 1);
    const deg = (k < half ? 180 : 0) + off;
    const a = (deg * Math.PI) / 180;
    el.style.left = `${(cx + R * Math.cos(a)).toFixed(1)}px`;
    el.style.top = `${(cy + R * Math.sin(a)).toFixed(1)}px`;
  });
}

function fillLinks(i) {
  const rows = neighbours[i]
    .map((e) => ({
      other: edgeIdx[e * 2] === i ? edgeIdx[e * 2 + 1] : edgeIdx[e * 2],
      w: edgeW[e],
    }))
    .sort((a, b) => b.w - a.w)
    .slice(0, TARGET_MAX);
  targetSlots.forEach((el, k) => {
    const r = rows[k];
    if (!r) { el.style.display = "none"; delete el.dataset.i; return; }
    el.style.display = "flex";
    el.dataset.i = r.other;
    el.querySelector(".t").textContent = tracks[r.other].t;
    el.querySelector(".w").textContent = r.w.toFixed(2);
  });
  elTargets.classList.add("on");
  document.body.classList.add("has-sel");
}

function clearLinks() {
  elTargets.classList.remove("on");
  document.body.classList.remove("has-sel");
  // 真正清空槽位数据，不只是隐藏——否则取消选中后数字键还能用上一次的
  // 残留 dataset.i 预选到一个早已不相关的目标
  for (const el of targetSlots) { el.style.display = "none"; delete el.dataset.i; }
}

// 数字键 1-8 只预选槽位（高亮候选，不切换），按 Space/空格按钮确认才真正
// select() 过去；PageUp/PageDown 保持直切，连续浏览没必要每步都确认
let pendingSlot = -1;

function pickTargetSlot(k) {
  const el = targetSlots[k];
  if (!el || !el.dataset.i) return;
  if (pendingSlot >= 0 && targetSlots[pendingSlot]) targetSlots[pendingSlot].classList.remove("pending");
  pendingSlot = k;
  el.classList.add("pending");
}

// Space/空格按钮先确认预选：有预选就切换过去（这一下只切换，不接敌）；
// 没有预选时调用方退回接敌语义。返回值告诉调用方是否吃掉了这次按键
function confirmPending() {
  if (pendingSlot < 0) return false;
  const el = targetSlots[pendingSlot];
  const i = el && el.dataset.i ? Number(el.dataset.i) : -1;
  el.classList.remove("pending");
  pendingSlot = -1;
  if (i >= 0) select(i);
  return true;
}
function cycleTarget(dir) {
  const filled = targetSlots
    .map((el) => (el.dataset.i ? Number(el.dataset.i) : -1))
    .filter((i) => i >= 0);
  if (!filled.length) return;
  const idx = filled.indexOf(selected);
  select(filled[idx < 0 ? 0 : (idx + dir + filled.length) % filled.length]);
}

function pick(x, y, focus) {
  const i = nearest(x, y, 16);
  // 取消选中只清标记，不动镜头 —— 回弹会把用户刚调好的视角冲掉
  if (i >= 0) select(i);
  else if (focus) select(-1);
}

/* ── 选中标记：平顶正六边形 + 接到信息框的引线 ─────────
   六边形与引线画在屏幕空间的 SVG 上，这样一端能贴住 DOM 信息框，
   另一端跟住恒星的投影位置，尺寸也不随镜头远近变化。 */
const linkLayer = document.getElementById("link-layer");
const elLeader = document.getElementById("leader");
const elRing = document.getElementById("ring");
const elRingGlow = document.getElementById("ring-glow");
const elHoverRing = document.getElementById("hover-ring");
const elRingDist = document.getElementById("ring-dist");
const elRingCls = document.getElementById("ring-cls");
const RING_R = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue("--ring-r")) || 19;

// 顶点取 0°/60°/…/300°，于是上下各有一条水平边 —— 平顶六边形
const HEX = Array.from({ length: 6 }, (_, k) => {
  const a = (k * Math.PI) / 3;
  return [Math.cos(a), Math.sin(a)];
});

function hexPoints(cx, cy, r) {
  return HEX.map(([dx, dy]) => `${(cx + dx * r).toFixed(1)},${(cy + dy * r).toFixed(1)}`)
            .join(" ");
}

// 拖尾把星点画成滞后的质心，标记按瞬时投影走会脱节；
// 用拖尾同源的 decay 做同步 EMA，decay=0（静止/拖尾关）时无平滑
const mark = { sx: 0, sy: 0, hx: 0, hy: 0, sel: -1, hov: -1 };
const elLockDot = document.getElementById("lock-dot");
// 半径改由 JS 算好直接写数值，不用 CSS calc(var(...)*N)——实测这个引擎下
// SVG 的 r 属性用 calc() 做乘法不可靠（哪怕是字面量 calc(2.6*3.5) 也会
// 解析成 3.5，calc() 本身在 width/height 这类常规盒模型属性上没问题，
// 只在 r 上出问题），JS 直接赋值反而稳妥，跟 cx/cy 本来就是 JS 在管一致
let lockDotScale = 1;

function updateMarker() {
  const k = 1 - decay;
  // 锁定指示器：未选中时暗态守在屏幕正中，选中且可见时移动到目标身上并变亮；
  // 选中但暂时转出画面时先退回中心，不跟丢
  const locked = selected >= 0 && visible[selected];
  elLockDot.classList.toggle("locked", locked);
  elLockDot.style.r = `${((locked ? 2.4 : 3.5) * lockDotScale).toFixed(2)}px`;
  if (locked) {
    const lx = mark.sel === selected ? mark.sx : projected[selected * 2];
    const ly = mark.sel === selected ? mark.sy : projected[selected * 2 + 1];
    elLockDot.setAttribute("cx", lx.toFixed(1));
    elLockDot.setAttribute("cy", ly.toFixed(1));
  } else {
    elLockDot.setAttribute("cx", (vw() / 2).toFixed(1));
    elLockDot.setAttribute("cy", (vh() / 2).toFixed(1));
  }
  // 悬停标记与选中标记同形同尺寸，只靠透明度区分；选中的那颗不重复画
  const showHover = hovered >= 0 && hovered !== selected && visible[hovered];
  if (showHover) {
    const tx = projected[hovered * 2], ty = projected[hovered * 2 + 1];
    if (mark.hov !== hovered) { mark.hx = tx; mark.hy = ty; mark.hov = hovered; }
    else { mark.hx += (tx - mark.hx) * k; mark.hy += (ty - mark.hy) * k; }
    elHoverRing.setAttribute("points", hexPoints(mark.hx, mark.hy, RING_R));
  } else {
    mark.hov = -1;
  }
  linkLayer.classList.toggle("hov", showHover);

  if (selected < 0 || !visible[selected]) {
    mark.sel = -1;
    linkLayer.classList.remove("sel");
    return;
  }
  const px = projected[selected * 2], py = projected[selected * 2 + 1];
  if (mark.sel !== selected) { mark.sx = px; mark.sy = py; mark.sel = selected; }
  else { mark.sx += (px - mark.sx) * k; mark.sy += (py - mark.sy) * k; }
  const sx = mark.sx, sy = mark.sy;
  const pts = hexPoints(sx, sy, RING_R);
  elRing.setAttribute("points", pts);
  elRingGlow.setAttribute("points", pts);

  // 类型字母在左上、距离在右上，基线与平顶六边形的上边取平（0.866R）
  const dLy = camera.position.distanceTo(starVec(selected)) / SCENE_SCALE;
  elRingDist.textContent = `${dLy.toFixed(2)} ly`;
  const topY = (sy - RING_R * 0.866).toFixed(1);
  elRingCls.setAttribute("x", (sx - RING_R - 5).toFixed(1));
  elRingCls.setAttribute("y", topY);
  elRingDist.setAttribute("x", (sx + RING_R + 5).toFixed(1));
  elRingDist.setAttribute("y", topY);

  // 引线从信息框朝向恒星的那条边引出，止于六边形边缘。
  // 用射线与矩形求交，桌面端的左侧卡片和移动端的底部抽屉都能自然出线。
  let box = panelLeft.getBoundingClientRect();
  // 旋转 body 下 rect 是物理视口坐标，轴对齐换算回旋转坐标系
  if (isFakeLand()) {
    box = { left: box.top, top: innerWidth - box.right,
            width: box.height, height: box.width };
  }
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const vx = sx - cx, vy = sy - cy;
  const hw = box.width / 2 || 1, hh = box.height / 2 || 1;
  const t = 1 / Math.max(Math.abs(vx) / hw, Math.abs(vy) / hh, 1e-6);
  const ax = cx + vx * t, ay = cy + vy * t;

  const dx = sx - ax, dy = sy - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ex = sx - (dx / len) * RING_R, ey = sy - (dy / len) * RING_R;

  // 折角方向跟着出线的那条边：竖边先横走，横边先竖走
  const fromVertical = Math.abs(vx) / hw >= Math.abs(vy) / hh;
  const d = fromVertical
    ? `M${ax.toFixed(1)},${ay.toFixed(1)} L${(ax + (ex - ax) * 0.45).toFixed(1)},${ay.toFixed(1)} `
      + `L${ex.toFixed(1)},${ey.toFixed(1)}`
    : `M${ax.toFixed(1)},${ay.toFixed(1)} L${ax.toFixed(1)},${(ay + (ey - ay) * 0.45).toFixed(1)} `
      + `L${ex.toFixed(1)},${ey.toFixed(1)}`;
  elLeader.setAttribute("d", d);
  linkLayer.classList.add("sel");
}

/* ── 内嵌播放器 ─────────────────────────────────────── */
function stopPlayer() {
  elCover.querySelector("iframe")?.remove();
}

// 选中即挂载，autoplay=0，播放器停在自己的首帧上 —— 封面直接借它的，
// 不必再单独取一张图，也省掉了防盗链那套。
function mountPlayer(i) {
  const t = tracks[i];
  if (!t) return;
  stopPlayer();
  const frame = document.createElement("iframe");
  const q = new URLSearchParams({
    isOutside: "true", bvid: t.b, cid: String(t.i), p: String(t.p),
    autoplay: "0", danmaku: "0", high_quality: "1",
  });
  frame.src = `https://player.bilibili.com/player.html?${q}`;
  frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  frame.allowFullscreen = true;
  frame.scrolling = "no";
  frame.referrerPolicy = "no-referrer";
  frame.addEventListener("load", () => frame.classList.add("on"));
  elCover.appendChild(frame);
}

/* ── 显示选项 ───────────────────────────────────────
   存进 localStorage，刷新后不用重设 */
const optBtn = document.getElementById("opt-btn");
const optsBox = document.getElementById("opts");
const OPTS = {
  reticle: ["o-reticle", "no-reticle", true],
  targets: ["o-targets", "no-targets", true],
  navball: ["o-navball", "no-navball", true],
  footer: ["o-footer", "no-footer", true],
  spin: ["o-spin", null, true],
};
const opt = {};

function applyOpt(key) {
  const [id, cls] = OPTS[key];
  const el = document.getElementById(id);
  opt[key] = el.checked;
  if (cls) document.body.classList.toggle(cls, !el.checked);
  try { localStorage.setItem(`hud.${key}`, el.checked ? "1" : "0"); } catch { /* 隐私模式 */ }
}

for (const key of Object.keys(OPTS)) {
  const [id, , def] = OPTS[key];
  const el = document.getElementById(id);
  let saved = null;
  try { saved = localStorage.getItem(`hud.${key}`); } catch { /* 隐私模式 */ }
  el.checked = saved === null ? def : saved === "1";
  el.addEventListener("change", () => applyOpt(key));
  applyOpt(key);
}

optBtn.addEventListener("click", () => {
  optsBox.classList.toggle("on");
  optBtn.classList.toggle("on", optsBox.classList.contains("on"));
});

// 拖尾强度：关/低/中/高，不是勾选框走独立的 select，中＝默认＝现在的强度
const elTrail = document.getElementById("o-trail");
let trailLevel = TRAIL_LEVELS.mid;
function applyTrailLevel() {
  trailLevel = TRAIL_LEVELS[elTrail.value] || TRAIL_LEVELS.mid;
  try { localStorage.setItem("hud.trail", elTrail.value); } catch { /* 隐私模式 */ }
}
{
  let saved = null;
  try { saved = localStorage.getItem("hud.trail"); } catch { /* 隐私模式 */ }
  elTrail.value = saved && TRAIL_LEVELS[saved] ? saved : "mid";
  elTrail.addEventListener("change", applyTrailLevel);
  applyTrailLevel();
}

/* ── 自动巡游 / 漫游 ────────────────────────────────
   两种模式共用同一套引擎规格，只是编排方式不同。
   巡游：一次一个目标，星体与坐标点各半，走"瞄准→点火→反推→入轨"的
   分段时序；每个目标占 10-15s 的时间预算，行程吃不满的部分留给驻留。
   漫游：不落地的连续飞行，逐帧积分一条受引擎限制的轨迹，路点只是转向
   吸引子；沿途扫描顺路的星体——只锁定展示、不改航线。 */
const modeBtns = {
  manual: document.getElementById("mode-manual"),
  cruise: document.getElementById("mode-cruise"),
  wander: document.getElementById("mode-wander"),
};
const bgm = document.getElementById("bgm");

// 曲目顺序即优先级，放完最后一首回到第一首
const BGM_LIST = ["audio/star-wish.m4a", "audio/star-lalala.m4a"];
let bgmIndex = 0;

function loadBgm(i, play) {
  bgmIndex = ((i % BGM_LIST.length) + BGM_LIST.length) % BGM_LIST.length;
  bgm.src = new URL(BGM_LIST[bgmIndex], base).href;
  if (play) bgm.play().catch(() => {});
}
bgm.addEventListener("ended", () => loadBgm(bgmIndex + 1, auto.on));

const auto = {
  on: false, mode: "", t0: 0, lastWasSelect: false,
  segs: null, idx: 0, from: null, engine: "", rcsOn: false,
  assist: false,
  gear: 0,                       // su/s，自动驾驶当前设定的目标速度（正=前进）
  roll: 0, rollRate: 0,          // rad / rad·s⁻¹，自动段的滚转
  scan: -1, scanEnd: 0, scanNext: 0,   // 漫游扫描：目标、到期时刻、下次可扫时刻
};
const FIELD_R = 26;   // 巡游随机坐标点的活动半径，场景单位

const rnd = (a, b) => a + Math.random() * (b - a);
const easeInOut = (u) => u * u * (3 - 2 * u);
// 两端更平缓的五次缓动，转向不会一上来就窜出去
const easeSoft = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const easeIn = (u) => u * u;              // 点火加速
const easeOut = (u) => 1 - (1 - u) * (1 - u);   // 熄火滑行

function snapshotCam() {
  // 取机体实际位形而非 goal：滚轮/拖拽可能让 goal 甩开机体，
  // 段起点若取 goal，直跟分支会把脱开量一口吞成瞬移
  return {
    theta: cam.theta, phi: cam.phi, radius: cam.radius,
    target: cam.target.clone(),
  };
}

/* 瞄准：机位不动，只把注视点转到目标上。
   相机位置由 target + 球面偏移决定，所以要反解出让 P 保持不变的那组
   (theta, phi, radius)，否则"转向"会连人带机一起漂过去。 */
const aimV = new THREE.Vector3();

// atan2 的结果落在 (-pi, pi]，直接插值会在跨越边界时绕远路转一大圈。
// 解缠到离当前角度最近的等价值，转向才走短弧。
function unwrap(target, ref) {
  let d = (target - ref) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return ref + d;
}

function aimFrom(pos, point, thetaRef) {
  aimV.copy(pos).sub(point);
  // phi 必须用真实长度归一：半径下限只是给返回值兜底，拿它当分母会在近距离
  // （辅助驾驶停稳在 0.68 su、或捏合压到 minRadius）把俯仰压向 π/2，
  // 瞄准段声称的「机位钉死」就不成立了
  const len = Math.max(aimV.length(), 1e-6);
  return {
    target: point.clone(),
    radius: Math.max(len, 1),
    theta: unwrap(Math.atan2(aimV.x, aimV.z), thetaRef),
    phi: Math.acos(THREE.MathUtils.clamp(aimV.y / len, -1, 1)),
  };
}

// 由 (target, theta, phi, radius) 还原机位，给后续段的瞄准反解用
function stateCamPos(s) {
  const sp = Math.sin(s.phi);
  return new THREE.Vector3(
    s.target.x + s.radius * sp * Math.sin(s.theta),
    s.target.y + s.radius * Math.cos(s.phi),
    s.target.z + s.radius * sp * Math.cos(s.theta));
}

// 视线过竖直时把注视点沿水平推开：极区反解 theta 不稳
function levelPoint(pivot, point, minPhi) {
  const dx = pivot.x - point.x, dy = pivot.y - point.y, dz = pivot.z - point.z;
  const r = Math.max(Math.hypot(dx, dy, dz), 1e-6);
  const phi = Math.acos(THREE.MathUtils.clamp(dy / r, -1, 1));
  const phiC = THREE.MathUtils.clamp(phi, minPhi, Math.PI - minPhi);
  if (phiC === phi) return point;
  const h = Math.hypot(dx, dz);
  const hC = r * Math.sin(phiC);
  const hx = h > 1e-6 ? dx / h : 1, hz = h > 1e-6 ? dz / h : 0;
  point.set(pivot.x - hx * hC, pivot.y - r * Math.cos(phiC), pivot.z - hz * hC);
  return point;
}

const starPos = new THREE.Vector3();
function starVec(i) {
  return starPos.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
}

// 一次动作拆成若干段依次播放，构成"瞄准 -> 飞过去 -> 停留"的节奏
function startSegs(segs) {
  auto.segs = segs;
  auto.idx = 0;
  auto.from = snapshotCam();
  auto.t0 = performance.now();
}

// 瞄准段时长：机位钉死时真正扫过的是两个注视方向的大圆夹角。用
// max(|Δθ|,|Δφ|) 会低估（两轴同时变化时最坏差 √2 倍），段时长跟着偏短，
// 角速度就破了 RCS 上限。1.9 盖过 easeSoft 峰值斜率 1.875，常数项留给起停斜坡
const angD0 = new THREE.Vector3();
const angD1 = new THREE.Vector3();
function pivotTime(pivot, from, to) {
  angD0.copy(from).sub(pivot);
  angD1.copy(to).sub(pivot);
  const l0 = angD0.length(), l1 = angD1.length();
  const ang = l0 > 1e-6 && l1 > 1e-6
    ? Math.acos(THREE.MathUtils.clamp(angD0.dot(angD1) / (l0 * l1), -1, 1))
    : 0;
  return (ang / ENGINE.rcs.angMax) * 1.9 + 0.4;
}

// 主燃时序：对行程 D 取 v = min(方向上限, sqrt(2D·a·b/(a+b)))。
// 触顶时中间有匀速巡航段，必须独立成段——加速+巡航合并在一个 easeIn 里
// 会让段末 goal 速率冲到 2v，仪表读数破引擎上限
function burnPlan(rFrom, rTo) {
  const m = ENGINE.main;
  const D = Math.abs(rTo - rFrom);
  if (D < 1e-6) {
    return { dAcc: 0, dCruise: 0, gear: 0, tAcc: 0.3, tCruise: 0, tRetro: 0.3 };
  }
  const cap = rTo < rFrom ? m.vFwd : m.vRev;
  const v = Math.min(cap, Math.sqrt((2 * D * m.accel * m.brake) / (m.accel + m.brake)));
  const dAcc = (v * v) / (2 * m.accel);
  const dRetro = (v * v) / (2 * m.brake);
  const dCruise = Math.max(0, D - dAcc - dRetro);
  // gear：本次点火设定的目标速度，半径减小为前进（正），供仪表的空心游标读
  return { dAcc, dCruise, gear: rTo < rFrom ? v : -v, tAcc: v / m.accel,
           tCruise: dCruise / Math.max(v, 1e-3), tRetro: v / m.brake };
}

// 按 burnPlan 生成 主燃(加速)[+巡航]+反推 段列表；theta 弧线按行程占比扫
function burnSegs(fromState, arriveState, plan) {
  const dR = arriveState.radius - fromState.radius;
  const dT = arriveState.theta - fromState.theta;
  const D = Math.abs(dR);
  const fAcc = D > 1e-6 ? plan.dAcc / D : 0.5;
  const fCru = D > 1e-6 ? (plan.dAcc + plan.dCruise) / D : 0.5;
  const mid = (f) => ({ ...arriveState, target: arriveState.target.clone(),
    theta: fromState.theta + dT * f, radius: fromState.radius + dR * f });
  const segs = [{ to: mid(fAcc), dur: plan.tAcc, ease: easeIn,
                  engine: "main", gear: plan.gear }];
  if (plan.tCruise > 0.05) {
    segs.push({ to: mid(fCru), dur: plan.tCruise, ease: (u) => u,
                engine: "main", gear: plan.gear });
  }
  // 反推段的设定速度是 0：空心游标先跳到点火档位，再落回零，实心指针跟着走
  segs.push({ to: arriveState, dur: plan.tRetro, ease: easeOut,
              engine: "retro", gear: 0 });
  return segs;
}

// 一次机动拆成三段行程，对应真实的推进时序：
// 矢量喷口转向 -> 主引擎点火加速 -> 反推减速（驻留由 padHold 另接）
// 瞄准段带 pivot：机位钉死，goal 逐帧由注视点反解，段末与 aim 精确衔接
function flyTo(point, finalRadius, arcTheta = 0) {
  const from = snapshotCam();
  const pivot = stateCamPos(from);
  levelPoint(pivot, point, 0.12);
  const aim = aimFrom(pivot, point, from.theta);
  const plan = burnPlan(aim.radius, finalRadius);

  // arcTheta 让推进段同时转向，走一条弧线而不是直着往后退。但 theta 是按
  // 行程占比铺开的，角速率恒为 arcTheta·v/D —— 行程短时会轻松破 RCS 上限
  // （D=5su、v=7.5su/s、arc=0.7 就是 1.04 rad/s，两倍 angMax）。按本次点火
  // 的实际时长把弧度上限反算出来
  const burn = plan.tAcc + plan.tCruise + plan.tRetro;
  const arcCap = ENGINE.rcs.angMax * burn * 0.5;   // 0.5 留给 easeIn 的峰值斜率
  const arc = THREE.MathUtils.clamp(arcTheta, -arcCap, arcCap);
  const arrive = { ...aim, target: aim.target.clone(),
                   theta: aim.theta + arc, radius: finalRadius };

  return [
    { to: aim, dur: pivotTime(pivot, from.target, aim.target),
      ease: easeSoft, engine: "rcs", pivot, gear: 0 },
    ...burnSegs(aim, arrive, plan),
  ];
}

/* 一次目标占满 budget 秒：行程算完后把剩下的时间给入轨驻留段。目标较远、
   行程本身已经吃满预算时只留最短驻留——宽容超时，不砍航段。
   入轨漂移量同时受驻留时长与 RCS 角速度上限约束，驻留短就少转一点。 */
const CRUISE_CYCLE = [10, 15];   // s，一个目标的时间预算
const CRUISE_HOLD_MIN = 1.5;     // s，最短驻留
const PANO_HOLD_MIN = 4.5;       // s，全景回望的最短驻留
const CRUISE_BANK = 0.45;        // rad，巡游转向时的坡度上限，比漫游收敛

function padHold(segs, budget, driftA, driftB, minHold = CRUISE_HOLD_MIN) {
  let travel = 0;
  for (const s of segs) travel += s.dur;
  const hold = Math.max(minHold, budget - travel);
  const last = segs[segs.length - 1].to;
  // 漂移上限同时看角速度与线速度：驻留段是绕注视点画弧，切向线速度是
  // 半径×角速率。只钳角速率的话，全景那种 400 su 半径下 0.25 rad 的漂移
  // 会跑出近 900 ly/s —— 而这一段的引擎灯是全灭的，仪表自相矛盾
  const r = Math.max(last.radius, 1);
  const cap = hold * Math.min(ENGINE.rcs.angMax * 0.6, ENGINE.rcs.panMax / r);
  segs.push({
    to: { ...last, target: last.target.clone(),
          theta: last.theta + Math.min(rnd(driftA, driftB), cap) },
    dur: hold, ease: (u) => u, engine: "orbit", gear: 0,
  });
  return segs;
}

// 全景：一律机头朝前 —— 倒车上限 100 ly/s 拖不动大半径外推。
// 沿背离银心方向外推出系，反推停住后原地掉头回望银心；
// arcTheta 变体把出口方向绕 Y 侧偏，燃烧段再扫一条大弧
function panorama(arcTheta = 0) {
  const from = snapshotCam();
  const pivot = stateCamPos(from);
  const out = pivot.clone();
  if (out.length() < 1) out.set(rnd(-1, 1), 0.5, rnd(-1, 1));
  out.normalize();
  if (arcTheta) {
    out.applyAxisAngle(FLIP_UP, (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 0.9));
  }
  // 出口必须在当前机位之外，否则「出系」会变成向心俯冲
  const exitDist = Math.min(430,
    Math.max(rnd(150, 260), pivot.length() * 1.15 + 30));
  const exitPt = out.multiplyScalar(exitDist);
  levelPoint(pivot, exitPt, 0.12);
  const aim = aimFrom(pivot, exitPt, from.theta);
  const nearR = rnd(5, 9);
  const arrive = { ...aim, target: aim.target.clone(),
                   theta: aim.theta + arcTheta, radius: nearR };
  // 掉头仍是机位反解：注视点回到银心附近，半径自然放大成全景
  const pivotB = stateCamPos(arrive);
  const backPt = new THREE.Vector3(rnd(-8, 8), rnd(-5, 5), rnd(-8, 8));
  levelPoint(pivotB, backPt, 0.15);
  const back = aimFrom(pivotB, backPt, arrive.theta);
  return [
    { to: aim, dur: pivotTime(pivot, from.target, aim.target),
      ease: easeSoft, engine: "rcs", pivot, gear: 0 },
    ...burnSegs(aim, arrive, burnPlan(aim.radius, nearR)),
    { to: back, dur: pivotTime(pivotB, arrive.target, back.target),
      ease: easeSoft, engine: "rcs", pivot: pivotB, gear: 0 },
  ];
}

const APPROACH_LY = 8.12;   // 自动逼近固定停在这个距离，不再随当前半径浮动

// 手动点选后的辅助驾驶：同一套分段送达，无 orbit 段，任何主动操作打断
function startAssist(i) {
  adoptBodyRoll();   // 只在手动态下调用，进来先接管机身滚转
  auto.assist = true;
  bankHas = false;   // 坡度参考的上一帧视线作废，别拿手动那帧去算
  startSegs(flyTo(starVec(i), APPROACH_LY * SCENE_SCALE));
}

/* ── 自动滚转 ────────────────────────────────────────
   滚转与偏航/俯仰同吃 RCS 的角加速度与角速度上限。角度收进 (-π, π]，
   连续横滚才不会把 roll 累加成一个越来越大的数。 */

const rollNeutral = new THREE.Vector3();
const rollCross = new THREE.Vector3();

/* 手动交给自动的那一帧：把机身当前的滚转量折进 auto.roll。自动段的 up
   基准是世界 Y（applyCamera），不折算就等于把用户压出来的坡度一帧抹平，
   地平线硬切回水平。折完由 autoRollTo 按 RCS 规格慢慢收回去。
   这是 attitudeStep 里自动→手动那次折算的逆向，两边同一套「中性 up」。 */
function adoptBodyRoll() {
  rollNeutral.copy(FLIP_UP).addScaledVector(bodyFwd, -FLIP_UP.dot(bodyFwd));
  if (rollNeutral.lengthSq() < 1e-8) { auto.roll = 0; auto.rollRate = 0; return; }
  rollNeutral.normalize();
  rollCross.crossVectors(rollNeutral, bodyUp);
  auto.roll = Math.atan2(rollCross.dot(bodyFwd), rollNeutral.dot(bodyUp));
  // 角速度一并接管：手动滚到一半交出去时地平线不该硬停，与反向交接对称
  auto.rollRate = THREE.MathUtils.clamp(att.roll,
    -ENGINE.rcs.angMax, ENGINE.rcs.angMax);
  att.roll = 0;
}

function autoRoll(rate, dt) {
  const rcs = ENGINE.rcs;
  const want = THREE.MathUtils.clamp(rate, -rcs.angMax, rcs.angMax);
  auto.rollRate += THREE.MathUtils.clamp(want - auto.rollRate,
    -rcs.angAccel * dt, rcs.angAccel * dt);
  if (!auto.rollRate) return;
  auto.roll += auto.rollRate * dt;
  if (auto.roll > Math.PI) auto.roll -= Math.PI * 2;
  else if (auto.roll <= -Math.PI) auto.roll += Math.PI * 2;
}

// 滚转到指定坡度角：期望角速度按 sqrt(2·角加速度·剩余角) 收敛，够近就吸住
function autoRollTo(bank, dt) {
  const rcs = ENGINE.rcs;
  // 误差要折到最短弧：横滚可能停在 ±π 附近，裸差值会让机身朝反方向多转
  // 近 180° 才回到坡度上
  let err = bank - auto.roll;
  if (err > Math.PI) err -= Math.PI * 2;
  else if (err < -Math.PI) err += Math.PI * 2;
  if (!err && !auto.rollRate) return;
  autoRoll(Math.sign(err)
    * Math.min(rcs.angMax, Math.sqrt(2 * rcs.angAccel * Math.abs(err))), dt);
  let rest = bank - auto.roll;
  if (rest > Math.PI) rest -= Math.PI * 2;
  else if (rest < -Math.PI) rest += Math.PI * 2;
  if (Math.abs(rest) < 0.01 && Math.abs(auto.rollRate) < 0.06) {
    auto.roll = bank; auto.rollRate = 0;
  }
}

/* 转弯压坡度：从视线方向的逐帧变化里取绕机顶那一份（即偏航角速度），
   反号即为坡度——绕机头正向滚转把机顶压向右舷，而绕机顶正向偏航是左转。
   巡游与漫游共用，只是坡度上限不同。 */
const bankPrev = new THREE.Vector3();
const bankAxis = new THREE.Vector3();
const bankUp = new THREE.Vector3();
let bankHas = false;

function bankFor(fwd, dt, maxBank, gain) {
  if (!bankHas || dt <= 0) { bankPrev.copy(fwd); bankHas = true; return 0; }
  bankAxis.crossVectors(bankPrev, fwd);
  bankPrev.copy(fwd);
  bankUp.copy(FLIP_UP).addScaledVector(fwd, -FLIP_UP.dot(fwd));
  if (bankUp.lengthSq() < 1e-8) return 0;
  const yaw = bankAxis.dot(bankUp.normalize()) / dt;   // 叉乘模长≈转过的角
  return THREE.MathUtils.clamp(-yaw * gain, -maxBank, maxBank);
}

/* ── 漫游：连续轨迹 ───────────────────────────────────
   不做分段编排，逐帧积分：路点只是转向吸引子，够近或已掠过就换下一个，
   全程不停车。转向吃 RCS 角加速度/角速度上限，加减速吃主引擎 accel/brake
   与前进上限，滚转走同一套 RCS —— 与手动飞行共用一份 ENGINE 规格。 */
// 活动半径按星距分布定：到银心 p50=31su、p75=51su、p90=86su，再往外就是
// 几乎无星的空域——跑出去只会得到一块黑屏，所以把漫游圈在 p80 附近
const ROAM_FIELD = 42;          // su，路点活动半径
const ROAM_LEG = [35, 80];      // su，单段路点距离
// 转弯半径 = 航速 / 角速度上限，300 ly/s 时是 48 su，比场界还大——掉头一次
// 就会甩到 100 su 外的空域去。压到 220 ly/s，转弯半径 35 su 才收得住
const ROAM_SPEED = [90, 220];   // ly/s，巡航目标速度区间
const ROAM_LEASH_SPEED = 110;   // ly/s，被缰绳拽回场界时压到的档位
const ROAM_HOLD = [6, 12];      // s，同一个目标速度维持多久
const ROAM_PITCH = 0.8;         // |期望方向.y| 上限，避开极区反解不稳
const ROAM_PITCH_HARD = 0.97;   // |机头.y| 硬上限，只兜极区奇点
const ROAM_PLAN = 3;            // 预排路点数，导航球虚线直接读这条队列
const ROAM_BANK = 0.9;          // rad，转弯压坡度的最大滚转角
// 横滚按时间起落，不挂在换段上：换段快慢受路点间距与航速影响，挂上去
// 会时密时疏
const ROAM_ROLL_ON = [2.5, 5];  // s，一次横滚持续多久
const ROAM_ROLL_OFF = [10, 22]; // s，两次横滚之间隔多久
/* 视角拉动：注视点跑轨迹，相机吊在它后面 boom 远处。boom 一变，相机就沿
   航线前后拉伸——这就是自动模式版的推拉镜头。拉伸速率必须小于航速的
   1/4，否则 frame() 里"半径涨得比总位移快就是倒车"的判据会把它误判成
   倒车，仪表整块翻红。 */
/* 吊臂上限还受转弯牵制：相机绕注视点摆，转弯时线速度要多出 boom×角速度
   （42 su × 0.524 rad/s ≈ 250 ly/s），与航速加起来必须留在主引擎前进
   上限之内，否则"按引擎限制运动"就成了空话。 */
const ROAM_BOOM = [12, 42];     // su，相机吊臂长度区间
const ROAM_BOOM_HOLD = [8, 16]; // s，一个吊臂长度维持多久
const ROAM_BOOM_RATE = 0.18;    // 吊臂伸缩速率上限占航速的比例

const roam = {
  pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1),
  omega: new THREE.Vector3(),     // rad/s，角速度矢量（方向即转轴）
  v: 0, gear: 0, turn: 0, barrel: 0, plan: [],
  speedAt: 0, rollAt: 0, boom: 24, boomTo: 24, boomAt: 0, boomV: 0,
};
const roamDir = new THREE.Vector3();
const roamAxis = new THREE.Vector3();
const roamUp = new THREE.Vector3();
const roamWant = new THREE.Vector3();

/* 俯仰钳制：y 分量压回 ±lim，水平分量按比例补回，长度仍为 1。
   期望方向用 ROAM_PITCH，机头本身只用 ROAM_PITCH_HARD 兜住极区 —— 拿
   ROAM_PITCH 去钳机头会让"仰角很大时切进漫游"一帧改写 goalPhi 达 0.6 rad，
   而 applyCamera 对 goal 没有角速率限幅，机位会被甩出去。让机头顺着期望
   方向自己转回带内，转速自然受 angMax 约束。 */
function roamLevel(d, lim = ROAM_PITCH) {
  if (d.lengthSq() < 1e-12) return d.set(0, 0, -1);
  d.normalize();
  if (Math.abs(d.y) <= lim) return d;
  const h = Math.hypot(d.x, d.z) || 1e-6;
  const s = Math.sqrt(1 - lim * lim) / h;
  return d.set(d.x * s, Math.sign(d.y) * lim, d.z * s);
}

// 排一个新路点：沿队尾航向侧偏加起伏；越接近场界越往银心侧掰
function roamPush() {
  const n = roam.plan.length;
  const last = n ? roam.plan[n - 1] : roam.pos;
  if (n >= 2) roamDir.subVectors(last, roam.plan[n - 2]);
  else if (n === 1) roamDir.subVectors(last, roam.pos);
  else roamDir.copy(roam.fwd);
  roamLevel(roamDir);

  roamDir.applyAxisAngle(FLIP_UP, (Math.random() < 0.5 ? -1 : 1) * rnd(0.2, 0.7));
  roamAxis.crossVectors(roamDir, FLIP_UP);
  if (roamAxis.lengthSq() < 1e-8) roamAxis.copy(FLIP_RIGHT);
  roamDir.applyAxisAngle(roamAxis.normalize(),
    (Math.random() < 0.5 ? -1 : 1) * rnd(0.05, 0.3));

  // 出界不靠硬折返（那会甩出一个近 180° 的急转），按越界程度掺进指心方向。
  // 起掺点必须远早于场界：随机游走本身带外漂，掺得晚就一路漂到空域去
  const out = THREE.MathUtils.clamp(
    (last.length() - ROAM_FIELD * 0.4) / (ROAM_FIELD * 0.6), 0, 1);
  if (out > 0) {
    roamAxis.copy(last).multiplyScalar(-1).normalize();
    roamDir.lerp(roamAxis, out * 0.85);
  }
  roamLevel(roamDir);
  const p = last.clone().addScaledVector(roamDir, rnd(ROAM_LEG[0], ROAM_LEG[1]));
  // 掺指心方向只是"倾向"，不保证落点在场界内：随机游走照样会一路外溢。
  // 越界的落点直接沿原方向投回场界球面，路点集合就硬性有界了
  const L = p.length();
  if (L > ROAM_FIELD) p.multiplyScalar(ROAM_FIELD / L);
  roam.plan.push(p);
}

// 换段：丢掉队首路点、补满队列
function roamNextLeg() {
  roam.plan.shift();
  while (roam.plan.length < ROAM_PLAN) roamPush();
}

// 目标速度、吊臂长度与横滚都按时间轮换，与换段解耦
function roamTempo(now) {
  if (now >= roam.speedAt) {
    roam.gear = rnd(ROAM_SPEED[0], ROAM_SPEED[1]) * SCENE_SCALE;
    roam.speedAt = now + rnd(ROAM_HOLD[0], ROAM_HOLD[1]) * 1000;
  }
  if (now >= roam.boomAt) {
    roam.boomTo = rnd(ROAM_BOOM[0], ROAM_BOOM[1]);
    roam.boomAt = now + rnd(ROAM_BOOM_HOLD[0], ROAM_BOOM_HOLD[1]) * 1000;
  }
  if (now >= roam.rollAt) {
    if (roam.barrel) {
      roam.barrel = 0;
      roam.rollAt = now + rnd(ROAM_ROLL_OFF[0], ROAM_ROLL_OFF[1]) * 1000;
    } else {
      roam.barrel = (Math.random() < 0.5 ? -1 : 1)
        * ENGINE.rcs.angMax * rnd(0.6, 0.95);
      roam.rollAt = now + rnd(ROAM_ROLL_ON[0], ROAM_ROLL_ON[1]) * 1000;
    }
  }
}

function roamStart() {
  auto.segs = null;
  // 机位由 cam 反算而不是读 camera.position：后者要等 applyCamera 跑过一帧
  // 才有值，切模式这一步不该依赖调用时机
  const here = stateCamPos(cam);
  roam.fwd.subVectors(cam.target, here);
  roamLevel(roam.fwd, ROAM_PITCH_HARD);   // 只兜极区，仰角带内的交接不改朝向
  // 吊臂进区间、注视点由机位反推：机位 = 注视点 − 吊臂×航向 恒等于当前机位，
  // 所以切进漫游没有跳变。反过来（吊臂接管当前轨道半径）会留下一条 160su
  // 的长臂，转弯时把相机甩到主引擎上限之外
  roam.boom = THREE.MathUtils.clamp(cam.radius, ROAM_BOOM[0], ROAM_BOOM[1]);
  roam.pos.copy(here).addScaledVector(roam.fwd, roam.boom);
  roam.boomAt = 0;
  /* 接管当前动量，不平白丢一截速度。手动的动量在 throttle.v 里，巡游的
     动量在半径变化率 vel.r 里（半径减小即前进，取负号），两条入口都要认，
     否则从巡游主燃段切进来会一帧掉到 0。动量既然由漫游接管，就得把节流阀
     清干净，否则 throttleStep 的泄放会再推一次。 */
  roam.v = THREE.MathUtils.clamp(
    Math.max(throttle.v, -vel.r), 0, ENGINE.main.vFwd);
  throttle.gear = 0; throttle.v = 0;
  roam.turn = 0;
  roam.omega.set(0, 0, 0);
  roam.boomV = 0;
  roam.barrel = 0;
  roam.speedAt = 0;
  roam.rollAt = performance.now() + rnd(ROAM_ROLL_OFF[0], ROAM_ROLL_OFF[1]) * 1000;
  roam.plan.length = 0;
  roamNextLeg();
  roamTempo(performance.now());
}

// 一步积分：换段判定 -> 转向 -> 加减速 -> 推进 -> 滚转 -> 写 goal -> 扫描
function roamStep(dt, now) {
  roamTempo(now);
  /* 硬缰绳：转弯半径 = 航速 / 角速度上限，路点再怎么有界，一次大掉头照样
     能把机身甩到场界外一大截。真跑远了就直接以银心为目标、同时减速（半径
     跟着缩小），别再等下一个路点。缰绳生效期间不换段——那会儿路点全在
     身后，逐帧丢段只会把队列空转掉，掉头动作反而做不出来。 */
  const far = roam.pos.length();
  const leash = far > ROAM_FIELD * 1.2;
  roamDir.subVectors(roam.plan[0], roam.pos);
  const wpDist = roamDir.length();
  if (!leash && (wpDist < Math.max(10, roam.v * 1.2)
      || (roamDir.dot(roam.fwd) < 0 && wpDist < ROAM_LEG[0]))) {
    roamNextLeg();
    roamDir.subVectors(roam.plan[0], roam.pos);
  }
  if (leash) roamDir.copy(roam.pos).multiplyScalar(-1);
  roamLevel(roamDir);

  const rcs = ENGINE.rcs;
  const ang = Math.acos(THREE.MathUtils.clamp(roam.fwd.dot(roamDir), -1, 1));
  roamAxis.crossVectors(roam.fwd, roamDir);
  if (roamAxis.lengthSq() < 1e-10) {
    // 近反向共线：绕世界 Y 掉头，航向本身近竖直时退回绕 X
    roamAxis.copy(Math.abs(roam.fwd.y) < 0.95 ? FLIP_UP : FLIP_RIGHT);
    roamAxis.addScaledVector(roam.fwd, -roamAxis.dot(roam.fwd));
  }
  roamAxis.normalize();
  /* 期望角速度 sqrt(2·角加速度·夹角) 截到 angMax，再按角加速度限变化率。
     限的是角速度**矢量**不是标量幅值：换路点时转轴常常整个翻向，只限幅值
     会让 ω 在一帧内从 +angMax 跳到 −angMax，等效角加速度是上限的几十倍，
     航迹在路点处出现折角式急抖。
     另外自动模式以世界 Y 定基，机体实际是绕世界轴整体转，机体角速率 =
     视线扫掠率 / sinφ，所以上限要乘一个 sinφ 才是真的"不超 angMax"。
     （扫描期间曾为撑住 3-5s 焦点把转向收到三成；焦点改成 1-3s 后不再需要
     压制机身，撤掉。） */
  const sinPhi = Math.max(0.6, Math.hypot(roam.fwd.x, roam.fwd.z));
  const wantTurn = Math.min(rcs.angMax * sinPhi,
    Math.sqrt(2 * rcs.angAccel * ang), ang / Math.max(dt, 1e-3));
  roamWant.copy(roamAxis).multiplyScalar(wantTurn).sub(roam.omega);
  const dOmega = rcs.angAccel * dt;
  if (roamWant.lengthSq() > dOmega * dOmega) roamWant.setLength(dOmega);
  roam.omega.add(roamWant);
  const rate = roam.omega.length();
  if (rate > 1e-6) {
    roamAxis.copy(roam.omega).divideScalar(rate);
    roamLevel(roam.fwd.applyAxisAngle(roamAxis, rate * dt), ROAM_PITCH_HARD);
  }
  roam.turn = rate;

  // 提速吃 accel、降速吃 brake，与手动节流同一套限幅。缰绳期间压低档位：
  // 转弯半径正比于航速，慢下来才掉得回场界里
  const m = ENGINE.main;
  const gear = leash ? Math.min(roam.gear, ROAM_LEASH_SPEED * SCENE_SCALE) : roam.gear;
  const err = gear - roam.v;
  if (err) {
    const lim = (err > 0 ? m.accel : m.brake) * dt;
    roam.v += THREE.MathUtils.clamp(err, -lim, lim);
  }
  roam.pos.addScaledVector(roam.fwd, roam.v * dt);

  // 花样飞行：平时转弯压坡度（坡度跟着偏航角速度走），间或来一段整圈横滚。
  // 这里的偏航分量直接取自本帧下达的转向指令，比从视线差分反推更准
  if (roam.barrel) {
    autoRoll(roam.barrel, dt);
  } else {
    roamUp.copy(FLIP_UP).addScaledVector(roam.fwd, -FLIP_UP.dot(roam.fwd));
    const yawRate = roamUp.lengthSq() > 1e-8
      ? roamAxis.dot(roamUp.normalize()) * roam.turn : 0;
    autoRollTo(THREE.MathUtils.clamp(-yawRate * 2.2, -ROAM_BANK, ROAM_BANK), dt);
  }

  // 视角拉动：注视点就是轨迹上的点，相机吊在它后面 boom 远处（机位因此
  // 落在航线上更早的位置）。吊臂只按自己的节奏伸缩——曾经在扫描时放长是
  // 为了给 3-5s 焦点争取时间，焦点改成 1-3s 后没这个必要了
  const boomErr = roam.boomTo - roam.boom;
  // 收短＝相机比注视点跑得快（上限还远在主引擎前进上限之内，可以放开些）；
  // 放长＝相机跑得慢，得压在上面那条 1/4 判据之内。速率本身也要按 accel
  // 收敛：直接把速率阶跃到上限，等效加速度是主引擎的好几倍，画面会顿一下
  const boomWant = THREE.MathUtils.clamp(boomErr / 0.6,
    -Math.max(2, roam.v * 0.6), Math.max(0.2, roam.v * ROAM_BOOM_RATE));
  roam.boomV += THREE.MathUtils.clamp(boomWant - roam.boomV,
    -m.accel * dt, m.accel * dt);
  roam.boom += roam.boomV * dt;

  cam.goalTarget.copy(roam.pos);
  cam.goalRadius = roam.boom;
  cam.goalTheta = unwrap(Math.atan2(-roam.fwd.x, -roam.fwd.z), cam.goalTheta);
  cam.goalPhi = Math.acos(THREE.MathUtils.clamp(-roam.fwd.y, -1, 1));

  // 机位 = 注视点 − 吊臂×航向，所以相机的前向速度还要减去吊臂伸长速率，
  // 空心游标读的才是相机真正被指令的速度
  auto.gear = gear - roam.boomV;
  auto.engine = err < -0.5 * SCENE_SCALE ? "retro" : "main";
  auto.rcsOn = roam.turn > 0.05 || Math.abs(auto.rollRate) > 0.05;
  roamScan(now);
}

/* 扫描顺路星体：只锁定展示，不改航线。候选＝落在机头锥角内、距离适中、
   而且此刻真的在画面里的星；焦点 3-5s，一旦转出视野立即取消。 */
/* 锥角与距离窗一起决定焦点能撑多久：星离轴 θ0、距离 d0，逼近到
   d ≈ d0·sinθ0/tan(半视场) 时就滑出画面。焦点只要 1-3s，就不必再为了
   把目标钉在画面里而收窄锥角、把候选推远——锥角开到 12°、候选取"还有
   2-6 秒才掠过"，候选更多、轮换更快，正是要的快速多目标。 */
const SCAN_COS = Math.cos((12 * Math.PI) / 180);
const SCAN_LEAD = [2, 6];              // s，候选星距离 = 航速 × 这个区间
const SCAN_MIN = 30, SCAN_MAX = 120;   // su，航速极低/极高时的距离兜底
const SCAN_BEST = 6;                   // 只在最贴航向的这几颗里随机挑
const SCAN_HOLD = [1, 3];              // s，单个目标的锁定时长
const SCAN_GAP = [0.4, 1.5];           // s，两次锁定之间的间隔

// visible[] 只判深度，"在画面里"还得看投影落没落进视口
function inView(i) {
  if (!visible[i]) return false;
  const x = projected[i * 2], y = projected[i * 2 + 1];
  return x >= 0 && x <= vw() && y >= 0 && y <= vh();
}

// 只在决策瞬间线性扫一次全表，禁止逐帧
function scanPick() {
  const p = camera.position, f = roam.fwd;
  const near = Math.max(SCAN_MIN, Math.min(SCAN_MAX, roam.v * SCAN_LEAD[0]));
  const far = Math.max(near + 10, Math.min(SCAN_MAX, roam.v * SCAN_LEAD[1]));
  const near2 = near * near, far2 = far * far;
  const hits = [];     // [余弦, 序号]，只留最贴航向的几颗
  for (let i = 0; i < N; i++) {
    if (!visible[i]) continue;
    const dx = positions[i * 3] - p.x;
    const dy = positions[i * 3 + 1] - p.y;
    const dz = positions[i * 3 + 2] - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < near2 || d2 > far2) continue;
    const c = (dx * f.x + dy * f.y + dz * f.z) / Math.sqrt(d2);
    if (c < SCAN_COS) continue;
    if (!inView(i)) continue;
    hits.push([c, i]);
  }
  if (!hits.length) return -1;
  hits.sort((a, b) => b[0] - a[0]);
  return hits[(Math.random() * Math.min(SCAN_BEST, hits.length)) | 0][1];
}

function roamScan(now) {
  if (auto.scan >= 0) {
    if (now >= auto.scanEnd || !inView(auto.scan)) {
      if (selected === auto.scan) select(-1);
      auto.scan = -1;
      auto.scanNext = now + rnd(SCAN_GAP[0], SCAN_GAP[1]) * 1000;
    }
    return;
  }
  if (now < auto.scanNext) return;
  const i = scanPick();
  if (i < 0) { auto.scanNext = now + 500; return; }   // 附近没顺路的，稍后再看
  select(i);
  auto.scan = i;
  auto.scanEnd = now + rnd(SCAN_HOLD[0], SCAN_HOLD[1]) * 1000;
}

/* 巡游选目标：星体与坐标点各半。
   星体：上一项也是星体时，有 25% 概率跳到它的关联曲目，让巡游沿曲风网络
   走一段。坐标点：其中 25% 是"出系再掉头回望银河"的全景变体。 */
function nextAction() {
  const budget = rnd(CRUISE_CYCLE[0], CRUISE_CYCLE[1]);
  if (Math.random() < 0.5) {
    let i;
    if (auto.lastWasSelect && selected >= 0 && neighbours[selected].length
        && Math.random() < 0.25) {
      const e = neighbours[selected][(Math.random() * neighbours[selected].length) | 0];
      i = edgeIdx[e * 2] === selected ? edgeIdx[e * 2 + 1] : edgeIdx[e * 2];
    } else {
      i = (Math.random() * N) | 0;
    }
    select(i);
    startSegs(padHold(flyTo(starVec(i), rnd(12, 26)), budget, 0.15, 0.35));
    auto.lastWasSelect = true;
    return;
  }
  if (Math.random() < 0.25) {
    // 全景是例外，选中留着 —— 正好用引线把那颗星从远处指出来。
    // 出系再 180° 掉头本身就要二十多秒，行程必然吃穿预算；这一档单独给一个
    // 更长的最短驻留，否则"回望银河"的落点镜头只剩 1.5s 就被换掉
    startSegs(padHold(panorama(Math.random() < 0.5
      ? 0 : (Math.random() < 0.5 ? -1 : 1) * rnd(1.0, 1.6)),
      budget, 0.1, 0.25, PANO_HOLD_MIN));
  } else {
    select(-1);   // 纯运镜不留选中，信息框和引线挂着不动会显得镜头脱节
    const point = new THREE.Vector3(rnd(-FIELD_R, FIELD_R),
      rnd(-FIELD_R * 0.4, FIELD_R * 0.4), rnd(-FIELD_R, FIELD_R));
    startSegs(padHold(flyTo(point, rnd(20, 90),
      (Math.random() < 0.5 ? -1 : 1) * rnd(0.2, 0.7)), budget, 0.15, 0.35));
  }
  auto.lastWasSelect = false;
}

const lookPoint = new THREE.Vector3();
const autoDir = new THREE.Vector3();
const pivD0 = new THREE.Vector3();
const pivD1 = new THREE.Vector3();
const pivAxis = new THREE.Vector3();
function stepAuto(dt) {
  if (!auto.on && !auto.assist) {
    auto.engine = ""; auto.rcsOn = false; auto.gear = 0;
    return;                          // 残留的 auto.roll 留给 attitudeStep 接手
  }
  const now = performance.now();
  if (auto.on && auto.mode === "wander" && !auto.assist) {
    roamStep(dt, now);
    return;
  }
  if (!auto.segs || auto.idx >= auto.segs.length) {
    autoRollTo(0, dt);   // 没有航段可跟就回正，从漫游切过来的滚转也在这里收
    if (auto.assist) {
      auto.assist = false; auto.segs = null;
      auto.engine = ""; auto.rcsOn = false; auto.gear = 0;
      return;
    }
    nextAction();
    return;
  }

  const seg = auto.segs[auto.idx];
  auto.engine = seg.engine;
  auto.rcsOn = seg.engine === "rcs";
  auto.gear = seg.gear || 0;
  const raw = (now - auto.t0) / (seg.dur * 1000);
  const u = seg.ease(THREE.MathUtils.clamp(raw, 0, 1));
  const f = auto.from, t = seg.to;
  if (seg.pivot) {
    // 机位钉死在 pivot：注视「方向」做球面插值、距离线性插值，逐帧反解。
    // 注视点走直线弦在转角近 180° 时会穿过机位——半径塌缩、视线甩鞭
    pivD0.copy(f.target).sub(seg.pivot);
    pivD1.copy(t.target).sub(seg.pivot);
    const r0 = Math.max(pivD0.length(), 1e-4), r1 = Math.max(pivD1.length(), 1e-4);
    pivD0.divideScalar(r0); pivD1.divideScalar(r1);
    const ang = Math.acos(THREE.MathUtils.clamp(pivD0.dot(pivD1), -1, 1));
    pivAxis.crossVectors(pivD0, pivD1);
    if (pivAxis.lengthSq() < 1e-8) {
      // 近反向共线：绕世界 Y 掉头；视线本身近竖直时退回绕 X
      pivAxis.copy(Math.abs(pivD0.y) < 0.95 ? FLIP_UP : FLIP_RIGHT);
      pivAxis.addScaledVector(pivD0, -pivAxis.dot(pivD0));
    }
    pivAxis.normalize();
    lookPoint.copy(pivD0).applyAxisAngle(pivAxis, ang * u)
      .multiplyScalar(r0 + (r1 - r0) * u).add(seg.pivot);
    const g = aimFrom(seg.pivot, lookPoint, cam.goalTheta);
    cam.goalTheta = g.theta;
    cam.goalPhi = g.phi;
    cam.goalRadius = g.radius;
    cam.goalTarget.copy(g.target);
  } else {
    cam.goalTheta = f.theta + (t.theta - f.theta) * u;
    cam.goalPhi = f.phi + (t.phi - f.phi) * u;
    // 恒加速模型下 r 随时间是缓动×线性，半径走线性插值
    cam.goalRadius = f.radius + (t.radius - f.radius) * u;
    cam.goalTarget.lerpVectors(f.target, t.target, u);
  }

  // 巡游同样压坡度：转向段跟着视线扫过的方向侧倾，入轨驻留时自然回正
  const sp = Math.sin(cam.goalPhi);
  autoDir.set(-sp * Math.sin(cam.goalTheta), -Math.cos(cam.goalPhi),
              -sp * Math.cos(cam.goalTheta));
  autoRollTo(bankFor(autoDir, dt, CRUISE_BANK, 1.1), dt);

  if (raw >= 1) {
    auto.from = { ...t, target: t.target.clone() };
    auto.idx += 1;
    auto.t0 = now;
  }
}

function setAuto(on, mode = "cruise") {
  const wasAuto = auto.on || auto.assist;
  // 任何入口都先取消辅助驾驶段，早退之前就得清掉
  if (auto.assist) { auto.assist = false; auto.segs = null; auto.engine = ""; }
  if (auto.on === on && (!on || auto.mode === mode)) return;
  auto.on = on;
  auto.mode = on ? mode : "";
  auto.scan = -1;   // 扫描焦点不跨模式存活；选中本身留着，好接着接敌
  document.body.classList.toggle("auto", on && mode === "cruise");
  document.body.classList.toggle("wander", on && mode === "wander");
  for (const [k, el] of Object.entries(modeBtns)) {
    el.classList.toggle("cur", on ? k === mode : k === "manual");
  }
  refreshBgmName();
  if (on) {
    if (!wasAuto) adoptBodyRoll();   // 巡游/漫游同样别把手动的坡度一帧抹平
    auto.segs = null;
    auto.engine = "";
    auto.rcsOn = false;
    auto.gear = 0;
    auto.lastWasSelect = false;
    auto.scanNext = 0;
    bankHas = false;
    // 自动模式下姿态输入被逐帧清零，"持续转向银心"这个标志既不会生效也
    // 不会自清，留着会在用户切回手动的第一帧突然接管操纵
    steerCenterPersist = false;
    if (mode === "wander") roamStart();
    bgm.volume = 0.55;
    if (!bgm.src) loadBgm(0, false);
    bgm.play().catch(() => {});    // 自动播放被拦就静默跳过
  } else {
    bgm.pause();
  }
}

// 三段式切换：巡游/漫游互斥，两类皆无即手动
modeBtns.manual.addEventListener("click", () => setAuto(false));
modeBtns.cruise.addEventListener("click", () => setAuto(true, "cruise"));
modeBtns.wander.addEventListener("click", () => setAuto(true, "wander"));
// 任何主动操作都退出巡游
for (const ev of ["pointerdown", "wheel"]) {
  canvas.addEventListener(ev, () => setAuto(false), { passive: true });
}
addEventListener("keydown", (e) => {
  // 搜索框/下拉框里打 wasd 不算飞行操作
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  // F1-F3 直接调 setAuto，与三个模式按钮走同一入口；部分浏览器 F1 会弹自带帮助，需拦掉
  if (e.code === "F1") { e.preventDefault(); setAuto(false); return; }
  if (e.code === "F2") { e.preventDefault(); setAuto(true, "cruise"); return; }
  if (e.code === "F3") { e.preventDefault(); setAuto(true, "wander"); return; }
  if (MOVE_KEYS[e.code]) setAuto(false);
});

/* ── 搜索 ───────────────────────────────────────────── */
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// 预折叠成小写检索串，避免每次按键都重新拼
const haystack = tracks.map((t) =>
  `${t.t}${t.a}${t.s}${t.u}`.toLowerCase());

/* 延长药丸：点放大镜后药丸自身横向展开露出内嵌输入框，
   再点/Esc/失焦收回；收起时清空输入并藏结果 */
const searchWrap = document.getElementById("search-wrap");
const searchBtn = document.getElementById("search-btn");
const elSearch = document.getElementById("search");
const elResults = document.getElementById("results");
let hits = [], cursor = -1;

function openSearch() {
  searchWrap.classList.add("on");
  elSearch.focus();
}

function closeSearch() {
  searchWrap.classList.remove("on");
  elSearch.value = "";
  hits = []; cursor = -1;
  elResults.classList.remove("on");
  if (document.activeElement === elSearch) elSearch.blur();
}

searchBtn.addEventListener("click", () => {
  if (searchWrap.classList.contains("on")) closeSearch();
  else openSearch();
});
// 药丸内按下不抢输入框焦点：失焦收起才不会被按钮/结果行误触发
searchWrap.addEventListener("pointerdown", (e) => {
  if (e.target !== elSearch) e.preventDefault();
});
elSearch.addEventListener("blur", () => closeSearch());

function highlight(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, i))
       + "<mark>" + escapeHtml(text.slice(i, i + q.length)) + "</mark>"
       + escapeHtml(text.slice(i + q.length));
}

function runSearch() {
  const q = elSearch.value.trim().toLowerCase();
  cursor = -1;
  if (q.length < 1) { elResults.classList.remove("on"); hits = []; return; }

  hits = [];
  for (let i = 0; i < haystack.length && hits.length < 40; i++) {
    if (haystack[i].includes(q)) hits.push(i);
  }
  elResults.classList.add("on");
  if (!hits.length) {
    elResults.innerHTML = '<div class="none">没有匹配的曲目</div>';
    return;
  }
  elResults.innerHTML = hits.map((i) => {
    const t = tracks[i];
    const who = t.a || `UID ${t.u}`;
    return `<div class="hit" data-i="${i}">`
         + `<span class="n">${highlight(t.t, q)}</span>`
         + `<span class="s">${highlight(who, q)} · ${highlight(t.s, q)}`
         + ` · ${fmt.format(Math.round(t.l))} 光年</span></div>`;
  }).join("");
}

function moveCursor(step) {
  if (!hits.length) return;
  cursor = (cursor + step + hits.length) % hits.length;
  [...elResults.children].forEach((el, k) => el.classList.toggle("cur", k === cursor));
  elResults.children[cursor]?.scrollIntoView({ block: "nearest" });
}

function chooseHit(i) {
  select(i);
  elResults.classList.remove("on");
  elSearch.blur();
}

elSearch.addEventListener("input", runSearch);
elSearch.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); moveCursor(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moveCursor(-1); }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (hits.length) chooseHit(hits[cursor >= 0 ? cursor : 0]);
  } else if (e.key === "Escape") {
    closeSearch();
  }
});
elResults.addEventListener("click", (e) => {
  const row = e.target.closest(".hit");
  if (row) chooseHit(Number(row.dataset.i));
});
addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== elSearch) {
    e.preventDefault();
    openSearch();
  }
});

// 空格（确认预选/接敌）、攻击指示器数字键预选、PageUp/PageDown 循环切换
addEventListener("keydown", (e) => {
  // 输入框/下拉框有焦点时（比如刚点开拖尾强度 #o-trail）这些键交给它原生处理
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === "Space") {
    if (e.target instanceof HTMLButtonElement) return;   // 让聚焦按钮保留原生空格激活
    e.preventDefault();
    // 与触屏空格按钮同路：自动模式下有锁定目标就先退出自动再接敌。
    // 漫游的扫描会一直挂着选中，不退出的话这个键在自动模式里永远是死键
    if (confirmPending()) return;
    if (selected < 0) return;
    setAuto(false);
    fireEngage();
    return;
  }
  if (e.code === "PageUp") { e.preventDefault(); cycleTarget(-1); return; }
  if (e.code === "PageDown") { e.preventDefault(); cycleTarget(1); return; }
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m) { e.preventDefault(); pickTargetSlot(Number(m[1]) - 1); }
});

/* ── 底部弧形仪表 ───────────────────────────────────
   两条同心弧画在视口下方的圆心上，只露出顶部一小段。
   内弧是速度（三角游标），外弧是当前曲目进度。 */
const hudSvg = document.getElementById("hud");
const arcBgmBg = document.getElementById("arc-bgm-bg");
const arcBgm = document.getElementById("arc-bgm");
const arcSpeedBg = document.getElementById("arc-speed-bg");
const speedTicks = document.getElementById("speed-ticks");
const speedMark = document.getElementById("speed-mark");
const speedSet = document.getElementById("speed-set");
const speedZero = document.getElementById("speed-zero");
const labels = document.getElementById("hud-labels");
const arcTgtL = document.getElementById("arc-tgt-l");
const arcTgtR = document.getElementById("arc-tgt-r");
const elBgmName = document.getElementById("f-bgm");
const elSpeed = document.getElementById("speed-readout");
const ICONS = Object.fromEntries(["main", "rcs", "auto", "lock", "rev"]
  .map((k) => [k, document.getElementById(`ic-${k}`)]));

// 弧心在屏幕中心略上方，弧长 90 度、以正下方为中点：右半段前进、左半段倒车
const A_SPAN = 90, A_MID = 90;
const A0 = A_MID + A_SPAN / 2;   // 左端（倒车满）
const A1 = A_MID - A_SPAN / 2;   // 右端（前进满）
// 零点放在弧长 1/5 处：倒车上限只有 100 ly/s，不该占太多刻度
const A_ZERO = A0 + (A1 - A0) / 5;
const SPEED_FULL = 1000;         // 量程上限 ly/s，即主引擎前进上限
const REV_FULL = 100;            // 倒车上限 ly/s，独立归一才能把 1/5 区占满
const SPEED_GAMMA = 0.42;        // <1 使低速段更精细，指针在起步阶段更敏感

const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
function arcPath(cx, cy, r, d0, d1) {
  const [x0, y0] = polar(cx, cy, r, d0);
  const [x1, y1] = polar(cx, cy, r, d1);
  const large = Math.abs(d1 - d0) > 180 ? 1 : 0;
  const sweep = d1 > d0 ? 1 : 0;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} `
       + `A${r},${r} 0 ${large} ${sweep} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

let hudGeom = null;
function layoutHud() {
  const w = vw(), h = vh();
  hudSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  // 圆心仍在屏幕中心略上方；半径缩到 1/3 后再高就会和准星叠在一起
  const cx = w / 2, cy = h * 0.48;
  const rSpeed = Math.min(h * 0.38, w * 0.3) / 3;
  const rBgm = rSpeed + 24;      // 中间那圈留给速度读数
  hudGeom = { cx, cy, rSpeed, rBgm };

  arcSpeedBg.setAttribute("d", arcPath(cx, cy, rSpeed, A0, A1));
  arcBgmBg.setAttribute("d", arcPath(cx, cy, rBgm, A0, A1));
  arcBgm.setAttribute("d", arcPath(cx, cy, rBgm, A0, A1));
  arcBgm.style.strokeDasharray = `0 ${arcBgm.getTotalLength()}`;

  const [zx0, zy0] = polar(cx, cy, rSpeed - 7, A_ZERO);
  const [zx1, zy1] = polar(cx, cy, rSpeed + 4, A_ZERO);
  speedZero.setAttribute("x1", zx0.toFixed(1)); speedZero.setAttribute("y1", zy0.toFixed(1));
  speedZero.setAttribute("x2", zx1.toFixed(1)); speedZero.setAttribute("y2", zy1.toFixed(1));

  speedTicks.innerHTML = Array.from({ length: 9 }, (_, k) => {
    const d = A0 + ((A1 - A0) * k) / 8;
    const [ax, ay] = polar(cx, cy, rSpeed - 6, d);
    const [bx, by] = polar(cx, cy, rSpeed - (k % 4 === 0 ? 14 : 10), d);
    return `<line class="tick" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}"`
         + ` x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>`;
  }).join("");

  labels.style.top = `${(cy + rBgm + 18).toFixed(0)}px`;
  elSpeed.style.left = `${cx.toFixed(0)}px`;
  elSpeed.style.top = `${(cy + rSpeed + 12).toFixed(0)}px`;

  // 攻击指示器的内圈弧，贴在槽位弧的内侧——张开角用跟 layoutTargets 相同的
  // targetSpreadDeg()，槽位被迫放宽张角时这条装饰弧跟着放宽，不会脱节
  const rt = targetArcR();
  const half = targetSpreadDeg(rt + 6) / 2;
  arcTgtL.setAttribute("d", arcPath(cx, h / 2, rt, 180 - half, 180 + half));
  arcTgtR.setAttribute("d", arcPath(cx, h / 2, rt, -half, half));
}

let shownSpeed = 0;
function updateHud(signedSpeed, dt, angRate, radRateSmooth) {
  if (!hudGeom) return;
  const { cx, cy, rSpeed } = hudGeom;

  // 阻尼：时间常数固定，指针跟得慢一点、有配重感
  shownSpeed += (signedSpeed - shownSpeed) * (1 - Math.pow(0.05, dt));
  // 幂压缩量程（指数 <1），低速段分辨率更高；正反各自按自己的上限归一，
  // 倒车才能在只占 1/5 弧长的区间里也走到底
  const arcOf = (v) => {
    const full = v >= 0 ? SPEED_FULL : REV_FULL;
    const mag = THREE.MathUtils.clamp(Math.pow(Math.abs(v) / full, SPEED_GAMMA), 0, 1);
    const f = Math.sign(v) * mag;
    return f >= 0 ? A_ZERO + (A1 - A_ZERO) * f : A_ZERO + (A_ZERO - A0) * f;
  };
  // 游标嵌在两条弧之间的缝里。尺寸按像素给，否则半径一缩角度宽度就失真
  const triPts = (deg) => {
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);    // 径向
    const tanx = -uy, tany = ux;                      // 切向
    const mid = rSpeed - 3;      // 略微内移，免得顶到外环
    const p = (ar, at) =>
      `${(cx + ux * ar + tanx * at).toFixed(1)},${(cy + uy * ar + tany * at).toFixed(1)}`;
    return `${p(mid + 5, 0)} ${p(mid, -4.5)} ${p(mid, 4.5)}`;
  };
  // 实心三角=实际速度，空心三角=目标设定速度，同一量程映射。
  // 自动/辅助驾驶没有节流阀，读的是自动驾驶当前这一段设定的档位
  const inAuto = auto.on || auto.assist;
  speedMark.setAttribute("points", triPts(arcOf(shownSpeed)));
  speedSet.setAttribute("points",
    triPts(arcOf((inAuto ? auto.gear : throttle.gear) / SCENE_SCALE)));

  const rev = shownSpeed < -1;
  hudSvg.classList.toggle("rev", rev);
  document.body.classList.toggle("rev", rev);

  // 矢量喷口看视角是否在动；主引擎看是否在明显靠近目标
  const turning = angRate > 0.12;
  const closing = radRateSmooth < -Math.max(3, Math.abs(shownSpeed) * 0.15);
  const vt = throttle.v / SCENE_SCALE;   // ly/s
  const gearErr = Math.abs(throttle.gear - throttle.v) / SCENE_SCALE;
  // 自动/辅助驾驶亮推进程序对应的灯，orbit 段全灭；
  // 手动：姿态灯看角速率，主推灯看节流收敛，反推灯看倒档（启发式兜底）
  const eng = inAuto ? auto.engine : "";
  const attRate = Math.abs(att.yaw) + Math.abs(att.pitch);
  const panning = held.has("panU") || held.has("panD")
    || held.has("panL") || held.has("panR");
  // 漫游是一边主推一边转向的，engine 这一个字段表达不了，另给一路 rcsOn
  ICONS.rcs.classList.toggle("on",
    eng ? (eng === "rcs" || auto.rcsOn) : (attRate > 0.04 || turning || panning));
  ICONS.main.classList.toggle("on", eng ? eng === "main"
    : (Math.abs(vt) > 1 || gearErr > 1 || closing));
  ICONS.auto.classList.toggle("on", auto.on || auto.assist);
  ICONS.lock.classList.toggle("on", selected >= 0);
  ICONS.rev.classList.toggle("on", eng ? eng === "retro" : (vt < -0.5 || rev));
  const abs = Math.abs(shownSpeed);
  elSpeed.innerHTML = `${abs.toFixed(abs < 100 ? 1 : 0)} <em>ly/s</em>`;

  const total = arcBgm.getTotalLength();
  const pr = bgm.duration ? THREE.MathUtils.clamp(bgm.currentTime / bgm.duration, 0, 1) : 0;
  arcBgm.style.strokeDasharray = `${(total * pr).toFixed(1)} ${total.toFixed(1)}`;
}

const BGM_TITLE = { "star-wish.m4a": "星愿 StarWish", "star-lalala.m4a": "StarLaLaLa" };
function refreshBgmName() {
  const f = (bgm.currentSrc || "").split("/").pop();
  const name = bgm.paused ? "—" : (BGM_TITLE[f] || "—");
  elBgmName.textContent = name;
  document.body.classList.toggle("bgm-on", !bgm.paused);
  requestAnimationFrame(syncSkew);   // 「正在播放」行的增删会改左板高度
}
bgm.addEventListener("loadedmetadata", refreshBgmName);
bgm.addEventListener("play", refreshBgmName);
bgm.addEventListener("pause", refreshBgmName);

/* ── 主循环 ─────────────────────────────────────────── */

function resize() {
  // devicePixelRatio 可能在运行中变化（换屏幕、系统缩放、浏览器缩放），
  // 每次 resize 都重新读一遍——只在 setSize() 时读一次会导致画布分辨率
  // 与真实设备像素错位，光点渲染位置和实际投影就会跟着偏
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  const w = vw(), h = vh();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  starMat.uniforms.uScale.value = h / 900;
  const dpr = renderer.getPixelRatio();
  starMat.uniforms.uDpr.value = dpr;
  rtPrev.setSize(w * dpr, h * dpr);
  rtNext.setSize(w * dpr, h * dpr);
  layoutHud();
  layoutTargets();
  syncSkew();
  // #reticle 用 CSS 变量 --reticle-scale 缩放没问题（width/height 是常规
  // 盒模型属性），#lock-dot 的半径改这里读同一个变量再由 JS 直接赋值
  lockDotScale = parseFloat(
    getComputedStyle(document.body).getPropertyValue("--reticle-scale")) || 1;
}
addEventListener("resize", resize);
// 伪横屏切换等同一次视口尺寸变化
fakeLandMq.addEventListener("change", () => { resize(); showRotateToast(); });
// iOS Safari/Edge（WebKit）地址栏收起展开、双指缩放等场景下 visualViewport
// 会变但不一定派发 window resize；用它兜底，否则画布/相机还停在旧尺寸，
// WebGL 渲染的光点跟 SVG 覆盖层（project() 用同一套 vw()/vh()）就会对不上
if (window.visualViewport) {
  visualViewport.addEventListener("resize", resize);
}
resize();
showRotateToast();

let prev = performance.now();
let decay = 0;
const lastCamPos = new THREE.Vector3();
const camVel = new THREE.Vector3();
const worldVel = new THREE.Vector3();
let lastRadius = cam.radius;
let lastTheta = cam.theta;
let lastPhi = cam.phi;
let radRateSmooth = 0;

function frame(now) {
  // 下界不能省：dt 为负会让下面的 pow 指数翻转，平滑系数变成负数，decay 发散
  const dt = THREE.MathUtils.clamp((now - prev) / 1000, 1 / 240, 0.1);
  prev = now;
  stepAuto(dt);
  padStep(dt);          // 方向簇按键量先落进姿态/节流输入
  pointerSteerStep();   // 指向线同一路输入
  steerCenterStep();    // 中键长按转向银心，同一路输入
  panKeyStep(dt);       // WASD 辅助平移
  attitudeStep(dt);
  throttleStep(dt);
  applyCamera(dt);
  project();
  updateMarker();
  renderNavBall();

  // 位移除以轨道半径 -> 角速度，与场景尺度无关，推拉和旋转都能算进去。
  // 同一个位移量再作为速度矢量喂给着色器，用于逐星的视向多普勒偏移。
  camVel.subVectors(camera.position, lastCamPos)
        .divideScalar(Math.max(dt, 1e-3) * Math.max(cam.radius, 1));
  const speed = camVel.length();
  // 倒车判据用轨道半径的变化率：拉远即倒车。
  // 用视向分量会过于敏感 —— 选中飞入时相机绕到目标另一侧也会瞬间判成倒车。
  worldVel.subVectors(camera.position, lastCamPos).divideScalar(Math.max(dt, 1e-3));
  const totalSpeed = worldVel.length() / SCENE_SCALE;
  const radRate = (cam.radius - lastRadius) / Math.max(dt, 1e-3) / SCENE_SCALE;
  radRateSmooth += (radRate - radRateSmooth) * (1 - Math.pow(0.02, dt));
  const angRate = (Math.abs(cam.theta - lastTheta) + Math.abs(cam.phi - lastPhi))
                / Math.max(dt, 1e-3);
  lastRadius = cam.radius; lastTheta = cam.theta; lastPhi = cam.phi;
  // 退而不转才算倒车；一边外推一边转向是主引擎在画弧（比如退到全景）。
  // 手动时以节流 v 的符号为准，径向启发式只作兜底
  let backing = radRate > totalSpeed * 0.25 && angRate < 0.10;
  if (!auto.on && !auto.assist && Math.abs(throttle.v) > 0.5 * SCENE_SCALE)
    backing = throttle.v < 0;
  const signedSpeed = backing ? -totalSpeed : totalSpeed;
  lastCamPos.copy(camera.position);
  starMat.uniforms.uCamVel.value.copy(camVel);
  updateHud(signedSpeed, dt, angRate, radRateSmooth);

  const excess = Math.max(speed - TRAIL_DEADZONE, 0);
  const want = THREE.MathUtils.clamp(
    trailLevel.k * Math.pow(excess, TRAIL_EXP), 0, trailLevel.max);
  // want 本身已经按当前档位钳过，外层只需夹 [0,1] 这个绝对安全范围——
  // 不能再夹 trailLevel.max，否则调低档位时 decay 若已经高于新档上限，
  // 会被瞬间摁下去而不是像正常过渡那样顺着平滑公式慢慢降
  decay = THREE.MathUtils.clamp(
    decay + (want - decay) * (1 - Math.pow(0.002, dt)), 0, 1);

  // 上一帧衰减后写入 rtNext，场景以 (1-decay) 的增益叠加其上
  renderer.setRenderTarget(rtNext);
  renderer.clear(true, true, true);
  quadMat.uniforms.uTex.value = rtPrev.texture;
  quadMat.uniforms.uDecay.value = decay;
  renderer.render(quadScene, quadCam);
  // 严格能量守恒（gain = 1-decay）会把尾巴压到看不见；留一部分累积，
  // 让星点在移动时拉出更亮的光迹，静止时 decay=0 自动回到原亮度
  setGain(1 - decay * 0.7);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  renderer.clear(true, true, true);
  quadMat.uniforms.uTex.value = rtNext.texture;
  quadMat.uniforms.uDecay.value = 1;
  renderer.render(quadScene, quadCam);

  const swap = rtPrev; rtPrev = rtNext; rtNext = swap;
  requestAnimationFrame(frame);
}

document.getElementById("loading").classList.add("done");
requestAnimationFrame(frame);

/* ── 全屏 ───────────────────────────────────────────── */
const fsBtn = document.getElementById("fs-btn");
if (document.documentElement.requestFullscreen) {
  fsBtn.hidden = false;
  fsBtn.addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen()
        .then(() => screen.orientation?.lock?.("landscape")?.catch(() => {}))
        .catch(() => {});
    }
  });
  document.addEventListener("fullscreenchange", () => {
    fsBtn.classList.toggle("on", !!document.fullscreenElement);
  });
}

/* ── 姿态指示器：底部中央圆形仪表 ─────────────────────
   独立小渲染器渲到 #attitude；场景根节点每帧取主相机四元数的共轭，
   世界在仪表中反向旋转，等价机头姿态仪（含滚转）。
   正交相机近远平面裁掉背半球，环与点云只显示面朝的一侧；
   到目标的指向线走全量程相机（layer 1），背向时也保留投影方向。 */
const navCanvas = document.getElementById("attitude");
const navRenderer = new THREE.WebGLRenderer(
  { canvas: navCanvas, antialias: true, alpha: true });
navRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
navRenderer.autoClear = false;
const navScene = new THREE.Scene();
const navRoot = new THREE.Group();
navScene.add(navRoot);
const navCam = new THREE.OrthographicCamera(-1.12, 1.12, 1.12, -1.12, -0.03, 1.2);
const navCamFull = new THREE.OrthographicCamera(-1.12, 1.12, 1.12, -1.12, -1.2, 1.2);
navCamFull.layers.set(1);

// 银道水平面：XZ 参考圆环 + 十字细线
const NAV_R = 0.95;
const navRing = new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 65 }, (_, k) => {
    const a = (k / 64) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * NAV_R, 0, Math.sin(a) * NAV_R);
  }));
navRoot.add(new THREE.Line(navRing, new THREE.LineBasicMaterial(
  { color: 0x93b6d4, transparent: true, opacity: 0.5 })));
const navCross = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-NAV_R, 0, 0), new THREE.Vector3(NAV_R, 0, 0),
  new THREE.Vector3(0, 0, -NAV_R), new THREE.Vector3(0, 0, NAV_R),
]);
navRoot.add(new THREE.LineSegments(navCross, new THREE.LineBasicMaterial(
  { color: 0x93b6d4, transparent: true, opacity: 0.2 })));

// XYZ 短轴线与端点：X/Z 蓝灰、Y（银道法向）金色
const NAV_AXES = [
  [new THREE.Vector3(1, 0, 0), 0x7ea8cc],
  [new THREE.Vector3(0, 1, 0), 0xf2c84b],
  [new THREE.Vector3(0, 0, 1), 0x7ea8cc],
];
const navTipPos = [];
const navTipCol = [];
for (const [dir, color] of NAV_AXES) {
  const g = new THREE.BufferGeometry().setFromPoints(
    [new THREE.Vector3(), dir.clone().multiplyScalar(0.55)]);
  navRoot.add(new THREE.Line(g, new THREE.LineBasicMaterial(
    { color, transparent: true, opacity: 0.85 })));
  navTipPos.push(dir.x * 0.55, dir.y * 0.55, dir.z * 0.55);
  const c = new THREE.Color(color);
  navTipCol.push(c.r, c.g, c.b);
}
const navTips = new THREE.BufferGeometry();
navTips.setAttribute("position",
  new THREE.BufferAttribute(new Float32Array(navTipPos), 3));
navTips.setAttribute("color",
  new THREE.BufferAttribute(new Float32Array(navTipCol), 3));
navRoot.add(new THREE.Points(navTips, new THREE.PointsMaterial(
  { size: 3, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.95, depthWrite: false })));

// 附近的星星：以当前机位为心找最近一批星，方向投到单位球面——不是银道系
// 整体分布，是随飞船位置动态更新的"附近"。全量扫描 N 颗星（数千量级，纯
// 数值比较）很便宜，但没必要每帧都做，挪动够远才重新采样一次。
const NAV_NEARBY = 160;
const NAV_NEARBY_REFRESH_DIST = 30 * SCENE_SCALE;
const navNearbyGeom = new THREE.BufferGeometry();
navNearbyGeom.setAttribute("position",
  new THREE.BufferAttribute(new Float32Array(NAV_NEARBY * 3), 3));
navNearbyGeom.setDrawRange(0, 0);
navRoot.add(new THREE.Points(navNearbyGeom, new THREE.PointsMaterial(
  { color: 0xcfe0f2, size: 1.4, sizeAttenuation: false,
    transparent: true, opacity: 0.55, depthWrite: false })));
const navNearbyOrder = Array.from({ length: N }, (_, i) => i);
const navNearbyD2 = new Float32Array(N);
const navNearbyAt = new THREE.Vector3(Infinity, Infinity, Infinity);

function refreshNavNearby() {
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  for (let i = 0; i < N; i++) {
    const dx = positions[i * 3] - cx, dy = positions[i * 3 + 1] - cy, dz = positions[i * 3 + 2] - cz;
    navNearbyD2[i] = dx * dx + dy * dy + dz * dz;
  }
  navNearbyOrder.sort((a, b) => navNearbyD2[a] - navNearbyD2[b]);
  const pos = navNearbyGeom.getAttribute("position");
  const k = Math.min(NAV_NEARBY, N);
  for (let j = 0; j < k; j++) {
    const i = navNearbyOrder[j];
    const dx = positions[i * 3] - cx, dy = positions[i * 3 + 1] - cy, dz = positions[i * 3 + 2] - cz;
    const l = Math.hypot(dx, dy, dz) || 1e-4;
    pos.setXYZ(j, (dx / l) * NAV_R * 0.92, (dy / l) * NAV_R * 0.92, (dz / l) * NAV_R * 0.92);
  }
  navNearbyGeom.setDrawRange(0, k);
  pos.needsUpdate = true;
  navNearbyAt.set(cx, cy, cz);
}

// 到目标恒星的金色虚线：选中时从球心指向该星方向
const navTgtGeom = new THREE.BufferGeometry();
navTgtGeom.setAttribute("position",
  new THREE.BufferAttribute(new Float32Array(6), 3));
const navTgt = new THREE.Line(navTgtGeom, new THREE.LineDashedMaterial(
  { color: 0xf2c84b, transparent: true, opacity: 0.9, dashSize: 0.05, gapSize: 0.035 }));
navTgt.layers.set(1);
navTgt.visible = false;
navRoot.add(navTgt);

// 规划路径：辅助驾驶进行中时，把各航段终点的实际机位（用 stateCamPos 从
// theta/phi/radius/target 反算——瞄准段的 target 是"看向"的星不是机位本身）
// 连成虚线折线，方向都从当前机位算，与目标虚线区分用更淡的暖色
const NAV_PATH_MAX = 8;
const navPathGeom = new THREE.BufferGeometry();
navPathGeom.setAttribute("position",
  new THREE.BufferAttribute(new Float32Array(NAV_PATH_MAX * 3), 3));
navPathGeom.setDrawRange(0, 0);
const navPath = new THREE.Line(navPathGeom, new THREE.LineDashedMaterial(
  { color: 0xffb37a, transparent: true, opacity: 0.55, dashSize: 0.035, gapSize: 0.03 }));
navPath.layers.set(1);
navPath.visible = false;
navRoot.add(navPath);

const navDir = new THREE.Vector3();
const navWaypoint = new THREE.Vector3();
let navW = 0, navH = 0;

function renderNavBall() {
  if (!opt.navball) return;
  const w = navCanvas.clientWidth, h = navCanvas.clientHeight;
  if (!w || !h) return;
  if (w !== navW || h !== navH) {
    navW = w; navH = h;
    navRenderer.setSize(w, h, false);
  }
  navRoot.quaternion.copy(camera.quaternion).invert();
  if (camera.position.distanceToSquared(navNearbyAt) > NAV_NEARBY_REFRESH_DIST * NAV_NEARBY_REFRESH_DIST) {
    refreshNavNearby();
  }
  if (selected >= 0) {
    navDir.set(positions[selected * 3], positions[selected * 3 + 1],
               positions[selected * 3 + 2]).sub(camera.position);
    const l = navDir.length();
    navTgt.visible = l > 1e-4;
    if (navTgt.visible) {
      navDir.multiplyScalar(NAV_R / l);
      const a = navTgtGeom.getAttribute("position");
      a.setXYZ(1, navDir.x, navDir.y, navDir.z);
      a.needsUpdate = true;
      navTgt.computeLineDistances();
    }
  } else {
    navTgt.visible = false;
  }
  // 巡游取剩余分段的终点机位，漫游取预排的路点队列，两者同一条虚线
  const wander = auto.on && auto.mode === "wander" && !auto.assist;
  const src = wander ? roam.plan : auto.segs;
  const from = wander ? 0 : auto.idx;
  if ((auto.on || auto.assist) && src && src.length > from) {
    const pos = navPathGeom.getAttribute("position");
    pos.setXYZ(0, 0, 0, 0);
    const k = Math.min(src.length - from, NAV_PATH_MAX - 1);
    for (let j = 0; j < k; j++) {
      const p = src[from + j];
      navWaypoint.copy(wander ? p : stateCamPos(p.to)).sub(camera.position);
      const l = navWaypoint.length();
      if (l > 1e-4) navWaypoint.multiplyScalar(NAV_R / l);
      pos.setXYZ(j + 1, navWaypoint.x, navWaypoint.y, navWaypoint.z);
    }
    navPathGeom.setDrawRange(0, k + 1);
    pos.needsUpdate = true;
    navPath.computeLineDistances();
    navPath.visible = k > 0;
  } else {
    navPath.visible = false;
  }
  navRenderer.clear(true, true, true);
  navRenderer.render(navScene, navCam);
  navRenderer.render(navScene, navCamFull);
}

/* ── 操作指南弹窗：首访自动弹出，左上角常驻按钮可重开 ──── */
const helpModal = document.getElementById("help-modal");
const helpClose = document.getElementById("help-close");
const helpBtn = document.getElementById("help-btn");

// 弹窗只挡「新」输入（捕获阶段 keydown + 遮罩挡 canvas 指针），
// 已经按住的键、已经设定的档位不会被冻结——开窗时顺手清掉，
// 免得飞船在弹窗背后继续滚转/巡航
function openHelp() {
  helpModal.hidden = false;
  held.clear();
  throttle.gear = 0; throttle.v = 0;
  midRelease(midMouse); midRelease(midTouch);
}
const INIT_GEAR = 50 * SCENE_SCALE;
function closeHelp() {
  helpModal.hidden = true;
  throttle.gear = INIT_GEAR;
}

helpClose.addEventListener("click", closeHelp);
helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) closeHelp();
});
helpBtn.addEventListener("click", openHelp);
addEventListener("keydown", (e) => {
  if (helpModal.hidden) return;
  if (e.key === "Escape") closeHelp();
  e.stopPropagation();
}, true);

let helpSeen = false;
try { helpSeen = !!localStorage.getItem("hud.helpSeen"); } catch { /* 隐私模式 */ }
if (helpSeen) {
  throttle.gear = INIT_GEAR;
} else {
  try { localStorage.setItem("hud.helpSeen", "1"); } catch { /* 隐私模式 */ }
  // 首访指南要等开屏贺词（#splash，z-index 更高）先关掉再弹出——否则两层
  // 蒙层同时叠着，贺词挡住指南，指南的全屏蒙层又挡在摇杆/按钮上面；触屏
  // 第一次点摇杆其实点在指南的蒙层上把它关掉，杆本身纹丝不动，摸上去
  // 跟失灵一样。开屏贺词关闭前已完成的情况在这里也兜住，不会永远不弹
  const splashEl = document.getElementById("splash");
  if (!splashEl || splashEl.classList.contains("out")) {
    openHelp();
  } else {
    new MutationObserver((_, ob) => {
      if (splashEl.classList.contains("out")) { ob.disconnect(); openHelp(); }
    }).observe(splashEl, { attributes: true, attributeFilter: ["class"] });
  }
}




