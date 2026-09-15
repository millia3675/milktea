let pendingAPI;

// One lazy-loaded official API for the page. A failed request can be retried.
export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pendingAPI) return pendingAPI;
  pendingAPI = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    const previous = window.onYouTubeIframeAPIReady;
    const cleanup = () => {
      clearTimeout(timer);
      if (window.onYouTubeIframeAPIReady === ready)
        window.onYouTubeIframeAPIReady = previous;
    };
    const ready = () => {
      cleanup();
      resolve(window.YT);
      if (typeof previous === "function") previous();
    };
    const fail = () => {
      cleanup();
      script.remove();
      pendingAPI = null;
      reject(new Error("YOUTUBE_API_UNAVAILABLE"));
    };
    const timer = setTimeout(fail, 12000);
    window.onYouTubeIframeAPIReady = ready;
    script.onerror = fail;
    document.head.append(script);
  });
  return pendingAPI;
}

export function playbackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—:—";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const tail = String(whole % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}`
    : `${minutes}:${tail}`;
}
