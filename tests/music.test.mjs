import test from "node:test";
import assert from "node:assert/strict";
import { parseMusic, validMusic, musicInfo } from "../src/music.js";
import { playbackTime } from "../src/youtube-player.js";

test("Playback time covers unknown duration, fractions and hour-long playlists", () => {
  for (const [seconds, expected] of [
    [NaN, "—:—"],
    [Infinity, "—:—"],
    [-1, "—:—"],
    [0, "0:00"],
    [61.9, "1:01"],
    [3601, "1:00:01"],
  ])
    assert.equal(playbackTime(seconds), expected);
});

const id = "M7lc1UVf-VE";
test("YouTube, mobile, short, shorts, live and embed links normalize to one safe video URL", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}&si=tracking&list=PLabc`,
    `https://m.youtube.com/watch?v=${id}`,
    `youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=tracking`,
    `http://youtu.be/${id}`,
    `https://youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}`,
    `https://youtube-nocookie.com/embed/${id}`,
    `//youtu.be/${id}`,
  ])
    assert.deepEqual(parseMusic(url, "  오늘의 노래  "), {
      url: `https://www.youtube.com/watch?v=${id}`,
      title: "오늘의 노래",
    });
});
test("YouTube Music preserves the original listening service", () => {
  const song = parseMusic(
    `https://music.youtube.com/watch?v=${id}&si=tracking`,
  );
  assert.equal(song.url, `https://music.youtube.com/watch?v=${id}`);
  assert.equal(musicInfo(song).service, "YouTube Music");
});
test("Music albums and video playlists have a playlist embed and canonical external link", () => {
  for (const host of ["www.youtube.com", "music.youtube.com"]) {
    const music = parseMusic(
      `https://${host}/playlist?list=OLAK5uy_abc-123&si=tracking`,
    );
    assert.equal(music.url, `https://${host}/playlist?list=OLAK5uy_abc-123`);
    const embed = new URL(musicInfo(music).embed);
    assert.equal(embed.pathname, "/embed/videoseries");
    assert.equal(embed.searchParams.get("list"), "OLAK5uy_abc-123");
  }
});
test("Unsafe hosts, credentials, ports, protocols and malformed IDs are rejected", () => {
  for (const url of [
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://evil.test/?v=${id}`,
    `https://youtube.com@evil.test/watch?v=${id}`,
    `https://evil@youtube.com/watch?v=${id}`,
    `https://youtube.com:8888/watch?v=${id}`,
    `javascript:alert(1)`,
    `data:text/html,<iframe>`,
    `file:///youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=bad`,
    `https://youtu.be/${id}/extra`,
    `https://youtube.com/playlist?list=bad%22%3E`,
    `https://youtube.com/@someone`,
  ])
    assert.throws(() => parseMusic(url));
});
test("Optional music, title length and legacy documents are handled without unsafe fallbacks", () => {
  assert.equal(parseMusic("  "), null);
  assert.equal(validMusic(undefined), true);
  assert.equal(validMusic(null), true);
  assert.equal(musicInfo({ url: "https://evil.test", title: "bad" }), null);
  assert.throws(() => parseMusic(`https://youtu.be/${id}`, "가".repeat(121)));
  assert.throws(() => parseMusic("a".repeat(2049)));
  const good = parseMusic(
    `https://youtu.be/${id}`,
    "<script>plain text</script>",
  );
  assert.equal(validMusic(good), true);
  for (const bad of [
    "",
    [],
    {},
    { ...good, title: 12 },
    { ...good, iframe: "<iframe>" },
    { ...good, url: `https://youtu.be/${id}` },
  ])
    assert.equal(validMusic(bad), false);
});
test("Embeds use privacy enhanced host, native controls, no autoplay, and no pasted parameters", () => {
  const info = musicInfo(
    parseMusic(`https://youtu.be/${id}?autoplay=1&controls=0`),
  );
  const embed = new URL(info.embed);
  assert.equal(embed.host, "www.youtube-nocookie.com");
  assert.equal(embed.searchParams.get("autoplay"), "0");
  assert.equal(embed.searchParams.has("controls"), false);
  assert.equal(embed.searchParams.get("playsinline"), "1");
});

test("Artist credits are optional, trimmed, preserved and validated", () => {
  const url = `https://youtu.be/${id}`;
  assert.equal(parseMusic(url, "밤편지", "  아이유  ").artist, "아이유");
  assert.equal(musicInfo(parseMusic(url, "밤편지", "아이유")).artist, "아이유");
  assert.equal(validMusic(parseMusic(url, "밤편지", "아이유")), true);
  assert.equal(Object.hasOwn(parseMusic(url, "밤편지"), "artist"), false);
  assert.throws(() => parseMusic("", "", "아이유"));
  for (const artist of [null, 1, [], {}, "가".repeat(121), " 가수 "])
    assert.equal(
      validMusic({
        url: `https://www.youtube.com/watch?v=${id}`,
        title: "곡",
        artist,
      }),
      false,
    );
  assert.equal(
    validMusic({
      url: `https://www.youtube.com/watch?v=${id}`,
      title: "곡",
      artist: "🎵".repeat(120),
    }),
    true,
  );
});
