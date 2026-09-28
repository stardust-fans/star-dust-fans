import { ref } from "vue";
import { API_BASE, fetchAPI } from "../../shared/api.js";

export function useLogin() {
  const isLoading = ref(false);
  const error = ref(null);

  function setCookie(name, value, days = 7) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }

  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp("(^| )" + name + "=([^;]+)"),
    );
    return match ? decodeURIComponent(match[2]) : null;
  }

  function removeCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }

  async function login(credentials) {
    isLoading.value = true;
    error.value = null;

    try {
      const data = await fetchAPI("/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      if (data.token) {
        setCookie("authToken", data.token, 7);
        setCookie("user", JSON.stringify(data.user), 7);
      }

      return data;
    } catch (err) {
      error.value = err.message || "登录失败";
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  function logout() {
    removeCookie("authToken");
    removeCookie("user");
    window.location.reload();
  }

  function getUser() {
    const raw = getCookie("user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      removeCookie("user");
      return null;
    }
  }

  function getToken() {
    return getCookie("authToken");
  }

  async function refreshUser() {
    const token = getToken();
    if (!token) return null;
    const response = await fetch(`${API_BASE}/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const profile = await response.json();
    const user = { id: profile.id, username: profile.username, display_name: profile.display_name };
    setCookie("user", JSON.stringify(user), 7);
    return user;
  }

  function isAuthenticated() {
    return !!getToken();
  }

  return {
    login,
    logout,
    getUser,
    getToken,
    refreshUser,
    isAuthenticated,
    isLoading,
    error,
  };
}
