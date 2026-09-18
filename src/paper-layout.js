import { visibleStickerRect } from "./sticker-visible-bounds.js";

// A saved sheet has one coordinate space. Resizing only scales its presentation.
export function paperLayout(document) {
  const layout = document.layout;
  return layout?.version === 1 && Number.isFinite(layout.width) &&
    layout.width >= 240 && layout.width <= 1200 &&
    Number.isFinite(layout.height) && layout.height >= 100 && layout.height <= 200000
    ? layout : null;
}

export function stickerStyle(sticker, layout) {
  const left = layout ? `${sticker.x * layout.width}px` : `${sticker.x * 100}%`;
  const top = layout ? `${sticker.y * layout.height}px` : `${sticker.y * 100}%`;
  return `left:${left};top:${top};transform:translate(-50%,-50%) rotate(${Number(sticker.rotation)}deg) scale(${Number(sticker.scale)});z-index:${Number(sticker.z)};--sticker-inverse-scale:${1 / sticker.scale}`;
}

export function growPaper(document, height) {
  const layout = paperLayout(document);
  if (!layout || height <= layout.height) return;
  const nextHeight = Math.min(200000, height);
  for (const sticker of document.stickers)
    sticker.y = (sticker.y * layout.height) / nextHeight;
  layout.height = nextHeight;
}

export function blockHeight(layout, id) {
  const value = layout?.blocks?.[id];
  return Number.isFinite(value) && value >= 0 && value <= 200000 ? value : 0;
}

// Presentation-only cropping and spacing. The saved sheet and sticker coordinates
// stay untouched; all readers apply the same adjustments before viewport scaling.
const photoStyles = new WeakMap();
const blockStyles = new WeakMap();
const paragraphStyles = new WeakMap();
const stickerTops = new WeakMap();
const ceilPixel = value => Math.ceil(value - 0.001);

export function readingGaps(blocks, stickers) {
  return blocks.map(({ top, bottom, contentBottom }) => {
    let start = Math.min(bottom, Math.max(top, contentBottom));
    // A sticker may occupy editor whitespace. Only remove space below its full
    // rotated bounds, never a band through the sticker itself.
    for (const sticker of stickers) {
      if (sticker.top < bottom && sticker.bottom > start)
        start = Math.min(bottom, Math.max(start, sticker.bottom + 8));
    }
    start = Math.min(bottom, top + ceilPixel(start - top));
    return { start, end: bottom, height: bottom - start };
  });
}

function compactReadingBlocks(paper, origin, scale, stickers) {
  const bounds = node => {
    const rect = node.getBoundingClientRect();
    return { top: (rect.top - origin.top) / scale, bottom: (rect.bottom - origin.top) / scale };
  };
  const blocks = [...paper.querySelectorAll(".fixed-block")].map(node => ({ node, ...bounds(node) }));
  // Hold every original block in place while measuring its content without the
  // textarea's empty writing area. This also excludes toolbars and caption inputs.
  for (const block of blocks) {
    block.node.style.minHeight = `${block.bottom - block.top}px`;
    const paragraph = block.node.querySelector(":scope > p");
    if (paragraph?.textContent.trim()) {
      paragraph.style.minHeight = "0";
      paragraph.style.paddingBottom = "10px";
    }
  }
  const gaps = readingGaps(blocks.map(block => ({
    ...block,
    contentBottom: Math.max(block.top, ...[...block.node.children].map(node => bounds(node).bottom)),
  })), stickers.filter(({ rect }) => rect.width && rect.height).map(({ rect }) => ({
    top: (rect.top - origin.top) / scale, bottom: (rect.bottom - origin.top) / scale,
  })));
  blocks.forEach((block, i) => {
    block.node.style.minHeight = `${block.bottom - block.top - gaps[i].height}px`;
  });
  for (const { node, rect } of stickers) {
    const top = (rect.top - origin.top) / scale;
    const shift = gaps.reduce((sum, gap) => sum + (gap.end <= top + 0.001 ? gap.height : 0), 0);
    node.style.top = `${parseFloat(stickerTops.get(node)) - shift}px`;
  }
}

