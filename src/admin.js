import { e, icon, busy, toast, errorText, confirmAction, emptyState } from "./ui.js";
import { hydrateAssets } from "./articles.js";

export async function adminPage(root, ctx) {
  if (!ctx.state.isAdmin || ctx.repo.mode !== "cloud") {
    root.innerHTML = emptyState("관리자 전용 공간이에요", "초대와 꾸러미 관리는 운영자만 사용할 수 있어요.", '<a class="button secondary" href="#/home">홈으로</a>');
    return;
  }
  root.innerHTML = `<header class="page-heading"><div><h1>일기장 관리</h1><p>친구를 초대하고, 함께 쓰는 스티커를 정리해요.</p></div></header>
    <section class="admin-invite" aria-labelledby="invite-heading"><div><h2 id="invite-heading">친구 초대</h2><p class="muted">이메일을 입력하면 그 친구만 사용할 초대 링크를 만들어요.<br>링크를 복사해 직접 전달해주세요.</p></div>
      <div><form id="invite-form"><label class="field-label" for="invite-email">초대할 친구의 이메일</label><div class="inline-form"><input type="email" id="invite-email" required maxlength="254" autocomplete="off" placeholder="friend@example.com"><button class="button" type="submit">초대 링크 만들기</button></div><p class="form-message" role="alert"></p></form><div id="invite-result" aria-live="polite"></div></div></section>
    <section class="admin-packs" aria-labelledby="packs-heading"><div class="library-heading"><div><h2 id="packs-heading">스티커 꾸러미</h2><p class="muted">‘다함께 사용하기’로 등록된 스티커를 표지 한 장과 함께 묶어요.</p></div><button class="button secondary" id="new-pack">${icon("plus")} 꾸러미 만들기</button></div><div id="pack-editor"></div><div id="pack-list" class="pack-list" aria-live="polite">꾸러미를 불러오고 있어요…</div></section>`;
  const inviteForm = root.querySelector("#invite-form");
  const emailInput = root.querySelector("#invite-email");
  const resultRoot = root.querySelector("#invite-result");
  let inviting = false;
  emailInput.oninput = () => { resultRoot.replaceChildren(); inviteForm.querySelector(".form-message").textContent = ""; };
  async function invite(recovery = false) {
    if (inviting) return;
    inviting = true;
    const email = emailInput.value.trim();
    inviteForm.querySelector(".form-message").textContent = "";
    resultRoot.replaceChildren();
    emailInput.disabled = true;
    inviteForm.querySelector("[type=submit]").disabled = true;
    try {
      const result = await ctx.repo.invite(email, recovery);
      if (ctx.signal.aborted) return;
      if (!result.invitationLink) {
        resultRoot.innerHTML = `<p class="inline-notice">${e(result.email)}은 이미 가입한 계정이에요. 기존 비밀번호로 로그인할 수 있어요.</p><button class="text-button" id="recovery-link">비밀번호 재설정 링크 만들기</button>`;
        resultRoot.querySelector("button").onclick = event => busy(event.currentTarget, async () => {
          if (await confirmAction("비밀번호 재설정 링크를 만들까요?", `${result.email}에 전달할 링크예요. 친구가 링크에서 새 비밀번호를 저장하면 변경돼요.`, "재설정 링크 만들기")) await invite(true);
        });
        return;
      }
      resultRoot.innerHTML = `<div class="invite-ready"><label class="field-label" for="created-invite">${e(result.email)} · ${result.type === "recovery" ? "비밀번호 재설정" : "초대"} 링크</label><textarea id="created-invite" readonly rows="3" spellcheck="false"></textarea><div class="invite-copy-row"><button class="button secondary" id="copy-invite">링크 복사</button><span class="field-help" id="copy-status" role="status">받는 친구에게 이 링크 전체를 전달해주세요.</span></div><p class="field-help">링크는 한 번 사용할 수 있어요. 만료되면 같은 이메일로 새로 만들어주세요.</p></div>`;
      const field = resultRoot.querySelector("textarea");
      field.value = result.invitationLink;
      resultRoot.querySelector("#copy-invite").onclick = async () => {
        try {
          await navigator.clipboard.writeText(field.value);
          resultRoot.querySelector("#copy-status").textContent = "복사했어요. 친구에게 붙여넣어 전달해주세요.";
        } catch {
          field.focus(); field.select();
          resultRoot.querySelector("#copy-status").textContent = "선택한 링크를 길게 누르거나 Ctrl+C로 복사해주세요.";
        }
      };
    } catch (error) { inviteForm.querySelector(".form-message").textContent = errorText(error); }
    finally { inviting = false; emailInput.disabled = false; inviteForm.querySelector("[type=submit]").disabled = false; }
  }
  inviteForm.onsubmit = event => { event.preventDefault(); busy(inviteForm.querySelector("[type=submit]"), () => invite()); };
  let packs = await ctx.repo.stickerPacks();
  if (ctx.signal.aborted) return;
  const stickers = () => ctx.state.assets.filter(a => a.kind === "sticker" && a.is_shared && !a.archived);
  const list = root.querySelector("#pack-list");
  const editor = root.querySelector("#pack-editor");
  function draw() {
    const available = new Map(stickers().map(a => [a.id, a]));
    list.innerHTML = packs.length ? packs.map(p => {
      const ids = p.asset_ids.filter(id => available.has(id));
      const cover = ids.includes(p.cover_asset_id) ? p.cover_asset_id : ids[0];
      return `<article class="pack-cover"><div class="pack-cover-image">${cover ? `<img data-asset="${e(cover)}" alt="${e(p.name)} 대표 스티커" hidden>` : icon("image")}</div><h3>${e(p.name)}</h3><p class="field-help">스티커 ${ids.length}개</p><div class="pack-actions"><button class="text-button" data-edit-pack="${e(p.id)}">꾸러미 수정</button><button class="text-button danger-text" data-delete-pack="${e(p.id)}">삭제</button></div></article>`;
    }).join("") : '<p class="asset-empty">첫 꾸러미를 만들어보세요. 친구들도 스티커를 고를 때 꾸러미를 펼쳐볼 수 있어요.</p>';
    list.querySelectorAll("[data-edit-pack]").forEach(b => b.onclick = () => busy(b, () => openEditor(packs.find(p => p.id === b.dataset.editPack))));
    list.querySelectorAll("[data-delete-pack]").forEach(b => b.onclick = () => busy(b, async () => {
      if (!(await confirmAction("꾸러미를 삭제할까요?", "묶음만 지워져요. 스티커 원본과 일기에 붙인 스티커는 그대로 남아요.", "꾸러미 삭제"))) return;
      await ctx.repo.deleteStickerPack(b.dataset.deletePack);
      packs = await ctx.repo.stickerPacks(); editor.replaceChildren(); draw(); toast("꾸러미를 삭제했어요.");
    }));
    hydrateAssets(list, ctx.repo);
  }
  async function openEditor(pack = null) {
    await ctx.refreshState();
    if (ctx.signal.aborted) return;
    const assets = stickers();
    const selected = new Set((pack?.asset_ids || []).filter(id => assets.some(a => a.id === id)));
    let cover = selected.has(pack?.cover_asset_id) ? pack.cover_asset_id : [...selected][0];
    editor.innerHTML = `<form class="pack-editor-form"><div class="library-heading"><h3>${pack ? "꾸러미 수정" : "새 꾸러미"}</h3><button class="text-button" type="button" id="cancel-pack">닫기</button></div><label class="field-label" for="pack-name">꾸러미 이름</label><input id="pack-name" maxlength="50" required value="${e(pack?.name || "")}" placeholder="예: 고양이의 하루"><div class="pack-selection-heading"><label for="pack-search">스티커 고르기 <span id="pack-count"></span></label><input id="pack-search" type="search" placeholder="파일 이름으로 찾기" aria-label="공유 스티커 검색"></div><p class="field-help">스티커를 선택한 뒤, 표지로 쓸 한 장의 ‘대표’를 눌러주세요. 최대 200개까지 담을 수 있어요.</p><div class="pack-select-grid"></div><p class="form-message" role="alert"></p><div class="dialog-actions"><button class="button" type="submit">꾸러미 저장</button></div></form>`;
    const form = editor.querySelector("form");
    function drawChoices() {
      const keyword = editor.querySelector("#pack-search").value.trim().toLocaleLowerCase();
      const filtered = assets.filter(a => a.name.toLocaleLowerCase().includes(keyword));
      editor.querySelector("#pack-count").textContent = `· ${selected.size}개 선택`;
      const grid = editor.querySelector(".pack-select-grid");
      grid.innerHTML = filtered.length ? filtered.map(a => `<div class="pack-select-item ${selected.has(a.id) ? "selected" : ""}"><label><input type="checkbox" value="${e(a.id)}" ${selected.has(a.id) ? "checked" : ""}><img data-asset="${e(a.id)}" alt="" hidden><span title="${e(a.name)}">${e(a.name)}</span></label><button type="button" data-cover="${e(a.id)}" aria-pressed="${cover === a.id}" ${selected.has(a.id) ? "" : "disabled"}>${cover === a.id ? "대표 스티커" : "대표로 선택"}</button></div>`).join("") : '<p class="asset-empty">공유 스티커가 없어요. 꾸미기에서 ‘다함께 사용하기’로 등록해주세요.</p>';
      grid.querySelectorAll("input").forEach(input => input.onchange = () => {
        if (input.checked) {
          if (selected.size >= 200) { input.checked = false; toast("꾸러미에는 최대 200개까지 담을 수 있어요.", true); return; }
          selected.add(input.value); cover ||= input.value;
        } else { selected.delete(input.value); if (cover === input.value) cover = [...selected][0]; }
        drawChoices();
        grid.querySelector(`input[value="${input.value}"]`)?.focus({ preventScroll: true });
      });
      grid.querySelectorAll("[data-cover]").forEach(b => b.onclick = () => { cover = b.dataset.cover; drawChoices(); grid.querySelector(`[data-cover="${cover}"]`)?.focus({ preventScroll: true }); });
      hydrateAssets(grid, ctx.repo);
    }
    editor.querySelector("#pack-search").oninput = drawChoices;
    editor.querySelector("#cancel-pack").onclick = () => { editor.replaceChildren(); root.querySelector("#new-pack").focus(); };
    form.onsubmit = event => {
      event.preventDefault();
      busy(form.querySelector("[type=submit]"), async () => {
        const name = form.querySelector("#pack-name").value.trim();
        if (!name || !selected.size || !cover) { form.querySelector(".form-message").textContent = "이름을 적고 스티커를 한 장 이상 선택해주세요."; return; }
        try {
          await ctx.repo.saveStickerPack({ id: pack?.id, name, asset_ids: [...selected], cover_asset_id: cover });
          packs = await ctx.repo.stickerPacks(); editor.replaceChildren(); draw(); toast("꾸러미를 저장했어요."); root.querySelector("#new-pack").focus();
        } catch (error) { form.querySelector(".form-message").textContent = errorText(error); }
      });
    };
    drawChoices(); editor.querySelector("#pack-name").focus();
  }
  root.querySelector("#new-pack").onclick = event => busy(event.currentTarget, () => openEditor());
  draw();
}
