import type { Category, Conversation, DemoState } from "./types";

const DAY = 86_400_000;

export interface PeriodMetrics {
  total: number;
  aiResolved: number;
  handedOff: number;
  resolutionRate: number;
  handoffRate: number;
  helpful: number;
  rated: number;
  medianHumanMinutes: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Minutes from the handoff to the first reply from a person. */
export function humanResponseMinutes(c: Conversation): number | null {
  if (!c.handoffAt) return null;
  const reply = c.messages.find((m) => m.role === "agent" && m.at >= c.handoffAt!);
  return reply ? (Date.parse(reply.at) - Date.parse(c.handoffAt)) / 60_000 : null;
}

export function metrics(convs: Conversation[]): PeriodMetrics {
  const total = convs.length;
  const handedOff = convs.filter((c) => c.handoffAt).length;
  const aiResolved = convs.filter((c) => !c.handoffAt && c.status === "resolved").length;
  let up = 0;
  let down = 0;
  for (const c of convs)
    for (const m of c.messages) {
      if (m.feedback === "up") up++;
      if (m.feedback === "down") down++;
    }
  const times = convs.map(humanResponseMinutes).filter((x): x is number => x !== null);
  return {
    total,
    aiResolved,
    handedOff,
    resolutionRate: total ? aiResolved / total : 0,
    handoffRate: total ? handedOff / total : 0,
    helpful: up + down ? up / (up + down) : 0,
    rated: up + down,
    medianHumanMinutes: median(times),
  };
}

export interface DayPoint {
  day: string;
  label: string;
  ai: number;
  human: number;
}

export interface Gap {
  question: string;
  count: number;
  lastAt: string;
  confidence: number;
  closest: string | null;
}

export function overview(state: DemoState, now = Date.now(), days = 30) {
  // Whole UTC days, so the chart buckets and the totals agree.
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  const from = today - (days - 1) * DAY;
  const current = state.conversations.filter((c) => Date.parse(c.startedAt) >= from);
  const previous = state.conversations.filter((c) => Date.parse(c.startedAt) >= from - days * DAY && Date.parse(c.startedAt) < from);

  const byDay = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today - i * DAY);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { day: key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), ai: 0, human: 0 });
  }
  for (const c of current) {
    const p = byDay.get(c.startedAt.slice(0, 10));
    if (p) p[c.handoffAt ? "human" : "ai"]++;
  }

  const topicCounts = new Map<Category | "other", number>();
  for (const c of current) topicCounts.set(c.topic ?? "other", (topicCounts.get(c.topic ?? "other") ?? 0) + 1);
  const topics = [...topicCounts].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);

  // Questions the assistant handed off because it wasn't confident: candidates for new articles.
  const gapMap = new Map<string, Gap>();
  const cited = new Map<string, number>();
  for (const c of current) {
    c.messages.forEach((m, i) => {
      for (const ref of m.answer?.citations ?? []) if (m.answer?.kind === "answer") cited.set(ref.articleId, (cited.get(ref.articleId) ?? 0) + 1);
      if (m.role !== "assistant" || m.answer?.kind !== "handoff" || m.answer.confidence >= 1) return;
      const q = c.messages[i - 1];
      if (!q || q.role !== "customer") return;
      const key = q.text.trim().toLowerCase().replace(/[?.!]+$/, "");
      const g = gapMap.get(key) ?? { question: q.text.trim(), count: 0, lastAt: q.at, confidence: 0, closest: null };
      g.count++;
      if (q.at > g.lastAt) g.lastAt = q.at;
      g.confidence = Math.max(g.confidence, m.answer.confidence);
      g.closest = m.answer.citations[0]?.title ?? g.closest;
      gapMap.set(key, g);
    });
  }
  const gaps = [...gapMap.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
  const topArticles = [...cited]
    .map(([id, count]) => ({ id, title: state.articles.find((a) => a.id === id)?.title ?? id, count }))
    .sort((a, b) => b.count - a.count);

  return { current: metrics(current), previous: metrics(previous), daily: [...byDay.values()], topics, gaps, topArticles };
}

/** Share of past customer questions that would be handed off at a given threshold. */
export function handoffShareAt(confidences: number[], threshold: number) {
  return confidences.length ? confidences.filter((c) => c < threshold).length / confidences.length : 0;
}
