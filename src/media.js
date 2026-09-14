import { userError, uuid } from "./ui.js";
const mimeByExt = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};
export function pickFiles(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    document.body.append(input);
    let done = false;
    const finish = (files) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish([...input.files]), {
      once: true,
    });
    input.addEventListener("cancel", () => finish([]), { once: true });
    input.click();
  });
}
export async function imageBlob(file, kind, { x = 0.5, y = 0.5 } = {}) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw userError("JPG, PNG, WebP 사진을 선택해주세요.");
  if (file.size > 20 * 1024 * 1024)
    throw userError("원본 사진은 20MB 이하로 선택해주세요.");
  if (kind === "sticker" && !["image/png", "image/webp"].includes(file.type))
    throw userError("스티커는 PNG 또는 WebP 파일로 골라주세요.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw userError("이미지를 읽을 수 없어요. 다른 파일을 선택해주세요.");
  }
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw userError("사진 해상도가 너무 커요. 크기를 줄인 뒤 선택해주세요.");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (kind === "avatar") {
      canvas.width = canvas.height = 512;
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) * x,
        (bitmap.height - side) * y,
        side,
        side,
        0,
        0,
        512,
        512,
      );
    } else {
      const max = kind === "sticker" ? 1024 : 1920;
      const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    if (!blob) throw userError("사진을 준비하지 못했어요. 다시 시도해주세요.");
    const limit =
      kind === "avatar" ? 1048576 : kind === "sticker" ? 2097152 : 8388608;
    if (blob.size > limit)
      throw userError("사진 용량이 커요. 더 작은 파일을 선택해주세요.");
    return blob;
  } finally {
    bitmap.close();
  }
}
export async function uploadImage(repo, file, kind, options) {
  const blob = await imageBlob(file, kind, options);
  return repo.upload(blob, {
    kind,
    name: file.name,
    mime: "image/webp",
    extension: "webp",
  });
}
export async function uploadFont(repo, file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!mimeByExt[ext])
    throw userError("WOFF2, WOFF, TTF, OTF 폰트를 선택해주세요.");
  if (file.size > 10485760) throw userError("폰트는 10MB 이하로 올려주세요.");
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const magic = String.fromCharCode(...bytes);
  if (
    !(
      { woff: "wOFF", woff2: "wOF2", otf: "OTTO" }[ext] === magic ||
      (ext === "ttf" &&
        ((bytes[0] === 0 &&
          bytes[1] === 1 &&
          bytes[2] === 0 &&
          bytes[3] === 0) ||
          magic === "true"))
    )
  )
    throw userError("폰트 파일 형식이 올바르지 않아요.");
  const face = new FontFace(`check-${uuid()}`, await file.arrayBuffer());
  try {
    await face.load();
  } catch {
    throw userError("불러올 수 없는 폰트예요. 다른 파일을 선택해주세요.");
  }
  return repo.upload(file, {
    kind: "font",
    name: file.name.replace(/\.[^.]+$/, ""),
    mime: mimeByExt[ext],
    extension: ext,
  });
}
export async function emojiSticker(repo, emoji) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext("2d");
  ctx.font = '144px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 96, 104);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  return repo.upload(blob, {
    kind: "sticker",
    name: `기본 ${emoji}`,
    extension: "png",
    mime: "image/png",
  });
}
const fonts = new Map();
export async function fontFamily(repo, id) {
  if (!id) return "";
  if (fonts.has(id)) return fonts.get(id);
  const url = await repo.assetURL(id);
  if (!url) return "";
  const name = `milk-${id.replaceAll("-", "")}`;
  const face = new FontFace(name, `url("${url}")`);
  await face.load();
  document.fonts.add(face);
  fonts.set(id, name);
  return name;
}
