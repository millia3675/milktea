const cache = new WeakMap();

export function alphaBounds(pixels, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!pixels[(y * width + x) * 4 + 3]) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  // One sample of padding protects antialiased edges, including downsampled images.
  return right < 0 ? null : {
    left: Math.max(0, left - 1) / width, top: Math.max(0, top - 1) / height,
    right: Math.min(width, right + 2) / width, bottom: Math.min(height, bottom + 2) / height,
  };
}

export function transformVisibleBounds(bounds, width, height, matrix, center, paperScale) {
  const corners = [
    [bounds.left, bounds.top], [bounds.right, bounds.top],
    [bounds.left, bounds.bottom], [bounds.right, bounds.bottom],
  ].map(([x, y]) => {
    const dx = (x - .5) * width, dy = (y - .5) * height;
    return { x: center.x + (matrix.a * dx + matrix.c * dy) * paperScale,
      y: center.y + (matrix.b * dx + matrix.d * dy) * paperScale };
  });
  const left = Math.min(...corners.map(p => p.x)), right = Math.max(...corners.map(p => p.x));
  const top = Math.min(...corners.map(p => p.y)), bottom = Math.max(...corners.map(p => p.y));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function visibleStickerRect(node, paperScale) {
  const full = node.getBoundingClientRect(), img = node.querySelector("img");
  if (!img?.complete || !img.naturalWidth || !img.naturalHeight) return full;
  let item = cache.get(img);
  if (!item || item.src !== img.src) {
    try {
      const ratio = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(img.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.ceil(img.naturalHeight * ratio));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      item = { src: img.src, bounds: alphaBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height) };
    } catch {
      // If pixels cannot be inspected, preserve the full sticker instead of clipping it.
      item = { src: img.src, bounds: { left: 0, top: 0, right: 1, bottom: 1 } };
    }
    cache.set(img, item);
  }
  const center = { x: (full.left + full.right) / 2, y: (full.top + full.bottom) / 2 };
  if (!item.bounds) return { left: center.x, right: center.x, top: center.y, bottom: center.y, width: 0, height: 0 };
  const style = getComputedStyle(node);
  return transformVisibleBounds(item.bounds, parseFloat(style.width), parseFloat(style.height),
    new DOMMatrixReadOnly(style.transform), center, paperScale);
}
