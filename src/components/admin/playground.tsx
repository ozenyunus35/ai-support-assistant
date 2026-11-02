"use client";

import { ArrowRight, FlaskConical } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { HANDOFF_REQUESTED, respondTo, type DialogContext, type Facts, type Part } from "@/lib/dialog";
import { pct } from "@/lib/format";
import { engineFor, useStore } from "@/lib/store";
import { RichText } from "../rich-text";
import { Card, CardHeader, EmptyState, PageHeader, Spinner, cx, inputClass } from "../ui";

const EXAMPLES = ["can i get my money back if the tent is used", "refnd for a retrun", "my zipper broke", "do you sell kayaks?", "Where is my order NF-20517?", "how much is express shipping", "hw do u send my order back pls"];
const MULTI = ["Do you ship to Canada and can I return a used tent after 45 days?", "The tent arrived 31 days ago. Can I still return it?", "Do not track NF-20481. Tell me your return policy."];
const CHAT = [["Do you ship to Canada?", "What about Germany?"], ["NF-20481", "Cancel that order, please."]];

const INTENT_LABEL: Record<string, string> = { ship: "Shipping", return: "Return", "refund-delay": "Refund not arrived", cancel: "Cancel an order", "size-swap": "Exchange for another size", exchange: "Exchange", missing: "Missing item", "not-received": "Delivered, not received", deadline: "Delivery deadline", warranty: "Warranty", injection: "Instruction override attempt", "refund-action": "Refund action (demo cannot do it)", "live-data": "Live stock or price", smalltalk: "Small talk", human: "Wants a person", lookup: "Order lookup", other: "Help center question" };

function factChips(f: Facts): string[] {
  const out: string[] = [];
  if (f.orderNo) out.push(`order ${f.orderNo}`);
  if (f.country) out.push(`country ${f.country}`);
  if (f.speed) out.push(`speed ${f.speed}`);
  if (f.poBox) out.push("PO box");
  if (f.amount !== undefined) out.push(`order total $${f.amount}`);
  if (f.days) out.push(`${f.days.n} ${f.days.kind} days${f.days.basis !== "unknown" ? ` since ${f.days.basis}` : ""}`);
  if (f.used !== undefined) out.push(f.used ? "used" : "unused");
  if (f.defect) out.push("defect");
  if (f.animal) out.push("animal damage");
  if (f.finalSale) out.push("final sale");
  if (f.payment) out.push(`paid with ${f.payment}`);
  if (f.shipped) out.push("already shipped");
  return out;
}

