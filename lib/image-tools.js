const IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ICON_MAX_BYTES = 2 * 1024 * 1024;
const ICON_TARGET_SIZE = 512;
const BANNER_MAX_BYTES = 2 * 1024 * 1024;
const BANNER_TARGET_WIDTH = 1024;
const BANNER_TARGET_HEIGHT = 432;

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

export function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽지 못했습니다.'));
    };
    img.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('이미지 변환 실패'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('이미지 변환 실패'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function clamp01(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

export async function normalizeBannerImage(file, crop = {}) {
  if (!file) throw new Error('배너 파일이 없습니다.');
  const mime = String(file.type || '').toLowerCase();
  if (!IMAGE_ALLOWED_MIME.includes(mime)) {
    throw new Error('배너 이미지는 JPG/PNG/WEBP 파일만 사용할 수 있습니다.');
  }
  if ((file.size || 0) > BANNER_MAX_BYTES) {
    throw new Error('배너 파일은 최대 2MB까지 가능합니다.');
  }
  const image = await loadImageElementFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_TARGET_WIDTH;
  canvas.height = BANNER_TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('배너 캔버스를 만들지 못했습니다.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const cropX = clamp01(crop?.x ?? crop?.cropX, 0.5);
  const cropY = clamp01(crop?.y ?? crop?.cropY, 0.5);
  const scale = Math.max(BANNER_TARGET_WIDTH / Math.max(1, image.naturalWidth), BANNER_TARGET_HEIGHT / Math.max(1, image.naturalHeight));
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const overflowX = Math.max(0, drawWidth - BANNER_TARGET_WIDTH);
  const overflowY = Math.max(0, drawHeight - BANNER_TARGET_HEIGHT);
  const dx = overflowX > 0 ? -overflowX * cropX : (BANNER_TARGET_WIDTH - drawWidth) / 2;
  const dy = overflowY > 0 ? -overflowY * cropY : (BANNER_TARGET_HEIGHT - drawHeight) / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

  const qualitySteps = [0.92, 0.86, 0.8, 0.74, 0.68, 0.6, 0.52];
  let lastBlob = null;
  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    lastBlob = blob;
    if ((blob.size || 0) <= BANNER_MAX_BYTES) {
      return {
        dataUrl: await blobToDataUrl(blob),
        width: BANNER_TARGET_WIDTH,
        height: BANNER_TARGET_HEIGHT,
        bytes: blob.size || 0
      };
    }
  }
  if (lastBlob && (lastBlob.size || 0) <= BANNER_MAX_BYTES) {
    return {
      dataUrl: await blobToDataUrl(lastBlob),
      width: BANNER_TARGET_WIDTH,
      height: BANNER_TARGET_HEIGHT,
      bytes: lastBlob.size || 0
    };
  }
  throw new Error(`배너 이미지는 자동 변환 후에도 최대 2MB 이하여야 합니다. 권장 크기: ${BANNER_TARGET_WIDTH}x${BANNER_TARGET_HEIGHT}px`);
}

export async function normalizeIconImage(file, crop = {}) {
  if (!file) throw new Error('아이콘 파일이 없습니다.');
  const mime = String(file.type || '').toLowerCase();
  if (!IMAGE_ALLOWED_MIME.includes(mime)) {
    throw new Error('아이콘 이미지는 JPG/PNG/WEBP 파일만 사용할 수 있습니다.');
  }
  if ((file.size || 0) > ICON_MAX_BYTES) {
    throw new Error('아이콘 파일은 최대 2MB까지 가능합니다.');
  }
  const image = await loadImageElementFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_TARGET_SIZE;
  canvas.height = ICON_TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('아이콘 캔버스를 만들지 못했습니다.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const cropX = clamp01(crop?.x ?? crop?.cropX, 0.5);
  const cropY = clamp01(crop?.y ?? crop?.cropY, 0.5);
  const zoom = Math.max(1, Number(crop?.zoom || 1));
  const scale = Math.max(ICON_TARGET_SIZE / Math.max(1, image.naturalWidth), ICON_TARGET_SIZE / Math.max(1, image.naturalHeight)) * zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const overflowX = Math.max(0, drawWidth - ICON_TARGET_SIZE);
  const overflowY = Math.max(0, drawHeight - ICON_TARGET_SIZE);
  const dx = overflowX > 0 ? -overflowX * cropX : (ICON_TARGET_SIZE - drawWidth) / 2;
  const dy = overflowY > 0 ? -overflowY * cropY : (ICON_TARGET_SIZE - drawHeight) / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  const qualitySteps = [0.92, 0.86, 0.8, 0.74];
  let lastBlob = null;
  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    lastBlob = blob;
    if ((blob.size || 0) <= ICON_MAX_BYTES) {
      return {
        dataUrl: await blobToDataUrl(blob),
        width: ICON_TARGET_SIZE,
        height: ICON_TARGET_SIZE,
        bytes: blob.size || 0
      };
    }
  }
  if (lastBlob && (lastBlob.size || 0) <= ICON_MAX_BYTES) {
    return {
      dataUrl: await blobToDataUrl(lastBlob),
      width: ICON_TARGET_SIZE,
      height: ICON_TARGET_SIZE,
      bytes: lastBlob.size || 0
    };
  }
  throw new Error(`아이콘 이미지는 자동 변환 후에도 최대 2MB 이하여야 합니다. 권장 크기: ${ICON_TARGET_SIZE}x${ICON_TARGET_SIZE}px`);
}

export function loadImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const out = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 크기를 읽지 못했습니다.'));
    };
    img.src = url;
  });
}

export async function validateIconFile(file) {
  if (!file) return '';
  if (!IMAGE_ALLOWED_MIME.includes(String(file.type || '').toLowerCase())) {
    return 'JPG/PNG/WEBP 파일만 사용할 수 있습니다.';
  }
  if ((file.size || 0) > ICON_MAX_BYTES) {
    return '아이콘 파일은 최대 2MB까지 가능합니다.';
  }
  return '';
}
