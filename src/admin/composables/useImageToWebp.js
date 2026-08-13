import { ref } from 'vue';

// 客户端 WebP 编码：将 bilibili 封面（data URI 或裸 base64）压缩转码为 WebP，
// 供表单预览与保存时的 cover 字段（POST/PUT /api/admin/songs 要求裸 base64 WebP）使用
export function useImageToWebp() {
    const isConverting = ref(false);
    const error = ref(null);

    async function convert(sourceDataUriOrBase64, { quality = 0.82, maxWidth = 480 } = {}) {
        isConverting.value = true;
        error.value = null;
        try {
            const src = sourceDataUriOrBase64.startsWith('data:')
                ? sourceDataUriOrBase64
                : `data:image/png;base64,${sourceDataUriOrBase64}`;

            const img = new Image();
            const loaded = new Promise((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('图片加载失败'));
            });
            img.src = src;
            await loaded;

            const naturalWidth = img.naturalWidth;
            const naturalHeight = img.naturalHeight;
            let width = naturalWidth;
            let height = naturalHeight;
            const longerEdge = Math.max(width, height);
            if (longerEdge > maxWidth) {
                const scale = maxWidth / longerEdge;
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (b) => (b ? resolve(b) : reject(new Error('WebP 转换失败'))),
                    'image/webp',
                    quality
                );
            });

            const dataUri = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('读取转换结果失败'));
                reader.readAsDataURL(blob);
            });

            const base64 = dataUri.split(',')[1] || '';

            return { base64, dataUri, sizeBytes: blob.size, width, height };
        } catch (err) {
            error.value = err.message || String(err);
            throw err;
        } finally {
            isConverting.value = false;
        }
    }

    return { convert, isConverting, error };
}
