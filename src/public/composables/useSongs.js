import { ref } from 'vue';
import { fetchAPI } from '../../shared/api.js';

const songs = ref([]);
const total = ref(0);
const loaded = ref(false);

let inflight = null;

async function fetchFeatured() {
    const [items, count] = await Promise.all([
        fetchAPI('/songs?limit=6&sort=latest'),
        fetchAPI('/songs/count'),
    ]);
    songs.value = items;
    total.value = Number(count.total) || 0;
    loaded.value = true;
}

function loadSongs() {
    if (loaded.value) return Promise.resolve();
    if (!inflight) inflight = fetchFeatured().finally(() => { inflight = null; });
    return inflight;
}

export function useSongs() {
    return { songs, total, loaded, loadSongs };
}
