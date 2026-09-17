import { isRetiredSticker } from "./sticker-placement.js";
import { e, icon, modal, busy, toast, errorText, confirmAction } from "./ui.js";
import { pickFiles, uploadImage, uploadFont } from "./media.js";
import { hydrateAssets } from "./articles.js";
import {
  ttussiconStickers,
  stickerURL,
  builtinStickerAsset,
} from "./builtin-sticker-assets.js";

export const builtinFonts = [
  {
    id: "system",
    name: "프리텐다드",
    note: "또렷하고 편안한 기본 글씨",
    source: "https://noonnu.cc/font_page/694",
  },
  {
    id: "sans",
    name: "수트",
    note: "간결하고 가지런한 고딕",
    source: "https://noonnu.cc/font_page/845",
  },
  {
    id: "handwriting",
    name: "고운돋움",
    note: "부드럽고 정다운 글씨",
    source: "https://noonnu.cc/font_page/734",
  },
  {
    id: "maruburi",
    name: "마루 부리",
    note: "차분하게 읽히는 책 속 글씨",
    source: "https://noonnu.cc/font_page/487",
  },
];
export const builtinPapers = [
  ["white", "하얀 종이"],
  ["lined", "줄노트"],
  ["grid", "모눈종이"],
  ["cream", "크림색"],
  ["dots", "도트 노트"],
  ["rose", "장밋빛"],
  ["lavender", "라벤더"],
  ["gingham", "민트 체크"],
];

const labels = { font: "폰트", sticker: "스티커", background: "배경" };
const limits = {
  font: "WOFF2 · WOFF · TTF · OTF, 파일당 최대 10MB",
  sticker: "PNG · WebP, 변환 후 파일당 최대 2MB",
  background: "JPG · PNG · WebP, 변환 후 파일당 최대 8MB",
};

export function fontOptions(assets, selected = "system", selectedAsset = null) {
  return `<optgroup label="밀크티 기본 폰트">${builtinFonts.map((f) => `<option value="${f.id}" ${!selectedAsset && selected === f.id ? "selected" : ""}>${f.name}</option>`).join("")}</optgroup><optgroup label="등록한 폰트 · 공유 폰트">${assets
    .filter((a) => a.kind === "font" && (!a.archived || a.id === selectedAsset))
    .map(
      (a) =>
        `<option value="asset:${e(a.id)}" ${a.id === selectedAsset ? "selected" : ""}>${e(a.name)}${a.is_shared ? " · 공유" : ""}</option>`,
    )
    .join(
      "",
    )}${selectedAsset && !assets.some((a) => a.id === selectedAsset) ? `<option value="asset:${e(selectedAsset)}" selected>사용 중인 폰트</option>` : ""}</optgroup>`;
}

