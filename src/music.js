const hosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const videoId = /^[A-Za-z0-9_-]{11}$/;
const playlistId = /^[A-Za-z0-9_-]{2,128}$/;
export const musicLinkHelp =
  "YouTube 또는 YouTube Music의 영상·음악·재생목록 공유 링크를 넣어주세요.";

// Store a canonical link and plain-text track credits. Never store embed HTML.
export function parseMusic(input, title = "", artist = "") {
  if (typeof input !== "string" || input.length > 2048)
    throw new Error(musicLinkHelp);
  const raw = input.trim();
  if (typeof title !== "string" || [...title.trim()].length > 120)
    throw new Error("곡 제목은 120자까지 적을 수 있어요.");
  if (typeof artist !== "string" || [...artist.trim()].length > 120)
    throw new Error("가수명은 120자까지 적을 수 있어요.");
  if (!raw) {
    if (title.trim() || artist.trim()) throw new Error(musicLinkHelp);
    return null;
  }
  let url;
  try {
    url = new URL(
      /^(?:https?:)?\/\//i.test(raw)
        ? raw.startsWith("//")
          ? `https:${raw}`
          : raw
        : `https://${raw}`,
    );
  } catch {
    throw new Error(musicLinkHelp);
  }
  if (
    !hosts.has(url.hostname) ||
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(musicLinkHelp);

  const path = url.pathname.replace(/\/$/, "");
  let video = null,
    playlist = null;
  if (["youtu.be", "www.youtu.be"].includes(url.hostname)) {
    video = path.slice(1);
  } else if (path === "/watch") {
    video = url.searchParams.get("v");
  } else if (
    /^\/(shorts|live|embed)\/[^/]+$/.test(path) &&
    path !== "/embed/videoseries"
  ) {
    video = path.split("/")[2];
  } else if (["/playlist", "/embed/videoseries", "/embed"].includes(path)) {
    playlist = url.searchParams.get("list");
  }
  if (
    !(video && videoId.test(video)) &&
    !(playlist && playlistId.test(playlist))
  )
    throw new Error(musicLinkHelp);
  const base =
    url.hostname === "music.youtube.com"
      ? "https://music.youtube.com"
      : "https://www.youtube.com";
  return {
    url: video
      ? `${base}/watch?v=${video}`
      : `${base}/playlist?list=${playlist}`,
    title: title.trim(),
    ...(artist.trim() ? { artist: artist.trim() } : {}),
  };
}

export function validMusic(music) {
  if (music == null) return true;
  if (
    typeof music !== "object" ||
    Array.isArray(music) ||
    typeof music.url !== "string" ||
    typeof music.title !== "string" ||
    (Object.hasOwn(music, "artist") && typeof music.artist !== "string") ||
    Object.keys(music).some((key) => !["url", "title", "artist"].includes(key))
  )
    return false;
  try {
    const normalized = parseMusic(music.url, music.title, music.artist);
    return (
      normalized !== null &&
      normalized.url === music.url &&
      normalized.title === music.title &&
      (normalized.artist || "") === (music.artist || "")
    );
  } catch {
    return false;
  }
}

export function musicInfo(music) {
  if (!music || !validMusic(music)) return null;
  const url = new URL(music.url);
  const video = url.searchParams.get("v");
  const playlist = url.searchParams.get("list");
  const embed = new URL(
    `https://www.youtube-nocookie.com/embed/${video || "videoseries"}`,
  );
  if (!video) {
    embed.searchParams.set("listType", "playlist");
    embed.searchParams.set("list", playlist);
  }
  embed.searchParams.set("playsinline", "1");
  embed.searchParams.set("autoplay", "0");
  embed.searchParams.set("hl", "ko");
  return {
    ...music,
    embed: embed.href,
    service: url.hostname === "music.youtube.com" ? "YouTube Music" : "YouTube",
    kind: video ? "음악" : "재생목록",
  };
}
