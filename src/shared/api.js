export const API_BASE = '/api';

export async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`获取 ${endpoint} 失败:`, error);
        return [];
    }
}
