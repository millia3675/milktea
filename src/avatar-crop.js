const bounded = (value, fallback, min, max) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));

export function avatarCrop(width, height, { x = 0.5, y = 0.5, zoom = 1 } = {}) {
  const size = Math.min(width, height) / bounded(zoom, 1, 1, 4);
  return {
    x: (width - size) * bounded(x, 0.5, 0, 1),
    y: (height - size) * bounded(y, 0.5, 0, 1),
    size,
  };
}

export function drawAvatar(canvas, bitmap, options) {
  const crop = avatarCrop(bitmap.width, bitmap.height, options);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size,
    0, 0, canvas.width, canvas.height);
}
