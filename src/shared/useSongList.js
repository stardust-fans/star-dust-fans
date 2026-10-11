import { ref, computed, watch, onUnmounted } from 'vue';
import { fetchAPI } from './api.js';

export function useSongList({ pageSize = 12, endpoint = '/songs', request = fetchAPI } = {}) {
    const songs = ref([]);
    const total = ref(0);
    const page = ref(1);
    const query = ref('');
    const search = ref('');
    const sort = ref('latest');
    const loading = ref(true);
    const error = ref('');
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
    let requestId = 0;
    let searchTimer;

    async function reload() {
        const id = ++requestId;
        loading.value = true;
        error.value = '';
        const filters = new URLSearchParams({ q: search.value });
        const params = new URLSearchParams({
            q: search.value,
            sort: sort.value,
            limit: String(pageSize),
            offset: String((page.value - 1) * pageSize),
        });
        try {
            const [items, count] = await Promise.all([
                request(`${endpoint}?${params}`),
                request(`${endpoint}/count?${filters}`),
            ]);
            if (id !== requestId) return;
            if (!Array.isArray(items)) throw new Error('歌曲列表格式错误');
            total.value = Number(count.total) || 0;
            if (page.value > pageCount.value) {
                page.value = pageCount.value;
                return;
            }
            songs.value = items;
        } catch (err) {
            if (id === requestId) error.value = err.message || '歌曲加载失败';
        } finally {
            if (id === requestId) loading.value = false;
        }
    }

    watch(query, () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            page.value = 1;
            search.value = query.value.trim();
        }, 300);
    });
    watch(sort, () => { page.value = 1; }, { flush: 'sync' });
    watch([page, search, sort], reload, { immediate: true });
    onUnmounted(() => {
        clearTimeout(searchTimer);
        requestId++;
    });

    return { songs, total, page, pageCount, query, sort, loading, error, reload };
}
