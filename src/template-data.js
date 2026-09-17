import { paperLayout } from "./paper-layout.js";
// Never copy diary text, photographs, music, habits, or questions into a template.
export function decorationSnapshot(document) {
  const decoration = {
    version: 1, paper: document.paper, font: document.font,
    background_asset_id: document.background_asset_id || null,
    font_asset_id: document.font_asset_id || null,
    stickers: document.stickers.map(({ id, asset_id, x, y, scale, rotation, z }) =>
      ({ id, asset_id, x, y, scale, rotation, z })),
  };
  const layout = paperLayout(document);
  if (layout) decoration.layout = { version: 1, width: layout.width, height: layout.height };
  return decoration;
}
export function applyDecoration(document, decoration, makeID = () => crypto.randomUUID()) {
  const next = { ...document, ...decorationSnapshot(decoration) };
  next.stickers = next.stickers.map(s => ({ ...s, id: makeID() }));
  if (next.layout) next.layout.blocks = {};
  return next;
}
