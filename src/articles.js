import { e, icon, busy, modal, confirmAction, toast, errorText } from "./ui.js";
import { formatDate, formatTime } from "./dates.js";
import { safeColor } from "./validation.js";
import { pickFiles, uploadImage, fontFamily } from "./media.js";
import { musicHTML, bindMusicPlayers } from "./music-ui.js";
export const emojis = ["👍", "❤️", "😂", "🐱", "✨", "🫂", "🍀", "🔥"];
export function avatar(profile, size = "") {
  const label = profile?.nickname || "친구";
  return `<span class="avatar ${size} ${profile?.demo_icon ? "" : "initial"}" style="background:${safeColor(profile?.main_color)}18">${profile?.avatar_asset_id ? `<img data-asset="${e(profile.avatar_asset_id)}" alt="${e(label)}의 프로필" hidden>` : ""}<span>${e(profile?.demo_icon || label.slice(0, 1))}</span></span>`;
}
export function entryTitle(entry) {
  return (
    entry.title?.trim() ||
    entry.document?.blocks
      .find((b) => b.type === "text" && b.text.trim())
      ?.text.trim()
      .split("\n")[0]
      .slice(0, 60) ||
    "제목 없는 일기"
  );
}
export function reactionHTML(entryId, reactions, me) {
  const counts = new Map();
  for (const r of reactions) {
    if (r.entry_id !== entryId) continue;
    const value = counts.get(r.emoji) || { count: 0, mine: false };
    value.count++;
    value.mine ||= r.user_id === me;
    counts.set(r.emoji, value);
  }
  return `${[...counts.entries()].map(([emoji, v]) => `<button class="reaction ${v.mine ? "mine" : ""}" data-react="${e(emoji)}" data-entry="${e(entryId)}" aria-label="${e(emoji)} 반응 ${v.count}개${v.mine ? ", 내가 누름" : ""}" aria-pressed="${v.mine}">${e(emoji)} <span>${v.count}</span></button>`).join("")}<button class="reaction" data-reaction-picker="${e(entryId)}" aria-label="반응 추가">${icon("plus")}</button>`;
}
export function commentsHTML(entry, comments, ctx, detail = false) {
  const all = comments
    .filter((c) => c.entry_id === entry.id)
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  const visible = detail ? all : all.slice(-2);
  return `${visible
    .map((c) => {
      const author = ctx.state.profiles.find((p) => p.id === c.author_id);
      return `<div class="comment-row" data-comment="${e(c.id)}"><div class="comment-meta"><span class="comment-author">${avatar(author, "tiny")}<strong title="${e(author?.nickname || "친구")}">${e(author?.nickname || "친구")}</strong></span><time datetime="${e(c.created_at)}">${formatTime(c.created_at)}</time><div class="comment-tools">${c.author_id === ctx.me.id ? `<button data-edit-comment="${e(c.id)}">수정</button>` : ""}${c.author_id === ctx.me.id || entry.author_id === ctx.me.id ? `<button data-delete-comment="${e(c.id)}">삭제</button>` : ""}</div></div><p class="comment-text">${e(c.content)}</p>${c.image_asset_id ? `<button data-full-image="${e(c.image_asset_id)}" aria-label="댓글 사진 크게 보기"><img data-asset="${e(c.image_asset_id)}" class="comment-photo" alt="댓글에 첨부한 사진" hidden></button>` : ""}</div>`;
    })
    .join(
      "",
    )}${!detail && all.length > 2 ? `<a class="read-more" href="#/entries/${e(entry.id)}">댓글 ${all.length}개 모두 보기</a>` : ""}${entry.status === "published" ? `<form class="comment-form" data-comment-form="${e(entry.id)}"><textarea name="content" rows="1" maxlength="2000" placeholder="한마디 남기기…" aria-label="${e(entryTitle(entry))}에 댓글 남기기"></textarea><button type="button" class="icon-button" data-comment-photo aria-label="댓글 사진 첨부">${icon("image")}</button><button type="submit" class="comment-submit">등록</button><div class="comment-attachment" hidden></div></form>` : ""}`;
}
export function articleHTML(
  entry,
  ctx,
  { comments = [], reactions = [], detail = false } = {},
) {
  const profile = ctx.state.profiles.find((x) => x.id === entry.author_id);
  const d = entry.document;
  const blocks = detail ? d.blocks : d.blocks.slice(0, 4);
  let remaining = 750;
  const content = blocks
    .map((b) => {
      if (b.type === "text") {
        const text = detail ? b.text : b.text.slice(0, Math.max(0, remaining));
        remaining -= text.length;
        return text
          ? `<p>${e(text)}${!detail && text.length < b.text.length ? "…" : ""}</p>`
          : "";
      }
      return `<button class="entry-photo" data-full-image="${e(b.asset_id)}" aria-label="${e(b.alt || "일기 사진")} 크게 보기"><img data-asset="${e(b.asset_id)}" alt="${e(b.alt || "일기에 첨부한 사진")}" hidden loading="lazy"></button>${b.alt && detail ? `<div class="photo-caption">${e(b.alt)}</div>` : ""}`;
    })
    .join("");
  const shortened =
    !detail &&
    (d.blocks.length > 4 ||
      d.blocks
        .filter((b) => b.type === "text")
        .reduce((n, b) => n + b.text.length, 0) > 750);
  return `<article class="diary-card" data-entry-card="${e(entry.id)}" data-detail="${detail}"><header class="diary-author"><a href="#/people/${e(entry.author_id)}" aria-label="${e(profile?.nickname)}의 일기장">${avatar(profile)}</a><div><a class="author-link" href="#/people/${e(entry.author_id)}">${e(profile?.nickname || "친구")}</a><a class="date-label" href="#/home?date=${e(entry.diary_date)}">${entry.diary_date.replaceAll("-", ". ")}${entry.status === "draft" ? " · 임시저장" : ""}</a></div>${entry.author_id === ctx.me.id ? `<div class="entry-actions"><a class="icon-button" href="#/write/${e(entry.id)}" aria-label="일기 수정">${icon("pen")}</a><button class="icon-button" data-delete-entry="${e(entry.id)}" aria-label="일기 삭제">${icon("trash")}</button></div>` : ""}</header><h2 class="diary-title"><a href="#/entries/${e(entry.id)}">${e(entryTitle(entry))}</a></h2><div class="paper ${e(d.paper || "white")} font-${e(d.font || "system")}" ${d.background_asset_id ? `data-background="${e(d.background_asset_id)}"` : ""} ${d.font_asset_id ? `data-font="${e(d.font_asset_id)}"` : ""}><div class="blocks">${content}</div>${!shortened ? `<div class="sticker-layer" aria-hidden="true">${(d.stickers || []).map((s) => `<span class="placed-sticker" style="left:${Number(s.x) * 100}%;top:${Number(s.y) * 100}%;transform:translate(-50%,-50%) rotate(${Number(s.rotation)}deg) scale(${Number(s.scale)});z-index:${Number(s.z)}"><img data-asset="${e(s.asset_id)}" alt="" hidden></span>`).join("")}</div>` : ""}</div>${shortened ? `<a class="read-more" href="#/entries/${e(entry.id)}">일기 전체 보기 ${icon("chevron")}</a>` : ""}${musicHTML(d.music, entry.id)}${entry.tags.length || d.habits?.length ? `<div class="entry-notes">${entry.tags.length ? `<div class="tag-list">${entry.tags.map((t) => `<a class="tag" style="background:${safeColor(profile?.main_color)}12" href="#/people/${e(entry.author_id)}/archive?month=${e(entry.diary_date.slice(0, 7))}&tag=${encodeURIComponent(t)}">#${e(t)}</a>`).join("")}</div>` : ""}${d.habits?.length ? `<div class="habit-list"><span class="habit-label">생활 기록</span>${d.habits.map((h) => `<span>${e(h.name)} ${h.type === "boolean" ? (h.value ? "✓" : "○") : `${e(h.value)}${e(h.unit)}`}</span>`).join("")}</div>` : ""}</div>` : ""}${entry.status === "published" ? `<div class="reactions">${reactionHTML(entry.id, reactions, ctx.me.id)}</div>` : ""}<div class="comments">${commentsHTML(entry, comments, ctx, detail)}</div></article>`;
}
export async function hydrateAssets(root, repo) {
  const tasks = [];
  const nodes = (selector) => [
    ...(root.matches?.(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  for (const img of root.querySelectorAll("img[data-asset]"))
    tasks.push(
      (async () => {
        try {
          const url = await repo.assetURL(img.dataset.asset);
          if (!url) throw Error("Missing image");
          if (!img.isConnected) return;
          img.onload = () => {
            img.hidden = false;
            const fallback = img
              .closest(".avatar")
              ?.querySelector(":scope > span");
            if (fallback) fallback.hidden = true;
          };
          img.loading = "eager";
          img.src = url;
          if (img.complete && img.naturalWidth) img.onload();
        } catch {
          if (img.isConnected) {
            img.hidden = true;
            if (!img.closest(".avatar")) {
              const fallback = document.createElement("span");
              fallback.className = "field-help";
              fallback.textContent = "사진을 불러오지 못했어요";
              img.after(fallback);
            }
          }
        }
      })(),
    );
  for (const paper of nodes("[data-background]"))
    tasks.push(
      (async () => {
        try {
          const assetId = paper.dataset.background;
          const url = await repo.assetURL(assetId);
          if (
            url &&
            paper.isConnected &&
            paper.dataset.background === assetId
          ) {
            paper.classList.add("custom-paper");
            paper.style.backgroundImage = `url("${url}")`;
          }
        } catch {}
      })(),
    );
  for (const paper of nodes("[data-font]"))
    tasks.push(
      (async () => {
        try {
          const assetId = paper.dataset.font;
          const family = await fontFamily(repo, assetId);
          if (family && paper.isConnected && paper.dataset.font === assetId)
            paper.style.fontFamily = `"Noto Color Emoji", "${family}", "Noto Color Emoji Keycaps", sans-serif`;
        } catch {}
      })(),
    );
  await Promise.allSettled(tasks);
}
export function bindArticles(root, ctx, loaded) {
  bindMusicPlayers(root, ctx.signal);
  const pendingPhotos = new Map();
  const getEntry = (id) => loaded.entries.find((x) => x.id === id);
  const reloadComments = async (entryId) => {
    const data = await ctx.repo.entries([entryId]);
    loaded.comments = loaded.comments
      .filter((x) => x.entry_id !== entryId)
      .concat(data.comments);
    const card = root.querySelector(`[data-entry-card="${entryId}"]`);
    if (!card) return;
    card.querySelector(".comments").innerHTML = commentsHTML(
      getEntry(entryId),
      loaded.comments,
      ctx,
      card.dataset.detail === "true",
    );
    await hydrateAssets(card, ctx.repo);
  };
  root.addEventListener(
    "submit",
    (event) => {
      const form = event.target.closest("[data-comment-form]");
      if (!form) return;
      event.preventDefault();
      const id = form.dataset.commentForm;
      const button = form.querySelector("[type=submit]");
      busy(button, async () => {
        await ctx.repo.saveComment({
          entry_id: id,
          content: form.elements.content.value.trim(),
          image_asset_id: pendingPhotos.get(id)?.id || null,
        });
        pendingPhotos.delete(id);
        await reloadComments(id);
        toast("댓글을 남겼어요.");
      });
    },
    { signal: ctx.signal },
  );
  root.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      if (btn.hasAttribute("data-comment-photo"))
        busy(btn, async () => {
          const files = await pickFiles("image/jpeg,image/png,image/webp");
          if (!files.length) return;
          const form = btn.closest("form");
          const a = await uploadImage(ctx.repo, files[0], "comment-image");
          pendingPhotos.set(form.dataset.commentForm, a);
          const attachment = form.querySelector(".comment-attachment");
          attachment.hidden = false;
          attachment.innerHTML = `<img data-asset="${e(a.id)}" alt="첨부할 사진" hidden><span>${e(a.name)}</span><button type="button" aria-label="첨부 사진 제거" data-remove-comment-photo>${icon("close")}</button>`;
          await hydrateAssets(attachment, ctx.repo);
        });
      if (btn.hasAttribute("data-remove-comment-photo")) {
        const form = btn.closest("form");
        pendingPhotos.delete(form.dataset.commentForm);
        const attachment = form.querySelector(".comment-attachment");
        attachment.hidden = true;
        attachment.replaceChildren();
      }
      if (btn.dataset.fullImage)
        busy(btn, async () => {
          const url = await ctx.repo.assetURL(btn.dataset.fullImage);
          if (!url) throw new Error("Missing image");
          modal(
            `<img src="${e(url)}" alt="첨부한 사진 크게 보기">`,
            "image-dialog",
          );
        });
      if (btn.dataset.react)
        busy(btn, async () => {
          const id = btn.dataset.entry;
          const mine = loaded.reactions.some(
            (r) =>
              r.entry_id === id &&
              r.emoji === btn.dataset.react &&
              r.user_id === ctx.me.id,
          );
          await ctx.repo.toggleReaction(id, btn.dataset.react, mine);
          loaded.reactions = loaded.reactions.filter(
            (r) =>
              !(
                r.entry_id === id &&
                r.emoji === btn.dataset.react &&
                r.user_id === ctx.me.id
              ),
          );
          if (!mine)
            loaded.reactions.push({
              entry_id: id,
              user_id: ctx.me.id,
              emoji: btn.dataset.react,
            });
          const card = root.querySelector(`[data-entry-card="${id}"]`);
          if (card)
            card.querySelector(".reactions").innerHTML = reactionHTML(
              id,
              loaded.reactions,
              ctx.me.id,
            );
        });
      if (btn.dataset.reactionPicker) {
        const id = btn.dataset.reactionPicker;
        const d = modal(
          `<h2>어떤 마음을 전할까요?</h2><div class="reaction-picker">${emojis.map((emoji) => `<button data-emoji="${emoji}" aria-label="${emoji} 반응">${emoji}</button>`).join("")}</div>`,
        );
        d.querySelectorAll("[data-emoji]").forEach(
          (b) =>
            (b.onclick = () =>
              busy(b, async () => {
                const mine = loaded.reactions.some(
                  (r) =>
                    r.entry_id === id &&
                    r.emoji === b.dataset.emoji &&
                    r.user_id === ctx.me.id,
                );
                await ctx.repo.toggleReaction(id, b.dataset.emoji, mine);
                loaded.reactions = loaded.reactions.filter(
                  (r) =>
                    !(
                      r.entry_id === id &&
                      r.emoji === b.dataset.emoji &&
                      r.user_id === ctx.me.id
                    ),
                );
                if (!mine)
                  loaded.reactions.push({
                    entry_id: id,
                    user_id: ctx.me.id,
                    emoji: b.dataset.emoji,
                  });
                const card = root.querySelector(`[data-entry-card="${id}"]`);
                if (card)
                  card.querySelector(".reactions").innerHTML = reactionHTML(
                    id,
                    loaded.reactions,
                    ctx.me.id,
                  );
                d.close();
              })),
        );
      }
      if (btn.dataset.deleteEntry)
        busy(btn, async () => {
          if (
            !(await confirmAction(
              "이 일기를 삭제할까요?",
              "함께 달린 댓글과 반응도 지워져요. 삭제한 일기는 되돌릴 수 없어요.",
            ))
          )
            return;
          await ctx.repo.deleteEntry(btn.dataset.deleteEntry);
          toast("일기를 삭제했어요.");
          await ctx.go("#/home");
        });
      if (btn.dataset.deleteComment)
        busy(btn, async () => {
          if (
            !(await confirmAction(
              "댓글을 삭제할까요?",
              "삭제한 댓글은 되돌릴 수 없어요.",
            ))
          )
            return;
          const c = loaded.comments.find(
            (x) => x.id === btn.dataset.deleteComment,
          );
          await ctx.repo.deleteComment(c.id);
          await reloadComments(c.entry_id);
          toast("댓글을 삭제했어요.");
        });
      if (btn.dataset.editComment) {
        const c = loaded.comments.find((x) => x.id === btn.dataset.editComment);
        let image = c.image_asset_id;
        const d = modal(
          `<h2>댓글 수정</h2><form id="edit-comment-form"><label class="field-label" for="edit-comment-text">댓글</label><textarea id="edit-comment-text" rows="4" maxlength="2000" style="width:100%">${e(c.content)}</textarea>${image ? `<p><label class="habit-check"><input type="checkbox" id="remove-image">첨부 사진 제거</label></p>` : ""}<div class="dialog-actions"><button type="submit" class="button">수정 저장</button></div></form>`,
        );
        d.querySelector("form").onsubmit = (event) => {
          event.preventDefault();
          busy(d.querySelector("[type=submit]"), async () => {
            await ctx.repo.saveComment({
              ...c,
              content: d.querySelector("textarea").value.trim(),
              image_asset_id: d.querySelector("#remove-image")?.checked
                ? null
                : image,
            });
            d.close();
            await reloadComments(c.entry_id);
            toast("댓글을 수정했어요.");
          });
        };
      }
    },
    { signal: ctx.signal },
  );
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          observer.unobserve(record.target);
          const entry = getEntry(record.target.dataset.entryCard);
          if (entry?.status === "published") ctx.markRead(entry.id);
        }
      },
      { threshold: 0.2 },
    );
    loaded.readObserver = observer;
    root
      .querySelectorAll("[data-entry-card]")
      .forEach((card) => observer.observe(card));
    ctx.signal.addEventListener("abort", () => observer.disconnect(), {
      once: true,
    });
  }
}
