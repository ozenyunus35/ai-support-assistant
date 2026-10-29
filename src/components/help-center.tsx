"use client";

import { ArrowRight, ArrowUpRight, ChevronRight, CreditCard, MessageCircle, Package, Search, ShieldCheck, Shirt, Store, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { sections, units } from "@/lib/engine";
import { formatDate } from "@/lib/format";
import { CATEGORIES } from "@/lib/kb";
import { engineFor, useStore } from "@/lib/store";
import type { Article, Category, DemoState } from "@/lib/types";
import { NorthfoldLogo } from "./brand";
import { ChatWidget, articleHref, openChat, sectionSlug } from "./chat-widget";
import { RichText } from "./rich-text";
import { ThemeToggle } from "./theme-toggle";
import { Spinner, cx } from "./ui";

const ICONS: Record<Category, React.ComponentType<{ className?: string }>> = {
  orders: Package,
  returns: Undo2,
  products: Shirt,
  warranty: ShieldCheck,
  account: CreditCard,
  club: Store,
};

const POPULAR = ["refund-status", "international-shipping", "start-return", "lifetime-warranty", "apparel-sizing", "track-order"];

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const useHash = () => useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");

function DemoBar() {
  return (
    <div className="border-b border-border bg-surface-2">
      <div className="mx-auto flex h-9 max-w-6xl items-center gap-3 px-4 text-xs text-muted sm:px-6">
        <span className="truncate">
          <span className="font-medium text-text">Relay demo.</span> Northfold is a fictional store. <span className="hidden md:inline">The chat assistant answers from this help center, right in your browser.</span>
        </span>
        <Link href="/admin/" className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-text hover:text-accent">
          Open admin console <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#" aria-label="Northfold help center home">
          <NorthfoldLogo />
        </a>
        <nav aria-label="Site" className="hidden items-center gap-5 text-muted md:flex">
          {["Tents", "Packs", "Apparel", "Sleep", "Renew"].map((n) => (
            <span key={n} className="cursor-default">
              {n}
            </span>
          ))}
          <a href="#" className="font-medium text-text">
            Help
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => openChat()} className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-muted hover:bg-surface-2 hover:text-text sm:inline-flex">
            <MessageCircle className="size-4" aria-hidden /> Chat with us
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Words of the snippet that matched the query, bolded. */
function Highlight({ text, terms, state }: { text: string; terms: string[]; state: DemoState }) {
  const engine = engineFor(state);
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((p, i) => {
        const t = engine.analyse(p, false).terms[0];
        return t && terms.includes(t) ? (
          <mark key={i} className="bg-transparent font-medium text-text">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}

function SearchBox({ state }: { state: DemoState }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const engine = engineFor(state);
  const hits = useMemo(() => (q.trim().length > 1 ? engine.searchArticles(q, 6) : []), [engine, q]);
  const terms = useMemo(() => engine.analyse(q, true).terms, [engine, q]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const snippet = (text: string) => {
    const us = units(text);
    const best = us.find((u) => engine.analyse(u.text, false).terms.some((t) => terms.includes(t))) ?? us[0];
    return best?.text ?? "";
  };

  const go = (i: number) => {
    const h = hits[i];
    if (!h) return;
    window.location.hash = articleHref(h.articleId, h.heading);
    setQ("");
    ref.current?.blur();
  };

  const open = focused && q.trim().length > 1;
  return (
    <div className="relative">
      <div className="flex h-12 items-center gap-3 rounded-lg border border-border bg-surface px-4 shadow-card transition-colors focus-within:border-accent">
        <Search className="size-4 shrink-0 text-faint" aria-hidden />
        <input
          ref={ref}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") go(active);
            else if (e.key === "Escape") setQ("");
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="help-results"
          aria-label="Search the help center"
          placeholder="Search for refunds, shipping, sizing…"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-faint focus:outline-none"
        />
        <kbd className="hidden rounded border border-border px-1.5 font-sans text-[11px] text-faint sm:block">/</kbd>
      </div>
      {open && (
        <div id="help-results" role="listbox" aria-label="Search results" className="absolute inset-x-0 top-full z-30 mt-1.5 animate-pop overflow-hidden rounded-lg bg-surface shadow-pop">
          {hits.length === 0 ? (
            <div className="px-4 py-5 text-muted">
              <p>No articles match “{q}”.</p>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => openChat(q)} className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline">
                Ask the assistant instead <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <ul className="py-1">
              {hits.map((h, i) => (
                <li key={h.articleId} role="option" aria-selected={i === active}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(i)}
                    className={cx("block w-full px-4 py-2.5 text-left", i === active && "bg-surface-2")}
                  >
                    <p className="font-medium">
                      {h.title}
                      {h.heading && <span className="font-normal text-muted"> · {h.heading}</span>}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-muted">
                      <Highlight text={snippet(h.text)} terms={terms} state={state} />
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Home({ state }: { state: DemoState }) {
  const byCat = (c: Category) => state.articles.filter((a) => a.category === c);
  const popular = POPULAR.map((id) => state.articles.find((a) => a.id === id)).filter((a): a is Article => !!a);
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20 sm:pb-16">
          <p className="text-xs font-medium text-muted">Northfold help center</p>
          <h1 className="mt-3 max-w-xl text-[34px] leading-[1.1] font-semibold tracking-[-0.025em] sm:text-[44px]">How can we help?</h1>
          <p className="mt-3 max-w-lg text-[14px] text-muted">Search {state.articles.length} articles, or ask the assistant in the corner. It answers from these articles and brings in a person when it isn&apos;t sure.</p>
          <div className="mt-8 max-w-2xl">
            <SearchBox state={state} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
              <span className="text-faint">Popular:</span>
              {popular.slice(0, 4).map((a) => (
                <a key={a.id} href={articleHref(a.id, null)} className="hover:text-text">
                  {a.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6" aria-labelledby="topics">
        <h2 id="topics" className="text-[15px] font-semibold">
          Browse by topic
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(CATEGORIES) as Category[]).map((c) => {
            const Icon = ICONS[c];
            const list = byCat(c);
            return (
              <div key={c} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-muted">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-medium">{CATEGORIES[c].label}</h3>
                    <p className="text-xs text-muted">{CATEGORIES[c].description}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-0.5 border-t border-border pt-2.5">
                  {list.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      <a href={articleHref(a.id, null)} className="group flex items-center justify-between gap-2 rounded-md px-1.5 py-1 -mx-1.5 text-muted hover:bg-surface-2 hover:text-text">
                        <span className="truncate">{a.title}</span>
                        <ChevronRight className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
                {list.length > 4 && <p className="mt-1.5 text-xs text-faint">+{list.length - 4} more</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-2 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Still need help?</h2>
            <p className="mt-0.5 text-muted">The assistant answers in seconds and shows where each answer comes from. A teammate joins the same chat when needed.</p>
          </div>
          <button onClick={() => openChat()} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 font-medium text-accent-fg hover:bg-accent/90">
            <MessageCircle className="size-4" aria-hidden /> Start a chat
          </button>
        </div>
      </section>
    </>
  );
}

function ArticleView({ article, section, state }: { article: Article; section: string; state: DemoState }) {
  const secs = sections(article.body);
  const related = state.articles.filter((a) => a.category === article.category && a.id !== article.id);
  const [vote, setVote] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    const el = section ? document.getElementById(`s-${section}`) : null;
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      el.classList.remove("cited");
      void el.offsetWidth;
      el.classList.add("cited");
    } else window.scrollTo({ top: 0 });
  }, [article.id, section]);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_260px]">
      <article className="min-w-0 max-w-2xl animate-enter">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
          <a href="#" className="hover:text-text">
            Help center
          </a>
          <ChevronRight className="size-3 text-faint" aria-hidden />
          <span>{CATEGORIES[article.category].label}</span>
        </nav>
        <h1 className="mt-4 text-[28px] leading-tight font-semibold tracking-[-0.02em]">{article.title}</h1>
        <p className="mt-2 text-xs text-muted">Updated {formatDate(article.updatedAt)}</p>
        <div className="mt-8 space-y-2 text-[14px] leading-6">
          {secs.map((s, i) => (
            <section key={i} id={s.heading ? `s-${sectionSlug(s.heading)}` : undefined} className="-mx-3 scroll-mt-6 rounded-lg px-3 py-2">
              {s.heading && <h2 className="mb-2 text-[15px] font-semibold">{s.heading}</h2>}
              <RichText text={s.text} />
            </section>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-5 text-muted">
          {vote ? (
            <p role="status">Thanks for the feedback.</p>
          ) : (
            <>
              <span>Was this article helpful?</span>
              <button onClick={() => setVote("yes")} className="rounded-md border border-border px-2.5 py-1 text-text hover:bg-surface-2">
                Yes
              </button>
              <button onClick={() => setVote("no")} className="rounded-md border border-border px-2.5 py-1 text-text hover:bg-surface-2">
                No
              </button>
            </>
          )}
        </div>
      </article>
      <aside className="space-y-6 lg:pt-12">
        <div>
          <h2 className="text-xs font-medium text-muted">More in {CATEGORIES[article.category].label}</h2>
          <ul className="mt-2 space-y-1">
            {related.map((a) => (
              <li key={a.id}>
                <a href={articleHref(a.id, null)} className="text-text hover:text-accent">
                  {a.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="font-medium">Questions about this?</p>
          <p className="mt-1 text-muted">Ask the assistant. It cites the exact section it used.</p>
          <button onClick={() => openChat()} className="mt-3 inline-flex items-center gap-1 font-medium text-accent hover:underline">
            Ask a question <ArrowUpRight className="size-3.5" aria-hidden />
          </button>
        </div>
      </aside>
    </div>
  );
}

export function HelpCenter() {
  const state = useStore();
  const hash = useHash();
  const [, id, section = ""] = /^#\/([^/]+)\/?(.*)$/.exec(hash) ?? [];
  const article = id ? state?.articles.find((a) => a.id === id) : undefined;

  return (
    <div className="min-h-screen">
      <DemoBar />
      <SiteHeader />
      <main id="main">{!state ? <Spinner /> : article ? <ArticleView article={article} section={section} state={state} /> : <Home state={state} />}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-faint sm:px-6">
          <span>© 2026 Northfold, a fictional company for this demo. All data is synthetic.</span>
          <span>Help center + assistant: Relay</span>
        </div>
      </footer>
      <ChatWidget />
    </div>
  );
}
