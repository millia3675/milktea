export function today(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => p.find((x) => x.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(+d) &&
    d.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01"
  );
}
export function addDays(value, days) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monthDays(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function changeMonth(date, delta) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + delta, 1));
  const ym = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${ym}-${String(Math.min(d, monthDays(ym))).padStart(2, "0")}`;
}
export function weekDates(date = today()) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function streak(dates, reference = today()) {
  const unique = new Set(dates.filter((d) => d <= reference));
  let cursor = unique.has(reference) ? reference : addDays(reference, -1);
  let count = 0;
  while (unique.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
export function formatDate(date, weekday = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    ...(weekday ? { weekday: "long" } : {}),
  }).format(new Date(`${date}T12:00:00Z`));
}
export function formatTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}
