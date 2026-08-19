// src/public/composables/useRegister.js
import { ref } from 'vue';
import { fetchAPI } from '../../shared/api.js';

export function useRegister() {
    const isLoading = ref(false);
    const error = ref(null);

    async function register(userData) {
        isLoading.value = true;
        error.value = null;

        try {
            const data = await fetchAPI('/register', {
                method: 'POST',
                body: JSON.stringify(userData),
            });
            return data;
        } catch (err) {
            error.value = err.message || '注册失败，请稍后重试';
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    return { register, isLoading, error };
}