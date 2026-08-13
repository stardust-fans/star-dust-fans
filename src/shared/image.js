// 封面字段防御式归一化：兼容三种可能形态——
// 完整 data URI（GET /api/songs 与 bili 预览接口的实际返回格式）、
// 遗留 http(s) URL（007 之前存量数据可能残留）、
// 裸 base64（POST/PUT 提交时的约定格式）。
export function toImageSrc(cover) {
    if (!cover) return '';
    if (cover.startsWith('data:image')) return cover;
    if (cover.startsWith('http')) return cover;
    return `data:image/webp;base64,${cover}`;
}
