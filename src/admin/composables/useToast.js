import { ref } from 'vue';

// 模块级单例状态：所有组件共享同一个 toast 队列
const toasts = ref([]);
let uid = 0;

function showToast(message, type = 'info') {
    const id = ++uid;
    toasts.value.push({ id, message, type, leaving: false });
    setTimeout(() => {
        const t = toasts.value.find((item) => item.id === id);
        if (t) t.leaving = true;
        setTimeout(() => {
            toasts.value = toasts.value.filter((item) => item.id !== id);
        }, 300);
    }, 3000);
}

export function useToast() {
    return { toasts, showToast };
}
