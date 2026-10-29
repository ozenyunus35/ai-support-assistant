"use client";

import { ArrowLeft, Check, CornerDownLeft, Inbox as InboxIcon, Search, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { resolveConversation, sendAgentReply } from "@/lib/api";
import { duration, formatDateTime, formatTime, pct, timeAgo } from "@/lib/format";
import { CATEGORIES } from "@/lib/kb";
import { engineFor, useStore } from "@/lib/store";
import { useNow } from "@/lib/use-now";
import type { Conversation, ConversationStatus, DemoState, Message } from "@/lib/types";
import { RichText } from "../rich-text";
import { useToast } from "../toast";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Spinner, cx, type Tone } from "../ui";

const VIEWS = [
  { key: "all", label: "All" },
  { key: "needs-human", label: "Needs a person" },
  { key: "agent", label: "With the team" },
  { key: "ai", label: "Resolved by AI" },
  { key: "team", label: "Resolved by team" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const STATUS: Record<ConversationStatus, { label: string; tone: Tone }> = {
  open: { label: "AI answering", tone: "accent" },
  "needs-human": { label: "Needs a person", tone: "warning" },
  agent: { label: "With the team", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
};

const inView = (c: Conversation, v: View) =>
  v === "all" ||
  (v === "needs-human" && c.status === "needs-human") ||
  (v === "agent" && (c.status === "agent" || c.status === "open")) ||
  (v === "ai" && c.status === "resolved" && c.resolvedBy === "ai") ||
  (v === "team" && c.status === "resolved" && c.resolvedBy === "agent");

function StatusBadge({ c }: { c: Conversation }) {
  const s = STATUS[c.status];
  return <Badge tone={s.tone}>{c.status === "resolved" ? (c.resolvedBy === "ai" ? "Resolved by AI" : "Resolved by team") : s.label}</Badge>;
}

function ListItem({ c, active, onSelect }: { c: Conversation; active: boolean; onSelect: () => void }) {
  const now = useNow();
  const last = c.messages[c.messages.length - 1];
  const prefix = last?.role === "customer" ? "" : last?.role === "agent" ? "You: " : "AI: ";
  return (
    <li>
      <button onClick={onSelect} aria-current={active ? "true" : undefined} className={cx("flex w-full items-start gap-3 border-l-2 px-3.5 py-3 text-left transition-colors", active ? "border-accent bg-surface-2" : "border-transparent hover:bg-surface-2")}>
        <Avatar name={c.customer.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{c.customer.name}</span>
            {c.live && <span className="shrink-0 rounded border border-accent/40 px-1 text-[10px] font-medium text-accent">Live</span>}
            <span className="ml-auto shrink-0 text-xs text-faint">{timeAgo(c.updatedAt, now)}</span>
          </div>
          <p className="mt-0.5 truncate text-muted">
            {prefix}
            {last?.text || "Handed to the team"}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge c={c} />
            {c.status === "needs-human" && c.handoffAt && <span className="text-xs text-warning tabular-nums">waiting {duration(now - Date.parse(c.handoffAt))}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}

function Bubble({ m, state, threshold }: { m: Message; state: DemoState; threshold: number }) {
  if (m.role === "customer")
    return (
      <div className="flex max-w-[85%] flex-col items-start">
        <p className="rounded-2xl rounded-tl-md bg-surface-2 px-3 py-2 whitespace-pre-wrap">{m.text}</p>
        <span className="mt-1 text-[11px] text-faint">{formatTime(m.at)}</span>
      </div>
    );
  if (m.role === "agent") {
    const agent = state.agents.find((a) => a.id === m.agentId);
    return (
      <div className="ml-auto flex max-w-[85%] flex-col items-end">
        <p className="rounded-2xl rounded-tr-md bg-accent px-3 py-2 whitespace-pre-wrap text-accent-fg">{m.text}</p>
        <span className="mt-1 text-[11px] text-faint">
          {agent?.name ?? "Team"} · {formatTime(m.at)}
        </span>
      </div>
    );
  }
  const a = m.answer;
  const handoff = a?.kind === "handoff";
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end">
      <div className={cx("rounded-2xl rounded-tr-md border px-3 py-2", handoff ? "border-warning/40 bg-warning-soft" : "border-border bg-surface")}>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <Sparkles className="size-3" aria-hidden /> {handoff ? "AI handed off" : "AI answer"}
          {a && a.kind !== "greeting" && a.kind !== "thanks" && (
            <span className={cx("font-normal tabular-nums", a.confidence < threshold ? "text-warning" : "text-faint")}>
              · confidence {pct(a.confidence)}
            </span>
          )}
        </p>
        <RichText text={m.text} dense />
        {m.order && (
          <p className="mt-1.5 text-xs text-muted">
            Order card: {m.order.number}, {m.order.status.replace(/-/g, " ")}
          </p>
        )}
        {a && a.citations.length > 0 && (
          <p className="mt-1.5 text-xs text-muted">
            {handoff ? "Closest article: " : "Sources: "}
            {a.citations.map((c) => c.title + (c.heading ? ` › ${c.heading}` : "")).join(", ")}
          </p>
        )}
      </div>
      <span className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
        {m.feedback === "up" && (
          <span className="inline-flex items-center gap-1 text-success">
            <ThumbsUp className="size-3" aria-hidden /> Helpful
          </span>
        )}
        {m.feedback === "down" && (
          <span className="inline-flex items-center gap-1 text-danger">
            <ThumbsDown className="size-3" aria-hidden /> Not helpful
          </span>
        )}
        {formatTime(m.at)}
      </span>
    </div>
  );
}

function Detail({ c, state, onBack }: { c: Conversation; state: DemoState; onBack: () => void }) {
  const [draft, setDraft] = useState("");
  const { toast } = useToast();
  const lastQuestion = [...c.messages].reverse().find((m) => m.role === "customer");
  // Agent assist: the assistant's best attempt, even when it was too unsure to send it.
  const suggestion = useMemo(() => {
    if (!lastQuestion || c.status === "resolved") return null;
    const r = engineFor(state).answer(lastQuestion.text, { threshold: 0, orders: state.orders });
    return r.kind === "answer" && r.citations[0] ? r : null;
  }, [c.status, lastQuestion, state]);
  const assignee = state.agents.find((a) => a.id === c.assigneeId);

  const send = () => {
    if (!draft.trim()) return;
    sendAgentReply(c.id, draft.trim());
    setDraft("");
    toast(c.live ? "Reply sent. It appears in the widget right away." : "Reply sent.");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={onBack} className="rounded-md p-1 text-muted hover:bg-surface-2 lg:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-4" />
        </button>
        <Avatar name={c.customer.name} size={32} />
        <div className="min-w-0 flex-1 leading-tight">
          <h2 className="truncate font-semibold">{c.customer.name}</h2>
          <p className="truncate text-xs text-muted">
            {c.customer.email} · {c.customer.location}
          </p>
        </div>
        <StatusBadge c={c} />
        {c.status !== "resolved" && (
          <Button
            size="sm"
            onClick={() => {
              resolveConversation(c.id);
              toast("Conversation resolved.");
            }}
          >
            <Check /> Resolve
          </Button>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-4 py-2 text-xs">
        <div className="flex gap-1.5">
          <dt className="text-faint">Started</dt>
          <dd className="text-muted">{formatDateTime(c.startedAt)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-faint">Topic</dt>
          <dd className="text-muted">{c.topic ? CATEGORIES[c.topic].label : "Not in the help center"}</dd>
        </div>
        {c.handoffAt && (
          <div className="flex gap-1.5">
            <dt className="text-faint">Handed off</dt>
            <dd className="text-muted">{formatTime(c.handoffAt)}</dd>
          </div>
        )}
        <div className="flex gap-1.5">
          <dt className="text-faint">Assignee</dt>
          <dd className="text-muted">{assignee?.name ?? "Unassigned"}</dd>
        </div>
      </dl>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-label="Transcript">
        {c.messages.map((m) => (
          <Bubble key={m.id} m={m} state={state} threshold={state.settings.threshold} />
        ))}
      </div>

      {c.status !== "resolved" && (
        <div className="border-t border-border p-3">
          {suggestion && !draft && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  Suggested from <span className="text-text">{suggestion.citations[0].title}</span> · {pct(suggestion.confidence)} match
                </p>
                <p className="mt-0.5 line-clamp-2">{suggestion.text.replace(/\n- /g, " · ").replace(/^- /, "")}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDraft(suggestion.text.replace(/\n- /g, "\n• ").replace(/^- /, "• "))}>
                Use
              </Button>
            </div>
          )}
          <div className="rounded-lg border border-border bg-surface transition-colors focus-within:border-accent">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={3}
              aria-label="Reply"
              placeholder={`Reply to ${c.customer.name.split(" ")[0]}…`}
              className="block w-full resize-none bg-transparent px-3 py-2 text-[13px] placeholder:text-faint focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <span className="hidden pl-1 text-[11px] text-faint sm:inline">⌘ Enter to send</span>
              <Button variant="primary" size="sm" onClick={send} disabled={!draft.trim()} className="ml-auto">
                <CornerDownLeft /> Send reply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Inbox() {
  const state = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>((params.get("view") as View) || "all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const selectedId = params.get("c");

  const list = useMemo(() => {
    if (!state) return [];
    const needle = q.trim().toLowerCase();
    return state.conversations
      .filter((c) => inView(c, view))
      .filter((c) => !needle || c.customer.name.toLowerCase().includes(needle) || c.messages.some((m) => m.text.toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.status === "needs-human") - Number(a.status === "needs-human") || b.updatedAt.localeCompare(a.updatedAt));
  }, [state, view, q]);

  if (!state) return <Spinner />;
  // On wide screens the newest conversation in the view opens by default.
  const selected = state.conversations.find((c) => c.id === selectedId) ?? (!selectedId && window.matchMedia("(min-width: 1024px)").matches ? list[0] : undefined);
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, state.conversations.filter((c) => inView(c, v.key)).length]));
  const select = (id: string | null) => router.replace(id ? `/admin/inbox/?c=${id}${view !== "all" ? `&view=${view}` : ""}` : `/admin/inbox/${view !== "all" ? `?view=${view}` : ""}`, { scroll: false });

  return (
    <>
      <PageHeader title="Inbox" description="Every chat from the widget. The assistant answers first; handoffs wait here for the team." />
      <Card className="flex h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden">
        <div className={cx("flex w-full min-w-0 flex-col border-border lg:w-[340px] lg:shrink-0 lg:border-r", selected && "max-lg:hidden")}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2.5 focus-within:border-accent">
              <Search className="size-3.5 text-faint" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" placeholder="Search name or message" className="min-w-0 flex-1 bg-transparent placeholder:text-faint focus:outline-none" />
            </div>
            <div role="tablist" aria-label="Filter conversations" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={view === v.key}
                  onClick={() => {
                    setView(v.key);
                    setLimit(40);
                  }}
                  className={cx("h-6 shrink-0 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors", view === v.key ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
                >
                  {v.label} <span className="text-faint tabular-nums">{counts[v.key]}</span>
                </button>
              ))}
            </div>
          </div>
          {list.length === 0 ? (
            <EmptyState icon={InboxIcon} title="No conversations" text={q ? "Nothing matches this search." : "Nothing in this view right now."} />
          ) : (
            <ul className="flex-1 divide-y divide-border overflow-y-auto" aria-label="Conversations">
              {list.slice(0, limit).map((c) => (
                <ListItem key={c.id} c={c} active={c.id === selected?.id} onSelect={() => select(c.id)} />
              ))}
              {list.length > limit && (
                <li className="p-3 text-center">
                  <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 40)}>
                    Show more ({list.length - limit})
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>
        <div className={cx("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden lg:flex")}>
          {selected ? <Detail key={selected.id} c={selected} state={state} onBack={() => select(null)} /> : <EmptyState icon={InboxIcon} title="Select a conversation" text="Pick a chat on the left to read the transcript, see the assistant's confidence and sources, and reply." />}
        </div>
      </Card>
    </>
  );
}
