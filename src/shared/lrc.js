// LRC 目录用这个日期表示发行日期不适用
const NOT_APPLICABLE_DATE = '1970-01-01';
const DISABLED_NAMES = new Set(['', '不适用', '缺少信息']);

export const OFFER_TYPES = { physical: '实体', digital: '电子' };

export function releaseDate(album) {
    return album.year === NOT_APPLICABLE_DATE ? '' : album.year;
}

export function names(values) {
    return values.filter(value => !DISABLED_NAMES.has(value.trim()));
}

export function formatBytes(bytes) {
    return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
