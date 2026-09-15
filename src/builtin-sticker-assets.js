import catalog from "./ttussicon-stickers.json";
import { uploadImage } from "./media.js";
import { userError } from "./ui.js";

export const ttussiconStickers = catalog;
export const stickerURL = (sticker) =>
  new URL(sticker.file, document.baseURI).href;
const pending = new WeakMap();

// Use the same private media storage and diary references as uploaded stickers.
export async function builtinStickerAsset(ctx, id) {
  const sticker = catalog.find((item) => item.id === id);
  if (!sticker) throw userError("스티커를 찾을 수 없어요.");
  const name = `기본 뚜씨티콘 · ${sticker.name}`;
  const existing = ctx.state.assets.find(
    (asset) =>
      asset.owner_id === ctx.me.id &&
      asset.kind === "sticker" &&
      !asset.archived &&
      asset.name === name,
  );
  if (existing) return existing;
  let requests = pending.get(ctx.repo);
  if (!requests) {
    requests = new Map();
    pending.set(ctx.repo, requests);
  }
  if (requests.has(id)) return requests.get(id);
  const request = (async () => {
    const response = await fetch(stickerURL(sticker));
    if (!response.ok)
      throw userError("스티커를 불러오지 못했어요. 다시 선택해주세요.");
    const file = new File([await response.blob()], name, { type: "image/png" });
    const asset = await uploadImage(ctx.repo, file, "sticker");
    ctx.state.assets.push(asset);
    return asset;
  })();
  requests.set(id, request);
  try {
    return await request;
  } finally {
    requests.delete(id);
  }
}
