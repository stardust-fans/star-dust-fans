import { ref } from 'vue';
import { API_BASE } from '../../shared/api.js';

const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 与 /api/upload 的上限保持一致
const AVATAR_EDGE = 256; // 头像输出边长（正方形）
const QUALITY = 0.86;

// 头像上传：本地居中裁成正方形 → 缩放到 256 → WebP（不支持时回退 JPEG）
// → POST /api/upload（写入 R2，返回 /uploads/... 路径）
export function useAvatarUpload() {
  const isUploading = ref(false);
  const error = ref('');

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('图片读取失败'));
      };
      img.src = objectUrl;
    });
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
  }

  async function toAvatarBlob(file) {
    const img = await loadImage(file);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('图片尺寸异常');

    const sx = Math.floor((img.naturalWidth - side) / 2);
    const sy = Math.floor((img.naturalHeight - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_EDGE;
    canvas.height = AVATAR_EDGE;
    const ctx = canvas.getContext('2d');
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_EDGE, AVATAR_EDGE);

    // Safari 等环境可能不支持 WebP 编码，回退 JPEG
    const blob = (await canvasToBlob(canvas, 'image/webp')) || (await canvasToBlob(canvas, 'image/jpeg'));
    if (!blob) throw new Error('头像编码失败');
    return blob;
  }

  async function uploadAvatar(file, token) {
    error.value = '';

    if (!file) throw new Error('请选择图片');
    if (!/^image\//.test(file.type || '')) throw new Error('请选择图片文件');
    if (file.size > MAX_INPUT_BYTES) throw new Error('图片不能超过 15MB');

    isUploading.value = true;
    try {
      const blob = await toAvatarBlob(file);
      const name = blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg';

      const formData = new FormData();
      formData.append('file', new File([blob], name, { type: blob.type }));

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '上传失败');
      if (!data.url) throw new Error('上传结果缺少地址');
      return data.url;
    } catch (err) {
      error.value = err.message || '头像上传失败';
      throw err;
    } finally {
      isUploading.value = false;
    }
  }

  return { uploadAvatar, isUploading, error };
}
