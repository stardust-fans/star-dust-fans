<template>
  <div class="page-header">
    <span class="eyebrow page-eyebrow">✦ 关于</span>
    <h1 class="page-title">关于星尘粉丝站</h1>
    <p class="page-subtitle">一个由星尘爱好者维护的非官方站点</p>
  </div>

  <div class="about-content">
    <p>
      粉丝站由下面这些人一起折腾起来的，一直维护到现在。
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
      维护站点有些实际开支——域名、服务器之类的，偶尔还有其他乱七八糟的费用。
    </p>
    <p>
      本站暂时是试运行，用户群群号是920160812，希望各位支持
    </p>
    <p>
      代码在 <a href="https://github.com/stardust-fans/star-dust-fans" target="_blank" rel="noopener">GitHub 开源</a>，感兴趣的话可以去看看。
    </p>
    <p>
      如果你觉得这里还不错，随手支持一下也行——哪怕一两块，对我们来说都很有意义。
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
  color: var(--ink-muted);
  font-size: 1.05rem;
  line-height: 1.9;
  margin-bottom: 20px;
}

.about-content p a {
  color: var(--cobalt);
  text-decoration: none;
  border-bottom: 1px solid var(--cobalt-soft);
  transition: border-color 0.2s;
}

.about-content p a:hover {
  border-bottom-color: var(--cobalt);
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
  border-radius: var(--radius);
  background: var(--paper-raised);
  border: 1px solid var(--line);
  padding: 8px;
}

.sponsor-note {
  text-align: center;
  padding: 24px 0 16px;
  border-top: 1px solid var(--line);
}

.sponsor-note .sponsor-small {
  font-size: 0.85rem;
  color: var(--ink-faint);
}
</style>
