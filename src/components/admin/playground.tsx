"use client";

import { ArrowRight, FlaskConical } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { pct } from "@/lib/format";
import { engineFor, useStore } from "@/lib/store";
import { RichText } from "../rich-text";
import { Card, CardHeader, EmptyState, PageHeader, Spinner, cx, inputClass } from "../ui";

const EXAMPLES = ["can i get my money back if the tent is used", "refnd for a retrun", "my zipper broke", "do you sell kayaks?", "Where is my order NF-20517?", "how much is express shipping"];

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "muted" }) {
  return <span className={cx("inline-flex h-5 items-center rounded border px-1.5 font-mono text-[11px]", tone === "accent" ? "border-accent/40 bg-accent-soft text-text" : tone === "muted" ? "border-border text-faint line-through" : "border-border text-muted")}>{children}</span>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-7">
      <span className="absolute top-0 left-0 grid size-5 place-items-center rounded-full border border-border bg-surface text-[11px] font-medium text-muted">{n}</span>
      <p className="font-medium">{title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">{children}</div>
    </li>
  );
}

export function Playground() {
  const state = useStore();
  const [q, setQ] = useState(EXAMPLES[0]);
  const query = useDeferredValue(q);
  const x = useMemo(() => (state && query.trim() ? engineFor(state).explain(query, { threshold: state.settings.threshold, orders: state.orders }) : null), [state, query]);
  if (!state) return <Spinner />;
  const threshold = state.settings.threshold;
  const top = x?.hits[0]?.score ?? 1;
  const decision = !x ? "" : x.reply.kind === "answer" ? "Answer" : x.reply.kind === "handoff" ? "Hand off to a person" : x.reply.kind === "order" ? "Look up the order" : x.reply.kind === "clarify" ? "Ask a follow-up question" : "Small talk";

  return (
    <>
      <PageHeader title="Answer playground" description="Type a customer question and see each step the assistant takes: normalising the words, ranking help center sections with BM25, scoring confidence and composing the reply." />
      <Card className="p-4">
        <label htmlFor="pg-q" className="text-xs font-medium text-muted">
          Customer question
        </label>
        <input id="pg-q" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputClass, "mt-1.5 h-10 text-[14px]")} placeholder="Ask anything a customer might" />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => setQ(e)} className={cx("rounded-full border px-2.5 py-0.5 text-xs transition-colors", q === e ? "border-accent/50 text-text" : "border-border text-muted hover:text-text")}>
              {e}
            </button>
          ))}
        </div>
      </Card>

      {!x ? (
        <Card className="mt-3">
          <EmptyState icon={FlaskConical} title="Type a question to begin" />
        </Card>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-3">
            <Card>
              <CardHeader title="1 · Understand the question" />
              <ol className="space-y-4 p-4">
                <Step n={1} title="Drop filler words">
                  {x.analysis.dropped.length ? x.analysis.dropped.map((w, i) => <Chip key={w + i} tone="muted">{w}</Chip>) : <span className="text-xs text-faint">Nothing to drop</span>}
                </Step>
                <Step n={2} title="Fix spelling">
                  {x.analysis.corrections.length ? (
                    x.analysis.corrections.map((c) => (
                      <span key={c.from} className="inline-flex items-center gap-1">
                        <Chip>{c.from}</Chip>
                        <ArrowRight className="size-3 text-faint" aria-hidden />
                        <Chip tone="accent">{c.to}</Chip>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-faint">No typos found</span>
                  )}
                </Step>
                <Step n={3} title="Map customer wording">
                  {x.analysis.synonyms.length ? (
                    x.analysis.synonyms.map((c) => (
                      <span key={c.from} className="inline-flex items-center gap-1">
                        <Chip>{c.from}</Chip>
                        <ArrowRight className="size-3 text-faint" aria-hidden />
                        <Chip tone="accent">{c.to}</Chip>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-faint">No synonyms used</span>
                  )}
                </Step>
                <Step n={4} title="Search terms">
                  {x.analysis.terms.length ? [...new Set(x.analysis.terms)].map((t) => <Chip key={t} tone="accent">{t.replace(/_/g, " ")}</Chip>) : <span className="text-xs text-faint">No search terms left</span>}
                </Step>
              </ol>
            </Card>

            <Card>
              <CardHeader title="3 · Decide" />
              <div className="p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums" aria-label={`Confidence ${pct(x.confidence)}`}>
                    {pct(x.confidence)}
                  </p>
                  <p className={cx("font-medium", x.reply.kind === "handoff" ? "text-warning" : "text-success")} data-testid="decision">
                    {decision}
                  </p>
                </div>
                <div className="relative mt-3 h-1.5 rounded-full bg-surface-3">
                  <div className={cx("h-full rounded-full transition-[width] duration-300", x.confidence < threshold ? "bg-warning" : "bg-accent")} style={{ width: pct(x.confidence) }} />
                  <span className="absolute -top-1 h-3.5 w-px bg-text" style={{ left: pct(threshold) }} aria-hidden />
                </div>
                <p className="mt-1.5 text-xs text-faint">Handoff threshold {pct(threshold)} (change it in Settings)</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                  <div>
                    <dt className="text-muted">Coverage</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{pct(x.coverage)}</dd>
                    <dd className="text-faint">of the question the best article talks about</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Match strength</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{pct(x.strength)}</dd>
                    <dd className="text-faint">BM25 score of the best section, scaled</dd>
                  </div>
                </dl>
              </div>
            </Card>
          </div>

          <div className="space-y-3">
            <Card>
              <CardHeader title="2 · Rank help center sections" meta={`${engineFor(state).chunkCount} sections indexed`} />
              {x.hits.length === 0 ? (
                <EmptyState icon={FlaskConical} title="No section matches" text="None of the search terms appear in the help center." />
              ) : (
                <ol className="divide-y divide-border">
                  {x.hits.map((h, i) => (
                    <li key={h.articleId + h.heading} className="px-4 py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="w-4 shrink-0 text-xs text-faint tabular-nums">{i + 1}</span>
                        <p className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{h.title}</span>
                          {h.heading && <span className="text-muted"> › {h.heading}</span>}
                        </p>
                        <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{h.score.toFixed(2)}</span>
                      </div>
                      <div className="mt-1.5 ml-6 h-1 overflow-hidden rounded-full bg-surface-3">
                        <div className={cx("h-full rounded-full", i === 0 ? "bg-accent" : "bg-border-strong")} style={{ width: `${(h.score / top) * 100}%` }} />
                      </div>
                      <div className="mt-1.5 ml-6 flex flex-wrap gap-1">
                        {h.matched.map((t) => (
                          <Chip key={t}>{t.replace(/_/g, " ")}</Chip>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card>
              <CardHeader title="4 · Reply the customer sees" />
              <div className="p-4">
                {x.reply.kind === "handoff" ? (
                  <p className="text-muted">{state.settings.handoffMessage}</p>
                ) : (
                  <RichText text={x.reply.text} dense />
                )}
                {x.reply.order && (
                  <p className="mt-2 text-xs text-muted">
                    + order card for {x.reply.order.number} ({x.reply.order.status.replace(/-/g, " ")})
                  </p>
                )}
                {x.reply.citations.length > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    {x.reply.kind === "handoff" ? "Closest article, not shown to the customer: " : "Sources: "}
                    {x.reply.citations.map((c) => c.title + (c.heading ? ` › ${c.heading}` : "")).join(", ")}
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
