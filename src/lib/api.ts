"use client";

import { ME } from "./seed";
import { engineFor, getState, setVisitorConversationId, update, visitorConversationId } from "./store";
import type { Article, Conversation, Customer, DemoState, Message, Settings, SynonymGroup } from "./types";

/** Mock backend: every call changes the browser-side state in ./store. */

export const VISITOR: Customer = { name: "Website visitor", email: "visitor@mail.example", location: "This browser" };

export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

const find = (s: DemoState, id: string) => s.conversations.find((c) => c.id === id);

/** Moves a conversation to the top of the inbox. */
function touch(s: DemoState, c: Conversation) {
  c.updatedAt = nowIso();
  s.conversations = [c, ...s.conversations.filter((x) => x.id !== c.id)];
}

/** The widget's conversation in this browser, if it still exists. */
export function visitorConversation(state: DemoState): Conversation | undefined {
  const id = visitorConversationId();
  return id ? find(state, id) : undefined;
}

/** Stores a message from the website visitor and returns the conversation id. */
export function addCustomerMessage(text: string): string {
  let id = visitorConversation(getState())?.id;
  update((s) => {
    let c = id ? find(s, id) : undefined;
    if (!c) {
      id = uid("c");
      c = { id, customer: VISITOR, status: "open", startedAt: nowIso(), updatedAt: nowIso(), live: true, messages: [] };
      s.conversations.unshift(c);
    }
    if (c.status === "resolved") {
      c.status = "open";
      delete c.resolvedBy;
    }
    c.messages.push({ id: uid("m"), role: "customer", text, at: nowIso() });
    touch(s, c);
  });
  setVisitorConversationId(id!);
  return id!;
}

/** True when the conversation waits for the assistant, i.e. a person hasn't taken it over. */
export const assistantActive = (c: Conversation) => c.status === "open";

/** Lets the assistant answer the latest customer message. */
export function assistantRespond(conversationId: string): Message | undefined {
  const state = getState();
  const conv = find(state, conversationId);
  const last = conv?.messages[conv.messages.length - 1];
  if (!conv || !last || last.role !== "customer" || !assistantActive(conv)) return undefined;
  const engine = engineFor(state);
  const r = engine.answer(last.text, { threshold: state.settings.threshold, orders: state.orders });
  const message: Message = {
    id: uid("m"),
    role: "assistant",
    text: r.handoff ? state.settings.handoffMessage : r.text,
    at: nowIso(),
    answer: { kind: r.kind, confidence: r.confidence, citations: r.citations, matched: r.matched },
    order: r.order,
  };
  update((s) => {
    const c = find(s, conversationId)!;
    c.messages.push(message);
    if (!c.topic && r.citations[0] && !r.handoff) c.topic = s.articles.find((a) => a.id === r.citations[0].articleId)?.category;
    if (r.handoff) {
      c.status = "needs-human";
      c.handoffAt = nowIso();
    }
    touch(s, c);
  });
  return message;
}

export function requestHuman(conversationId: string) {
  update((s) => {
    const c = find(s, conversationId);
    if (!c || c.status !== "open") return;
    c.messages.push({ id: uid("m"), role: "assistant", text: s.settings.handoffMessage, at: nowIso(), answer: { kind: "handoff", confidence: 1, citations: [], matched: [] } });
    c.status = "needs-human";
    c.handoffAt = nowIso();
    touch(s, c);
  });
}

export function sendAgentReply(conversationId: string, text: string) {
  update((s) => {
    const c = find(s, conversationId);
    if (!c) return;
    c.messages.push({ id: uid("m"), role: "agent", agentId: ME.id, text, at: nowIso() });
    c.status = "agent";
    c.assigneeId = ME.id;
    c.handoffAt ??= nowIso();
    delete c.resolvedBy;
    touch(s, c);
  });
}

export function resolveConversation(conversationId: string) {
  update((s) => {
    const c = find(s, conversationId);
    if (!c) return;
    c.status = "resolved";
    c.resolvedBy = c.messages.some((m) => m.role === "agent") ? "agent" : "ai";
    c.updatedAt = nowIso();
  });
}

export function setFeedback(conversationId: string, messageId: string, value: "up" | "down" | undefined) {
  update((s) => {
    const m = find(s, conversationId)?.messages.find((x) => x.id === messageId);
    if (!m) return;
    if (value) m.feedback = value;
    else delete m.feedback;
  });
}

/** Starts a fresh chat in the widget; the old one stays in the inbox. */
export function newVisitorConversation() {
  setVisitorConversationId(null);
  update(() => {});
}

export function saveArticle(article: Article) {
  update((s) => {
    const next = { ...article, updatedAt: nowIso() };
    const i = s.articles.findIndex((a) => a.id === article.id);
    if (i >= 0) s.articles[i] = next;
    else s.articles.unshift(next);
  });
}

export function deleteArticle(id: string) {
  update((s) => {
    s.articles = s.articles.filter((a) => a.id !== id);
  });
}

export function saveSynonyms(groups: SynonymGroup[]) {
  update((s) => {
    s.synonyms = groups.filter((g) => g.terms.length >= 2);
  });
}

export function updateSettings(patch: Partial<Settings>) {
  update((s) => {
    s.settings = { ...s.settings, ...patch };
  });
}

/** URL-safe id from a title, unique among existing articles. */
export function slugFor(title: string, taken: string[]): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "article";
  let slug = base;
  for (let i = 2; taken.includes(slug); i++) slug = `${base}-${i}`;
  return slug;
}
