export const e = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const uuid = () => crypto.randomUUID();
const paths = {
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  music:
    '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  pen: '<path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M10 3H4v18h6M9 12h12m-4-4 4 4-4 4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  archive:
    '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M9 12h6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  book: '<path d="M3 4h7l2 2 2-2h7v16h-7l-2 1-2-1H3zM12 6v15"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${e(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
export function toast(message, bad = false) {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.className = `show ${bad ? "error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = ""), 4200);
}
export function errorText(error) {
  const m = error?.message || String(error);
  const map = {};
  map.MEMBER_REQUIRED =
    "아직 이용 승인이 되지 않은 계정이에요. 운영자에게 알려주세요.";
  map.ENTRY_CHANGED_OR_UNAVAILABLE =
    "다른 화면에서 수정된 일기예요. 작성한 내용을 복사한 뒤 다시 열어주세요.";
  Object.assign(map, {
    ADMIN_REQUIRED: "관리자만 사용할 수 있는 기능이에요.",
    INVALID_PACK: "꾸러미 이름과 스티커, 대표 스티커를 확인해주세요.",
    PACK_UNAVAILABLE: "이 꾸러미가 삭제되었어요. 목록을 다시 열어주세요.",
    PACK_ASSET_UNAVAILABLE: "공유 중인 스티커만 넣을 수 있어요. 목록을 새로고침해주세요.",
    INVALID_TEMPLATE: "서식을 저장하지 못했어요. 꾸미기 자료를 다시 확인해주세요.",
    TEMPLATE_UNAVAILABLE: "서식을 찾을 수 없어요. 내 서식에서 다시 선택해주세요.",
    COMMENT_PARENT_UNAVAILABLE: "답글을 달 댓글이 삭제되었어요. 작성한 내용을 확인하고 답글 취소 후 새 댓글로 남겨주세요.",
    comments_parent_in_entry_fkey: "답글을 달 댓글이 삭제되었거나 사용할 수 없어요. 작성한 내용은 그대로 남아 있어요.",
    FUTURE_DIARY_DATE: "미래 날짜로는 쓸 수 없어요.",
    EMPTY_ENTRY: "내용이나 사진을 추가해주세요.",
    INVALID_MUSIC:
      "음악 링크를 확인해주세요. YouTube 또는 YouTube Music 공유 링크를 넣을 수 있어요.",
    ASSET_TYPE_OR_OWNER_MISMATCH:
      "사용할 수 없는 첨부 파일이에요. 다시 선택해주세요.",
    "Invalid login credentials": "이메일이나 비밀번호를 다시 확인해주세요.",
    "Email not confirmed": "이메일로 받은 초대 링크를 먼저 열어주세요.",
    "Failed to fetch":
      "연결이 끊겼어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요.",
    "fetch failed": "인터넷 연결을 확인해주세요.",
    FORBIDDEN: "내가 작성한 내용만 변경할 수 있어요.",
  });
  for (const [code, text] of Object.entries(map))
    if (m.includes(code)) return text;
  if (error?.userMessage) return error.userMessage;
  return "처리하지 못했어요. 입력한 내용은 그대로 두고 다시 시도해주세요.";
}
export function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}
export async function busy(button, action) {
  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    return await action();
  } catch (error) {
    console.error(error);
    toast(errorText(error), true);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}
export function modal(html, className = "") {
  const d = document.createElement("dialog");
  if (!document.querySelector("dialog[open]")) d.id = "modal";
  document.body.append(d);
  const returnFocus = document.activeElement;
  d.className = className;
  d.innerHTML = `<button class="icon-button modal-close" aria-label="닫기">${icon("close")}</button>${html}`;
  d.querySelector(".modal-close").onclick = () => d.close();
  d.onclick = (event) => {
    if (event.target === d) {
      const r = d.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        d.close();
    }
  };
  d.onclose = () => {
    d.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  };
  d.showModal();
  return d;
}
export function confirmAction(title, description, label = "삭제하기") {
  return new Promise((resolve) => {
    const d = modal(
      `<h2>${e(title)}</h2><p class="muted">${e(description)}</p><div class="dialog-actions"><button class="button secondary" data-no>취소</button><button class="button danger" data-yes>${e(label)}</button></div>`,
    );
    d.querySelector("[data-no]").onclick = () => {
      d.close();
      resolve(false);
    };
    d.querySelector("[data-yes]").onclick = () => {
      d.close();
      resolve(true);
    };
    d.addEventListener("close", () => resolve(false), { once: true });
    d.querySelector("[data-no]").focus();
  });
}
export function emptyState(title, body, action = "") {
  return `<div class="empty-state"><span class="empty-icon">${icon("book")}</span><h2>${e(title)}</h2><p>${e(body)}</p>${action}</div>`;
}
export function contrast(color) {
  const n = color.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#202331" : "#ffffff";
}
