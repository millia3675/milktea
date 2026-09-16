import test from "node:test";
import assert from "node:assert/strict";
import { uploadFont } from "../src/media.js";

test("로컬 폰트의 MIME이 없거나 부정확해도 실제 multipart에는 검증한 폰트 형식을 보낸다", async t => {
  const original = globalThis.FontFace;
  // Parsing support is covered in the browser; this verifies the upload boundary.
  globalThis.FontFace = class { async load() { return this; } };
  t.after(() => { globalThis.FontFace = original; });
  for (const [extension, signature] of [["otf", "OTTO"], ["ttf", "\x00\x01\x00\x00"], ["woff", "wOFF"], ["woff2", "wOF2"]]) {
    for (const type of ["", "application/octet-stream", "application/x-font-opentype"]) {
      const bytes = new Uint8Array([...signature].map(c => c.charCodeAt(0)));
      const file = new File([bytes], `한글 이름.${extension.toUpperCase()}`, { type });
      const repo = { async upload(blob, options) {
        assert.equal(blob.type, `font/${extension}`);
        assert.equal(options.mime, blob.type);
        assert.equal(options.name, "한글 이름");
        assert.equal(options.shared, true);
        assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
        const form = new FormData(); form.append("", blob);
        const body = await new Request("https://example.invalid/upload", { method: "POST", body: form }).text();
        assert(body.includes(`Content-Type: font/${extension}\r\n`));
        return { id: "uploaded" };
      } };
      assert.equal((await uploadFont(repo, file, { shared: true })).id, "uploaded");
    }
  }
});
