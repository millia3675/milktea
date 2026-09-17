import { e, icon, modal, busy, toast, errorText, confirmAction, emptyState } from "./ui.js";
import { hydrateAssets } from "./articles.js";
import { paperLayout, stickerStyle } from "./paper-layout.js";
import { builtinPapers } from "./decoration-library.js";

export function saveTemplateDialog(ctx, decoration) {
  const d = modal(`<h2>이 꾸미기를 서식으로 저장</h2><p class="muted">종이·폰트·스티커 배치를 함께 저장해요. 일기 내용과 사진, 음악은 포함하지 않아요.</p><form id="template-save-form"><label class="field-label" for="template-name">서식 이름</label><input id="template-name" maxlength="50" placeholder="예: 평소의 일기, 독서 기록" required><p class="form-message" role="alert"></p><div class="dialog-actions"><button class="button" type="submit">서식 저장</button></div></form>`);
  const form = d.querySelector("form");
  form.onsubmit = event => {
    event.preventDefault();
    busy(form.querySelector("[type=submit]"), async () => {
      const name = form.querySelector("input").value.trim();
      if (!name) { form.querySelector(".form-message").textContent = "서식 이름을 입력해주세요."; return; }
      try { await ctx.repo.saveTemplate({ name, decoration }); d.close(); toast("내 서식에 저장했어요. 다음 일기에서 다시 쓸 수 있어요."); }
      catch (error) { form.querySelector(".form-message").textContent = errorText(error); }
    });
  };
}
export async function templatesPage(root, ctx) {
  const templates = await ctx.repo.templates();
  if (ctx.signal.aborted) return;
  root.innerHTML = `<header class="page-heading"><div><h1>내 다이어리 서식</h1><p>마음에 드는 종이와 글씨, 스티커 배치를 다시 펼쳐요.</p></div><a class="button secondary" href="#/write">${icon("plus")} 새 일기 쓰기</a></header><p class="template-intro">일기를 쓰거나 수정할 때 ‘이 꾸미기를 서식으로 저장’을 눌러보세요. 저장한 서식은 나만 볼 수 있어요.</p><div class="template-list"></div>`;
  const list = root.querySelector(".template-list");
  if (!templates.length) {
    list.innerHTML = emptyState("아직 저장한 서식이 없어요", "꾸며둔 일기의 수정 화면에서도 서식을 저장할 수 있어요.", '<a class="button soft" href="#/write">첫 서식 꾸미러 가기</a>');
    return;
  }
  list.innerHTML = templates.map(t => {
    const d = t.decoration;
    const layout = paperLayout(d) || { version: 1, width: 600, height: 420 };
    const scale = Math.min(260 / layout.width, 180 / layout.height);
    return `<article class="template-card"><div class="template-preview" aria-label="${e(t.name)} 꾸미기 미리보기"><div class="template-sheet paper ${e(d.paper)} font-${e(d.font)}" style="width:${layout.width}px;height:${layout.height}px;top:${(205 - layout.height * scale) / 2}px;transform:scale(${scale})" ${d.background_asset_id ? `data-background="${e(d.background_asset_id)}"` : ""} ${d.font_asset_id ? `data-font="${e(d.font_asset_id)}"` : ""}><p>오늘도, 나다운 하루를 기록해요.</p><div class="sticker-layer" aria-hidden="true">${d.stickers.map(s => `<span class="placed-sticker" style="${stickerStyle(s, layout)}"><img data-asset="${e(s.asset_id)}" alt="" hidden></span>`).join("")}</div></div></div><div class="template-caption"><h2>${e(t.name)}</h2><p class="field-help">${d.background_asset_id ? "내 배경" : e(builtinPapers.find(p => p[0] === d.paper)?.[1] || "종이")} · 스티커 ${d.stickers.length}개</p><a class="button soft" href="#/write?template=${e(t.id)}">이 서식으로 쓰기</a><div class="template-actions"><button class="text-button" data-rename-template="${e(t.id)}">이름 바꾸기</button><button class="text-button danger-text" data-delete-template="${e(t.id)}">삭제</button></div></div></article>`;
  }).join("");
  list.querySelectorAll("[data-rename-template]").forEach(b => b.onclick = () => {
    const t = templates.find(x => x.id === b.dataset.renameTemplate);
    const dialog = modal(`<h2>서식 이름 바꾸기</h2><form><label class="field-label" for="rename-template">서식 이름</label><input id="rename-template" maxlength="50" required value="${e(t.name)}"><p class="form-message" role="alert"></p><div class="dialog-actions"><button class="button" type="submit">이름 저장</button></div></form>`);
    dialog.querySelector("form").onsubmit = event => {
      event.preventDefault();
      busy(dialog.querySelector("[type=submit]"), async () => {
        const name = dialog.querySelector("input").value.trim();
        if (!name) return;
        try { await ctx.repo.saveTemplate({ id: t.id, name }); dialog.close(); await templatesPage(root, ctx); }
        catch (error) { dialog.querySelector(".form-message").textContent = errorText(error); }
      });
    };
  });
  list.querySelectorAll("[data-delete-template]").forEach(b => b.onclick = () => busy(b, async () => {
    if (!(await confirmAction("서식을 삭제할까요?", "이 서식으로 쓴 일기와 원본 꾸미기 자료는 그대로 남아요.", "서식 삭제"))) return;
    await ctx.repo.deleteTemplate(b.dataset.deleteTemplate); await templatesPage(root, ctx); toast("서식을 삭제했어요.");
  }));
  await hydrateAssets(list, ctx.repo);
}

