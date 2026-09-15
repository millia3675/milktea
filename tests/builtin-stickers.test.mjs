import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("요청한 뚜씨티콘 37개의 원본 바이트와 PNG 크기를 확인한다", async () => {
  const catalog = JSON.parse(
    await readFile(
      new URL("../src/ttussicon-stickers.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(catalog.length, 37);
  assert.equal(new Set(catalog.map((s) => s.id)).size, 37);
  assert.equal(catalog[0].sourceFilename, "#고마해라.png");
  assert.equal(catalog.at(-1).sourceFilename, "re_힘들다.png");
  for (const sticker of catalog) {
    const data = await readFile(
      new URL("../public/" + sticker.file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      sticker.sha256,
      sticker.sourceFilename,
    );
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(data.readUInt32BE(16), sticker.width);
    assert.equal(data.readUInt32BE(20), sticker.height);
    assert.match(sticker.file, /^stickers\/ttussicon\/\d{2}\.png$/);
  }
});