export function readingBounds(paper, layout) {
  const images = [...paper.querySelectorAll("img[data-asset]")];
  if (images.some(img => !img.getAttribute("src") || !img.complete))
    return { width: layout.width, height: paper.offsetHeight };
  const photos = [...paper.querySelectorAll(".entry-photo")];
  // Always re-measure the original sheet so resizing or delayed font/image loads
  // cannot compound an earlier spacing adjustment.
  for (const photo of photos) {
    if (!photoStyles.has(photo)) photoStyles.set(photo, photo.style.width);
    photo.style.width = photoStyles.get(photo);
  }
  for (const block of paper.querySelectorAll(".fixed-block")) {
    if (!blockStyles.has(block)) blockStyles.set(block, block.style.minHeight);
    block.style.minHeight = blockStyles.get(block);
    const paragraph = block.querySelector(":scope > p");
    if (paragraph) {
      if (!paragraphStyles.has(paragraph)) paragraphStyles.set(paragraph, {
        minHeight: paragraph.style.minHeight, paddingBottom: paragraph.style.paddingBottom,
      });
      Object.assign(paragraph.style, paragraphStyles.get(paragraph));
    }
  }
  const stickerNodes = [...paper.querySelectorAll(".placed-sticker")];
  for (const node of stickerNodes) {
    if (!stickerTops.has(node)) stickerTops.set(node, node.style.top);
    node.style.top = stickerTops.get(node);
  }
  const full = { width: layout.width, height: paper.offsetHeight };
  const origin = paper.getBoundingClientRect();
  const scale = origin.width / layout.width;
  if (!scale) return full;
  let right = 0, bottom = 0;
  const include = rect => {
    if (!rect.width || !rect.height) return;
    right = Math.max(right, (rect.right - origin.left) / scale);
    bottom = Math.max(bottom, (rect.bottom - origin.top) / scale);
  };
  let hasBodyText = false;
  for (const text of paper.querySelectorAll(".blocks p, .photo-caption")) {
    if (!text.textContent.trim()) continue;
    hasBodyText ||= text.matches(".blocks p");
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) include(rect);
  }
  const stickers = stickerNodes.map(node => ({ node, rect: visibleStickerRect(node, scale) }));
  for (const { rect } of stickers) include(rect);
  const photoWidth = Math.min(layout.width, Math.max(220, ceilPixel(right)));
  const photoFrames = photos.map(photo => ({
    photo, rect: photo.getBoundingClientRect(), block: photo.closest(".fixed-block"),
  }));
  // Full-width photo buttons used to force the whole diary (including short text)
  // to shrink. Fit undecorated photos to the visible writing; never resize a photo
  // under a sticker, and leave photo-only diaries at their original width.
  if (hasBodyText || stickers.length) {
    for (const { photo, rect, block } of photoFrames) {
      const decorated = stickers.some(({ rect: s }) =>
        s.left < rect.right && s.right > rect.left && s.top < rect.bottom && s.bottom > rect.top);
      if (decorated || photoWidth >= rect.width / scale) continue;
      if (block) block.style.minHeight = `${block.offsetHeight}px`;
      photo.style.width = `${photoWidth}px`;
    }
  }
  compactReadingBlocks(paper, origin, scale, stickers);
  right = 0; bottom = 0;
  for (const text of paper.querySelectorAll(".blocks p, .photo-caption")) {
    if (!text.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) include(rect);
  }
  for (const node of stickerNodes) include(visibleStickerRect(node, scale));
  for (const photo of photos) include(photo.getBoundingClientRect());
  if (!right || !bottom) return full;
  return {
    width: Math.min(full.width, Math.max(240, ceilPixel(right + 20))),
    height: Math.min(full.height, Math.max(100, ceilPixel(bottom + 20))),
  };
}

export function fitPaper(viewport, paper, layout, { signal, measure, crop = false } = {}) {
  paper.classList.add("fixed-paper");
  paper.style.width = `${layout.width}px`;
  let active = true, scheduled = 0;
  const refresh = () => {
    if (!active || !paper.isConnected) return;
    measure?.();
    paper.style.minHeight = `${layout.height}px`;
    const bounds = crop ? readingBounds(paper, layout) : { width: layout.width, height: paper.offsetHeight };
    const scale = Math.min(1, viewport.clientWidth / bounds.width);
    paper.style.transform = `scale(${scale})`;
    paper.style.setProperty("--paper-scale", scale);
    viewport.style.height = `${bounds.height * scale}px`;
    if (crop) {
      // Clip the blank right edge even when the sheet fits without scaling.
      paper.style.clipPath = `inset(0 ${Math.max(0, layout.width - bounds.width)}px ${Math.max(0, paper.offsetHeight - bounds.height)}px 0 round 8px)`;
      viewport.dataset.readingWidth = bounds.width;
      viewport.dataset.readingHeight = bounds.height;
    }
  };
  const schedule = () => {
    if (!active || scheduled) return;
    scheduled = requestAnimationFrame(() => { scheduled = 0; refresh(); });
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(viewport);
  observer.observe(paper);
  if (crop) {
    paper.addEventListener("load", schedule, true);
    paper.addEventListener("error", schedule, true);
    paper.addEventListener("papercontentchange", schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    document.fonts?.ready.then(schedule);
  }
  const destroy = () => {
    active = false;
    observer.disconnect();
    cancelAnimationFrame(scheduled);
    paper.removeEventListener("load", schedule, true);
    paper.removeEventListener("error", schedule, true);
    paper.removeEventListener("papercontentchange", schedule);
    document.fonts?.removeEventListener("loadingdone", schedule);
  };
  signal?.addEventListener("abort", destroy, { once: true });
  refresh();
  return { refresh, destroy };
}

export function bindFixedPapers(root, entries, signal) {
  for (const entry of entries) {
    const layout = paperLayout(entry.document);
    if (!layout) continue;
    const card = root.querySelector(`[data-entry-card="${entry.id}"]`);
    const viewport = card?.querySelector(".paper-viewport");
    if (viewport) fitPaper(viewport, viewport.querySelector(".paper"), layout, { signal, crop: true });
  }
}
