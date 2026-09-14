import "./styles.css";
import {
  CloudRepository,
  DemoRepository,
  configured,
  client,
} from "./repository.js";
import {
  e,
  icon,
  busy,
  toast,
  errorText,
  confirmAction,
  modal,
  contrast,
  emptyState,
} from "./ui.js";
import { today, validDate } from "./dates.js";
import { safeColor } from "./validation.js";
import { avatar, hydrateAssets } from "./articles.js";
import { homePage, personPage, detailPage, draftsPage } from "./pages.js";

const app = document.querySelector("#app");
let repo,
  me,
  state,
  routeController,
  editor,
  renderVersion = 0,
  currentHash = "",
  allowNavigation = false,
  loading = false;
const params = new URLSearchParams(location.search);
if (params.get("demo") === "1") {
  sessionStorage.setItem("milktea-demo", "1");
  history.replaceState(
    null,
    "",
    location.pathname + (location.hash || "#/home"),
  );
}
const demoEnabled = () => sessionStorage.getItem("milktea-demo") === "1";
function setupHelp() {
  modal(
    `<h2>친구들과 함께 쓰려면</h2><p class="muted">지금은 체험 공간이에요. 여기서 쓴 내용은 이 브라우저에만 저장됩니다.</p><ol class="connection-steps"><li><a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">Supabase</a>에 가입하고 새 프로젝트를 만들어주세요.</li><li>프로젝트가 준비되면 Codex에 알려주세요. 일기 저장 공간과 로그인 연결을 이어서 진행할 수 있어요.</li><li>연결이 끝난 뒤 친구 계정을 초대하면 같은 일기장을 함께 쓰게 됩니다.</li></ol><p class="small muted">체험 공간의 예시 친구와 일기는 실제 모임에 자동으로 옮겨지지 않습니다.</p><a class="button soft" href="./setup.html" target="_blank" rel="noopener">연결 안내 열기</a>`,
  );
}
function applyTheme(profile) {
  const accent = safeColor(profile?.main_color);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-text", contrast(accent));
  document.documentElement.style.setProperty(
    "--page",
    safeColor(profile?.background_color, "#F3F5FF"),
  );
}
function unreadFor(id) {
  const reads = new Map(state.reads.map((x) => [x.entry_id, x.last_read_at]));
  return state.entries.some(
    (x) =>
      x.author_id === id &&
      x.author_id !== me.id &&
      x.status === "published" &&
      x.diary_date === today() &&
      (!reads.has(x.id) || x.published_at > reads.get(x.id)),
  );
}
function renderShell(path) {
  const own = state.profiles.find((x) => x.id === me.id);
  const personId = path.match(/^\/people\/([^/]+)/)?.[1];
  const selected = state.profiles.find((x) => x.id === personId) || own;
  applyTheme(selected);
  const friends = [...state.profiles].sort((a, b) =>
    a.id === me.id
      ? -1
      : b.id === me.id
        ? 1
        : a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  app.innerHTML = `<div class="shell"><aside class="sidebar" aria-label="주 메뉴"><a class="brand" href="#/home"><img src="./favicon.svg" alt="">밀크티</a><p class="brand-caption">친구들과 나누는 교환일기</p><a class="nav-item ${path === "/home" ? "active" : ""}" href="#/home">${icon("home")}<span>홈</span></a><div class="nav-caption">우리의 일기장</div><div class="friend-list">${friends.map((p) => `<a class="nav-item ${personId === p.id ? "active" : ""}" href="#/people/${e(p.id)}" ${personId === p.id ? 'aria-current="page"' : ""}>${avatar(p)}<span class="nickname">${e(p.nickname)}</span>${p.id === me.id ? '<small class="me-label">나</small>' : ""}<i class="unread-dot" data-unread-user="${e(p.id)}" ${unreadFor(p.id) ? "" : "hidden"} aria-label="아직 읽지 않은 오늘 일기"></i></a>`).join("")}</div><nav class="nav-bottom"><a class="nav-item ${path.startsWith("/settings") ? "active" : ""}" href="#/settings/profile">${icon("settings")}<span>설정</span></a><button class="nav-item" id="logout">${icon("logout")}<span>${repo.mode === "demo" ? "체험 나가기" : "로그아웃"}</span></button></nav></aside><div class="mobile-menu-overlay"></div><div class="topbar-mobile"><button class="icon-button" id="mobile-menu" aria-label="친구 목록 열기" aria-expanded="false">${icon("menu")}</button><a class="mobile-brand" href="#/home">밀크티</a><a href="#/settings/profile" aria-label="내 설정">${avatar(own, "tiny")}</a></div>${repo.mode === "demo" ? '<div class="demo-banner"><span>체험 공간 · 이 브라우저에만 저장돼요</span><button class="text-button" id="setup-help">친구들과 쓰려면</button></div>' : ""}<main class="main" id="main" tabindex="-1"><div class="loading-block" role="status">일기장을 펼치고 있어요…</div></main></div>`;
  app.querySelector("#setup-help")?.addEventListener("click", setupHelp);
  app.querySelector("#logout").addEventListener("click", (event) =>
    busy(event.currentTarget, async () => {
      if (
        editor?.dirty &&
        !(await confirmAction(
          "작성 중인 일기를 남겨둘까요?",
          "저장하지 않고 나가면 현재 변경 내용이 사라져요.",
          "저장하지 않고 나가기",
        ))
      )
        return;
      editor?.destroy();
      editor = null;
      await repo.logout();
      me = null;
      renderLogin();
    }),
  );
  const side = app.querySelector(".sidebar"),
    overlay = app.querySelector(".mobile-menu-overlay"),
    toggle = app.querySelector("#mobile-menu");
  const closeMenu = () => {
    side.classList.remove("open");
    overlay.classList.remove("show");
    toggle.setAttribute("aria-expanded", "false");
    side.removeAttribute("role");
    side.removeAttribute("aria-modal");
    document.body.style.overflow = "";
    toggle.focus();
  };
  toggle.onclick = () => {
    side.classList.add("open");
    overlay.classList.add("show");
    toggle.setAttribute("aria-expanded", "true");
    side.setAttribute("role", "dialog");
    side.setAttribute("aria-modal", "true");
    document.body.style.overflow = "hidden";
    side.querySelector("a").focus();
  };
  overlay.onclick = closeMenu;
  side.addEventListener("keydown", (event) => {
    if (!side.classList.contains("open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
    if (event.key === "Tab") {
      const items = [...side.querySelectorAll("a,button")];
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  hydrateAssets(side, repo);
  hydrateAssets(app.querySelector(".topbar-mobile"), repo);
}
async function render() {
  if (!me) return renderLogin();
  const version = ++renderVersion;
  loading = true;
  routeController?.abort();
  routeController = new AbortController();
  editor?.destroy();
  editor = null;
  document.body.style.overflow = "";
  const hash = location.hash.startsWith("#/") ? location.hash : "#/home";
  currentHash = hash;
  const [path, query = ""] = hash.slice(1).split("?");
  const search = new URLSearchParams(query);
  try {
    state = await repo.bootstrap();
    if (version !== renderVersion) return;
    if (path === "/home" && !validDate(search.get("date") || today()))
      search.set("date", today());
    if (
      search.has("month") &&
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(search.get("month"))
    )
      search.set("month", today().slice(0, 7));
    renderShell(path);
    const root = app.querySelector("#main");
    const ctx = {
      repo,
      me,
      state,
      signal: routeController.signal,
      go,
      reload: render,
      setEditor(value) {
        editor = value;
      },
      async refreshState() {
        state = await repo.bootstrap();
        ctx.state = state;
      },
      markRead(id) {
        if (state.reads.some((x) => x.entry_id === id)) return;
        const now = new Date().toISOString();
        state.reads.push({ entry_id: id, last_read_at: now, user_id: me.id });
        repo
          .markRead(id)
          .then(() => {
            app
              .querySelectorAll("[data-unread-user]")
              .forEach((el) => (el.hidden = !unreadFor(el.dataset.unreadUser)));
          })
          .catch(() => {
            state.reads = state.reads.filter((x) => x.entry_id !== id);
          });
      },
      setupHelp,
    };
    if (path === "/home") await homePage(root, ctx, search);
    else if (path.startsWith("/people/")) {
      const parts = path.split("/");
      await personPage(root, ctx, parts[2], parts[3] === "archive", search);
    } else if (path.startsWith("/entries/"))
      await detailPage(root, ctx, path.split("/")[2]);
    else if (path === "/drafts") draftsPage(root, ctx);
    else if (path === "/write" || path.startsWith("/write/")) {
      const { editorPage } = await import("./editor.js");
      await editorPage(root, ctx, path.split("/")[2], search);
    } else if (path.startsWith("/settings")) {
      const { settingsPage } = await import("./settings.js");
      await settingsPage(root, ctx, path.split("/")[2] || "profile");
    } else
      root.innerHTML = emptyState(
        "없는 페이지예요",
        "홈에서 다시 시작해주세요.",
        '<a class="button" href="#/home">홈으로</a>',
      );
    if (version === renderVersion)
      document.title =
        (root.querySelector("h1")?.textContent || "우리만의 교환일기") +
        " · 밀크티";
  } catch (error) {
    if (version !== renderVersion) return;
    console.error(error);
    if (error.message.includes("MEMBER_REQUIRED")) {
      app.innerHTML = `<div class="login-page"><div class="login-card"><div class="login-brand">밀크티</div><h2>이용 승인을 기다리고 있어요</h2><p>로그인은 되었어요. 모임 운영자가 계정을 승인하면 일기장을 열 수 있습니다.</p><button class="button" id="retry-member">다시 확인</button><button class="text-button" id="member-logout">로그아웃</button></div></div>`;
      app.querySelector("#retry-member").onclick = render;
      app.querySelector("#member-logout").onclick = () =>
        busy(app.querySelector("#member-logout"), async () => {
          await repo.logout();
          me = null;
          renderLogin();
        });
    } else {
      const root = app.querySelector("#main") || app;
      root.innerHTML = emptyState(
        "일기장을 열지 못했어요",
        errorText(error),
        '<button class="button secondary" id="retry-load">다시 시도</button>',
      );
      root.querySelector("#retry-load").onclick = render;
    }
  } finally {
    if (version === renderVersion) loading = false;
  }
}
async function canLeave() {
  if (editor?.dirty)
    return confirmAction(
      "아직 저장하지 않은 내용이 있어요",
      "이동하면 이번에 수정한 내용이 사라져요. 먼저 임시저장하거나 게시해주세요.",
      "저장하지 않고 이동",
    );
  return true;
}
async function go(hash) {
  allowNavigation = true;
  if (location.hash === hash) {
    allowNavigation = false;
    await render();
  } else location.hash = hash;
}
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#/"]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  (async () => {
    if (await canLeave()) {
      window.scrollTo(0, 0);
      await go(link.getAttribute("href"));
    }
  })();
});
window.addEventListener("hashchange", async () => {
  if (!allowNavigation && !(await canLeave())) {
    history.replaceState(
      null,
      "",
      location.pathname + location.search + currentHash,
    );
    return;
  }
  allowNavigation = false;
  await render();
  window.scrollTo(0, 0);
});
window.addEventListener("beforeunload", (event) => {
  if (editor?.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function renderLogin() {
  routeController?.abort();
  editor?.destroy();
  editor = null;
  document.body.style.overflow = "";
  applyTheme(null);
  ++renderVersion;
  app.innerHTML = `<main class="login-page" id="main"><section class="login-card"><div class="login-brand"><img src="./favicon.svg" alt="">밀크티</div><p>친구들과 나누는 작은 교환일기장</p>${configured ? `<form id="login-form"><label for="email">이메일</label><input id="email" name="email" type="email" autocomplete="username" placeholder="초대받은 이메일" required><label for="password">비밀번호</label><input id="password" name="password" type="password" autocomplete="current-password" required><div class="login-error" role="alert"></div><button class="button" type="submit">일기장 열기</button></form><div class="login-links"><button id="forgot-password">비밀번호를 잊었어요</button></div>` : `<div class="connection-note"><strong>일기장이 준비되고 있어요</strong>아래 체험 공간에서 일기를 쓰고 꾸며볼 수 있어요. 실제 친구 모임 연결은 다음 단계에서 진행합니다.</div>`}<div class="${configured ? "login-note" : ""}"><button class="button ${configured ? "secondary" : ""}" id="start-demo">${icon("book")} 체험 일기장 열기</button><p class="field-help" style="text-align:center;margin-top:12px">체험 내용은 이 브라우저에만 저장돼요.</p></div>${!configured ? '<div class="login-links"><button id="setup-help">친구들과 함께 쓰려면</button></div>' : ""}</section></main>`;
  app.querySelector("#start-demo").onclick = (event) =>
    busy(event.currentTarget, async () => {
      sessionStorage.setItem("milktea-demo", "1");
      repo = new DemoRepository();
      me = await repo.session();
      if (location.hash === "#/home") await render();
      else await go("#/home");
    });
  app.querySelector("#setup-help")?.addEventListener("click", setupHelp);
  app.querySelector("#login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    busy(form.querySelector("[type=submit]"), async () => {
      try {
        repo = new CloudRepository();
        me = await repo.login(
          form.elements.email.value.trim(),
          form.elements.password.value,
        );
        sessionStorage.removeItem("milktea-demo");
        await go("#/home");
      } catch (error) {
        form.querySelector(".login-error").textContent = errorText(error);
      }
    });
  });
  app.querySelector("#forgot-password")?.addEventListener("click", () => {
    const d = modal(
      '<h2>비밀번호 다시 정하기</h2><p class="muted">초대받은 이메일로 비밀번호 재설정 링크를 보내드려요.</p><form id="reset-form"><label class="field-label" for="reset-email">이메일</label><input id="reset-email" type="email" required autocomplete="email" style="width:100%"><div class="dialog-actions"><button class="button" type="submit">재설정 메일 받기</button></div></form>',
    );
    d.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      busy(d.querySelector("[type=submit]"), async () => {
        const { error } = await client.auth.resetPasswordForEmail(
          d.querySelector("input").value.trim(),
          {
            redirectTo: new URL(
              "./auth-callback.html",
              location.href.split("#")[0],
            ).href,
          },
        );
        if (error) throw error;
        d.close();
        toast(
          "등록된 이메일이면 재설정 링크가 도착해요. 메일함을 확인해주세요.",
        );
      });
    };
  });
}
async function start() {
  try {
    repo = demoEnabled()
      ? new DemoRepository()
      : configured
        ? new CloudRepository()
        : null;
    if (!repo) return renderLogin();
    me = await repo.session();
    if (me) await render();
    else renderLogin();
  } catch (error) {
    renderLogin();
    toast(errorText(error), true);
  }
}
if (client)
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && repo?.mode === "cloud") {
      me = null;
      repo.clearURLs();
      renderLogin();
    }
  });
start();