export async function registerDecorations(ctx, kind) {
  const files = await pickFiles(
    kind === "font"
      ? ".woff2,.woff,.ttf,.otf"
      : kind === "sticker"
        ? "image/png,image/webp"
        : "image/jpeg,image/png,image/webp",
    true,
  );
  if (!files.length) return [];
  return new Promise((resolve) => {
    const items = files.map((file) => ({ file, state: "대기", asset: null }));
    let uploading = false;
    const d = modal(
      `<h2>${labels[kind]} 여러 개 등록</h2><p class="muted small">${limits[kind]}</p><div class="upload-file-list" id="upload-files"></div><label class="share-choice"><input type="checkbox" id="share-assets"><span><strong>다함께 사용하기</strong><small>체크하면 밀크티에 초대된 모든 친구의 공유 자료에 올라가요.</small></span></label><p class="field-help">사용·공유할 권리가 있는 파일을 등록해주세요.${kind === "font" ? " 폰트 공유에는 재배포가 허용된 파일을 사용해주세요." : ""}</p>${ctx.repo.mode === "demo" ? '<p class="inline-notice small">체험 중에는 이 브라우저에 저장돼요. 친구들과의 실제 공유는 계정 연결 후 사용할 수 있어요.</p>' : ""}<p id="upload-progress" role="status" aria-live="polite"></p><div class="dialog-actions"><button class="button secondary" id="upload-done">취소</button><button class="button" id="upload-start">등록하기</button></div>`,
    );
    const close = HTMLDialogElement.prototype.close.bind(d);
    d.close = (...args) => {
      if (!uploading) close(...args);
    };
    d.addEventListener("cancel", (event) => {
      if (uploading) event.preventDefault();
    });
    const draw = () => {
      d.querySelector("#upload-files").innerHTML = items
        .map(
          (x, i) =>
            `<div class="upload-file-row"><span title="${e(x.file.name)}">${e(x.file.name)}<small>${(x.file.size / 1048576).toFixed(2)} MB</small></span><span class="upload-file-state ${x.asset ? "success" : ""}">${e(x.state)}</span>${!uploading && !x.asset ? `<button class="icon-button" data-remove-file="${i}" aria-label="${e(x.file.name)} 제외">${icon("close")}</button>` : ""}</div>`,
        )
        .join("");
      d.querySelectorAll("[data-remove-file]").forEach(
        (b) =>
          (b.onclick = () => {
            items.splice(Number(b.dataset.removeFile), 1);
            draw();
          }),
      );
      d.querySelector("#upload-start").disabled =
        uploading || items.every((x) => x.asset);
    };
    d.querySelector("#upload-done").onclick = () => d.close();
    d.querySelector("#upload-start").onclick = async () => {
      const shared = d.querySelector("#share-assets").checked;
      uploading = true;
      d.querySelector("#share-assets").disabled = true;
      d.querySelector("#upload-done").disabled = true;
      d.querySelector(".modal-close").disabled = true;
      const guard = (event) => {
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", guard);
      try {
        for (const item of items.filter((x) => !x.asset)) {
          item.state = "등록 중…";
          draw();
          try {
            item.asset =
              kind === "font"
                ? await uploadFont(ctx.repo, item.file, { shared })
                : await uploadImage(ctx.repo, item.file, kind, { shared });
            item.state = "등록 완료";
          } catch (error) {
            item.state = errorText(error);
          }
          draw();
        }
      } finally {
        uploading = false;
        window.removeEventListener("beforeunload", guard);
        d.querySelector("#upload-done").disabled = false;
        d.querySelector(".modal-close").disabled = false;
        const done = items.filter((x) => x.asset).length;
        d.querySelector("#upload-progress").textContent =
          `${items.length}개 중 ${done}개 등록 완료${done < items.length ? " · 실패한 파일만 다시 시도할 수 있어요." : ""}`;
        d.querySelector("#upload-done").textContent = "완료";
        d.querySelector("#upload-start").textContent = "실패한 파일 다시 시도";
        draw();
        if (done === items.length) {
          toast(
            `${done}개를 ${shared ? "다함께 사용할 자료로" : "내 자료에"} 등록했어요.`,
          );
          d.close();
        }
      }
    };
    d.addEventListener(
      "close",
      () => {
        delete d.close;
        resolve(items.filter((x) => x.asset).map((x) => x.asset));
      },
      { once: true },
    );
    draw();
  });
}

function builtinHTML(kind, picking) {
  if (kind === "font")
    return `<div class="font-catalog">${builtinFonts.map((f) => `<div class="font-preview-card">${picking ? `<button class="font-pick" data-pick-builtin="${f.id}" aria-label="${f.name} 적용">` : ""}<div class="font-${f.id} font-sample">오늘도, 나다운 하루를 기록해요.</div>${picking ? "</button>" : ""}<div class="font-card-meta"><strong>${f.name}</strong><a href="${f.source}" target="_blank" rel="noopener noreferrer">눈누 ↗</a></div><span class="field-help">${f.note}</span></div>`).join("")}</div><p class="field-help">무료 폰트 4종을 기본으로 제공해요. <a href="./fonts/credits.html" target="_blank" rel="noopener">제작자와 이용 조건</a></p>`;
  if (kind === "background")
    return `<div class="asset-grid builtin-grid">${builtinPapers.map(([id, name]) => `<${picking ? "button" : "div"} class="asset-tile ${picking ? "asset-pick" : ""}" ${picking ? `data-pick-builtin="${id}"` : ""}><div class="paper ${id} paper-swatch"></div><span>${name}</span></${picking ? "button" : "div"}>`).join("")}</div>`;
  return `<h3 class="sticker-pack-heading">뚜씨티콘 <span>${ttussiconStickers.length}종</span></h3><div class="asset-grid builtin-grid ttussicon-grid">${ttussiconStickers.map((sticker) => `<${picking ? "button" : "div"} class="asset-tile ${picking ? "asset-pick" : ""}" ${picking ? `data-pick-builtin="${sticker.id}" aria-label="뚜씨티콘 ${e(sticker.name)} 붙이기"` : ""}><img src="${e(stickerURL(sticker))}" alt="${e(sticker.name)}" loading="lazy" width="${sticker.width}" height="${sticker.height}"><span>${e(sticker.name)}</span></${picking ? "button" : "div"}>`).join("")}</div>`;
}

export async function mountLibrary(root, ctx, kind, onPick) {
  let category = "builtin", selectedPack = null;
  const packs = kind === "sticker" ? await ctx.repo.stickerPacks() : [];
  if (ctx.signal.aborted) return;
  const categories = [["builtin", "밀크티 기본"], ["mine", `내 ${labels[kind]}`], ["shared", "다함께 쓰는 자료"], ...(kind === "sticker" ? [["packs", "꾸러미"]] : [])];
  function packHTML() {
    const available = new Set(ctx.state.assets.filter(a => a.kind === "sticker" && a.is_shared && !a.archived && !isRetiredSticker(a)).map(a => a.id));
    const visible = packs.map(p => ({ ...p, asset_ids: p.asset_ids.filter(id => available.has(id)) })).filter(p => p.asset_ids.length);
    return visible.length ? `<div class="pack-list">${visible.map(p => `<button class="pack-cover" data-open-pack="${e(p.id)}"><span class="pack-cover-image"><img data-asset="${e(p.asset_ids.includes(p.cover_asset_id) ? p.cover_asset_id : p.asset_ids[0])}" alt="" hidden></span><strong>${e(p.name)}</strong><small>스티커 ${p.asset_ids.length}개</small></button>`).join("")}</div>` : '<p class="asset-empty">아직 꾸러미가 없어요. 운영자가 공유 스티커를 묶으면 여기에 보여요.</p>';
  }
  const draw = () => {
    const assets = ctx.state.assets.filter(
      (a) =>
        a.kind === kind &&
        !a.archived &&
        !isRetiredSticker(a) &&
        (category === "packs" ? selectedPack?.asset_ids.includes(a.id) && a.is_shared : category === "mine" ? a.owner_id === ctx.me.id : a.is_shared),
    );
    root.innerHTML = `<div class="library-heading"><div><h2>${labels[kind]}</h2><p class="field-help">${kind === "font" ? "읽기 좋은 글씨로 나만의 분위기를 더해요." : "기본 자료부터 친구들이 나눈 취향까지."}</p></div><button class="button secondary" data-upload-kind="${kind}">${icon("plus")} 여러 개 등록</button></div><div class="library-tabs" role="tablist" aria-label="${labels[kind]} 자료 분류">${categories
      .map(
        ([id, name]) =>
          `<button role="tab" id="${kind}-tab-${id}" aria-controls="${kind}-panel" aria-selected="${category === id}" tabindex="${category === id ? 0 : -1}" data-category="${id}">${name}</button>`,
      )
      .join(
        "",
      )}</div><div role="tabpanel" id="${kind}-panel" aria-labelledby="${kind}-tab-${category}">${category === "packs" && selectedPack ? `<div class="library-heading"><h3>${e(selectedPack.name)}</h3><button class="text-button" data-pack-back>꾸러미 목록</button></div>` : ""}${category === "builtin" ? builtinHTML(kind, !!onPick) : category === "packs" && !selectedPack ? packHTML() : assets.length ? `<div class="asset-grid">${assets.map((a) => `<div class="asset-tile">${onPick ? `<button class="asset-select" data-pick-asset="${e(a.id)}">` : ""}${kind === "font" ? `<div class="font-file" data-font="${e(a.id)}">오늘의 기록</div>` : `<img data-asset="${e(a.id)}" alt="${e(a.name)}" hidden>`}<span title="${e(a.name)}">${e(a.name)}</span>${onPick ? "</button>" : ""}<small>${a.is_shared ? "다함께 사용" : "나만 사용"}</small>${!onPick && a.owner_id === ctx.me.id ? `<button class="icon-button" data-archive-asset="${e(a.id)}" aria-label="${e(a.name)} 라이브러리에서 숨기기">${icon("close")}</button>` : ""}</div>`).join("")}</div>` : `<div class="asset-empty">${category === "mine" ? "아직 등록한 자료가 없어요. 여러 파일을 한 번에 추가해보세요." : "친구들과 함께 쓸 첫 자료를 등록해보세요."}</div>`}</div>`;
    root.querySelectorAll("[data-open-pack]").forEach(b => b.onclick = () => { selectedPack = packs.find(p => p.id === b.dataset.openPack); draw(); root.querySelector("[data-pack-back]")?.focus(); });
    root.querySelector("[data-pack-back]")?.addEventListener("click", () => { const id = selectedPack.id; selectedPack = null; draw(); root.querySelector(`[data-open-pack="${id}"]`)?.focus(); });
    const tabs = [...root.querySelectorAll("[data-category]")];
    tabs.forEach((btn, index) => {
      btn.onclick = () => {
        category = btn.dataset.category;
        selectedPack = null;
        draw();
        root.querySelector(`[data-category="${category}"]`).focus();
      };
      btn.onkeydown = (event) => {
        const next =
          event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index + tabs.length - 1) % tabs.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : null;
        if (next !== null) {
          event.preventDefault();
          tabs[next].click();
        }
      };
    });
    root.querySelector("[data-upload-kind]").onclick = (event) =>
      busy(event.currentTarget, async () => {
        const added = await registerDecorations(ctx, kind);
        if (added.length) {
          await ctx.refreshState();
          category = added[0].is_shared ? "shared" : "mine";
          draw();
        }
      });
    root.querySelectorAll("[data-pick-asset]").forEach(
      (b) =>
        (b.onclick = () =>
          busy(b, () =>
            onPick({
              asset: assets.find((a) => a.id === b.dataset.pickAsset),
            }),
          )),
    );
    root.querySelectorAll("[data-pick-builtin]").forEach(
      (b) =>
        (b.onclick = () =>
          busy(b, async () => {
            if (kind !== "sticker")
              return onPick({ builtin: b.dataset.pickBuiltin });
            if (b.dataset.pickBuiltin.startsWith("ttussicon-"))
              return onPick({
                asset: await builtinStickerAsset(ctx, b.dataset.pickBuiltin),
              });
          })),
    );
    root.querySelectorAll("[data-archive-asset]").forEach(
      (b) =>
        (b.onclick = () =>
          busy(b, async () => {
            if (
              !(await confirmAction(
                "라이브러리에서 숨길까요?",
                "공유 자료는 친구들의 목록에서도 숨겨져요. 이미 일기에 사용한 파일은 계속 표시돼요.",
                "숨기기",
              ))
            )
              return;
            await ctx.repo.archiveAsset(b.dataset.archiveAsset);
            await ctx.refreshState();
            draw();
          })),
    );
    hydrateAssets(root, ctx.repo);
  };
  draw();
}

export async function pickDecoration(ctx, kind, onPick, afterPick) {
  await ctx.refreshState();
  const d = modal('<div class="decoration-picker"></div>');
  d.classList.add("library-dialog");
  await mountLibrary(
    d.querySelector(".decoration-picker"),
    ctx,
    kind,
    async (value) => {
      await onPick(value);
      if (afterPick)
        d.addEventListener(
          "close",
          () => {
            void afterPick();
          },
          { once: true },
        );
      d.close();
    },
  );
}
