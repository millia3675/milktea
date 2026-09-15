const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Place inside the visible portion of the paper; an offscreen paper uses its nearest edge.
export function stickerInsertionPosition(paper, viewport) {
  if (paper.width <= 0 || paper.height <= 0) return { x: 0.5, y: 0.5 };
  const center = (start, length, viewStart, viewEnd) => {
    const end = start + length;
    const visibleStart = Math.max(start, viewStart);
    const visibleEnd = Math.min(end, viewEnd);
    const margin = Math.min(64, length / 2);
    const desired =
      visibleEnd > visibleStart
        ? (visibleStart + visibleEnd) / 2
        : end <= viewStart
          ? end - margin
          : start + margin;
    return (clamp(desired, start + margin, end - margin) - start) / length;
  };
  return {
    x: center(paper.left, paper.width, viewport.left, viewport.right),
    y: center(paper.top, paper.height, viewport.top, viewport.bottom),
  };
}

// Keep existing diary attachments readable, but remove retired defaults from all pickers.
const retiredNames = new Set(
  ["🌙", "⭐", "🐱", "🍰", "🍀", "💛", "🌷", "🧸", "🍓", "☕", "🎀", "☁️"].map(
    (emoji) => `기본 ${emoji}`,
  ),
);
export const isRetiredSticker = (asset) =>
  asset.kind === "sticker" && retiredNames.has(asset.name);
