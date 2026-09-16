import {
  mountLibrary,
  fontOptions,
  builtinPapers,
} from "./decoration-library.js";
import { e, icon, busy, toast, modal, confirmAction, userError, errorText } from "./ui.js";
import { avatar, hydrateAssets } from "./articles.js";
import { pickFiles, uploadImage, readImage } from "./media.js";
import { drawAvatar } from "./avatar-crop.js";
import { client } from "./repository.js";
const colors = [
  "#6C80D9",
  "#A18BCC",
  "#D990AA",
  "#699F8E",
  "#BF995C",
  "#648FAE",
];
const backgrounds = [
  "#F3F5FF",
  "#FFF3F7",
  "#F0F7F1",
  "#FFF8E9",
  "#F2F7FB",
  "#FAF5FC",
];
function colorField(label, key, value, choices) {
  return `<div class="form-field"><label for="${key}">${label}</label><div class="color-swatches">${choices.map((c) => `<button type="button" class="color-choice ${c.toLowerCase() === value.toLowerCase() ? "selected" : ""}" style="--color:${c}" data-color-target="${key}" data-color="${c}" aria-label="${label} ${c}" aria-pressed="${c.toLowerCase() === value.toLowerCase()}"></button>`).join("")}<label class="custom-color-label" for="${key}">직접 선택 <input type="color" id="${key}" name="${key}" value="${e(value)}"></label></div></div>`;
}
async function cropAvatar(repo, file) {
  const bitmap = await readImage(file, "avatar");
  return new Promise((resolve) => {
    let completed = false;
    const finish = (value) => {
      if (completed) return;
      completed = true;
      bitmap.close();
      resolve(value);
    };
    const d = modal(
      `<h2>프로필 사진 맞추기</h2><p class="muted">크기와 위치를 조절해 원 안에 맞춰주세요.</p><div class="crop-preview"><canvas width="512" height="512" role="img" aria-label="저장될 프로필 사진 미리보기" id="crop-photo"></canvas></div><div class="crop-controls"><label for="crop-zoom">사진 크기 <output id="crop-zoom-value" for="crop-zoom">100%</output></label><div class="crop-zoom-row"><button type="button" id="crop-zoom-out" aria-label="사진 축소">−</button><input id="crop-zoom" type="range" min="1" max="4" step="0.1" value="1"><button type="button" id="crop-zoom-in" aria-label="사진 확대">+</button></div><label>가로 위치<input id="crop-x" type="range" min="0" max="1" step="0.01" value="0.5"></label><label>세로 위치<input id="crop-y" type="range" min="0" max="1" step="0.01" value="0.5"></label></div><p class="inline-error" id="crop-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" id="crop-reset">처음으로</button><button class="button" id="crop-save">이 사진 사용</button></div>`,
    );
    const options = () => ({
      x: Number(d.querySelector("#crop-x").value),
      y: Number(d.querySelector("#crop-y").value),
      zoom: Number(d.querySelector("#crop-zoom").value),
    });
    const preview = () => {
      drawAvatar(d.querySelector("#crop-photo"), bitmap, options());
      const zoom = options().zoom;
      d.querySelector("#crop-zoom-value").value = `${Math.round(zoom * 100)}%`;
      d.querySelector("#crop-zoom-out").disabled = zoom <= 1;
      d.querySelector("#crop-zoom-in").disabled = zoom >= 4;
    };
    d.querySelectorAll("input").forEach(input => input.oninput = preview);
    for (const [id, delta] of [["crop-zoom-out", -0.1], ["crop-zoom-in", 0.1]])
      d.querySelector(`#${id}`).onclick = () => {
        d.querySelector("#crop-zoom").value = String(options().zoom + delta);
        preview();
      };
    d.querySelector("#crop-reset").onclick = () => {
      d.querySelector("#crop-zoom").value = "1";
      d.querySelector("#crop-x").value = d.querySelector("#crop-y").value = "0.5";
      preview();
    };
    preview();
    d.querySelector("#crop-save").onclick = (event) =>
      busy(event.currentTarget, async () => {
        const message = d.querySelector("#crop-error");
        message.hidden = true;
        try {
          const asset = await uploadImage(repo, file, "avatar", options());
          finish(asset);
          d.close();
        } catch (error) {
          message.textContent = errorText(error);
          message.hidden = false;
        }
      });
    d.addEventListener("close", () => finish(null), { once: true });
  });
}
export async function settingsPage(root, ctx, section) {
  if (!["profile", "theme", "diary", "decorate", "account"].includes(section))
    section = "profile";
  root.innerHTML = `<header class="page-heading"><div><h1>나답게, 밀크티</h1><p>좋아하는 모습으로 내 일기장을 꾸며요.</p></div></header><nav class="settings-nav" aria-label="설정 분류">${[
    ["profile", "프로필"],
    ["theme", "테마"],
    ["diary", "일기"],
    ["decorate", "꾸미기"],
    ["account", "계정"],
  ]
    .map(
      ([key, name]) =>
        `<a href="#/settings/${key}" class="${section === key ? "active" : ""}" ${section === key ? 'aria-current="page"' : ""}>${name}</a>`,
    )
    .join("")}</nav><div class="settings-content" id="settings-content"></div>`;
  const content = root.querySelector("#settings-content");
  let own = ctx.state.profiles.find((p) => p.id === ctx.me.id);
  if (section === "profile" || section === "theme") {
    let avatarId = own.avatar_asset_id;
    content.innerHTML = `<form id="profile-form" class="settings-card">${section === "profile" ? `<div class="profile-avatar-picker"><div id="profile-avatar">${avatar(own, "large")}</div><div class="avatar-buttons"><button type="button" id="choose-avatar">사진 선택</button><button type="button" id="remove-avatar">제거</button></div></div><div class="form-field"><label for="nickname">닉네임</label><input id="nickname" name="nickname" maxlength="20" required value="${e(own.nickname)}" autocomplete="nickname"><span class="field-help">로그인 이메일과 별개예요. 친구들에게는 이 이름으로 보여요.</span></div>` : '<h2>내 일기장의 색</h2><p class="muted small">친구가 내 일기장을 방문했을 때도 이 색으로 보여요.</p>'}${colorField("내 포인트 색상", "main_color", own.main_color, colors)}${colorField("일기장 배경색", "background_color", own.background_color, backgrounds)}<div class="settings-actions"><button type="submit" class="button">${section === "profile" ? "프로필 저장" : "테마 저장"}</button></div></form>`;
    const form = content.querySelector("form");
    form.querySelectorAll("[data-color-target]").forEach(
      (btn) =>
        (btn.onclick = () => {
          form.elements[btn.dataset.colorTarget].value = btn.dataset.color;
          form
            .querySelectorAll(
              `[data-color-target="${btn.dataset.colorTarget}"]`,
            )
            .forEach((b) => {
              b.classList.toggle("selected", b === btn);
              b.setAttribute("aria-pressed", b === btn);
            });
        }),
    );
    form.querySelectorAll("input[type=color]").forEach(
      (input) =>
        (input.oninput = () =>
          form
            .querySelectorAll(`[data-color-target="${input.id}"]`)
            .forEach((b) => {
              const on =
                b.dataset.color.toLowerCase() === input.value.toLowerCase();
              b.classList.toggle("selected", on);
              b.setAttribute("aria-pressed", on);
            })),
    );
    const updateAvatar = () => {
      const el = form.querySelector("#profile-avatar");
      el.innerHTML = avatar({ ...own, avatar_asset_id: avatarId }, "large");
      hydrateAssets(el, ctx.repo);
    };
    form.querySelector("#choose-avatar")?.addEventListener("click", (event) =>
      busy(event.currentTarget, async () => {
        const files = await pickFiles("image/jpeg,image/png,image/webp");
        if (!files.length) return;
        const asset = await cropAvatar(ctx.repo, files[0]);
        if (asset) {
          avatarId = asset.id;
          updateAvatar();
        }
      }),
    );
    form.querySelector("#remove-avatar")?.addEventListener("click", () => {
      avatarId = null;
      updateAvatar();
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      busy(form.querySelector("[type=submit]"), async () => {
        const nickname =
          section === "profile"
            ? form.elements.nickname.value.trim()
            : own.nickname;
        if (!nickname) throw userError("닉네임을 적어주세요.");
        await ctx.repo.saveProfile({
          nickname,
          avatar_asset_id: avatarId,
          main_color: form.elements.main_color.value,
          background_color: form.elements.background_color.value,
        });
        toast(
          section === "profile"
            ? "프로필을 저장했어요."
            : "일기장 색을 저장했어요.",
        );
        await ctx.reload();
      });
    };
    await hydrateAssets(content, ctx.repo);
    return;
  }
  if (section === "diary") {
    const p = ctx.state.preferences;
    content.innerHTML = `<form class="settings-card" id="preferences-form"><h2>내 기록을 보는 방법</h2><div class="form-field"><label>연참 표시</label><div class="radio-group"><label class="radio-option"><input type="radio" name="streak_mode" value="weekly" ${p.streak_mode === "weekly" ? "checked" : ""}>Weekly · 이번 주</label><label class="radio-option"><input type="radio" name="streak_mode" value="monthly" ${p.streak_mode === "monthly" ? "checked" : ""}>Monthly · 이번 달</label></div><span class="field-help">나와 친구의 연참을 볼 때 적용돼요. 연참은 게시한 일기로 계산하며 임시저장은 제외해요.</span></div><div class="form-field"><label for="default-paper">기본 종이</label><select id="default-paper" name="default_paper">${builtinPapers
      .map(
        ([v, l]) =>
          `<option value="${v}" ${p.default_paper === v && !p.default_background_asset_id ? "selected" : ""}>${l}</option>`,
      )
      .join("")}${ctx.state.assets
      .filter(
        (a) =>
          a.kind === "background" &&
          (!a.archived || a.id === p.default_background_asset_id),
      )
      .map(
        (a) =>
          `<option value="asset:${a.id}" ${p.default_background_asset_id === a.id ? "selected" : ""}>${e(a.name)}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="form-field"><label for="default-font">기본 글씨체</label><select id="default-font" name="default_font">${fontOptions(ctx.state.assets, p.default_font, p.default_font_asset_id)}</select><span class="field-help">새로 쓰는 일기에 적용돼요. 예전 일기는 그대로 유지됩니다.</span></div><div class="settings-actions"><button class="button" type="submit">일기 설정 저장</button></div></form><section class="settings-card"><h2>나의 생활 기록 항목</h2><p class="muted small">체크하는 항목과 숫자로 적는 항목을 만들 수 있어요.</p><div id="habit-fields">${
      ctx.state.habits
        .filter((h) => !h.archived)
        .map(
          (h) =>
            `<div class="habit-setting-row"><span>${e(h.name)}</span><span class="muted">${h.type === "boolean" ? "체크" : `숫자 · ${e(h.unit) || "단위 없음"}`}</span><button class="icon-button" data-archive-habit="${e(h.id)}" aria-label="${e(h.name)} 항목 숨기기">${icon("trash")}</button></div>`,
        )
        .join("") ||
      '<p class="field-help">아래에서 첫 항목을 만들어주세요.</p>'
    }</div><form class="habit-add" id="habit-form"><label class="sr-only" for="habit-name">새 생활 기록 이름</label><input id="habit-name" name="name" maxlength="30" placeholder="예: 수면" required><label class="sr-only" for="habit-type">기록 방식</label><select id="habit-type" name="type"><option value="boolean">체크</option><option value="number">숫자</option></select><label class="sr-only" for="habit-unit">숫자 단위</label><input id="habit-unit" name="unit" maxlength="10" placeholder="단위" disabled><button class="button secondary" type="submit">${icon("plus")} 항목 추가</button></form><p class="field-help">숨긴 항목도 예전 일기에서는 그대로 볼 수 있어요.</p></section>`;
    const form = content.querySelector("#preferences-form");
    form.onsubmit = (event) => {
      event.preventDefault();
      busy(form.querySelector("[type=submit]"), async () => {
        const paper = form.elements.default_paper.value,
          font = form.elements.default_font.value;
        await ctx.repo.savePreferences({
          streak_mode: form.elements.streak_mode.value,
          default_paper: paper.startsWith("asset:") ? "white" : paper,
          default_background_asset_id: paper.startsWith("asset:")
            ? paper.slice(6)
            : null,
          default_font: font.startsWith("asset:") ? "system" : font,
          default_font_asset_id: font.startsWith("asset:")
            ? font.slice(6)
            : null,
        });
        toast("일기 설정을 저장했어요.");
        await ctx.refreshState();
      });
    };
    const habits = content.querySelector("#habit-form");
    habits.elements.type.onchange = () =>
      (habits.elements.unit.disabled = habits.elements.type.value !== "number");
    habits.onsubmit = (event) => {
      event.preventDefault();
      busy(habits.querySelector("[type=submit]"), async () => {
        if (ctx.state.habits.filter((h) => !h.archived).length >= 30)
          throw userError("생활 기록은 최대 30개까지 사용해주세요.");
        const name = habits.elements.name.value.trim();
        if (!name) throw userError("항목 이름을 적어주세요.");
        await ctx.repo.saveHabit({
          name,
          type: habits.elements.type.value,
          unit:
            habits.elements.type.value === "number"
              ? habits.elements.unit.value.trim()
              : "",
          position: Math.min(100, ctx.state.habits.length),
        });
        toast("생활 기록 항목을 추가했어요.");
        await ctx.reload();
      });
    };
    content.querySelectorAll("[data-archive-habit]").forEach(
      (btn) =>
        (btn.onclick = () =>
          busy(btn, async () => {
            if (
              !(await confirmAction(
                "이 항목을 숨길까요?",
                "새 일기에서는 빠지고, 예전 일기의 기록은 그대로 남아요.",
                "숨기기",
              ))
            )
              return;
            const h = ctx.state.habits.find(
              (x) => x.id === btn.dataset.archiveHabit,
            );
            await ctx.repo.saveHabit({ ...h, archived: true });
            await ctx.reload();
          })),
    );
    return;
  }
  if (section === "decorate") {
    content.innerHTML =
      ["font", "sticker", "background"]
        .map(
          (kind) =>
            `<section class="settings-card library-section" data-library="${kind}"></section>`,
        )
        .join("") +
      '<p class="inline-notice">공유 자료는 초대된 친구들끼리 사용해요. 라이브러리에서 숨겨도 예전 일기의 꾸미기는 유지돼요.</p>';
    for (const section of content.querySelectorAll("[data-library]"))
      await mountLibrary(section, ctx, section.dataset.library);
    return;
  }
  if (section === "account") {
    if (ctx.repo.mode === "demo") {
      content.innerHTML =
        '<section class="settings-card"><h2>체험 공간을 사용하고 있어요</h2><p class="muted">이 공간은 브라우저에만 저장됩니다. 실제 친구 계정이나 비밀번호를 사용하지 않아요.</p><button class="button soft" id="account-help">친구들과 함께 쓰는 방법</button></section>';
      content.querySelector("#account-help").onclick = ctx.setupHelp;
      return;
    }
    content.innerHTML = `<section class="settings-card"><h2>내 계정</h2><p class="muted">${e(ctx.me.email)}</p><form id="password-form"><div class="form-field"><label for="new-password">새 비밀번호</label><input type="password" id="new-password" name="password" minlength="12" autocomplete="new-password" required><span class="field-help">12자 이상으로 입력해주세요.</span></div><div class="form-field"><label for="confirm-password">새 비밀번호 확인</label><input type="password" id="confirm-password" name="confirmation" minlength="12" autocomplete="new-password" required></div><div class="settings-actions"><button class="button" type="submit">비밀번호 변경</button></div></form></section>`;
    const form = content.querySelector("form");
    form.onsubmit = (event) => {
      event.preventDefault();
      busy(form.querySelector("[type=submit]"), async () => {
        if (form.elements.password.value !== form.elements.confirmation.value)
          throw userError("두 비밀번호가 일치하지 않아요.");
        const { error } = await client.auth.updateUser({
          password: form.elements.password.value,
        });
        if (error) throw error;
        form.reset();
        toast("비밀번호를 변경했어요.");
      });
    };
  }
}
