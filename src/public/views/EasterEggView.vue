<template>
  <main class="aspirateur" aria-labelledby="aspirateur-title">
    <div class="aspirateur__noise" aria-hidden="true"></div>
    <header class="aspirateur__header">
      <RouterLink class="aspirateur__back" to="/">← 返回星尘站</RouterLink>
      <span class="aspirateur__stamp">01.04 · secret archive</span>
    </header>
    <section class="aspirateur__hero">
      <p class="aspirateur__eyebrow">un petit secret pour les curieux</p>
      <h1 id="aspirateur-title">星尘吸尘器</h1>
      <p class="aspirateur__lead">
        Aspirateur，在法语里就是“吸尘器”。<br />今天，顺手把宇宙里的灰尘吸干净吧。
      </p>
      <div class="aspirateur__machine" :class="{ 'is-running': isRunning }">
        <span class="aspirateur__spark aspirateur__spark--one">✦</span
        ><span class="aspirateur__spark aspirateur__spark--two">✧</span
        ><span class="aspirateur__spark aspirateur__spark--three">✦</span>
        <svg
          class="aspirateur__svg"
          viewBox="0 0 420 280"
          role="img"
          aria-label="一台星尘吸尘器"
        >
          <path class="hose" d="M265 158c58 9 71 54 103 66 18 7 30-2 31-17" />
          <path class="wand" d="M355 207l27 41" />
          <path
            class="body"
            d="M117 93c0-26 21-47 47-47h80c27 0 48 21 48 47v72c0 22-18 40-40 40H157c-22 0-40-18-40-40z"
          />
          <path class="body-top" d="M140 94h129" />
          <circle class="dial" cx="182" cy="129" r="25" />
          <path class="dial-mark" d="M182 112v17l12 9" />
          <path
            class="handle"
            d="M175 45V25c0-9 7-16 16-16h43c9 0 16 7 16 16v24"
          />
          <path class="wheel" d="M142 205v18M250 205v18" />
          <circle class="wheel-dot" cx="142" cy="229" r="16" />
          <circle class="wheel-dot" cx="250" cy="229" r="16" />
          <path class="dust-line" d="M86 194H30M76 216H48" />
        </svg>
        <span class="aspirateur__label">COSMIC<br />CLEANER</span>
      </div>
      <button
        class="aspirateur__button"
        type="button"
        @click="toggleCleaner"
        :aria-pressed="isRunning"
      >
        <span aria-hidden="true">{{ isRunning ? "◼" : "✦" }}</span
        >{{ isRunning ? "停止吸尘" : "开始吸尘" }}
      </button>
      <p class="aspirateur__status" aria-live="polite">{{ status }}</p>
    </section>
    <footer class="aspirateur__footer">
      Made of stardust · Rien ne se perd, tout scintille.
    </footer>
  </main>

  <!-- 小土的一封信 彩蛋模态框 -->
  <Teleport to="body">
    <div v-if="showLetter" class="letter-overlay" @click.self="closeLetter">
      <div class="letter-card">
        <button class="letter-close" @click="closeLetter">✕</button>
        <h2>{{ letterContent?.title || '小土的一封信' }}</h2>
        <div class="letter-body">
          <pre>{{ letterContent?.content || '' }}</pre>
        </div>
        <p class="letter-geo">————来自以太之海的星小土</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from "vue";
// 直接导入同目录下的 JSON 文件（Vite 支持）
import letterData from "./letter-from-xiaotu.json?raw";

const isRunning = ref(false);
const cleaned = ref(0);
const showLetter = ref(false);
const letterContent = ref(null);
const userCity = ref("未知之地");
const userCityShort = ref("未知之地");
const isFetchingLocation = ref(false);
const lastTriggerTime = ref(0);

// 获取IP归属地（通过 Worker 代理 /api/ip/get，自动携带用户真实 IP）
const fetchLocation = async () => {
  if (isFetchingLocation.value) return;
  isFetchingLocation.value = true;
  try {
    const res = await fetch("/api/ip/get");
    const data = await res.json();
    if (data.ret === 200 && data.data) {
      const d = data.data;
      const city = d.city || "未知之地";
      const prov = d.prov || "";
      const isp = d.isp || "";
      // 详细位置（显示在信纸底部）
      const detail = prov ? `${city}（${prov}${isp ? `·${isp}` : ""}）` : city;
      userCity.value = detail;
      // 仅城市名（用于信的内容）
      userCityShort.value = city;
    }
  } catch {
    userCity.value = "远方";
    userCityShort.value = "远方";
  } finally {
    isFetchingLocation.value = false;
  }
};

