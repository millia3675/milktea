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

export function fitPaper(viewport, paper, layout, { signal, measure } = {}) {
  paper.classList.add("fixed-paper");
  paper.style.width = `${layout.width}px`;
  let active = true;
  const refresh = () => {
    if (!active || !paper.isConnected) return;
    measure?.();
    paper.style.minHeight = `${layout.height}px`;
    const scale = Math.min(1, viewport.clientWidth / layout.width);
    paper.style.transform = `scale(${scale})`;
    paper.style.setProperty("--paper-scale", scale);
    viewport.style.height = `${paper.offsetHeight * scale}px`;
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(viewport);
  observer.observe(paper);
  const destroy = () => { active = false; observer.disconnect(); };
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
    if (viewport) fitPaper(viewport, viewport.querySelector(".paper"), layout, { signal });
  }
}
