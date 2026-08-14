export function formatNumber(num) {
    if (!num) return '0';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toLocaleString();
}

export function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDate(timestamp) {
    if (!timestamp) return '未知';
    const d = new Date(timestamp * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDuration(str) {
    const match = String(str || '').trim().match(/^(\d+):([0-5]?\d)$/);
    if (!match) return 0;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

export function parseDateToPubdate(str) {
    if (!str) return 0;
    const ts = new Date(`${str}T00:00:00`).getTime();
    return Number.isNaN(ts) ? 0 : Math.floor(ts / 1000);
}

export function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getTagClass(tag) {
    const map = {
        '殿堂曲': 'masterpiece',
        '传说曲': 'legend',
        '神调教': 'custom',
        '国风': 'custom',
        '出道曲': 'custom',
    };
    return map[tag] || 'custom';
}
