import { ref } from 'vue';
import { fetchAPI } from '../../shared/api.js';

const PAGE_SIZE = 200;

const songs = ref([]);
const total = ref(0);
const loaded = ref(false);

let inflight = null;

async function fetchAll() {
    // 与首批并发，避免多一次串行往返；先到先用于展示总数
    fetchAPI('/songs/count').then(res => {
        const n = Number(res?.total);
        if (n > 0) total.value = n;
    });

    const collected = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const batch = await fetchAPI(`/songs?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!Array.isArray(batch) || batch.length === 0) break;
        collected.push(...batch);
        songs.value = collected.slice();
        loaded.value = true;
        if (batch.length < PAGE_SIZE) break;
    }

    loaded.value = true;
    if (!total.value) total.value = songs.value.length;
}

function loadSongs() {
    if (loaded.value) return Promise.resolve();
    if (!inflight) inflight = fetchAll().finally(() => { inflight = null; });
    return inflight;
}

export function useSongs() {
    return { songs, total, loaded, loadSongs };
}
