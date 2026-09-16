import { paperLayout, stickerStyle, growPaper, fitPaper } from "./paper-layout.js";
import { stickerInsertionPosition } from "./sticker-placement.js";
import { bindStickerGestures } from "./sticker-gestures.js";
import {
  ttussiconStickers,
  stickerURL,
  builtinStickerAsset,
} from "./builtin-sticker-assets.js";
import {
  fontOptions,
  builtinPapers,
  pickDecoration,
} from "./decoration-library.js";
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
import { parseMusic, musicInfo, musicLinkHelp } from "./music.js";
import { musicMetadata } from "./music-metadata.js";
import { emptyDocument } from "./seed.js";
import { pickFiles, uploadImage } from "./media.js";
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
    gestures = null,
    rawTags = entry.tags.join(" ");
  const wasPublished = entry.status === "published";
  root.classList.add("editor-page");
  root.innerHTML = `<header class="page-heading"><div><h1>${wasPublished ? "일기 다듬기" : "오늘의 페이지"}</h1><p>무슨 일이 있었나요? 천천히 적어보세요.</p></div><div class="heading-actions">${!wasPublished ? '<button class="button secondary" id="save-draft">임시저장</button>' : ""}<button class="button" id="publish-entry">${wasPublished ? "수정 저장" : "게시하기"}</button></div></header><div class="editor-layout"><div><div class="editor-paper"><div class="editor-meta">${icon("calendar")}<label class="sr-only" for="diary-date">작성 날짜</label><input type="date" id="diary-date" min="1900-01-01" max="${today()}" value="${e(entry.diary_date)}"><span class="save-status" id="save-status" role="status">${id ? "저장된 일기를 불러왔어요" : ""}</span></div><label class="sr-only" for="diary-title">일기 제목</label><input id="diary-title" class="editor-title" maxlength="100" placeholder="오늘의 제목을 적어주세요" value="${e(entry.title)}"><div class="mode-toggle" id="mode-toggle" ${entry.document.stickers.length ? "" : "hidden"}><button class="active" data-editor-mode="text">글 쓰기</button><button data-editor-mode="stickers">스티커 배치</button></div><p class="sticker-canvas-hint" id="sticker-gesture-hint" hidden><span class="desktop-sticker-hint">드래그로 이동 · 스티커 위에서 휠로 회전 · 모서리를 끌어 크기 조절<br>Shift + 휠로 각도를 조금씩 조절할 수 있어요.</span><span class="touch-sticker-hint">한 손가락으로 이동 · 두 손가락으로 크기와 각도 조절</span></p><div class="paper-viewport" id="editor-viewport"><div class="editor-content paper" id="editor-content"><div class="block-list" id="block-list"></div><div class="sticker-layer" id="sticker-layer"></div></div></div><div class="add-block-row"><button type="button" data-add-text>${icon("plus")} 글 추가</button><button type="button" data-add-image>${icon("image")} 사진 추가</button></div><section class="editor-music" aria-labelledby="editor-music-heading"><div class="music-heading">${icon("music")}<h2 id="editor-music-heading">오늘의 음악</h2><button type="button" id="remove-music" class="music-remove" hidden>음악 빼기</button></div><label for="diary-music-url" class="field-label">YouTube · YouTube Music 링크</label><input type="url" inputmode="url" id="diary-music-url" value="${e(entry.document.music?.url || "")}" placeholder="공유 링크를 붙여 넣어주세요" maxlength="2048" autocomplete="off" spellcheck="false" aria-describedby="music-preview"><p id="music-preview" class="music-help" aria-live="polite"></p><div class="music-credits-inputs"><div><label for="diary-music-title" class="field-label">곡 제목</label><input id="diary-music-title" value="${e(entry.document.music?.title || "")}" placeholder="링크에서 불러오거나 직접 입력" maxlength="120"></div><div><label for="diary-music-artist" class="field-label">가수 · 아티스트 <span class="optional-label">(선택)</span></label><input id="diary-music-artist" value="${e(entry.document.music?.artist || "")}" placeholder="노래한 가수나 아티스트 이름" maxlength="120"></div></div></section><div class="editor-tags"><label class="field-label" for="diary-tags">태그</label><input id="diary-tags" value="${e(rawTags)}" placeholder="#카페 #친구" maxlength="230"><span class="field-help">띄어쓰기 또는 #으로 구분해요. 최대 10개.</span></div><div class="editor-habits"><div class="field-label">오늘의 생활 기록</div><div class="habit-inputs" id="habit-inputs"></div><a class="tool-link" href="#/settings/diary">생활 기록 항목 관리</a></div></div><div class="editor-foot"><span>글과 사진 사이에 블록을 추가할 수 있어요.</span><span class="public-badge">${icon("lock")} 게시하면 모든 친구가 읽을 수 있어요.</span></div></div><aside class="editor-toolbar" aria-label="일기 꾸미기"><section class="tool-card font-tool"><h2><label for="diary-font">폰트</label></h2><select id="diary-font">${fontOptions(ctx.state.assets, entry.document.font, entry.document.font_asset_id)}</select><p class="font-live-preview font-${entry.document.font}" id="font-preview">오늘의 작은 순간을 기록해요.</p><button class="tool-link" id="pick-font">기본·내 폰트·공유 폰트 보기</button></section><section class="tool-card"><h2>종이 고르기</h2><div class="paper-options">${builtinPapers
    .map(
      ([key, label]) =>
        `<button class="paper-option ${key} ${entry.document.paper === key && !entry.document.background_asset_id ? "selected" : ""}" data-paper="${key}" aria-pressed="${entry.document.paper === key && !entry.document.background_asset_id}">${label}</button>`,
    )
    .join(
      "",
    )}</div><button class="tool-link" id="pick-background">기본·내 배경·공유 배경 보기</button></section><section class="tool-card sticker-tool"><h2>스티커</h2><div class="sticker-buttons">${[
    "ttussicon-12",
    "ttussicon-31",
    "ttussicon-08",
  ]
    .map((id) => ttussiconStickers.find((s) => s.id === id))
    .map(
      (s) =>
        `<button data-builtin-sticker="${s.id}" aria-label="뚜씨티콘 ${e(s.name)} 붙이기"><img src="${e(stickerURL(s))}" alt="" draggable="false"></button>`,
    )
    .join(
      "",
    )}</div><button class="tool-link" id="pick-sticker">기본·내 스티커·공유 스티커 보기</button><button class="tool-link" id="find-sticker" hidden>붙인 스티커로 이동</button><p>글씨는 항상 스티커 위에 보여요.</p><div id="sticker-controls"></div></section></aside></div>`;
  const status = root.querySelector("#save-status");
  const content = root.querySelector("#editor-content");
  const blockList = root.querySelector("#block-list");
  const stickerLayer = root.querySelector("#sticker-layer");
  const viewport = root.querySelector("#editor-viewport");
  let sheet = null;
  function measureSheet() {
    const layout = paperLayout(entry.document);
    if (!layout) return;
    const height = Math.max(240, content.offsetHeight);
    growPaper(entry.document, height);
    layout.blocks = Object.fromEntries([...blockList.children].map(node =>
      [node.dataset.blockId, node.offsetHeight]));
    for (const sticker of entry.document.stickers) updateStickerNode(sticker);
  }
  function fixSheet() {
    if (sheet) return;
    entry.document.layout ||= {
      version: 1,
      width: Math.max(240, Math.min(1200, content.offsetWidth)),
      height: Math.max(240, content.offsetHeight),
      blocks: {},
    };
    if (!paperLayout(entry.document)) return;
    sheet = fitPaper(viewport, content, entry.document.layout, {
      signal: ctx.signal, measure: measureSheet,
    });
  }
  const editorHandle = {
    get dirty() {
      return revision !== savedRevision || uploads > 0;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      resizeObserver.disconnect();
      sheet?.destroy();
      gestures?.cancel();
      root.classList.remove("editor-page");
    },
  };
  let lastWidth = 0;
  const resizeObserver = new ResizeObserver(([record]) => {
    if (Math.abs(record.contentRect.width - lastWidth) < 1) return;
    lastWidth = record.contentRect.width;
    gestures?.cancel();
    blockList.querySelectorAll("textarea").forEach(autoSize);
  });
  resizeObserver.observe(content);
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
  function snapshot(statusValue, focusInvalidMusic = false) {
    sheet?.refresh();
    const result = structuredClone(entry);
    result.title = root.querySelector("#diary-title").value.trim();
    result.diary_date = root.querySelector("#diary-date").value;
    result.tags = parseTags(root.querySelector("#diary-tags").value);
    result.status = statusValue;
    try {
      result.document.music = readMusic();
    } catch (error) {
      updateMusicPreview();
      if (focusInvalidMusic) root.querySelector("#diary-music-url").focus();
      throw userError(error.message);
    }
    validateEntry(result);
    return result;
  }
  function readMusic() {
    return parseMusic(
      root.querySelector("#diary-music-url").value,
      root.querySelector("#diary-music-title").value,
      root.querySelector("#diary-music-artist").value,
    );
  }
  function updateMusicPreview() {
    const input = root.querySelector("#diary-music-url");
    const preview = root.querySelector("#music-preview");
    root.querySelector("#remove-music").hidden =
      !input.value &&
      !root.querySelector("#diary-music-title").value &&
      !root.querySelector("#diary-music-artist").value;
    try {
      const info = musicInfo(readMusic());
      input.removeAttribute("aria-invalid");
      preview.classList.remove("error");
      preview.textContent = info
        ? `${info.service} ${info.kind} · 곡 제목을 확인하고 가수명을 적어주세요.`
        : musicLinkHelp;
    } catch (error) {
      input.setAttribute("aria-invalid", "true");
      preview.classList.add("error");
      preview.textContent = error.message;
    }
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
      data = snapshot(statusValue, !automatic);
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
    content.className = `editor-content paper ${paperLayout(entry.document) ? "fixed-paper" : ""} ${entry.document.paper} font-${entry.document.font} ${stickerMode ? "editing-stickers" : ""}`;
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
    hydrateAssets(content, ctx.repo).then(() => {
      if (destroyed) return;
      const preview = root.querySelector("#font-preview");
      preview.className = `font-live-preview font-${entry.document.font}`;
      preview.style.fontFamily = content.style.fontFamily;
      document.fonts.ready.then(() => {
        if (!destroyed)
          blockList.querySelectorAll("textarea").forEach(autoSize);
      });
    });
  }
  function renderStickers() {
    gestures?.cancel();
    stickerLayer.innerHTML = entry.document.stickers
      .map(
        (s) =>
          `<button class="placed-sticker ${selectedSticker === s.id ? "selected" : ""}" data-sticker="${e(s.id)}" aria-label="붙인 스티커 선택, 방향키로 이동" aria-describedby="sticker-gesture-hint" style="${stickerStyle(s, paperLayout(entry.document))}" ${stickerMode ? "" : 'tabindex="-1"'}><img data-asset="${e(s.asset_id)}" alt="" hidden draggable="false">${["nw", "ne", "sw", "se"].map((corner) => `<span class="sticker-resize-handle" data-sticker-resize="${corner}" aria-hidden="true"></span>`).join("")}</button>`,
      )
      .join("");
    root.querySelector("#mode-toggle").hidden = !entry.document.stickers.length;
    root.querySelector("#find-sticker").hidden =
      !entry.document.stickers.length;
    hydrateAssets(stickerLayer, ctx.repo);
    renderStickerControls();
  }
  function renderStickerControls() {
    const s = entry.document.stickers.find((x) => x.id === selectedSticker);
    root.querySelector("#sticker-controls").innerHTML = s
      ? `<div class="sticker-controls"><div class="desktop-sticker-sliders"><label>크기<input aria-label="선택한 스티커 크기" data-sticker-scale type="range" min="0.25" max="4" step="0.05" value="${s.scale}"></label><label>회전<input aria-label="선택한 스티커 회전" data-sticker-rotation type="range" min="-180" max="180" step="1" value="${s.rotation}"></label></div><p class="touch-sticker-hint">스티커를 누르고 두 손가락을 벌리거나 돌려보세요.</p><div class="row"><button data-sticker-front>스티커끼리 앞으로</button><button data-sticker-back>스티커끼리 뒤로</button><button data-sticker-remove>삭제</button></div></div>`
      : "";
  }
  function updateStickerNode(s) {
    const el = stickerLayer.querySelector(`[data-sticker="${s.id}"]`);
    if (el) {
      const layout = paperLayout(entry.document);
      el.style.left = layout ? `${s.x * layout.width}px` : `${s.x * 100}%`;
      el.style.top = layout ? `${s.y * layout.height}px` : `${s.y * 100}%`;
      el.style.transform = `translate(-50%,-50%) rotate(${s.rotation}deg) scale(${s.scale})`;
      el.style.zIndex = s.z;
      el.style.setProperty("--sticker-inverse-scale", 1 / s.scale);
    }
  }
  function setMode(value) {
    gestures?.cancel();
    stickerMode = value === "stickers";
    root.querySelectorAll("[data-editor-mode]").forEach((btn) => {
      const on = btn.dataset.editorMode === value;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on);
    });
    content.classList.toggle("editing-stickers", stickerMode);
    blockList.inert = stickerMode;
    root.querySelector("#sticker-gesture-hint").hidden = !stickerMode;
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
  function stickerViewport() {
    const viewport = window.visualViewport;
    const topbar = document.querySelector(".topbar-mobile");
    const headerBottom = topbar?.getBoundingClientRect().height
      ? topbar.getBoundingClientRect().bottom
      : 0;
    const top = Math.max(viewport?.offsetTop || 0, headerBottom);
    const bottom =
      (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
    return {
      top: Math.min(top + 20, bottom - 20),
      bottom: bottom - 20,
      left: (viewport?.offsetLeft || 0) + 20,
      right:
        (viewport?.offsetLeft || 0) +
        (viewport?.width || window.innerWidth) -
        20,
    };
  }
  function captureStickerPosition() {
    return stickerInsertionPosition(
      content.getBoundingClientRect(),
      stickerViewport(),
    );
  }
  async function revealSticker(id) {
    if (destroyed || !id) return;
    const sticker = entry.document.stickers.find((s) => s.id === id);
    if (!sticker) return;
    selectedSticker = id;
    setMode("stickers");
    stickerLayer
      .querySelectorAll("[data-sticker]")
      .forEach((button) =>
        button.classList.toggle("selected", button.dataset.sticker === id),
      );
    renderStickerControls();
    await hydrateAssets(stickerLayer, ctx.repo);
    const node = stickerLayer.querySelector(`[data-sticker="${id}"]`);
    const img = node?.querySelector("img");
    if (img?.src) await img.decode().catch(() => {});
    if (destroyed || !node?.isConnected || selectedSticker !== id) return;
    node.focus({ preventScroll: true });
    const bounds = node.getBoundingClientRect(),
      viewport = stickerViewport();
    if (bounds.top < viewport.top || bounds.bottom > viewport.bottom)
      window.scrollBy({
        top: (bounds.top + bounds.bottom - viewport.top - viewport.bottom) / 2,
        behavior: "instant",
      });
  }
  async function addSticker(asset, position = captureStickerPosition()) {
    if (entry.document.stickers.length >= 40)
      throw userError("스티커는 40개까지 붙일 수 있어요.");
    fixSheet();
    const s = {
      id: uuid(),
      asset_id: asset.id,
      x: position.x,
      y: position.y,
      scale: 1,
      rotation: 0,
      z: Math.min(100, entry.document.stickers.length),
    };
    entry.document.stickers.push(s);
    selectedSticker = s.id;
    setMode("stickers");
    renderStickers();
    touch();
    return s.id;
  }
  async function library(kind) {
    const position = captureStickerPosition();
    let addedId;
    await pickDecoration(
      ctx,
      kind,
      async ({ asset, builtin }) => {
        if (kind === "sticker") addedId = await addSticker(asset, position);
        else if (kind === "background") {
          entry.document.background_asset_id = asset?.id || null;
          if (builtin) entry.document.paper = builtin;
          renderPaper();
          touch();
        } else {
          entry.document.font_asset_id = asset?.id || null;
          if (builtin) entry.document.font = builtin;
          root.querySelector("#diary-font").innerHTML = fontOptions(
            ctx.state.assets,
            entry.document.font,
            entry.document.font_asset_id,
          );
          renderPaper();
          touch();
        }
      },
      () => revealSticker(addedId),
    );
  }
  root.querySelector("#diary-font").value = entry.document.font_asset_id
    ? `asset:${entry.document.font_asset_id}`
    : entry.document.font;
  root
    .querySelector("#save-draft")
    ?.addEventListener("click", () => persist("draft"));
  updateMusicPreview();
  let musicLookupTimer,
    musicLookupController,
    musicTitleRevision = 0,
    autoMusicTitle = "";
  function queueMusicMetadata() {
    clearTimeout(musicLookupTimer);
    musicLookupController?.abort();
    const title = root.querySelector("#diary-music-title");
    if (autoMusicTitle && title.value === autoMusicTitle) title.value = "";
    autoMusicTitle = "";
    const revision = musicTitleRevision;
    musicLookupTimer = setTimeout(async () => {
      let music;
      try {
        music = readMusic();
      } catch {
        return;
      }
      if (!music || title.value || ctx.signal.aborted) return;
      const controller = new AbortController();
      musicLookupController = controller;
      root.querySelector("#music-preview").textContent =
        "곡 제목을 불러오고 있어요…";
      const metadata = await musicMetadata(music.url, controller.signal);
      if (controller.signal.aborted || ctx.signal.aborted) return;
      if (revision !== musicTitleRevision || title.value) return;
      if (metadata?.title) {
        title.value = metadata.title;
        autoMusicTitle = metadata.title;
        updateMusicPreview();
        touch();
      } else {
        updateMusicPreview();
        root.querySelector("#music-preview").textContent =
          "제목을 불러오지 못했어요. 곡 제목과 가수명을 직접 적어주세요.";
      }
    }, 450);
  }
  ctx.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(musicLookupTimer);
      musicLookupController?.abort();
    },
    { once: true },
  );
  queueMusicMetadata();
  root.querySelector("#remove-music").onclick = () => {
    clearTimeout(musicLookupTimer);
    musicLookupController?.abort();
    autoMusicTitle = "";
    root.querySelector("#diary-music-url").value = "";
    root.querySelector("#diary-music-title").value = "";
    root.querySelector("#diary-music-artist").value = "";
    updateMusicPreview();
    touch();
    root.querySelector("#diary-music-url").focus();
  };
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
      } else if (
        ["diary-music-url", "diary-music-title", "diary-music-artist"].includes(
          t.id,
        )
      ) {
        if (t.id === "diary-music-title") musicTitleRevision++;
        if (t.id === "diary-music-url") queueMusicMetadata();
        updateMusicPreview();
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
      if (btn.dataset.builtinSticker)
        busy(btn, async () => {
          if (entry.document.stickers.length >= 40)
            throw userError("스티커는 40개까지 붙일 수 있어요.");
          const position = captureStickerPosition();
          uploads++;
          checkUpload();
          try {
            const asset = await builtinStickerAsset(
              ctx,
              btn.dataset.builtinSticker,
            );
            if (!destroyed) {
              const id = await addSticker(asset, position);
              await revealSticker(id);
            }
          } finally {
            uploads--;
            if (!destroyed) checkUpload();
          }
        });
      if (btn.id === "find-sticker")
        busy(btn, () =>
          revealSticker(selectedSticker || entry.document.stickers.at(-1)?.id),
        );
      if (btn.id === "pick-font") busy(btn, () => library("font"));
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
  gestures = bindStickerGestures(stickerLayer, {
    enabled: () => stickerMode && !destroyed,
    selected: () =>
      entry.document.stickers.find((s) => s.id === selectedSticker),
    find: (id) => entry.document.stickers.find((s) => s.id === id),
    select: (s) => {
      selectedSticker = s.id;
      stickerLayer
        .querySelectorAll("[data-sticker]")
        .forEach((button) =>
          button.classList.toggle("selected", button.dataset.sticker === s.id),
        );
      renderStickerControls();
    },
    change: (s) => {
      updateStickerNode(s);
      touch();
    },
    finish: () => {
      if (!destroyed) renderStickerControls();
    },
    signal: ctx.signal,
  });
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
  if (paperLayout(entry.document)) fixSheet();
  renderBlocks();
  if (entry.document.stickers.length) fixSheet();
  sheet?.refresh();
  renderHabits();
  renderPaper();
  renderStickers();
}
