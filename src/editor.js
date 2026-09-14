import {
  e,
  icon,
  uuid,
  toast,
  errorText,
  userError,
  busy,
  modal,
  confirmAction,
  emptyState,
} from "./ui.js";
import { today, validDate } from "./dates.js";
import { parseTags, validateEntry } from "./validation.js";
import { emptyDocument } from "./seed.js";
import { pickFiles, uploadImage, emojiSticker } from "./media.js";
import { hydrateAssets } from "./articles.js";

export async function editorPage(root, ctx, id, params) {
  let entry = id ? await ctx.repo.entry(id) : null;
  if (ctx.signal.aborted) return;
  if (id && (!entry || entry.author_id !== ctx.me.id)) {
    root.innerHTML = emptyState(
      "수정할 수 없는 일기예요",
      "내가 작성한 일기에서 수정 버튼을 눌러주세요.",
      '<a class="button secondary" href="#/home">홈으로</a>',
    );
    return;
  }
  const preferences = ctx.state.preferences;
  let suggested = params.get("date") || today();
  if (!validDate(suggested) || suggested > today()) suggested = today();
  entry = entry
    ? structuredClone(entry)
    : {
        id: uuid(),
        author_id: ctx.me.id,
        diary_date: suggested,
        title: "",
        status: "draft",
        tags: [],
        version: 0,
        document: {
          ...emptyDocument(),
          paper: preferences.default_paper,
          font: preferences.default_font,
          background_asset_id: preferences.default_background_asset_id,
          font_asset_id: preferences.default_font_asset_id,
          blocks: [{ id: uuid(), type: "text", text: "" }],
        },
      };
  let revision = 0,
    savedRevision = 0,
    timer,
    inFlight = null,
    destroyed = false,
    uploads = 0,
    selectedSticker = null,
    stickerMode = false,
    rawTags = entry.tags.join(" ");
  const wasPublished = entry.status === "published";
  root.classList.add("editor-page");
  root.innerHTML = `<header class="page-heading"><div><h1>${wasPublished ? "일기 다듬기" : "오늘의 페이지"}</h1><p>무슨 일이 있었나요? 천천히 적어보세요.</p></div><div class="heading-actions">${!wasPublished ? '<button class="button secondary" id="save-draft">임시저장</button>' : ""}<button class="button" id="publish-entry">${wasPublished ? "수정 저장" : "게시하기"}</button></div></header><div class="editor-layout"><div><div class="editor-paper"><div class="editor-meta">${icon("calendar")}<label class="sr-only" for="diary-date">작성 날짜</label><input type="date" id="diary-date" min="1900-01-01" max="${today()}" value="${e(entry.diary_date)}"><span class="save-status" id="save-status" role="status">${id ? "저장된 일기를 불러왔어요" : ""}</span></div><label class="sr-only" for="diary-title">일기 제목</label><input id="diary-title" class="editor-title" maxlength="100" placeholder="오늘의 제목을 적어주세요" value="${e(entry.title)}"><div class="mode-toggle" id="mode-toggle" ${entry.document.stickers.length ? "" : "hidden"}><button class="active" data-editor-mode="text">글 쓰기</button><button data-editor-mode="stickers">스티커 배치</button></div><div class="editor-content paper" id="editor-content"><div class="block-list" id="block-list"></div><div class="sticker-layer" id="sticker-layer"></div></div><div class="add-block-row"><button type="button" data-add-text>${icon("plus")} 글 추가</button><button type="button" data-add-image>${icon("image")} 사진 추가</button></div><div class="editor-tags"><label class="field-label" for="diary-tags">태그</label><input id="diary-tags" value="${e(rawTags)}" placeholder="#카페 #친구" maxlength="230"><span class="field-help">띄어쓰기 또는 #으로 구분해요. 최대 10개.</span></div><div class="editor-habits"><div class="field-label">오늘의 생활 기록</div><div class="habit-inputs" id="habit-inputs"></div><a class="tool-link" href="#/settings/diary">생활 기록 항목 관리</a></div></div><div class="editor-foot"><span>글과 사진 사이에 블록을 추가할 수 있어요.</span><span class="public-badge">${icon("lock")} 게시하면 모든 친구가 읽을 수 있어요.</span></div></div><aside class="editor-toolbar" aria-label="일기 꾸미기"><section class="tool-card"><h2>종이 고르기</h2><div class="paper-options">${[
    ["white", "기본"],
    ["lined", "줄노트"],
    ["grid", "모눈"],
    ["cream", "크림"],
  ]
    .map(
      ([key, label]) =>
        `<button class="paper-option ${key} ${entry.document.paper === key && !entry.document.background_asset_id ? "selected" : ""}" data-paper="${key}" aria-pressed="${entry.document.paper === key && !entry.document.background_asset_id}">${label}</button>`,
    )
    .join(
      "",
    )}</div><button class="tool-link" id="pick-background">내 배경 고르기</button></section><section class="tool-card sticker-tool"><h2>스티커</h2><div class="sticker-buttons">${["🌙", "⭐", "🐱", "🍰", "🍀", "💛"].map((emoji) => `<button data-emoji-sticker="${emoji}" aria-label="${emoji} 스티커 붙이기">${emoji}</button>`).join("")}</div><button class="tool-link" id="pick-sticker">내 스티커 고르기</button><p>붙인 뒤 원하는 자리로 옮겨요.</p><div id="sticker-controls"></div></section><section class="tool-card font-tool"><h2><label for="diary-font">글씨체</label></h2><select id="diary-font"><option value="system">기본 글씨</option><option value="sans">깔끔한 글씨</option><option value="handwriting">편안한 글씨</option>${ctx.state.assets
    .filter((a) => a.kind === "font" && !a.archived)
    .map((a) => `<option value="asset:${e(a.id)}">${e(a.name)}</option>`)
    .join(
      "",
    )}</select><a class="tool-link" href="#/settings/decorate">배경·스티커·폰트 등록</a></section></aside></div>`;
  const status = root.querySelector("#save-status");
  const content = root.querySelector("#editor-content");
  const blockList = root.querySelector("#block-list");
  const stickerLayer = root.querySelector("#sticker-layer");
  const editorHandle = {
    get dirty() {
      return revision !== savedRevision || uploads > 0;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      root.classList.remove("editor-page");
    },
  };
  ctx.setEditor(editorHandle);
  function touch() {
    revision++;
    status.textContent = wasPublished
      ? "저장하지 않은 변경이 있어요"
      : "입력을 마치면 임시저장해요";
    clearTimeout(timer);
    if (!wasPublished)
      timer = setTimeout(() => {
        if (!destroyed && uploads === 0) persist("draft", false, true);
      }, 2000);
  }
  function checkUpload() {
    root.querySelector("#publish-entry").disabled = uploads > 0;
    root.querySelector("#save-draft")?.toggleAttribute("disabled", uploads > 0);
  }
  function snapshot(statusValue) {
    const result = structuredClone(entry);
    result.title = root.querySelector("#diary-title").value.trim();
    result.diary_date = root.querySelector("#diary-date").value;
    result.tags = parseTags(root.querySelector("#diary-tags").value);
    result.status = statusValue;
    validateEntry(result);
    return result;
  }
  async function persist(statusValue, leave = false, automatic = false) {
    clearTimeout(timer);
    if (destroyed || uploads > 0) return;
    if (inFlight) {
      await inFlight;
      if (destroyed) return;
    }
    let data;
    try {
      data = snapshot(statusValue);
    } catch (error) {
      status.textContent = automatic
        ? "날짜와 입력 내용을 확인해주세요."
        : errorText(error);
      if (!automatic) toast(errorText(error), true);
      return;
    }
    const rev = revision;
    status.textContent =
      statusValue === "published"
        ? "일기를 저장하고 있어요…"
        : "임시저장하고 있어요…";
    const manualButtons = [
      root.querySelector("#publish-entry"),
      root.querySelector("#save-draft"),
    ].filter(Boolean);
    manualButtons.forEach((b) => (b.disabled = true));
    if (leave)
      root
        .querySelectorAll("input,textarea,select")
        .forEach((el) => (el.disabled = true));
    inFlight = (async () => {
      try {
        let result;
        try {
          result = await ctx.repo.saveEntry(data);
        } catch (error) {
          const saved = await ctx.repo.entry(data.id).catch(() => null);
          if (
            saved &&
            saved.status === data.status &&
            saved.title === data.title &&
            saved.diary_date === data.diary_date &&
            JSON.stringify(saved.document) === JSON.stringify(data.document) &&
            JSON.stringify(saved.tags) === JSON.stringify(data.tags)
          )
            result = saved;
          else throw error;
        }
        const saved = Array.isArray(result) ? result[0] : result;
        entry.version = saved.version;
        entry.created_at = saved.created_at;
        entry.published_at = saved.published_at;
        entry.status = saved.status;
        savedRevision = rev;
        if (!destroyed) {
          status.textContent = `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())} ${saved.status === "draft" ? "임시저장됨" : "저장됨"}`;
          if (!automatic)
            toast(
              saved.status === "draft"
                ? "이야기를 임시저장했어요."
                : "오늘의 이야기를 남겼어요.",
            );
        }
        if (leave && !destroyed) {
          ctx.setEditor(null);
          editorHandle.destroy();
          await ctx.go(`#/entries/${entry.id}`);
        }
      } catch (error) {
        console.error(error);
        if (!destroyed) {
          status.textContent = "저장하지 못했어요. 내용은 그대로 남아 있어요.";
          if (!automatic) toast(errorText(error), true);
        }
      } finally {
        inFlight = null;
        if (!destroyed) {
          manualButtons.forEach((b) => (b.disabled = false));
          if (leave)
            root
              .querySelectorAll("input,textarea,select")
              .forEach((el) => (el.disabled = false));
          if (!wasPublished && revision !== savedRevision) clearTimeout(timer);
        }
      }
    })();
    return inFlight;
  }
  function renderBlocks() {
    blockList.innerHTML = entry.document.blocks
      .map(
        (b, i) =>
          `<section class="editor-block" data-block-id="${e(b.id)}">${b.type === "text" ? `<label class="sr-only" for="block-${e(b.id)}">본문 ${i + 1}</label><textarea id="block-${e(b.id)}" data-block-text="${e(b.id)}" placeholder="오늘 어떤 하루를 보냈나요?" rows="4">${e(b.text)}</textarea>` : `<div class="editor-image"><img data-asset="${e(b.asset_id)}" alt="작성 중인 일기 사진" hidden><label class="sr-only" for="alt-${e(b.id)}">사진 설명</label><input id="alt-${e(b.id)}" data-block-alt="${e(b.id)}" value="${e(b.alt || "")}" placeholder="사진 설명 (선택)" maxlength="200"></div>`}<div class="block-tools"><button data-insert-after="${e(b.id)}" aria-label="이 블록 다음에 글 추가">＋ 글</button><button data-image-after="${e(b.id)}" aria-label="이 블록 다음에 사진 추가">＋ 사진</button><button data-move-block="${e(b.id)}" data-direction="-1" aria-label="블록 위로 이동" ${i === 0 ? "disabled" : ""}>↑</button><button data-move-block="${e(b.id)}" data-direction="1" aria-label="블록 아래로 이동" ${i === entry.document.blocks.length - 1 ? "disabled" : ""}>↓</button><button data-remove-block="${e(b.id)}" aria-label="블록 삭제">${icon("trash")}</button></div></section>`,
      )
      .join("");
    hydrateAssets(blockList, ctx.repo);
    blockList.querySelectorAll("textarea").forEach(autoSize);
  }
  function autoSize(el) {
    el.style.height = "auto";
    el.style.height = Math.max(128, el.scrollHeight + 2) + "px";
  }
  function renderHabits() {
    const existing = entry.document.habits;
    const fields = [...ctx.state.habits.filter((h) => !h.archived)];
    for (const h of existing)
      if (!fields.some((f) => f.id === h.field_id))
        fields.push({
          id: h.field_id,
          name: h.name,
          type: h.type,
          unit: h.unit,
          archived: true,
        });
    root.querySelector("#habit-inputs").innerHTML = fields.length
      ? fields
          .map((f) => {
            const value = existing.find((h) => h.field_id === f.id);
            return f.type === "boolean"
              ? `<label class="habit-check"><input type="checkbox" data-habit="${e(f.id)}" ${value?.value ? "checked" : ""}>${e(value?.name || f.name)}</label>`
              : `<label class="habit-number">${e(value?.name || f.name)}<input type="number" data-habit="${e(f.id)}" min="0" max="1000000" step="any" placeholder="—" value="${value ? e(value.value) : ""}">${e(value?.unit ?? f.unit)}</label>`;
          })
          .join("")
      : '<span class="field-help">설정에서 나만의 체크 항목을 추가할 수 있어요.</span>';
  }
  function renderPaper() {
    content.className = `editor-content paper ${entry.document.paper} font-${entry.document.font} ${stickerMode ? "editing-stickers" : ""}`;
    content.style.backgroundImage = "";
    content.style.fontFamily = "";
    delete content.dataset.background;
    delete content.dataset.font;
    if (entry.document.background_asset_id)
      content.dataset.background = entry.document.background_asset_id;
    if (entry.document.font_asset_id)
      content.dataset.font = entry.document.font_asset_id;
    root.querySelectorAll("[data-paper]").forEach((btn) => {
      const on =
        btn.dataset.paper === entry.document.paper &&
        !entry.document.background_asset_id;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-pressed", on);
    });
    hydrateAssets(content, ctx.repo);
  }
  function renderStickers() {
    stickerLayer.innerHTML = entry.document.stickers
      .map(
        (s) =>
          `<button class="placed-sticker ${selectedSticker === s.id ? "selected" : ""}" data-sticker="${e(s.id)}" aria-label="붙인 스티커 선택, 방향키로 이동" style="left:${s.x * 100}%;top:${s.y * 100}%;transform:translate(-50%,-50%) rotate(${s.rotation}deg) scale(${s.scale});z-index:${s.z}" ${stickerMode ? "" : 'tabindex="-1"'}><img data-asset="${e(s.asset_id)}" alt="" hidden draggable="false"></button>`,
      )
      .join("");
    root.querySelector("#mode-toggle").hidden = !entry.document.stickers.length;
    hydrateAssets(stickerLayer, ctx.repo);
    renderStickerControls();
  }
  function renderStickerControls() {
    const s = entry.document.stickers.find((x) => x.id === selectedSticker);
    root.querySelector("#sticker-controls").innerHTML = s
      ? `<div class="sticker-controls"><label>크기<input aria-label="선택한 스티커 크기" data-sticker-scale type="range" min="0.25" max="4" step="0.05" value="${s.scale}"></label><label>회전<input aria-label="선택한 스티커 회전" data-sticker-rotation type="range" min="-180" max="180" step="1" value="${s.rotation}"></label><div class="row"><button data-sticker-front>앞으로</button><button data-sticker-back>뒤로</button><button data-sticker-remove>삭제</button></div></div>`
      : "";
  }
  function updateStickerNode(s) {
    const el = stickerLayer.querySelector(`[data-sticker="${s.id}"]`);
    if (el) {
      el.style.left = s.x * 100 + "%";
      el.style.top = s.y * 100 + "%";
      el.style.transform = `translate(-50%,-50%) rotate(${s.rotation}deg) scale(${s.scale})`;
      el.style.zIndex = s.z;
    }
  }
  function setMode(value) {
    stickerMode = value === "stickers";
    root.querySelectorAll("[data-editor-mode]").forEach((btn) => {
      const on = btn.dataset.editorMode === value;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on);
    });
    content.classList.toggle("editing-stickers", stickerMode);
    blockList.inert = stickerMode;
    stickerLayer
      .querySelectorAll("button")
      .forEach((b) => (b.tabIndex = stickerMode ? 0 : -1));
  }
  function insertBlock(block, after) {
    if (entry.document.blocks.length >= 100)
      throw userError("글과 사진은 100개까지 넣을 수 있어요.");
    const index = after
      ? entry.document.blocks.findIndex((b) => b.id === after) + 1
      : entry.document.blocks.length;
    entry.document.blocks.splice(index, 0, block);
    setMode("text");
    renderBlocks();
    touch();
    if (block.type === "text")
      root.querySelector(`[data-block-text="${block.id}"]`)?.focus();
  }
  async function addImages(after) {
    const files = await pickFiles("image/jpeg,image/png,image/webp", true);
    if (!files.length) return;
    if (entry.document.blocks.length + files.length > 100)
      throw userError("글과 사진은 100개까지 넣을 수 있어요.");
    uploads++;
    checkUpload();
    status.textContent = "사진을 준비하고 있어요…";
    try {
      let anchor = after;
      for (const file of files) {
        const a = await uploadImage(ctx.repo, file, "diary-image");
        if (destroyed) return;
        const b = { id: uuid(), type: "image", asset_id: a.id, alt: "" };
        insertBlock(b, anchor);
        anchor = b.id;
      }
    } finally {
      uploads--;
      if (!destroyed) {
        checkUpload();
        touch();
      }
    }
  }
  async function addSticker(asset) {
    if (entry.document.stickers.length >= 40)
      throw userError("스티커는 40개까지 붙일 수 있어요.");
    const s = {
      id: uuid(),
      asset_id: asset.id,
      x: 0.75,
      y: 0.5,
      scale: 1,
      rotation: 0,
      z: Math.min(100, entry.document.stickers.length),
    };
    entry.document.stickers.push(s);
    selectedSticker = s.id;
    setMode("stickers");
    renderStickers();
    touch();
  }
  async function library(kind) {
    await ctx.refreshState();
    const assets = ctx.state.assets.filter(
      (x) => x.kind === kind && !x.archived,
    );
    const title = kind === "sticker" ? "내 스티커" : "내 배경";
    const d = modal(
      `<h2>${title}</h2>${assets.length ? `<div class="asset-grid">${assets.map((a) => `<button class="asset-tile asset-pick" data-pick-asset="${e(a.id)}"><img data-asset="${e(a.id)}" alt="" hidden><span>${e(a.name)}</span></button>`).join("")}</div>` : '<p class="muted">아직 등록한 파일이 없어요. 설정의 꾸미기에서 먼저 등록해주세요.</p>'}<div class="dialog-actions"><button class="button secondary" id="upload-library">${icon("plus")} 새로 등록</button></div>`,
    );
    hydrateAssets(d, ctx.repo);
    d.querySelectorAll("[data-pick-asset]").forEach(
      (btn) =>
        (btn.onclick = () =>
          busy(btn, async () => {
            const asset = assets.find((a) => a.id === btn.dataset.pickAsset);
            if (kind === "sticker") await addSticker(asset);
            else {
              entry.document.background_asset_id = asset.id;
              renderPaper();
              touch();
            }
            d.close();
          })),
    );
    d.querySelector("#upload-library").onclick = (event) =>
      busy(event.currentTarget, async () => {
        const files = await pickFiles(
          kind === "sticker"
            ? "image/png,image/webp"
            : "image/jpeg,image/png,image/webp",
        );
        if (!files.length) return;
        uploads++;
        checkUpload();
        try {
          const a = await uploadImage(ctx.repo, files[0], kind);
          if (kind === "sticker") await addSticker(a);
          else {
            entry.document.background_asset_id = a.id;
            renderPaper();
            touch();
          }
          d.close();
        } finally {
          uploads--;
          checkUpload();
        }
      });
  }
  root.querySelector("#diary-font").value = entry.document.font_asset_id
    ? `asset:${entry.document.font_asset_id}`
    : entry.document.font;
  root
    .querySelector("#save-draft")
    ?.addEventListener("click", () => persist("draft"));
  root.querySelector("#publish-entry").onclick = () =>
    persist("published", true);
  root.addEventListener(
    "input",
    (event) => {
      const t = event.target;
      if (t.dataset.blockText) {
        entry.document.blocks.find((b) => b.id === t.dataset.blockText).text =
          t.value;
        autoSize(t);
        touch();
      } else if (t.dataset.blockAlt) {
        entry.document.blocks.find((b) => b.id === t.dataset.blockAlt).alt =
          t.value;
        touch();
      } else if (["diary-title", "diary-date", "diary-tags"].includes(t.id)) {
        touch();
      } else if (t.dataset.habit) {
        const field =
          ctx.state.habits.find((h) => h.id === t.dataset.habit) ||
          entry.document.habits.find((h) => h.field_id === t.dataset.habit);
        const old = entry.document.habits.find(
          (h) => h.field_id === t.dataset.habit,
        );
        entry.document.habits = entry.document.habits.filter(
          (h) => h.field_id !== t.dataset.habit,
        );
        if (t.type === "checkbox" || t.value !== "")
          entry.document.habits.push({
            field_id: t.dataset.habit,
            name: old?.name || field.name,
            type: field.type,
            unit: old?.unit ?? field.unit,
            value: t.type === "checkbox" ? t.checked : Number(t.value),
          });
        touch();
      } else if (
        t.hasAttribute("data-sticker-scale") ||
        t.hasAttribute("data-sticker-rotation")
      ) {
        const s = entry.document.stickers.find((x) => x.id === selectedSticker);
        if (!s) return;
        if (t.hasAttribute("data-sticker-scale")) s.scale = Number(t.value);
        else s.rotation = Number(t.value);
        updateStickerNode(s);
        touch();
      }
    },
    { signal: ctx.signal },
  );
  root.querySelector("#diary-font").onchange = (event) => {
    const value = event.target.value;
    if (value.startsWith("asset:"))
      entry.document.font_asset_id = value.slice(6);
    else {
      entry.document.font = value;
      entry.document.font_asset_id = null;
    }
    renderPaper();
    touch();
  };
  root.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      if (btn.hasAttribute("data-add-text") || btn.dataset.insertAfter)
        busy(btn, () =>
          insertBlock(
            { id: uuid(), type: "text", text: "" },
            btn.dataset.insertAfter,
          ),
        );
      if (btn.hasAttribute("data-add-image") || btn.dataset.imageAfter)
        busy(btn, () => addImages(btn.dataset.imageAfter));
      if (btn.dataset.moveBlock) {
        const index = entry.document.blocks.findIndex(
          (b) => b.id === btn.dataset.moveBlock,
        );
        const target = index + Number(btn.dataset.direction);
        if (target >= 0 && target < entry.document.blocks.length) {
          const [b] = entry.document.blocks.splice(index, 1);
          entry.document.blocks.splice(target, 0, b);
          renderBlocks();
          touch();
        }
      }
      if (btn.dataset.removeBlock)
        busy(btn, async () => {
          const block = entry.document.blocks.find(
            (b) => b.id === btn.dataset.removeBlock,
          );
          if (
            (block.type === "image" || block.text?.trim()) &&
            !(await confirmAction(
              "이 블록을 지울까요?",
              "이 일기에서 선택한 글 또는 사진이 빠져요.",
            ))
          )
            return;
          entry.document.blocks = entry.document.blocks.filter(
            (b) => b.id !== block.id,
          );
          if (!entry.document.blocks.length)
            entry.document.blocks.push({ id: uuid(), type: "text", text: "" });
          renderBlocks();
          touch();
        });
      if (btn.dataset.paper) {
        entry.document.paper = btn.dataset.paper;
        entry.document.background_asset_id = null;
        renderPaper();
        touch();
      }
      if (btn.dataset.editorMode) setMode(btn.dataset.editorMode);
      if (btn.dataset.emojiSticker)
        busy(btn, async () => {
          if (entry.document.stickers.length >= 40)
            throw userError("스티커는 40개까지 붙일 수 있어요.");
          uploads++;
          checkUpload();
          try {
            await ctx.refreshState();
            let asset = ctx.state.assets.find(
              (a) =>
                a.kind === "sticker" &&
                a.name === `기본 ${btn.dataset.emojiSticker}` &&
                !a.archived,
            );
            if (!asset)
              asset = await emojiSticker(ctx.repo, btn.dataset.emojiSticker);
            await addSticker(asset);
          } finally {
            uploads--;
            checkUpload();
          }
        });
      if (btn.id === "pick-sticker") busy(btn, () => library("sticker"));
      if (btn.id === "pick-background") busy(btn, () => library("background"));
      if (
        btn.hasAttribute("data-sticker-front") ||
        btn.hasAttribute("data-sticker-back")
      ) {
        const s = entry.document.stickers.find((x) => x.id === selectedSticker);
        if (!s) return;
        const ordered = [...entry.document.stickers].sort((a, b) => a.z - b.z);
        const i = ordered.findIndex((x) => x.id === s.id);
        const target = i + (btn.hasAttribute("data-sticker-front") ? 1 : -1);
        if (target >= 0 && target < ordered.length) {
          [ordered[i], ordered[target]] = [ordered[target], ordered[i]];
          ordered.forEach((x, n) => (x.z = n));
          renderStickers();
          touch();
        }
      }
      if (btn.hasAttribute("data-sticker-remove")) {
        entry.document.stickers = entry.document.stickers.filter(
          (s) => s.id !== selectedSticker,
        );
        selectedSticker = null;
        renderStickers();
        touch();
        if (!entry.document.stickers.length) setMode("text");
      }
    },
    { signal: ctx.signal },
  );
  stickerLayer.addEventListener(
    "pointerdown",
    (event) => {
      const el = event.target.closest("[data-sticker]");
      if (!el || !stickerMode) return;
      event.preventDefault();
      const s = entry.document.stickers.find(
        (x) => x.id === el.dataset.sticker,
      );
      selectedSticker = s.id;
      stickerLayer
        .querySelectorAll("[data-sticker]")
        .forEach((b) => b.classList.toggle("selected", b === el));
      renderStickerControls();
      el.setPointerCapture(event.pointerId);
      const rect = content.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, sx: s.x, sy: s.y };
      let moved = false;
      const move = (ev) => {
        s.x = Math.max(
          0,
          Math.min(1, start.sx + (ev.clientX - start.x) / rect.width),
        );
        s.y = Math.max(
          0,
          Math.min(1, start.sy + (ev.clientY - start.y) / rect.height),
        );
        updateStickerNode(s);
        moved = true;
      };
      const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        if (moved) touch();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    },
    { signal: ctx.signal },
  );
  stickerLayer.addEventListener(
    "keydown",
    (event) => {
      const el = event.target.closest("[data-sticker]");
      if (!el || !stickerMode) return;
      const s = entry.document.stickers.find(
        (x) => x.id === el.dataset.sticker,
      );
      selectedSticker = s.id;
      const delta = event.shiftKey ? 0.05 : 0.01;
      const changes = {
        ArrowLeft: [-delta, 0],
        ArrowRight: [delta, 0],
        ArrowUp: [0, -delta],
        ArrowDown: [0, delta],
      };
      if (changes[event.key]) {
        event.preventDefault();
        s.x = Math.max(0, Math.min(1, s.x + changes[event.key][0]));
        s.y = Math.max(0, Math.min(1, s.y + changes[event.key][1]));
        updateStickerNode(s);
        touch();
      }
    },
    { signal: ctx.signal },
  );
  renderBlocks();
  renderHabits();
  renderPaper();
  renderStickers();
}
