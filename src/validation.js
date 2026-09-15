import { today, validDate } from "./dates.js";
import { userError } from "./ui.js";
import { validMusic, musicLinkHelp } from "./music.js";
export function parseTags(input) {
  const tags = [
    ...new Set(
      input
        .split(/[,\s#]+/u)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 10 || tags.some((t) => [...t].length > 20))
    throw userError("태그는 20자 이내로 최대 10개까지 넣을 수 있어요.");
  return tags;
}
export function validateEntry(entry) {
  if (!validDate(entry.diary_date) || entry.diary_date > today())
    throw userError("오늘 또는 과거 날짜를 선택해주세요.");
  if (entry.title.length > 100)
    throw userError("제목은 100자까지 쓸 수 있어요.");
  const d = entry.document;
  if (!validMusic(d.music)) throw userError(musicLinkHelp);
  if (d.blocks.length > 100 || d.stickers.length > 40 || d.habits.length > 30)
    throw userError(
      "글·사진은 100개, 스티커는 40개, 생활 기록은 30개까지 넣을 수 있어요.",
    );
  if (
    d.blocks
      .filter((b) => b.type === "text")
      .reduce((n, b) => n + b.text.length, 0) > 30000
  )
    throw userError("본문은 30,000자까지 쓸 수 있어요.");
  if (
    entry.status === "published" &&
    !d.blocks.some((b) => b.type === "image" || b.text?.trim())
  )
    throw userError("내용이나 사진을 추가해주세요.");
  if (new TextEncoder().encode(JSON.stringify(d)).length > 262144)
    throw userError(
      "일기에 담긴 내용이 너무 많아요. 글이나 장식을 조금 줄여주세요.",
    );
  for (const h of d.habits)
    if (
      h.type === "number" &&
      (!Number.isFinite(h.value) || h.value < 0 || h.value > 1000000)
    )
      throw userError("생활 기록에 올바른 숫자를 넣어주세요.");
}
export function safeColor(value, fallback = "#6C80D9") {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}
