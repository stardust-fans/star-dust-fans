import { ref } from 'vue';
import { fetchAPI } from '../../shared/api.js';

export function useLogin() {
    const isLoading = ref(false);
    const error = ref(null);

    function setCookie(name, value, days = 7) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    }

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function removeCookie(name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }

    async function login(credentials) {
        isLoading.value = true;
        error.value = null;

        try {
            const data = await fetchAPI('/login', {
                method: 'POST',
                body: JSON.stringify(credentials),
            });

            if (data.token) {
                setCookie('authToken', data.token, 7);
                setCookie('user', JSON.stringify(data.user), 7);
            }

            return data;
        } catch (err) {
            error.value = err.message || '登录失败';
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    function logout() {
        removeCookie('authToken');
        removeCookie('user');
        window.location.reload();
    }

    function getUser() {
        const raw = getCookie('user');
        return raw ? JSON.parse(raw) : null;
    }

    function getToken() {
        return getCookie('authToken');
    }

    function isAuthenticated() {
        return !!getToken();
    }

    return { login, logout, getUser, getToken, isAuthenticated, isLoading, error };
}