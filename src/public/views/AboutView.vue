<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">✦ 关于</span>
    <h1 class="page-title">关于星尘粉丝站</h1>
    <p class="page-subtitle">一个由星尘爱好者维护的非官方站点</p>
  </div>

  <div class="about-content">
    <p>
      关于星尘粉丝站，本身其实是由{{ signature }}共同主导、搭建、维护的。
    </p>
    <p>
      这会产生许多成本，比如域名费用、服务器维护费、以及其他乱七八糟的开支。
    </p>
    <p>
      Github链接：https://github.com/stardust-fans/star-dust-fans
    </p>
    <p>
      恳请屏幕前的吸尘器们，如果有能力，请帮助我们。
    </p>
    <p>
      哪怕只是一两块，都可能是粉丝站活下去的希望。
    </p>

    <div class="sponsor-image-wrapper">
      <img :src="imageUrl" alt="支持星尘粉丝站" class="sponsor-image" />
    </div>

    <div class="sponsor-note">
      <p class="sponsor-small">非官方粉丝站 · 用爱发电</p>
    </div>
  </div>
</template>

<script setup>
// 名单由 tool/fetch_contributors.mjs 在构建期生成
import contributors from '../../shared/contributors.json';

const imageUrl = '/images/bayuep-support.png';
const signature = contributors.map(c => c.name).join('、');
</script>

<style scoped>
.about-content {
  max-width: 680px;
  margin: 0 auto;
}

.about-content p {
  color: var(--text-muted);
  font-size: 1.05rem;
  line-height: 1.9;
  margin-bottom: 20px;
}

.sponsor-image-wrapper {
  margin: 32px 0;
  text-align: center;
}

.sponsor-image {
  max-width: 400px; 
  height: auto;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 8px;
}

.sponsor-note {
  text-align: center;
  padding: 24px 0 16px;
  border-top: 1px solid var(--border);
}

.sponsor-note .sponsor-small {
  font-size: 0.85rem;
  color: var(--text-dim);
}
</style>