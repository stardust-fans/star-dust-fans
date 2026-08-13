import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', component: { template: '<div>placeholder</div>' } }],
});

export default router;
