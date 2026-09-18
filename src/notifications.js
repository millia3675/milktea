import { e, icon, busy, emptyState, errorText, toast } from "./ui.js";
import { avatar, hydrateAssets } from "./articles.js";
import { notificationPreview } from "./notification-data.js";

export function mountNotificationNav(app, path, repo, signal) {
  const badge = '<span class="notification-count" data-notification-count hidden aria-hidden="true"></span>';
  app.querySelector('.sidebar > a[href="#/home"].nav-item')?.insertAdjacentHTML("afterend",
    `<a class="nav-item ${path === "/notifications" ? "active" : ""}" href="#/notifications" data-notification-link ${path === "/notifications" ? 'aria-current="page"' : ""}>${icon("bell")}<span>알림</span>${badge}</a>`);
  const settings = app.querySelector('.topbar-mobile > a[href="#/settings/profile"]');
  const actions = document.createElement("div");
  actions.className = "mobile-account-actions";
  actions.innerHTML = `<a class="icon-button notification-bell" href="#/notifications" aria-label="알림" data-notification-link>${icon("bell")}${badge}</a>`;
  settings.before(actions); actions.append(settings);
  let request = 0;
  const refresh = async () => {
    const current = ++request;
    try {
      const count = await repo.unreadNotifications();
      if (signal.aborted || current !== request) return;
      for (const link of app.querySelectorAll("[data-notification-link]")) {
        link.setAttribute("aria-label", count ? `알림, 읽지 않은 알림 ${count}개` : "알림");
        const node = link.querySelector("[data-notification-count]");
        node.hidden = !count; node.textContent = count > 99 ? "99+" : String(count);
      }
    } catch { /* Keep navigation usable; the inbox exposes errors and retry. */ }
  };
  const visibleRefresh = () => { if (!document.hidden) refresh(); };
  const timer = setInterval(visibleRefresh, 60000);
  window.addEventListener("focus", visibleRefresh, { signal });
  document.addEventListener("visibilitychange", visibleRefresh, { signal });
  signal.addEventListener("abort", () => clearInterval(timer), { once: true });
  refresh();
  return refresh;
}

export async function notificationsPage(root, ctx) {
  root.innerHTML = `<div class="notifications-page"><header class="page-heading"><div><h1>알림</h1><p>내 일기에 달린 댓글과 내 댓글에 온 답글을 모았어요.</p></div><button class="button secondary" id="notifications-read-all">모두 읽음</button></header><div class="notification-filters" role="group" aria-label="알림 보기"><button class="button secondary" data-notification-filter="all" aria-pressed="true">전체</button><button class="button secondary" data-notification-filter="unread" aria-pressed="false">안 읽은 알림</button><button class="text-button" id="notifications-refresh">새로고침</button></div><p id="notification-status" role="status" class="field-help"></p><div id="notification-list"></div><div class="more-row"><button class="button secondary" id="notifications-more" hidden>이전 알림 더 보기</button></div></div>`;
  const list = root.querySelector("#notification-list"), moreButton = root.querySelector("#notifications-more");
  const status = root.querySelector("#notification-status"), readAll = root.querySelector("#notifications-read-all");
  let unread = false, items = [], request = 0;
  const time = value => new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
  const row = n => `<a class="notification-row ${n.read_at ? "" : "unread"}" data-notification="${e(n.id)}" href="#/entries/${e(n.entry_id)}?comment=${e(n.comment_id)}&notification=${e(n.id)}">${avatar(n.actor)}<div class="notification-copy"><p class="notification-summary"><strong>${e(n.actor?.nickname || "친구")}</strong>님이 ${n.kind === "comment_reply" ? "내 댓글에 답글을 남겼어요." : "내 일기에 댓글을 남겼어요."}${n.read_at ? "" : '<span class="notification-unread-label">안 읽음</span>'}</p><p class="notification-preview">${e(notificationPreview(n.comment))}</p><p class="notification-context">${e(n.entry?.title || "제목 없는 일기")} <span aria-hidden="true">·</span> <time datetime="${e(n.created_at)}">${e(time(n.created_at))}</time></p></div>${icon("chevron")}</a>`;
  async function load(reset = false) {
    const current = ++request;
    moreButton.disabled = true;
    status.textContent = "알림을 불러오고 있어요…";
    if (reset) { items = []; list.replaceChildren(); moreButton.hidden = true; }
    try {
      const result = await ctx.repo.notifications({ unread, before: reset ? null : items.at(-1) });
      if (ctx.signal.aborted || current !== request) return;
      const known = new Set(items.map(n => n.id));
      const incoming = result.items.filter(n => !known.has(n.id));
      items.push(...incoming);
      if (!items.length) list.innerHTML = emptyState(unread ? "새로운 알림을 모두 읽었어요" : "아직 도착한 알림이 없어요", "친구가 댓글이나 답글을 남기면 여기서 볼 수 있어요.");
      else list.insertAdjacentHTML("beforeend", incoming.map(row).join(""));
      moreButton.hidden = !result.more;
      status.textContent = `${unread ? "안 읽은 알림" : "알림"} ${items.length}개${result.more ? " · 이전 알림이 더 있어요" : ""}`;
      await hydrateAssets(list, ctx.repo);
      ctx.refreshNotifications();
    } catch (error) {
      if (ctx.signal.aborted || current !== request) return;
      status.textContent = errorText(error);
      if (!items.length) list.innerHTML = emptyState("알림을 불러오지 못했어요", "위의 새로고침을 눌러 다시 시도해주세요.");
    } finally { if (current === request) moreButton.disabled = false; }
  }
  root.querySelectorAll("[data-notification-filter]").forEach(button => button.onclick = () => {
    unread = button.dataset.notificationFilter === "unread";
    root.querySelectorAll("[data-notification-filter]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    load(true);
  });
  root.querySelector("#notifications-refresh").onclick = () => load(true);
  moreButton.onclick = () => load();
  readAll.onclick = () => busy(readAll, async () => {
    await ctx.markNotificationsRead();
    if (ctx.signal.aborted) return;
    toast("모든 알림을 읽음으로 표시했어요.");
    await load(true);
  });
  await load(true);
}
