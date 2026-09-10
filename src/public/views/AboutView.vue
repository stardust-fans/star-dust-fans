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
      代码在 <a href="https://github.com/stardust-fans/star-dust-fans" target="_blank" rel="noopener">GitHub</a>以AGPL协议开源，感兴趣的话可以去看看并给我们点个Star。
    </p>
    <p>
      如果你觉得这里还不错，随手支持一下也行——哪怕一两块，对我们来说都很有意义。
    </p>
    <p>
      如遇到侵权，违规信息，请发送邮件至 <a href="mailto:cooollawf_bg2gsx@qq.com" target="_blank" rel="noopener">cooollawf_bg2gsx@qq.com</a>，星尘同人站遵守侵权避风港（“通知后删除”规则）原则。
    </p>
    <p>
      站长将在收到信息后大约一周（UTC+8北京标准时间）处理。不计算法定节假日
    </p>

    <div class="sponsor-image-wrapper">
      <img :src="imageUrl" alt="支持星尘粉丝站" class="sponsor-image" />
    </div>

    <!-- ===== 特别致谢（表格样式，和志愿者名单一致） ===== -->
    <table class="credits">
      <caption>特别致谢</caption>
      <thead>
        <tr>
          <th scope="col">署名</th>
          <th scope="col">致谢理由</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in specialThanks" :key="item.name">
          <td>
            <a v-if="item.url" :href="item.url" target="_blank" rel="noopener">{{ item.name }}</a>
            <span v-else>{{ item.name }}</span>
          </td>
          <td>{{ item.reason }}</td>
        </tr>
      </tbody>
    </table>

    <div class="sponsor-note">
      <p class="sponsor-small">非官方粉丝站 · 用爱发电</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
// 名单由 tool/fetch_contributors.mjs 在构建期生成
import contributors from '../../shared/contributors.json';

const imageUrl = '/images/bayuep-support.png';

// 特别致谢数据
const specialThanks = ref([]);

onMounted(async () => {
  try {
    const res = await fetch('/special-thanks.json');
    const data = await res.json();
    specialThanks.value = data;
  } catch {
    // 降级：硬编码默认数据
    specialThanks.value = [
      { name: '小土在哪', url: 'https://github.com/XingHui-8183/xiaotuzaina', reason: '项目启发与参考' }
    ];
  }
});
</script>