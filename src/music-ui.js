import { e, icon } from "./ui.js";
import { musicInfo } from "./music.js";
import { musicMetadata } from "./music-metadata.js";
import { loadYouTubeAPI, playbackTime } from "./youtube-player.js";

export function musicHTML(music, entryId) {
  const info = musicInfo(music);
  if (!info) return "";
  return `<section class="entry-music" aria-label="오늘의 음악" data-music-state="loading">
    <div class="music-heading">${icon("music")}<h3>오늘의 음악</h3><span>${e(info.service)}</span></div>
    <div class="music-widget">
    <div class="music-console">
      <button type="button" class="music-play" data-music-play aria-label="음악 재생" aria-controls="music-player-${e(entryId)}" disabled>${icon("play")}</button>
      <div class="music-track"><p class="music-title" ${info.title ? "" : "data-music-title-missing"}>${e(info.title || "곡 정보를 불러오는 중…")}</p><p class="music-artist" ${info.artist ? "" : "data-music-artist-missing hidden"}>${e(info.artist || "")}</p></div>
      <div class="music-timeline"><div class="music-progress" style="--played:0%"><div class="music-progress-bars" aria-hidden="true"></div><input class="music-seek" type="range" min="0" max="1000" step="1" value="0" disabled aria-label="음악 재생 위치" aria-valuetext="재생 후 이동할 수 있어요"></div><div class="music-times" aria-hidden="true"><span data-music-current>0:00</span><span data-music-duration>—:—</span></div></div>
      <p class="music-status" role="status">음악을 불러오고 있어요…</p>
    </div>
    <div class="music-player" id="music-player-${e(entryId)}" data-music-url="${e(info.url)}"></div>
    </div>
    <div class="music-actions"><a href="${e(info.url)}" target="_blank" rel="noopener noreferrer">${e(info.service)}에서 듣기 ${icon("external")}</a></div>
  </section>`;
}

const openPlayers = new Set();