// 加载小土的信（从同目录 JSON 文件，随机选取一封）
const loadLetter = async () => {
  try {
    const data = JSON.parse(letterData);
    // 如果 data 是数组，随机取一个
    const selected = Array.isArray(data) 
      ? data[Math.floor(Math.random() * data.length)] 
      : data;
    // 替换城市占位符
    selected.content = selected.content.replace(/\{city\}/g, userCityShort.value);
    letterContent.value = selected;
  } catch {
    // 降级方案：硬编码一封默认的信
    letterContent.value = {
      title: "小土的一封信",
      content: `亲爱的吸尘器，\n\n当你在${userCityShort.value}按下这个按钮时，星尘正在宇宙的某个角落看着你。\n\n她说："谢谢你记得我。"\n\n—— 小土，于星尘历10年`,
    };
  }
};

// 触发彩蛋（15%概率）
const tryTriggerLetter = async () => {
  const now = Date.now();
  // 防刷：10分钟内不再触发
  if (now - lastTriggerTime.value < 10 * 60 * 1000) return;
  if (showLetter.value) return;

  if (Math.random() < 0.15) {
    await fetchLocation();
    await loadLetter();
    showLetter.value = true;
    lastTriggerTime.value = now;
  }
};

const toggleCleaner = () => {
  isRunning.value = !isRunning.value;
  if (isRunning.value) {
    cleaned.value += 7;
    tryTriggerLetter();
  }
};

const closeLetter = () => {
  showLetter.value = false;
  letterContent.value = null;
};

const status = computed(() => {
  if (isRunning.value) return "吸吸吸……星尘正在回到它该在的地方。";
  if (cleaned.value > 0)
    return `清洁完成！本次收集了 ${cleaned.value} 粒宇宙灰尘。`;
  return "按下按钮，看看会吸出什么。";
});
</script>

