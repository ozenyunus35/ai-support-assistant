let locale = "en-US";
let lang: "en" | "tr" = "en";

/** Follows the interface language: dates, times and relative times read in English or Turkish. */
export function setFormatLocale(next: "en" | "tr") {
  lang = next;
  locale = next === "tr" ? "tr-TR" : "en-US";
}
export const uiLang = () => lang;

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });

export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const formatNumber = (n: number) => n.toLocaleString(locale);

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  const tr = lang === "tr";
  if (!iso) return tr ? "Hiç" : "Never";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return tr ? "Az önce" : "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return tr ? `${m} dk önce` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return tr ? `${h} sa önce` : `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return tr ? `${d} gün önce` : `${d} d ago`;
  return formatDate(iso);
}

/** Short duration for waiting times: "7 min", "2 h 5 min". */
export function duration(ms: number): string {
  const [mn, hr] = lang === "tr" ? ["dk", "sa"] : ["min", "h"];
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} ${mn}`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} ${hr} ${m % 60} ${mn}` : `${h} ${hr}`;
}

export const pct = (x: number) => (lang === "tr" ? `%${Math.round(x * 100)}` : `${Math.round(x * 100)}%`);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