export function bindMusicPlayers(root, signal) {
  const controllers = new Map();
  function mount(card, startPlayback = false) {
    const container = card.querySelector(".music-player");
    const play = card.querySelector("[data-music-play]");
    const status = card.querySelector(".music-status");
    const seek = card.querySelector(".music-seek");
    const progress = card.querySelector(".music-progress");
    const info = musicInfo({ url: container.dataset.musicUrl, title: "" });
    if (!info) return;
    const controller = {
      player: null,
      ready: false,
      alive: true,
      seeking: false,
      failed: false,
    };
    controllers.set(card, controller);
    openPlayers.add(controller);
    const setStatus = (text) => {
      if (status.textContent !== text) status.textContent = text;
    };
    const buttonState = (state) => {
      card.dataset.musicState = state;
      play.disabled = state === "loading";
      const playing = ["playing", "buffering"].includes(state);
      play.setAttribute(
        "aria-label",
        playing
          ? "음악 일시정지"
          : state === "error"
            ? "음악 다시 불러오기"
            : "음악 재생",
      );
      play.innerHTML = icon(playing ? "pause" : "play");
    };
    controller.sync = () => {
      if (
        !controller.ready ||
        !controller.alive ||
        controller.seeking ||
        controller.failed
      )
        return;
      const duration = controller.player.getDuration();
      const current = controller.player.getCurrentTime();
      const canSeek =
        Number.isFinite(duration) && duration > 0 && Number.isFinite(current);
      seek.disabled = !canSeek;
      const elapsed = canSeek ? Math.min(duration, Math.max(0, current)) : 0;
      seek.value = canSeek ? Math.round((elapsed / duration) * 1000) : 0;
      progress.style.setProperty("--played", `${Number(seek.value) / 10}%`);
      card.querySelector("[data-music-current]").textContent =
        playbackTime(elapsed);
      card.querySelector("[data-music-duration]").textContent = canSeek
        ? playbackTime(duration)
        : "—:—";
      seek.setAttribute(
        "aria-valuetext",
        canSeek
          ? `${playbackTime(elapsed)} / ${playbackTime(duration)}`
          : "재생 후 이동할 수 있어요",
      );
    };
    controller.pause = () => {
      if (
        controller.ready &&
        controller.alive &&
        [1, 3].includes(controller.player.getPlayerState())
      )
        controller.player.pauseVideo();
    };
    controller.destroy = () => {
      controller.alive = false;
      clearInterval(controller.ticker);
      clearTimeout(controller.timeout);
      controller.player?.destroy();
      openPlayers.delete(controller);
      controllers.delete(card);
      container.replaceChildren();
      seek.disabled = true;
      seek.value = 0;
      seek.setAttribute("aria-valuetext", "재생 후 이동할 수 있어요");
      progress.style.setProperty("--played", "0%");
      card.querySelector("[data-music-current]").textContent = "0:00";
      card.querySelector("[data-music-duration]").textContent = "—:—";
      buttonState("ready");
      setStatus("재생 버튼을 눌러 들어보세요.");
    };
    const fail = (message) => {
      if (!controller.alive) return;
      clearTimeout(controller.timeout);
      clearInterval(controller.ticker);
      controller.failed = true;
      seek.disabled = true;
      buttonState("error");
      setStatus(message);
    };

    buttonState("loading");
    setStatus("음악을 불러오고 있어요…");
    const iframe = document.createElement("iframe");
    iframe.id = `${container.id}-video`;
    iframe.title = `${card.querySelector(".music-title").textContent} · YouTube 플레이어`;
    const embed = new URL(info.embed);
    embed.searchParams.set("enablejsapi", "1");
    embed.searchParams.set("origin", location.origin);
    iframe.src = embed.href;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    container.replaceChildren(iframe);
    controller.timeout = setTimeout(
      () =>
        fail(
          "연결이 늦어지고 있어요. 다시 재생하거나 원본 링크에서 들어보세요.",
        ),
      16000,
    );
    loadYouTubeAPI()
      .then((YT) => {
        if (!controller.alive || signal.aborted || controller.failed) return;
        controller.player = new YT.Player(iframe.id, {
          events: {
            onReady(event) {
              if (!controller.alive || controller.failed) return;
              controller.player = event.target;
              controller.ready = true;
              clearTimeout(controller.timeout);
              buttonState("ready");
              controller.sync();
              controller.ticker = setInterval(controller.sync, 500);
              if (startPlayback && !document.hidden) event.target.playVideo();
              else {
                const state = event.target.getPlayerState();
                buttonState([1, 3].includes(state) ? "playing" : "ready");
                setStatus(
                  [1, 3].includes(state)
                    ? "재생 중"
                    : "재생 버튼을 눌러 들어보세요.",
                );
              }
            },
            onStateChange(event) {
              if (!controller.alive || controller.failed) return;
              if (event.data === 1) {
                for (const other of openPlayers)
                  if (other !== controller) other.pause();
                buttonState("playing");
                setStatus("재생 중");
              } else if (event.data === 2) {
                buttonState("paused");
                setStatus("잠시 멈췄어요.");
              } else if (event.data === 0) {
                buttonState("ended");
                setStatus("한 곡을 다 들었어요. 다시 들을까요?");
              } else if (event.data === 3) {
                buttonState("buffering");
                setStatus("음악을 이어서 불러오고 있어요…");
              } else {
                buttonState("ready");
                setStatus("재생 버튼을 눌러 들어보세요.");
              }
              controller.sync();
            },
            onAutoplayBlocked() {
              if (!controller.alive || controller.failed) return;
              buttonState("ready");
              setStatus("작은 영상의 재생 버튼을 눌러주세요.");
            },
            onError(event) {
              fail(
                [101, 150].includes(event.data)
                  ? "이 음악은 원본 사이트에서 들을 수 있어요."
                  : "음악을 불러오지 못했어요. 원본 링크를 확인해주세요.",
              );
            },
          },
        });
      })
      .catch(() =>
        fail(
          "음악 컨트롤을 연결하지 못했어요. 작은 영상이나 원본 링크에서 들어보세요.",
        ),
      );
    return controller;
  }

  root.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("[data-music-play]");
      if (!button) return;
      const card = button.closest(".entry-music");
      const controller = controllers.get(card);
      if (!controller || controller.failed) {
        controller?.destroy();
        mount(card, true);
      } else if (controller.ready) {
        const state = controller.player.getPlayerState();
        if ([1, 3].includes(state)) controller.player.pauseVideo();
        else controller.player.playVideo();
      }
    },
    { signal },
  );
  root.addEventListener(
    "input",
    (event) => {
      if (!event.target.matches(".music-seek")) return;
      const card = event.target.closest(".entry-music");
      const controller = controllers.get(card);
      if (!controller?.ready) return;
      controller.seeking = true;
      const time =
        (Number(event.target.value) / 1000) * controller.player.getDuration();
      card
        .querySelector(".music-progress")
        .style.setProperty("--played", `${Number(event.target.value) / 10}%`);
      card.querySelector("[data-music-current]").textContent =
        playbackTime(time);
      event.target.setAttribute(
        "aria-valuetext",
        `${playbackTime(time)} / ${playbackTime(controller.player.getDuration())}`,
      );
    },
    { signal },
  );
  root.addEventListener(
    "change",
    (event) => {
      if (!event.target.matches(".music-seek")) return;
      const controller = controllers.get(event.target.closest(".entry-music"));
      if (!controller?.ready) return;
      controller.player.seekTo(
        (Number(event.target.value) / 1000) * controller.player.getDuration(),
        true,
      );
      controller.seeking = false;
      controller.sync();
    },
    { signal },
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden)
        for (const controller of controllers.values()) controller.pause();
    },
    { signal },
  );
  signal.addEventListener(
    "abort",
    () => {
      for (const controller of [...controllers.values()]) controller.destroy();
    },
    { once: true },
  );
  if (signal.aborted) return;
  for (const card of root.querySelectorAll(".entry-music")) {
    mount(card);
    const title = card.querySelector("[data-music-title-missing]");
    const artist = card.querySelector("[data-music-artist-missing]");
    if (!title && !artist) continue;
    musicMetadata(
      card.querySelector(".music-player").dataset.musicUrl,
      signal,
    ).then((metadata) => {
      if (signal.aborted || !card.isConnected) return;
      if (title) title.textContent = metadata?.title || "곡 제목 미등록";
      if (artist && metadata?.channel) {
        artist.textContent = `채널 · ${metadata.channel}`;
        artist.hidden = false;
      }
      const iframe = card.querySelector("iframe");
      if (iframe)
        iframe.title = `${card.querySelector(".music-title").textContent} · YouTube 플레이어`;
    });
  }
}
