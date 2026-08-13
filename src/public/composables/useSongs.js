import { ref } from 'vue';
import { fetchAPI } from '../../shared/api.js';

const songs = ref([]);
const loaded = ref(false);

async function loadSongs() {
    const data = await fetchAPI('/songs');
    songs.value = data || [];
    loaded.value = true;
}

export function useSongs() {
    return { songs, loaded, loadSongs };
}
