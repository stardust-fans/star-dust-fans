<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">✦ 关于</span>
    <h1 class="page-title">关于星尘粉丝站</h1>
    <p class="page-subtitle">一个由星尘爱好者维护的非官方站点</p>
  </div>

  <div class="about-content">
    <p>
      关于星尘粉丝站，本身其实是由下面这些人共同主导、搭建、维护的。
    </p>

    <table class="credits">
      <caption>制作</caption>
      <thead>
        <tr>
          <th scope="col">署名</th>
          <th scope="col">GitHub</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in contributors" :key="person.login">
          <td>{{ person.name }}</td>
          <td>
            <a :href="`https://github.com/${person.login}`" target="_blank" rel="noopener">@{{ person.login }}</a>
          </td>
        </tr>
      </tbody>
    </table>

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

.credits {
  width: 100%;
  margin: 0 0 28px;
  border-collapse: collapse;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  font-size: 0.95rem;
}

.credits caption {
  padding-bottom: 10px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  color: var(--cobalt-soft);
}

.credits th {
  padding: 10px 0;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
  border-bottom: 1px solid var(--line);
}

.credits td {
  padding: 12px 0;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
}

.credits tbody tr:last-child td {
  border-bottom: none;
}

.credits td a {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--cobalt);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s var(--ease);
}

.credits td a:hover {
  border-bottom-color: var(--cobalt-soft);
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