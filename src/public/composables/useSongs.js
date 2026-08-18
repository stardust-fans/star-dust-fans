import { ref } from 'vue';
import { fetchAPI } from '../../shared/api.js';

const PAGE_SIZE = 200;

const songs = ref([]);
const loaded = ref(false);

async function loadSongs() {
    const all = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const batch = await fetchAPI(`/songs?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
    }
    songs.value = all;
    loaded.value = true;
}

export function useSongs() {
    return { songs, loaded, loadSongs };
}
