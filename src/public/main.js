import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { useSite } from './composables/useSite.js';
import './assets/style.css';

// 先取到站点配置（主题色 / 文案 / 背景）再挂载，避免首帧闪一下默认站的样式。
// load() 内部失败会 resolve(null)，不会阻塞渲染。
await useSite().load();

createApp(App).use(router).mount('#app');
