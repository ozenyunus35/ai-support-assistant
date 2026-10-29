"use client";

import { ArrowRight, BarChart3, Clock, Lightbulb, Tags } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { duration, pct, timeAgo } from "@/lib/format";
import { CATEGORIES } from "@/lib/kb";
import { overview } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/use-now";
import type { DayPoint } from "@/lib/stats";
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Sparkline, Spinner, cx } from "../ui";

const SERIES = [
  { key: "ai", label: "Resolved by AI", color: "var(--accent)" },
  { key: "human", label: "Handed to a person", color: "var(--border-strong)" },
] as const;

function Change({ current, previous, invert, format = "pct" }: { current: number; previous: number; invert?: boolean; format?: "pct" | "pts" }) {
  const diff = format === "pts" ? Math.round((current - previous) * 100) : previous === 0 ? 0 : Math.round(((current - previous) / previous) * 100);
  const good = invert ? diff < 0 : diff > 0;
  return (
    <span className="text-xs text-muted" title="Compared with the previous 30 days">
      <span className={cx("font-medium tabular-nums", diff === 0 ? "text-muted" : good ? "text-success" : "text-danger")}>
        {diff > 0 ? "+" : ""}
        {diff}
        {format === "pts" ? " pts" : "%"}
      </span>{" "}
      <span className="hidden xl:inline">vs prior 30 days</span>
    </span>
  );
}

function Kpi({ label, value, change, spark }: { label: string; value: string; change: React.ReactNode; spark?: number[] }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        {change}
        {spark && <Sparkline data={spark} className="w-16 shrink-0 sm:w-20" />}
      </div>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-md bg-surface px-2.5 py-2 text-xs shadow-pop">
      <p className="mb-1 text-faint">{label}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2">
          <span className="size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
          <span className="text-muted">{s.label}</span>
          <span className="ml-auto font-medium tabular-nums">{payload.find((p) => p.dataKey === s.key)?.value ?? 0}</span>
        </p>
      ))}
    </div>
  );
}

function DailyChart({ data }: { data: DayPoint[] }) {
  return (
    <div className="h-64 px-2 pt-4 pb-2" role="img" aria-label={`Conversations per day for the last ${data.length} days, split into resolved by AI and handed to a person`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="22%" margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--faint)", fontSize: 11 }} interval={6} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--faint)", fontSize: 11 }} width={40} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip />} />
          <Bar dataKey="ai" stackId="a" fill="var(--accent)" animationDuration={600} />
          <Bar dataKey="human" stackId="a" fill="var(--border-strong)" radius={[2, 2, 0, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Overview() {
  const state = useStore();
  const now = useNow();
  const o = useMemo(() => (state ? overview(state, now) : null), [state, now]);
  if (!state || !o) return <Spinner />;
  const { current: c, previous: p } = o;
  const waiting = state.conversations.filter((x) => x.status === "needs-human").sort((a, b) => (a.handoffAt ?? "").localeCompare(b.handoffAt ?? ""));
  const totalTopics = o.topics.reduce((s, t) => s + t.count, 0);
  const spark = (k: "ai" | "human" | "all") => o.daily.map((d) => (k === "all" ? d.ai + d.human : d[k]));

  return (
    <>
      <PageHeader title="Overview" description="How the assistant handled Northfold's support chats in the last 30 days." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Conversations" value={c.total.toLocaleString("en-US")} change={<Change current={c.total} previous={p.total} />} spark={spark("all")} />
        <Kpi label="Resolved by AI" value={pct(c.resolutionRate)} change={<Change current={c.resolutionRate} previous={p.resolutionRate} format="pts" />} spark={spark("ai")} />
        <Kpi label="Handed to a person" value={c.handedOff.toLocaleString("en-US")} change={<Change current={c.handoffRate} previous={p.handoffRate} format="pts" invert />} spark={spark("human")} />
        <Kpi label="Helpful answers" value={pct(c.helpful)} change={<span className="text-xs text-muted">{c.rated} ratings</span>} />
        <Kpi label="Median human reply" value={duration(c.medianHumanMinutes * 60_000)} change={<Change current={c.medianHumanMinutes} previous={p.medianHumanMinutes} invert />} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Conversations per day"
            icon={BarChart3}
            meta={
              <span className="flex items-center gap-3">
                {SERIES.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </span>
                ))}
              </span>
            }
          />
          <DailyChart data={o.daily} />
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Waiting for a person" icon={Clock} meta={<Link href="/admin/inbox/?view=needs-human" className="hover:text-text">Open queue</Link>} />
          {waiting.length === 0 ? (
            <EmptyState icon={Clock} title="Nobody is waiting" text="Handoffs from the assistant appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {waiting.slice(0, 5).map((x) => {
                const q = x.messages.filter((m) => m.role === "customer").pop();
                return (
                  <li key={x.id}>
                    <Link href={`/admin/inbox/?c=${x.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                      <Avatar name={x.customer.name} size={26} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2">
                          <span className="truncate font-medium">{x.customer.name}</span>
                          {x.live && <span className="rounded border border-accent/40 px-1 text-[10px] font-medium text-accent">Live</span>}
                        </p>
                        <p className="truncate text-muted">{q?.text}</p>
                      </div>
                      <span className="shrink-0 text-xs text-warning tabular-nums">{duration(now - Date.parse(x.handoffAt ?? x.updatedAt))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Topics" icon={Tags} meta="By cited article" />
          <ul className="space-y-3 p-4">
            {o.topics.map((t) => {
              const share = totalTopics ? t.count / totalTopics : 0;
              return (
                <li key={t.topic}>
                  <div className="flex justify-between gap-3">
                    <span className="truncate">{t.topic === "other" ? "Not in the help center" : CATEGORIES[t.topic].label}</span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {t.count} · {pct(share)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                    <div className={cx("h-full rounded-full", t.topic === "other" ? "bg-warning" : "bg-accent")} style={{ width: pct(share) }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Knowledge gaps" icon={Lightbulb} meta="Questions the assistant couldn't answer confidently" />
          {o.gaps.length === 0 ? (
            <EmptyState icon={Lightbulb} title="No gaps found" text="Every question in this period matched the help center." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Question</th>
                    <th className="px-2 py-2 text-right font-medium">Asked</th>
                    <th className="hidden px-2 py-2 font-medium md:table-cell">Closest article</th>
                    <th className="px-4 py-2 text-right font-medium">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {o.gaps.slice(0, 6).map((g) => (
                    <tr key={g.question}>
                      <td className="max-w-0 px-4 py-2.5">
                        <p className="truncate">{g.question}</p>
                        <p className="text-xs text-faint">Last asked {timeAgo(g.lastAt, now)}</p>
                      </td>
                      <td className="px-2 py-2.5 text-right text-muted tabular-nums">{g.count}×</td>
                      <td className="hidden max-w-0 px-2 py-2.5 md:table-cell">
                        <p className="truncate text-muted">{g.closest ?? "None"}</p>
                        <p className="text-xs text-faint tabular-nums">Best match {pct(g.confidence)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Link href={`/admin/knowledge/?new=${encodeURIComponent(g.question)}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                          Write article <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
