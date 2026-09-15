const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const normalizeRotation = (degrees) =>
  ((((degrees + 180) % 360) + 360) % 360) - 180;
const midpoint = (points) =>
  points.length === 1
    ? points[0]
    : {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
const distance = (points) =>
  Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
const angle = (points) =>
  Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);

export function gestureSnapshot(sticker, points, rect) {
  return {
    sticker: {
      x: sticker.x,
      y: sticker.y,
      scale: sticker.scale,
      rotation: sticker.rotation,
    },
    points: points.map((p) => ({ ...p })),
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
  };
}

// Transform the sticker about the fingers' midpoint, including off-centre pinches.
export function transformGesture(start, points) {
  const { sticker, rect } = start;
  if (
    !points.length ||
    points.length !== start.points.length ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return { ...sticker };
  const before = midpoint(start.points),
    after = midpoint(points);
  let scale = sticker.scale,
    rotation = sticker.rotation,
    radians = 0;
  if (points.length === 2 && distance(start.points) >= 2) {
    scale = clamp(
      (sticker.scale * distance(points)) / distance(start.points),
      0.25,
      4,
    );
    radians = angle(points) - angle(start.points);
    rotation = normalizeRotation(sticker.rotation + (radians * 180) / Math.PI);
  }
  const ratio = scale / sticker.scale;
  const dx = rect.left + sticker.x * rect.width - before.x;
  const dy = rect.top + sticker.y * rect.height - before.y;
  return {
    x: clamp(
      (after.x +
        ratio * (dx * Math.cos(radians) - dy * Math.sin(radians)) -
        rect.left) /
        rect.width,
      0,
      1,
    ),
    y: clamp(
      (after.y +
        ratio * (dx * Math.sin(radians) + dy * Math.cos(radians)) -
        rect.top) /
        rect.height,
      0,
      1,
    ),
    scale,
    rotation,
  };
}

export function resizeSnapshot(sticker, point, rect, corner, size) {
  const radians = (sticker.rotation * Math.PI) / 180;
  const dx = (corner.endsWith("e") ? 1 : -1) * size.width * sticker.scale;
  const dy = (corner.startsWith("s") ? 1 : -1) * size.height * sticker.scale;
  return {
    ...gestureSnapshot(sticker, [point], rect),
    diagonal: {
      x: dx * Math.cos(radians) - dy * Math.sin(radians),
      y: dx * Math.sin(radians) + dy * Math.cos(radians),
    },
  };
}

// Project the drag along the rotated diagonal, keeping the opposite corner fixed.
export function transformResize(start, point) {
  const { sticker, rect, diagonal, points } = start;
  const squaredLength = diagonal.x ** 2 + diagonal.y ** 2;
  if (squaredLength < 1 || rect.width <= 0 || rect.height <= 0)
    return { ...sticker };
  const delta =
    ((point.x - points[0].x) * diagonal.x +
      (point.y - points[0].y) * diagonal.y) /
    squaredLength;
  const scale = clamp(sticker.scale * (1 + delta), 0.25, 4);
  const shift = (scale / sticker.scale - 1) / 2;
  return {
    ...sticker,
    x: clamp(sticker.x + (diagonal.x * shift) / rect.width, 0, 1),
    y: clamp(sticker.y + (diagonal.y * shift) / rect.height, 0, 1),
    scale,
  };
}

export function bindStickerGestures(
  layer,
  { enabled, selected, find, select, change, finish, signal },
) {
  const pointers = new Map();
  let sticker = null,
    snapshot = null,
    resizing = false,
    draggable = false;
  const desktopControls = () =>
    window.matchMedia(
      "(min-width: 768px) and (hover: hover) and (pointer: fine)",
    ).matches;
  const positions = () => [...pointers.values()].map((p) => p.position);
  const rebase = () => {
    snapshot =
      sticker && pointers.size
        ? gestureSnapshot(sticker, positions(), layer.getBoundingClientRect())
        : null;
  };
  const release = (id) => {
    if (layer.hasPointerCapture(id)) layer.releasePointerCapture(id);
  };
  const end = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    release(event.pointerId);
    if (pointers.size) rebase();
    else {
      sticker = null;
      snapshot = null;
      resizing = false;
      draggable = false;
      finish();
    }
  };
  const cancel = () => {
    const ids = [...pointers.keys()];
    pointers.clear();
    sticker = null;
    snapshot = null;
    resizing = false;
    draggable = false;
    ids.forEach(release);
    if (ids.length) finish();
  };
  layer.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !enabled() ||
        (event.pointerType === "mouse" && event.button !== 0) ||
        pointers.size >= 2
      )
        return;
      if (
        pointers.size &&
        (event.pointerType !== "touch" ||
          [...pointers.values()].some((p) => p.type !== "touch"))
      )
        return;
      const target = event.target.closest("[data-sticker]");
      if (!pointers.size) {
        sticker = target
          ? find(target.dataset.sticker)
          : event.pointerType === "touch"
            ? selected()
            : null;
        if (!sticker) return;
        draggable = !!target;
        select(sticker);
      }
      event.preventDefault();
      pointers.set(event.pointerId, {
        position: { x: event.clientX, y: event.clientY },
        type: event.pointerType,
      });
      layer.setPointerCapture(event.pointerId);
      if (pointers.size === 2) draggable = true;
      const handle = event.target.closest("[data-sticker-resize]");
      resizing = !!handle && event.pointerType === "mouse" && desktopControls();
      if (resizing) {
        snapshot = resizeSnapshot(
          sticker,
          positions()[0],
          layer.getBoundingClientRect(),
          handle.dataset.stickerResize,
          { width: target.offsetWidth, height: target.offsetHeight },
        );
      } else rebase();
    },
    { signal },
  );
  layer.addEventListener(
    "pointermove",
    (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer || !sticker || !snapshot || !enabled()) return;
      event.preventDefault();
      pointer.position = { x: event.clientX, y: event.clientY };
      if (!draggable) return;
      const next = resizing
        ? transformResize(snapshot, pointer.position)
        : transformGesture(snapshot, positions());
      if (
        Object.entries(next).some(
          ([key, value]) => Math.abs(sticker[key] - value) > 0.000001,
        )
      ) {
        Object.assign(sticker, next);
        change(sticker);
      }
    },
    { signal },
  );
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    layer.addEventListener(type, end, { signal });
  layer.addEventListener(
    "wheel",
    (event) => {
      if (
        !enabled() ||
        !desktopControls() ||
        event.ctrlKey ||
        event.metaKey ||
        !event.deltaY
      )
        return;
      const target = event.target.closest("[data-sticker]");
      const hovered = target && find(target.dataset.sticker);
      if (!hovered) return;
      event.preventDefault();
      if (pointers.size) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? layer.clientHeight
            : 1;
      const degrees =
        clamp(event.deltaY * unit, -300, 300) * (event.shiftKey ? 0.01 : 0.05);
      if (selected()?.id !== hovered.id) select(hovered);
      hovered.rotation = normalizeRotation(
        Math.round((hovered.rotation + degrees) * 100) / 100,
      );
      change(hovered);
      finish();
    },
    { signal, passive: false },
  );
  window.addEventListener("blur", cancel, { signal });
  signal.addEventListener("abort", cancel, { once: true });
  return { cancel };
}
