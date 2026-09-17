import { dailyQuestion } from "./daily-question.js";
import { e, icon, emptyState, busy } from "./ui.js";
import {
  today,
  addDays,
  formatDate,
  changeMonth,
  monthDays,
  weekDates,
  streak,
} from "./dates.js";
import {
  avatar,
  articleHTML,
  hydrateAssets,
  bindArticles,
} from "./articles.js";
function heading(title, subtitle, actions = "") {
  return `<header class="page-heading"><div><h1>${e(title)}</h1>${subtitle ? `<p>${e(subtitle)}</p>` : ""}</div>${actions}</header>`;
}
function calendarHTML(date, entries, me, expandOnMonthChange = false) {
  const month = date.slice(0, 7);
  const [year, m] = month.split("-").map(Number);
  const offset = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const days = monthDays(month);
  const current = today();
  const expanded = expandOnMonthChange ? "&calendar=1" : "";
  const values = new Map();
  for (const entry of entries.filter((x) => x.status === "published")) {
    const v = values.get(entry.diary_date) || {
      count: 0,
      friends: false,
      mine: false,
    };
    v.count++;
    v.friends ||= entry.author_id !== me;
    v.mine ||= entry.author_id === me;
    values.set(entry.diary_date, v);
  }
  return `<section class="calendar" aria-label="일기 달력"><div class="calendar-top"><h2>${year}년 ${m}월</h2><div class="calendar-actions"><a class="today-button" href="#/home?date=${current}">오늘</a><a class="icon-button" href="#/home?date=${changeMonth(date, -1)}${expanded}" aria-label="이전 달">${icon("chevron", "left")}</a><a class="icon-button" href="#/home?date=${changeMonth(date, 1)}${expanded}" aria-label="다음 달">${icon("chevron")}</a></div></div><div class="calendar-grid">${["일", "월", "화", "수", "목", "금", "토"].map((d) => `<span class="weekday">${d}</span>`).join("")}${'<span aria-hidden="true"></span>'.repeat(offset)}${Array.from(
    { length: days },
    (_, i) => {
      const day = `${month}-${String(i + 1).padStart(2, "0")}`;
      const value = values.get(day);
      return `<a class="calendar-day ${date === day ? "selected" : ""} ${day === current ? "is-today" : ""} ${day > current ? "future" : ""}" href="#/home?date=${day}" ${date === day ? 'aria-current="date"' : ""} aria-label="${m}월 ${i + 1}일${day === current ? ", 오늘" : ""}${value ? `, 일기 ${value.count}편${value.friends ? ", 친구 일기 있음" : ""}${value.mine ? ", 내 일기 있음" : ""}` : ", 일기 없음"}"><span class="date-number">${i + 1}</span><span class="day-entry-markers" aria-hidden="true">${value?.friends ? '<span class="entry-bar friends"></span>' : ""}${value?.mine ? '<span class="entry-bar mine"></span>' : ""}</span></a>`;
    },
  ).join(
    "",
  )}</div><div class="calendar-legend"><span><i class="entry-bar friends" aria-hidden="true"></i>친구 일기</span><span><i class="entry-bar mine" aria-hidden="true"></i>내 일기</span><span>테두리 · 오늘</span></div></section>`;
}
async function mountFeed(
  container,
  ctx,
  metadata,
  { single = false, detail = false } = {},
) {
  const loaded = { entries: [], comments: [], reactions: [] };
  let offset = 0;
  container.innerHTML = `<div class="${single ? "profile-feed" : "diary-grid"}" data-feed-grid></div><div class="more-row" data-more-row></div>`;
  const grid = container.querySelector("[data-feed-grid]");
  const more = container.querySelector("[data-more-row]");
  async function load() {
    const ids = metadata.slice(offset, offset + 12).map((x) => x.id);
    if (!ids.length) return;
    const data = await ctx.repo.entries(ids);
    if (ctx.signal.aborted) return;
    data.entries.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    loaded.entries.push(...data.entries);
    loaded.comments.push(...data.comments);
    loaded.reactions.push(...data.reactions);
    grid.insertAdjacentHTML(
      "beforeend",
      data.entries
        .map((entry) =>
          articleHTML(entry, ctx, {
            comments: data.comments,
            reactions: data.reactions,
            detail,
          }),
        )
        .join(""),
    );
    offset += ids.length;
    more.innerHTML =
      offset < metadata.length
        ? '<button class="button secondary" data-more>일기 더 보기</button>'
        : "";
    more
      .querySelector("[data-more]")
      ?.addEventListener("click", (event) => busy(event.currentTarget, load));
    await hydrateAssets(grid, ctx.repo);
    if (loaded.readObserver)
      grid
        .querySelectorAll("[data-entry-card]")
        .forEach((card) => loaded.readObserver.observe(card));
  }
  await load();
  bindArticles(grid, ctx, loaded);
}
export async function homePage(root, ctx, params) {
  const question = dailyQuestion();
  let questionTimer;
  function scheduleQuestion() {
    const next = Date.parse(`${addDays(today(), 1)}T00:00:00+09:00`);
    questionTimer = setTimeout(() => {
      if (ctx.signal.aborted) return;
      const q = dailyQuestion(), panel = root.querySelector(".daily-question");
      if (panel) {
        panel.querySelector("p").textContent = q.text;
        panel.querySelector(".field-help").textContent = `${q.date.replaceAll("-", ".")} · 같은 질문, 서로 다른 이야기`;
        panel.querySelector("a").href = `#/write?date=${q.date}&question=1`;
      }
      scheduleQuestion();
    }, Math.max(1000, next - Date.now() + 50));
  }
  scheduleQuestion();
  ctx.signal.addEventListener("abort", () => clearTimeout(questionTimer), { once: true });
  const date = params.get("date") || today();
  const entries = ctx.state.entries.filter(
    (x) => x.status === "published" && x.diary_date === date,
  );
  root.innerHTML =
    `<div class="home-page">` +
    heading(
      "우리들의 오늘",
      "평범한 하루도, 함께 적으면 특별해져요.",
      date <= today()
        ? `<a class="button" href="#/write?date=${date}">${icon("plus")} 일기 쓰기</a>`
        : "",
    ) +
    `<section class="daily-question" aria-labelledby="daily-question-heading"><div><h2 id="daily-question-heading">오늘의 질문</h2><p>${e(question.text)}</p><span class="field-help">${question.date.replaceAll("-", ".")} · 같은 질문, 서로 다른 이야기</span></div><a class="button secondary" href="#/write?date=${question.date}&question=1">답하며 일기 쓰기 ${icon("pen")}</a></section><details class="home-mobile-calendar" ${params.get("calendar") === "1" ? "open" : ""}><summary>${icon("calendar")}<span>월별로 보기</span>${icon("chevron")}</summary>${calendarHTML(date, ctx.state.entries, ctx.me.id, true)}</details><div class="home-layout"><section class="home-stream" aria-label="선택한 날짜의 일기"><div class="feed-heading"><h2>${formatDate(date, true)}</h2><span>우리의 이야기 ${entries.length}편</span></div><div id="feed"></div></section></div></div>`;
  const mobileCalendar = root.querySelector(".home-mobile-calendar");
  mobileCalendar.addEventListener(
    "click",
    (event) => {
      if (event.target.closest(".calendar-day, .today-button")) {
        mobileCalendar.open = false;
        mobileCalendar.querySelector("summary").focus({ preventScroll: true });
      }
    },
    { signal: ctx.signal },
  );
  const feed = root.querySelector("#feed");
  if (!entries.length) {
    feed.innerHTML = emptyState(
      "아직 이 날의 일기가 없어요",
      "소소한 하루를 가장 먼저 남겨보세요.",
      date <= today()
        ? `<a class="button soft" href="#/write?date=${date}">${icon("pen")} 이 날의 일기 쓰기</a>`
        : "",
    );
    return;
  }
  await mountFeed(feed, ctx, entries);
}
function streakHTML(ctx, profile) {
  const dates = ctx.state.entries
    .filter((x) => x.author_id === profile.id && x.status === "published")
    .map((x) => x.diary_date);
  const unique = new Set(dates);
  const reference = today();
  const monthly = ctx.state.preferences.streak_mode === "monthly";
  const days = monthly
    ? Array.from(
        { length: monthDays(reference.slice(0, 7)) },
        (_, i) => `${reference.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
      )
    : weekDates(reference);
  const n = days.filter((x) => unique.has(x)).length;
  return `<section class="streak-card card" aria-label="${e(profile.nickname)}의 연참"><div class="streak-heading"><h2>🌱 ${streak(dates)}일째, 차곡차곡</h2><small>게시한 일기 기준</small></div><div class="streak-days">${days.map((date, i) => `<div class="streak-day ${unique.has(date) ? "done" : ""}"><span>${monthly ? Number(date.slice(-2)) : ["월", "화", "수", "목", "금", "토", "일"][i]}</span><span class="streak-circle" aria-label="${date} ${unique.has(date) ? "작성함" : "작성 안 함"}">${unique.has(date) ? "✓" : "·"}</span></div>`).join("")}</div><p class="streak-bottom">${monthly ? "이번 달" : "이번 주"} ${n} / ${days.length}일 기록했어요. &nbsp;<a href="#/settings/diary">표시 설정</a></p></section>`;
}
export async function personPage(root, ctx, id, archive, params) {
  const p = ctx.state.profiles.find((x) => x.id === id);
  if (!p) {
    root.innerHTML = emptyState(
      "일기장을 찾을 수 없어요",
      "친구 목록에서 다시 선택해주세요.",
    );
    return;
  }
  let entries = ctx.state.entries.filter(
    (x) => x.author_id === id && x.status === "published",
  );
  root.innerHTML = `<header class="profile-head">${avatar(p, "large")}<h1>${e(p.nickname)}의 일기장</h1><p>작고 소중한 하루들 · 총 ${entries.length}편의 일기</p><div class="profile-buttons"><a class="button ${archive ? "secondary" : "soft"}" href="#/people/${id}${archive ? "" : "/archive"}">${icon(archive ? "book" : "archive")}${archive ? "일기로 보기" : "모아보기"}</a>${id === ctx.me.id ? '<a class="button secondary" href="#/drafts">임시저장</a>' : ""}</div></header>${!archive ? streakHTML(ctx, p) : ""}<div id="person-feed"></div>`;
  await hydrateAssets(root, ctx.repo);
  const feed = root.querySelector("#person-feed");
  if (archive) {
    const month = params.get("month") || today().slice(0, 7);
    const tag = params.get("tag") || "";
    const tags = [...new Set(entries.flatMap((x) => x.tags))].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
    feed.innerHTML = `<div class="archive-controls"><label class="field-label" for="archive-month">모아볼 달</label><input id="archive-month" type="month" value="${e(month)}" min="1900-01"></div><div class="archive-tags"><button class="tag ${!tag ? "selected" : ""}" data-filter-tag="">전체</button>${tags.map((t) => `<button class="tag ${tag === t ? "selected" : ""}" data-filter-tag="${e(t)}">#${e(t)}</button>`).join("")}</div><div id="archive-results"></div>`;
    feed.querySelector("#archive-month").onchange = (event) => {
      if (event.target.value)
        ctx.go(
          `#/people/${id}/archive?month=${event.target.value}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`,
        );
    };
    feed
      .querySelectorAll("[data-filter-tag]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            ctx.go(
              `#/people/${id}/archive?month=${month}${b.dataset.filterTag ? `&tag=${encodeURIComponent(b.dataset.filterTag)}` : ""}`,
            )),
      );
    entries = entries.filter(
      (x) => x.diary_date.startsWith(month) && (!tag || x.tags.includes(tag)),
    );
    feed.querySelector("#archive-results").innerHTML = entries.length
      ? `<div class="archive-list card">${entries.map((entry) => `<a class="archive-row" href="#/entries/${e(entry.id)}"><span class="archive-day">${Number(entry.diary_date.slice(-2))}</span><div><h3>${e(entry.title || "제목 없는 일기")}</h3><small>${entry.tags.map((t) => "#" + e(t)).join(" ") || "우리의 하루"}</small></div>${icon("chevron")}</a>`).join("")}</div>`
      : emptyState(
          "조건에 맞는 일기가 없어요",
          "다른 달을 선택하거나 태그를 해제해보세요.",
        );
    return;
  }
  if (!entries.length) {
    feed.innerHTML = emptyState(
      "첫 페이지를 기다리고 있어요",
      id === ctx.me.id
        ? "오늘의 이야기를 남겨볼까요?"
        : "곧 친구의 이야기가 채워질 거예요.",
      id === ctx.me.id
        ? '<a class="button soft" href="#/write">일기 쓰기</a>'
        : "",
    );
    return;
  }
  await mountFeed(feed, ctx, entries, { single: true });
}
export async function detailPage(root, ctx, id) {
  const entry = await ctx.repo.entry(id);
  if (ctx.signal.aborted) return;
  if (!entry) {
    root.innerHTML = emptyState(
      "일기를 찾을 수 없어요",
      "삭제되었거나 볼 수 없는 일기일 수 있어요.",
      '<a href="#/home" class="button secondary">홈으로</a>',
    );
    return;
  }
  root.innerHTML =
    '<div class="detail-wrap"><a class="back-link" href="#/home?date=' +
    entry.diary_date +
    '">' +
    icon("back") +
    ' 함께 쓴 일기로</a><div id="detail-feed"></div></div>';
  await mountFeed(root.querySelector("#detail-feed"), ctx, [entry], {
    single: true,
    detail: true,
  });
}
export function draftsPage(root, ctx) {
  const drafts = ctx.state.entries
    .filter((x) => x.author_id === ctx.me.id && x.status === "draft")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  root.innerHTML =
    heading(
      "아직 쓰고 있는 이야기",
      "임시저장한 일기는 나만 볼 수 있어요.",
      `<a class="button" href="#/write">${icon("plus")} 일기 쓰기</a>`,
    ) +
    (drafts.length
      ? drafts
          .map(
            (d) =>
              `<article class="draft-card"><div><h3><a href="#/write/${e(d.id)}">${e(d.title || "제목 없는 일기")}</a></h3><p>${formatDate(d.diary_date)} · 마지막 저장 ${new Date(d.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p></div><a class="button soft" href="#/write/${e(d.id)}">이어 쓰기</a></article>`,
          )
          .join("")
      : emptyState(
          "저장해둔 초안이 없어요",
          "일기를 쓰다가 임시저장하면 여기서 이어 쓸 수 있어요.",
        ));
}
