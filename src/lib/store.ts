"use client";

import { useSyncExternalStore } from "react";
import { createEngine, type Engine } from "./engine";
import { createSeed, STATE_VERSION } from "./seed";
import type { Article, DemoState, SynonymGroup } from "./types";

/**
 * Browser-side persistence for the demo. State is one JSON document in
 * localStorage, shared across tabs through the `storage` event, so a reply sent
 * from the admin inbox shows up in the chat widget open in another tab.
 */

const STATE_KEY = "relay:state";
const VISITOR_KEY = "relay:visitor";

let snap: DemoState | null = null;
const listeners = new Set<() => void>();

function read(): DemoState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    // Corrupt or blocked storage: fall through to a fresh seed.
  }
  const fresh = createSeed();
  persist(fresh);
  return fresh;
}

function persist(state: DemoState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the demo keeps working in memory.
  }
}

const emit = () => listeners.forEach((l) => l());

export function getState(): DemoState {
  if (!snap) snap = read();
  return snap;
}

/** Applies a change to a copy of the state, saves it and notifies subscribers. */
export function update(fn: (draft: DemoState) => void) {
  const next = structuredClone(getState());
  fn(next);
  snap = next;
  persist(next);
  emit();
}

export function resetDemo() {
  try {
    localStorage.removeItem(VISITOR_KEY);
  } catch {}
  snap = createSeed();
  persist(snap);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STATE_KEY || e.key === VISITOR_KEY || e.key === null) {
      snap = read();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The demo state, or null while rendering on the server (static export). */
export function useStore(): DemoState | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}

let cached: { articles: Article[]; synonyms: SynonymGroup[]; key: string; engine: Engine } | null = null;

/** The answer engine for the current articles and synonyms, rebuilt only when their content changes. */
export function engineFor(state: DemoState): Engine {
  if (cached && cached.articles === state.articles && cached.synonyms === state.synonyms) return cached.engine;
  // Every update clones the state, so compare by content before rebuilding the index.
  const key = JSON.stringify([state.articles, state.synonyms]);
  if (!cached || cached.key !== key) cached = { articles: state.articles, synonyms: state.synonyms, key, engine: createEngine(state.articles, state.synonyms) };
  else Object.assign(cached, { articles: state.articles, synonyms: state.synonyms });
  return cached.engine;
}

export function visitorConversationId(): string | null {
  try {
    return localStorage.getItem(VISITOR_KEY);
  } catch {
    return null;
  }
}

export function setVisitorConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(VISITOR_KEY, id);
    else localStorage.removeItem(VISITOR_KEY);
  } catch {}
}