<style scoped>
.aspirateur {
  position: fixed;
  inset: 0;
  z-index: 1100;
  min-height: 100dvh;
  overflow-y: auto;
  color: #f7f1ff;
  background: #161329;
  isolation: isolate;
  font-family: Georgia, "Noto Serif SC", serif;
}
.aspirateur__noise {
  position: absolute;
  inset: 0;
  opacity: 0.18;
  pointer-events: none;
  background-image: radial-gradient(#fff 0.6px, transparent 0.7px);
  background-size: 7px 7px;
  mask-image: linear-gradient(135deg, transparent, #000 40%, transparent 85%);
}
.aspirateur__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.3rem clamp(1.2rem, 5vw, 5rem);
  font:
    700 0.7rem/1.2 ui-monospace,
    SFMono-Regular,
    monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.aspirateur__back {
  color: #e4d8ff;
  text-decoration: none;
}
.aspirateur__back:hover {
  color: #fff;
}
.aspirateur__stamp {
  color: #9c91ba;
}
.aspirateur__hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(2rem, 7vh, 5rem) 1.25rem 3rem;
  text-align: center;
}
.aspirateur__eyebrow {
  margin: 0 0 1rem;
  color: #b5e8db;
  font:
    0.75rem/1.2 ui-monospace,
    SFMono-Regular,
    monospace;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  color: #fff;
  font-size: clamp(3.2rem, 10vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.06em;
  line-height: 0.95;
  text-shadow: 0.08em 0.08em 0 #56457b;
}
.aspirateur__lead {
  margin: 1.6rem auto 0;
  color: #c8bfdc;
  font-size: clamp(1rem, 2vw, 1.25rem);
  line-height: 1.8;
}
.aspirateur__machine {
  position: relative;
  width: min(420px, 94vw);
  margin: 2.5rem 0 1rem;
}
.aspirateur__svg {
  display: block;
  width: 100%;
  overflow: visible;
}
.hose,
.wand,
.body-top,
.handle,
.wheel {
  fill: none;
  stroke: #dbd0fb;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 10;
}
.wand {
  stroke: #f6ca7e;
  stroke-width: 7;
}
.body {
  fill: #7457a2;
  stroke: #eee7ff;
  stroke-width: 7;
}
.body-top {
  stroke-width: 7;
}
.dial {
  fill: #1c1734;
  stroke: #b5e8db;
  stroke-width: 7;
}
.dial-mark {
  fill: none;
  stroke: #f6ca7e;
  stroke-linecap: round;
  stroke-width: 5;
}
.wheel-dot {
  fill: #f6ca7e;
  stroke: #fff5d8;
  stroke-width: 5;
}
.dust-line {
  fill: none;
  stroke: #b5e8db;
  stroke-dasharray: 9 10;
  stroke-linecap: round;
  stroke-width: 5;
}
.aspirateur__label {
  position: absolute;
  top: 45%;
  left: 49%;
  color: #f4eaff;
  font:
    700 0.6rem/1.1 ui-monospace,
    monospace;
  letter-spacing: 0.1em;
  transform: rotate(-8deg);
}
.aspirateur__spark {
  position: absolute;
  z-index: 2;
  color: #f6ca7e;
  font: 2rem serif;
}
.aspirateur__spark--one {
  top: 7%;
  left: 8%;
}
.aspirateur__spark--two {
  top: 21%;
  right: 9%;
  color: #b5e8db;
}
.aspirateur__spark--three {
  bottom: 16%;
  left: 3%;
}
.is-running .aspirateur__spark {
  animation: sparkle 0.7s ease-in-out infinite alternate;
}
.is-running .aspirateur__svg {
  animation: hum 0.14s linear infinite alternate;
}
.aspirateur__button {
  border: 2px solid #f6ca7e;
  border-radius: 999px;
  padding: 0.85rem 1.5rem;
  color: #211936;
  background: #f6ca7e;
  cursor: pointer;
  font:
    700 0.95rem/1 ui-monospace,
    monospace;
  box-shadow: 4px 4px 0 #614b88;
}
.aspirateur__button:hover {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0 #614b88;
}
.aspirateur__button:focus-visible {
  outline: 3px solid #b5e8db;
  outline-offset: 4px;
}
.aspirateur__status {
  min-height: 1.4em;
  margin: 1.25rem 0 0;
  color: #b5e8db;
  font-size: 0.9rem;
}
.aspirateur__footer {
  position: relative;
  z-index: 1;
  padding: 1rem;
  color: #75698f;
  text-align: center;
  font:
    0.7rem/1.5 ui-monospace,
    monospace;
  letter-spacing: 0.08em;
}

/* ===== 小土的一封信 彩蛋样式 ===== */
.letter-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(22, 19, 41, 0.85);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.5s ease;
}

.letter-card {
  position: relative;
  max-width: 520px;
  width: 90%;
  padding: 2.5rem 2rem;
  background: #f7f1ff;
  color: #161329;
  border-radius: 32px 12px 32px 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  font-family: Georgia, "Noto Serif SC", serif;
  transform: scale(0.95);
  animation: letterPop 0.4s ease forwards;
}

.letter-close {
  position: absolute;
  top: 12px;
  right: 18px;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7457a2;
  opacity: 0.6;
  transition: 0.2s;
}
.letter-close:hover {
  opacity: 1;
  transform: rotate(90deg);
}

.letter-card h2 {
  margin: 0 0 1rem;
  font-size: 1.8rem;
  color: #211936;
  border-bottom: 2px dashed #b5e8db;
  padding-bottom: 0.5rem;
}

.letter-body pre {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 1.05rem;
  line-height: 1.9;
  color: #2a1f3d;
  margin: 0;
}

.letter-geo {
  margin-top: 1.5rem;
  text-align: right;
  font-size: 0.85rem;
  color: #7457a2;
  opacity: 0.7;
  border-top: 1px solid #d5cce6;
  padding-top: 1rem;
}

/* ===== 动画 ===== */
@keyframes sparkle {
  to {
    transform: translateY(-8px) rotate(12deg);
    opacity: 0.45;
  }
}
@keyframes hum {
  to {
    transform: translateX(1px) rotate(0.2deg);
  }
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes letterPop {
  from {
    transform: scale(0.92) translateY(20px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* ===== 响应式 & 可访问性 ===== */
@media (max-width: 600px) {
  .aspirateur__stamp {
    display: none;
  }
  .aspirateur__header {
    padding-top: 1rem;
  }
  .aspirateur__machine {
    margin-top: 2rem;
  }
  .letter-card {
    padding: 1.8rem 1.2rem;
  }
  .letter-card h2 {
    font-size: 1.4rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-running .aspirateur__spark,
  .is-running .aspirateur__svg {
    animation: none;
  }
  .aspirateur__button:hover {
    transform: none;
  }
  .letter-overlay {
    animation: none;
  }
  .letter-card {
    animation: none;
    transform: scale(1);
  }
}
</style>