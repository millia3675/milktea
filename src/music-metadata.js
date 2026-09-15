import { parseMusic } from "./music.js";

const cache = new Map();

// oEmbed's author is a channel, not necessarily the performing artist.
export async function musicMetadata(url, signal) {
  const music = parseMusic(url);
  if (!music) return null;
  const canonical = new URL(music.url);
  canonical.hostname = "www.youtube.com";
  const key = canonical.href;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 300000) return cached.data;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) return null;
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 6000);
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", key);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (!response.ok) return null;
    const data = await response.json();
    const plain = (value) =>
      typeof value === "string" ? [...value.trim()].slice(0, 120).join("") : "";
    const result = {
      title: plain(data.title),
      channel: plain(data.author_name),
    };
    if (!result.title) return null;
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { data: result, time: Date.now() });
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