const STATUS_LABEL: Record<Part["status"], string> = { answered: "Answered", clarify: "Asked a question", handoff: "Handed to a person" };

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
  // Earlier messages of the same conversation. The context they leave behind is what the next message is read with.
  const [turns, setTurns] = useState<string[]>([]);
  const query = useDeferredValue(q);
  const x = useMemo(() => (state && query.trim() ? engineFor(state).explain(query, { threshold: state.settings.threshold, orders: state.orders }) : null), [state, query]);
  const d = useMemo(() => {
    if (!state || !query.trim()) return null;
    const engine = engineFor(state);
    const opts = { threshold: state.settings.threshold, orders: state.orders };
    const ctx = turns.reduce<DialogContext | undefined>((c, t) => respondTo(engine, t, c, opts).context, undefined);
    return { ctx, reply: respondTo(engine, query, ctx, opts) };
  }, [state, query, turns]);
  if (!state) return <Spinner />;
  const threshold = state.settings.threshold;
  const top = x?.hits[0]?.score ?? 1;
  const reply = d?.reply;
  const retrieved = !!reply && reply.method !== "rule";
  const conf = reply ? reply.confidence : 0;
  const sig = x?.reply.signals;
  const used = reply?.citations[0];
  const decision = !reply ? "" : reply.handoff && reply.kind === "handoff" ? "Hand off to a person" : reply.kind === "order" ? "Look up the order" : reply.kind === "clarify" ? "Ask a follow-up question" : reply.kind === "greeting" ? "Small talk" : "Answer";
  const handoffReason = reply?.handoffReason === "requested" ? "The customer asked for a person" : reply?.handoffReason === "low-confidence" ? "Not enough information: the retrieval match is below the threshold or the topic is outside the help center" : null;
  const send = (text: string) => {
    setTurns((t) => [...t, text]);
    setQ("");
  };

  return (
    <>
      <PageHeader title="Answer playground" description="Type a customer message and see each step the assistant takes: which requests it finds, which facts it keeps, which policy rule applies, what it takes from earlier messages, and, for what the rules don't cover, how it ranks help center sections with BM25." />
      <Card className="p-4">
        <label htmlFor="pg-q" className="text-xs font-medium text-muted">
          Customer question
        </label>
        {turns.length > 0 && (
          <ol className="mt-1.5 space-y-1 text-xs text-muted" data-testid="pg-turns" aria-label="Earlier messages in this conversation">
            {turns.map((t, i) => (
              <li key={i} className="truncate">
                <span className="text-faint tabular-nums">{i + 1}. </span>
                {t}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-1.5 flex gap-2">
          <input
            id="pg-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim() && turns.length) send(q);
            }}
            className={cx(inputClass, "h-10 text-[14px]")}
            placeholder={turns.length ? "Next message in this conversation" : "Ask anything a customer might"}
          />
          <button type="button" disabled={!q.trim()} onClick={() => send(q)} className="shrink-0 rounded-md border border-border px-3 text-xs text-muted transition-colors hover:text-text disabled:opacity-50" data-testid="pg-send">
            Send, then add a follow-up
          </button>
          {turns.length > 0 && (
            <button type="button" onClick={() => setTurns([])} className="shrink-0 rounded-md border border-border px-3 text-xs text-muted transition-colors hover:text-text" data-testid="pg-reset">
              New conversation
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-faint" data-testid="pg-mode">
          {turns.length ? `Conversation mode: this message is read together with the ${turns.length} earlier one${turns.length > 1 ? "s" : ""}.` : "Single message: no earlier context is used. Use “Send, then add a follow-up” to try a conversation."}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[...EXAMPLES, ...MULTI].map((e) => (
            <button key={e} onClick={() => { setTurns([]); setQ(e); }} className={cx("rounded-full border px-2.5 py-0.5 text-xs transition-colors", q === e && !turns.length ? "border-accent/50 text-text" : "border-border text-muted hover:text-text")}>
              {e}
            </button>
          ))}
          {CHAT.map((c) => (
            <button key={c.join("|")} onClick={() => { setTurns(c.slice(0, -1)); setQ(c[c.length - 1]); }} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted transition-colors hover:text-text">
              Conversation: {c.join(" → ")}
            </button>
          ))}
        </div>
      </Card>

      {!x || !reply ? (
        <Card className="mt-3">
          <EmptyState icon={FlaskConical} title="Type a question to begin" />
        </Card>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-3">
            <Card>
              <CardHeader title="Conversation layer" meta={`${reply!.total} request${reply!.total === 1 ? "" : "s"} found · ${reply!.covered} covered`} />
              <div className="space-y-3 p-4 text-xs" data-testid="dialog-layer">
                <div>
                  <p className="text-muted">Requests and their intent</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {reply!.parts.map((p, i) => (
                      <li key={i} className="rounded border border-border px-2 py-1.5" data-testid="dialog-part">
                        <p className="text-text">
                          <span className="font-medium">{INTENT_LABEL[p.intent] ?? p.intent}</span>
                          <span className="text-faint"> · {STATUS_LABEL[p.status]} · {p.method === "retrieval" ? `retrieval match ${pct(p.confidence ?? 0)}` : p.method === "rule" ? "policy rule" : p.method}</span>
                        </p>
                        <p className="mt-0.5 truncate text-faint">“{p.request.trim()}”</p>
                        {p.rule && <p className="mt-0.5 text-muted">Rule: {p.rule}</p>}
                        {p.missing?.length ? <p className="mt-0.5 text-warning">Missing: {p.missing.join(", ")}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted">Facts kept from this message</p>
                  <div className="mt-1.5 flex flex-wrap gap-1" data-testid="dialog-facts">
                    {factChips(reply!.facts).length ? factChips(reply!.facts).map((f) => <Chip key={f} tone="accent">{f}</Chip>) : <span className="text-faint">None stated</span>}
                  </div>
                </div>
                {reply!.negated.length > 0 && (
                  <div>
                    <p className="text-muted">Said the customer does not mean</p>
                    <div className="mt-1.5 flex flex-wrap gap-1" data-testid="dialog-negated">
                      {reply!.negated.map((n) => <Chip key={n} tone="muted">{n}</Chip>)}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-muted">Taken from earlier messages</p>
                  <p className="mt-1 text-text" data-testid="dialog-context">{reply!.contextUsed.length ? reply!.contextUsed.join("; ") : turns.length ? "Nothing from the earlier messages applied to this one." : "Nothing: single message, no context."}</p>
                </div>
                {reply!.missing.length > 0 && (
                  <div>
                    <p className="text-muted">Still missing</p>
                    <p className="mt-1 text-text" data-testid="dialog-missing">{reply!.missing.join("; ")}</p>
                  </div>
                )}
                {handoffReason && (
                  <div>
                    <p className="text-muted">Why it was handed off</p>
                    <p className="mt-1 text-text" data-testid="dialog-handoff">{handoffReason}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="1 · Understand the words" meta="retrieval path" />
              <ol className="space-y-4 p-4">
                <Step n={1} title="Normalise phrasing">
                  {x.analysis.rephrased ? <span className="text-xs text-text" data-testid="rephrased">{x.analysis.rephrased}</span> : <span className="text-xs text-faint">Nothing to rewrite</span>}
                </Step>
                <Step n={2} title="Drop filler words">
                  {x.analysis.dropped.length ? x.analysis.dropped.map((w, i) => <Chip key={w + i} tone="muted">{w}</Chip>) : <span className="text-xs text-faint">Nothing to drop</span>}
                </Step>
                <Step n={3} title="Fix spelling">
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
                <Step n={4} title="Map customer wording">
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
                <Step n={5} title="Search terms">
                  {x.analysis.terms.length ? [...new Set(x.analysis.terms)].map((t) => <Chip key={t} tone="accent">{t.replace(/_/g, " ")}</Chip>) : <span className="text-xs text-faint">No search terms left</span>}
                </Step>
              </ol>
            </Card>

            <Card>
              <CardHeader title="3 · Decide" />
              <div className="p-4">
                <div className="flex items-baseline justify-between">
                  {retrieved ? (
                    <p className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums" aria-label={`Retrieval match ${pct(conf)}`}>
                      {pct(conf)}
                    </p>
                  ) : (
                    <p className="text-[20px] leading-none font-semibold tracking-[-0.02em]" aria-label="Decided by policy rule">
                      Policy rule
                    </p>
                  )}
                  <p className={cx("font-medium", reply!.kind === "handoff" ? "text-warning" : "text-success")} data-testid="decision">
                    {decision}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-faint">
                  {retrieved ? "Retrieval match: how well the best help center section fits the question. It is not the chance that the answer is right." : "No help center search was needed: the facts and a policy rule decided the answer."}
                </p>
                {retrieved && (
                  <div className="relative mt-3 h-1.5 rounded-full bg-surface-3">
                    <div className={cx("h-full rounded-full transition-[width] duration-300", conf < threshold ? "bg-warning" : "bg-accent")} style={{ width: pct(conf) }} />
                    <span className="absolute -top-1 h-3.5 w-px bg-text" style={{ left: pct(threshold) }} aria-hidden />
                  </div>
                )}
                {retrieved && <p className="mt-1.5 text-xs text-faint">Handoff threshold {pct(threshold)} (change it in Settings)</p>}
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                  <div>
                    <dt className="text-muted">Coverage</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{pct(sig?.coverage ?? x.coverage)}</dd>
                    <dd className="text-faint">of the question the best article talks about</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Match strength</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{pct(sig?.strength ?? x.strength)}</dd>
                    <dd className="text-faint">BM25 score of the best section, scaled</dd>
                  </div>
                  {sig && (
                    <>
                      <div>
                        <dt className="text-muted">Lead</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">{Math.exp(sig.margin).toFixed(1)}×</dd>
                        <dd className="text-faint">score of the next best article</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Intent</dt>
                        <dd className="mt-0.5 font-medium">{sig.intent > 0 ? "Matched" : sig.intent < 0 ? "Missed" : "None stated"}</dd>
                        <dd className="text-faint">{pct(sig.unknown)} of words not in the help center</dd>
                      </div>
                    </>
                  )}
                </dl>
                <div className="mt-3 border-t border-border pt-3 text-xs" data-testid="rules">
                  <p className="text-muted">Rules applied</p>
                  {reply!.notes.length ? (
                    <ul className="mt-1.5 space-y-1">
                      {reply!.notes.map((n) => (
                        <li key={n} className="text-text">
                          {n}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-faint">None, the top section and its score were used as they are.</p>
                  )}
                </div>
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
                        {used && used.articleId === h.articleId && (used.heading ?? null) === (h.heading ?? null) && (
                          <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[11px] font-medium text-accent" data-testid="used-section">
                            {reply!.kind === "handoff" ? "Closest" : "Used"}
                          </span>
                        )}
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
                {reply!.kind === "handoff" ? (
                  <p className="text-muted">{reply!.handoffReason === "requested" ? HANDOFF_REQUESTED : state.settings.handoffMessage}</p>
                ) : (
                  <RichText text={reply!.text} dense />
                )}
                {reply!.order && (
                  <p className="mt-2 text-xs text-muted">
                    + order card for {reply!.order.number} ({reply!.order.status.replace(/-/g, " ")})
                  </p>
                )}
                {reply!.citations.length > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    {reply!.kind === "handoff" ? "Closest article, not shown to the customer: " : "Sources: "}
                    {reply!.citations.map((c) => c.title + (c.heading ? ` › ${c.heading}` : "")).join(", ")}
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
