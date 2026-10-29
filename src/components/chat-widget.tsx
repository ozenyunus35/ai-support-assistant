"use client";

import { ArrowUp, ArrowUpRight, ChevronDown, Clock, MessageCircle, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addCustomerMessage, assistantRespond, newVisitorConversation, requestHuman, setFeedback, visitorConversation } from "@/lib/api";
import { formatDate, formatTime, pct } from "@/lib/format";
import { getState, useStore } from "@/lib/store";
import type { Conversation, DemoState, Message, OrderCard } from "@/lib/types";
import { NorthfoldMark } from "./brand";
import { RichText } from "./rich-text";
import { Avatar, cx } from "./ui";

const OPEN_KEY = "relay:widget-open";
const DETAILS_KEY = "relay:details";

/** Opens the widget from anywhere on the page, optionally with a question. */
export const openChat = (question?: string) => window.dispatchEvent(new CustomEvent("relay:open", { detail: question }));

export const sectionSlug = (heading: string | null) => (heading ? heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "");
export const articleHref = (articleId: string, heading: string | null) => `#/${articleId}${heading ? `/${sectionSlug(heading)}` : ""}`;

const ORDER_STEPS: Array<{ key: OrderCard["status"]; label: string }> = [
  { key: "processing", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "out-for-delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];

function OrderStatus({ order }: { order: OrderCard }) {
  const at = ORDER_STEPS.findIndex((s) => s.key === order.status);
  const eta = new Date(order.eta).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="mt-2.5 rounded-lg border border-border bg-surface p-3" aria-label={`Order ${order.number}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">Order {order.number}</p>
        <p className="text-xs text-muted">Placed {formatDate(order.placedAt)}</p>
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Delivery progress">
        {ORDER_STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === at ? "step" : undefined}>
            <span className={cx("block h-1 rounded-full", i <= at ? "bg-accent" : "bg-surface-3")} />
            <span className={cx("mt-1.5 block text-[11px] leading-tight", i === at ? "font-medium text-text" : "text-faint")}>{s.label}</span>
          </li>
        ))}
      </ol>
      <ul className="mt-3 space-y-0.5 border-t border-border pt-2.5 text-muted">
        {order.items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {order.carrier} · {order.status === "delivered" ? `Delivered ${formatDate(order.eta)}` : order.status === "out-for-delivery" ? "Arrives today" : `Arrives ${eta}`}
      </p>
    </div>
  );
}

function Details({ message, threshold }: { message: Message; threshold: number }) {
  const a = message.answer;
  if (!a || !["answer", "handoff"].includes(a.kind) || (a.kind === "handoff" && a.confidence === 1)) return null;
  const below = a.confidence < threshold;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint" data-testid="answer-details">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className={cx("block h-full rounded-full", below ? "bg-warning" : "bg-accent")} style={{ width: pct(a.confidence) }} />
        </span>
        Confidence {pct(a.confidence)}
        {below && ` · under ${pct(threshold)}`}
      </span>
      {a.matched.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {[...new Set(a.matched)].slice(0, 5).map((t) => (
            <span key={t} className="rounded border border-border px-1 font-mono text-[10px] text-muted">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <NorthfoldMark size={24} className="mt-0.5" />
      <div className="min-w-0 max-w-[86%] rounded-2xl rounded-tl-md bg-surface-2 px-3 py-2">{children}</div>
    </div>
  );
}

function AssistantMessage({
  message,
  conversation,
  state,
  shown,
  latest,
  details,
  onCite,
}: {
  message: Message;
  conversation: Conversation;
  state: DemoState;
  shown: number | null;
  latest: boolean;
  details: boolean;
  onCite: () => void;
}) {
  const a = message.answer;
  const streaming = shown !== null;
  const text = streaming ? message.text.split(/(\s+)/).slice(0, shown).join("") : message.text;
  const rateable = a?.kind === "answer" || a?.kind === "order";
  return (
    <div className="animate-rise">
      <AssistantBubble>
        <RichText text={text} dense />
        {!streaming && message.order && <OrderStatus order={message.order} />}
        {!streaming && a && a.citations.length > 0 && a.kind !== "handoff" && (
          <div className="mt-2.5 space-y-1">
            <p className="text-[11px] font-medium text-faint">{a.citations.length > 1 ? "Sources" : "Source"}</p>
            {a.citations.map((c) => (
              <a
                key={c.articleId}
                href={articleHref(c.articleId, c.heading)}
                onClick={onCite}
                className="group flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-xs transition-colors hover:border-border-strong"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-text">{c.title}</span>
                  {c.heading && <span className="text-muted"> · {c.heading}</span>}
                </span>
                <ArrowUpRight className="size-3.5 shrink-0 text-faint group-hover:text-text" aria-hidden />
              </a>
            ))}
          </div>
        )}
        {!streaming && details && <Details message={message} threshold={state.settings.threshold} />}
      </AssistantBubble>
      {!streaming && rateable && (
        <div className="mt-1 ml-8 flex flex-wrap items-center gap-1 text-xs text-faint">
          <span className="mr-0.5">Helpful?</span>
          {(["up", "down"] as const).map((v) => {
            const Icon = v === "up" ? ThumbsUp : ThumbsDown;
            const on = message.feedback === v;
            return (
              <button
                key={v}
                onClick={() => setFeedback(conversation.id, message.id, on ? undefined : v)}
                aria-pressed={on}
                aria-label={v === "up" ? "Helpful" : "Not helpful"}
                className={cx("rounded-md p-1 transition-colors hover:bg-surface-2 hover:text-text", on && "text-accent hover:text-accent")}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
          {latest && conversation.status === "open" && (
            <button onClick={() => requestHuman(conversation.id)} className="ml-1 rounded-md px-1.5 py-0.5 font-medium text-muted hover:bg-surface-2 hover:text-text">
              {message.feedback === "down" ? "Sorry about that. Talk to a person" : "Talk to a person"}
            </button>
          )}
        </div>
      )}
      {a?.kind === "handoff" && (
        <p className="my-3 flex items-center gap-2 text-[11px] text-faint">
          <span className="h-px flex-1 bg-border" />
          Handed to the Northfold team · {formatTime(message.at)}
          <span className="h-px flex-1 bg-border" />
        </p>
      )}
    </div>
  );
}

export function ChatWidget() {
  const state = useStore();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [stream, setStream] = useState<{ id: string; shown: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const conv = state ? visitorConversation(state) : undefined;

  const setOpenSaved = useCallback((v: boolean) => {
    setOpen(v);
    try {
      sessionStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {}
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    let savedDetails: string | null = null;
    try {
      saved = sessionStorage.getItem(OPEN_KEY);
      savedDetails = localStorage.getItem(DETAILS_KEY);
    } catch {}
    // Open on wide screens the first time, so the demo starts in the conversation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(saved ? saved === "1" : window.matchMedia("(min-width: 1024px)").matches);
    if (savedDetails) setDetails(savedDetails === "1");
  }, []);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || thinking) return;
      const id = addCustomerMessage(text);
      setDraft("");
      if (input.current) input.current.style.height = "auto";
      if (visitorConversation(getState())?.status !== "open") return;
      setThinking(true);
      window.setTimeout(() => {
        const m = assistantRespond(id);
        setThinking(false);
        if (m) setStream({ id: m.id, shown: 0 });
      }, 700 + Math.random() * 400);
    },
    [thinking],
  );

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpenSaved(true);
      const q = (e as CustomEvent<string | undefined>).detail;
      if (q) send(q);
      else window.setTimeout(() => input.current?.focus(), 50);
    };
    window.addEventListener("relay:open", onOpen);
    return () => window.removeEventListener("relay:open", onOpen);
  }, [send, setOpenSaved]);

  // Reveals a new answer a few words at a time.
  useEffect(() => {
    if (!stream || !conv) return;
    const total = conv.messages.find((m) => m.id === stream.id)?.text.split(/(\s+)/).length ?? 0;
    if (stream.shown >= total) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStream(null);
      return;
    }
    const t = window.setTimeout(() => setStream({ id: stream.id, shown: stream.shown + 4 }), 24);
    return () => window.clearTimeout(t);
  }, [stream, conv]);

  const count = conv?.messages.length ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: stream ? "auto" : "smooth" });
  }, [count, thinking, stream, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenSaved(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpenSaved]);

  if (!state) return null;
  const { settings } = state;
  const agent = conv?.assigneeId ? state.agents.find((a) => a.id === conv.assigneeId) : undefined;
  const lastAnswerId = [...(conv?.messages ?? [])].reverse().find((m) => m.role === "assistant")?.id;

  const toggleDetails = () => {
    setDetails((d) => {
      try {
        localStorage.setItem(DETAILS_KEY, d ? "0" : "1");
      } catch {}
      return !d;
    });
  };

  // Close the full-screen phone view so the cited article is visible.
  const onCite = () => {
    if (!window.matchMedia("(min-width: 640px)").matches) setOpenSaved(false);
  };

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Chat with Northfold support"
          className="fixed z-50 flex animate-rise flex-col overflow-hidden bg-surface max-sm:inset-0 sm:right-5 sm:bottom-20 sm:h-[min(660px,calc(100dvh-7rem))] sm:w-[390px] sm:rounded-xl sm:border sm:border-border sm:shadow-pop"
        >
          <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
            {agent ? <Avatar name={agent.name} size={28} /> : <NorthfoldMark size={28} />}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-semibold">{agent ? agent.name : settings.assistantName}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                <span className={cx("size-1.5 rounded-full", conv?.status === "needs-human" ? "bg-warning" : "bg-success")} aria-hidden />
                {conv?.status === "needs-human" ? "Waiting for a teammate" : agent ? `${agent.title} · Northfold team` : "AI assistant · answers from the help center"}
              </p>
            </div>
            {count > 0 && (
              <button onClick={() => newVisitorConversation()} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Start a new conversation" title="New conversation">
                <RotateCcw className="size-4" />
              </button>
            )}
            <button onClick={() => setOpenSaved(false)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close chat">
              <ChevronDown className="size-4" />
            </button>
          </header>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-4" aria-live="polite" aria-label="Conversation">
            <AssistantBubble>
              <p>{settings.greeting}</p>
            </AssistantBubble>
            {count === 0 && (
              <div className="ml-8 flex flex-wrap gap-1.5 pt-0.5">
                {settings.suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text transition-colors hover:border-border-strong hover:bg-surface-2">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {conv?.messages.map((m) =>
              m.role === "customer" ? (
                <div key={m.id} className="flex animate-rise justify-end">
                  <p className="max-w-[82%] rounded-2xl rounded-br-md bg-accent px-3 py-2 whitespace-pre-wrap text-accent-fg">{m.text}</p>
                </div>
              ) : m.role === "agent" ? (
                <div key={m.id} className="animate-rise">
                  <p className="mb-1 ml-8 text-[11px] text-faint">{state.agents.find((a) => a.id === m.agentId)?.name ?? "Northfold team"} · Northfold team</p>
                  <div className="flex items-start gap-2">
                    <Avatar name={state.agents.find((a) => a.id === m.agentId)?.name ?? "N T"} size={24} />
                    <p className="max-w-[86%] rounded-2xl rounded-tl-md border border-border bg-surface px-3 py-2 whitespace-pre-wrap">{m.text}</p>
                  </div>
                </div>
              ) : m.role === "assistant" ? (
                <AssistantMessage key={m.id} message={m} conversation={conv} state={state} shown={stream?.id === m.id ? stream.shown : null} latest={m.id === lastAnswerId} details={details} onCite={onCite} />
              ) : null,
            )}
            {conv?.status === "needs-human" && (
              <p className="flex items-center justify-center gap-1.5 py-1 text-xs text-muted" role="status">
                <Clock className="size-3.5" aria-hidden />
                {settings.replyTime}
              </p>
            )}
            {thinking && (
              <div className="flex items-center gap-2" role="status" aria-label="Searching the help center">
                <NorthfoldMark size={24} />
                <span className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-surface-2 px-3 py-2 text-xs text-muted">
                  <span className="flex gap-0.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="typing-dot size-1 rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                  Searching {state.articles.length} help articles
                </span>
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t border-border p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <div className="flex items-end gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5 transition-colors focus-within:border-accent">
              <textarea
                ref={input}
                value={draft}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value);
                  const t = e.target;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 112)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder={conv?.status === "needs-human" || conv?.status === "agent" ? "Reply to the Northfold team…" : "Ask a question…"}
                aria-label="Message"
                className="max-h-28 flex-1 resize-none bg-transparent py-0.5 text-[13px] leading-5 placeholder:text-faint focus:outline-none"
              />
              <button type="submit" disabled={!draft.trim() || thinking} className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg transition-opacity disabled:opacity-30" aria-label="Send message">
                <ArrowUp className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between px-0.5 text-[11px] text-faint">
              <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
                <input type="checkbox" checked={details} onChange={toggleDetails} className="size-3 accent-[var(--accent)]" />
                Show retrieval details
              </label>
              <span>Demo · powered by Relay</span>
            </div>
          </form>
        </section>
      )}

      <button
        onClick={() => setOpenSaved(!open)}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        className={cx("fixed right-5 bottom-5 z-50 grid size-12 place-items-center rounded-full bg-accent text-accent-fg shadow-pop transition-transform duration-200 hover:scale-[1.04] active:scale-95", open && "max-sm:hidden")}
      >
        {open ? <ChevronDown className="size-5" /> : <MessageCircle className="size-5" />}
      </button>
    </>
  );
}
