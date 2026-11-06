"use client";

import { ArrowUpRight, BookOpen, ChevronRight, Code2, FileText, FlaskConical, Inbox, Languages, LayoutDashboard, Menu, MessageSquare, Moon, RotateCcw, Search, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ME } from "@/lib/seed";
import { resetDemo, useStore } from "@/lib/store";
import type { DemoState } from "@/lib/types";
import { RelayMark } from "./brand";
import { ThemeToggle, toggleTheme } from "./theme-toggle";
import { Palette, usePaletteShortcut, type Command } from "./palette";
import { LangToggle, useLang } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/kb";
import { useToast } from "./toast";
import { Avatar, Button, Modal, Spinner, cx } from "./ui";
import { DemoGuide } from "./demo-guide";
import { StorageNotice } from "./storage-notice";
import { useT } from "@/lib/i18n";

export const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { href: "/admin/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/admin/playground", label: "Answer playground", icon: FlaskConical },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function Sidebar({ state, path, onNavigate }: { state: DemoState; path: string; onNavigate?: () => void }) {
  const t = useT();
  const waiting = state.conversations.filter((c) => c.status === "needs-human").length;
  return (
    <nav aria-label={t("Main")} className="flex flex-1 flex-col gap-px overflow-y-auto px-2 py-2">
      {NAV.map((n) => {
        const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={`${n.href}/`}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx("flex h-7 items-center gap-2.5 rounded-md px-2 font-medium transition-colors duration-100", active ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text")}
          >
            <n.icon className={cx("size-4", active ? "text-text" : "text-faint")} aria-hidden />
            {t(n.label)}
            {n.href === "/admin/inbox" && waiting > 0 && (
              <span className="ml-auto rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent tabular-nums" aria-label={t("{n} waiting for a person", { n: waiting })}>
                {waiting}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-auto pt-4">
        <Link href="/" className="flex h-7 items-center gap-2.5 rounded-md px-2 text-muted hover:bg-surface-2 hover:text-text">
          <ArrowUpRight className="size-4 text-faint" aria-hidden />
          {t("Help center and widget")}
        </Link>
      </div>
    </nav>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useLang();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  usePaletteShortcut(openPalette);
  const state = useStore();
  const path = (usePathname() || "/admin").replace(/\/$/, "") || "/admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast } = useToast();

  if (!state) return <Spinner />;
  const navItem = [...NAV].reverse().find((n) => (n.href === "/admin" ? path === "/admin" : path.startsWith(n.href)));

  const STATUS_HINT: Record<string, string> = { "needs-human": "Needs a person", agent: "With the team", open: "With the team", resolved: "Resolved" };
  const go = t("Go to");
  const act = t("Actions");
  const commands: Command[] = [
    ...NAV.map((n) => ({ id: `nav:${n.href}`, label: t(n.label), group: go, icon: n.icon, run: () => router.push(`${n.href}/`) })),
    { id: "nav:help", label: t("Help center and widget"), group: go, icon: ArrowUpRight, run: () => router.push("/") },
    { id: "theme", label: t("Switch light or dark theme"), group: act, icon: Moon, run: toggleTheme },
    { id: "lang", label: lang === "tr" ? "Switch to English" : "Türkçeye geç", group: act, icon: Languages, run: () => setLang(lang === "tr" ? "en" : "tr") },
    { id: "reset", label: t("Reset demo data"), group: act, icon: RotateCcw, run: () => setConfirmReset(true) },
    { id: "source", label: t("Source code on GitHub"), group: act, icon: Code2, run: () => window.open("https://github.com/ozenyunus35/ai-support-assistant", "_blank", "noopener") },
    ...state.articles.map((a) => ({ id: `a:${a.id}`, label: a.title, group: t("Articles"), icon: FileText, hint: t(CATEGORIES[a.category].label), run: () => router.push(`/admin/knowledge/?a=${a.id}`) })),
    ...[...state.conversations]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => ({
        id: `c:${c.id}`,
        label: c.customer.name,
        group: t("Conversations"),
        icon: MessageSquare,
        hint: t(STATUS_HINT[c.status] ?? "Resolved"),
        keywords: c.messages
          .filter((m) => m.role === "customer")
          .map((m) => m.text)
          .join(" ")
          .slice(0, 400),
        run: () => router.push(`/admin/inbox/?c=${c.id}`),
      })),
  ];

  const workspace = (
    <div className="flex h-12 items-center gap-2 px-4">
      <RelayMark />
      <p className="truncate text-[13px] font-semibold">{t("Relay")}</p>
      <span className="truncate text-muted">{t("· Northfold")}</span>
    </div>
  );
  const userCard = (
    <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
      <Avatar name={ME.name} size={26} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-medium">{ME.name}</p>
        <p className="truncate text-xs text-muted">{ME.title}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-bg lg:flex">
        {workspace}
        <Sidebar state={state} path={path} />
        {userCard}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("Navigation menu")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85%] animate-drawer flex-col border-r border-border bg-bg">
            <div className="flex items-center justify-between pr-2">
              {workspace}
              <button onClick={() => setMenuOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label={t("Close menu")}>
                <X className="size-4" />
              </button>
            </div>
            <Sidebar state={state} path={path} onNavigate={() => setMenuOpen(false)} />
            {userCard}
          </div>
        </div>
      )}

      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur sm:px-5">
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label={t("Open menu")}>
            <Menu className="size-4" />
          </button>
          <nav aria-label={t("Breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-muted">
            <span className="hidden truncate sm:inline">{t("Northfold")}</span>
            <ChevronRight className="hidden size-3.5 text-faint sm:block" aria-hidden />
            <span className="truncate font-medium text-text">{t(navItem?.label ?? "Overview")}</span>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={openPalette} className="mr-1 inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-muted hover:bg-surface-2 hover:text-text lg:min-w-48" aria-label={t("Search and commands")} aria-keyshortcuts="Meta+K Control+K">
              <Search className="size-3.5" aria-hidden />
              <span className="hidden flex-1 text-left lg:inline">{t("Search chats, articles…")}</span>
              <kbd className="hidden rounded border border-border px-1 text-[10.5px] text-faint lg:inline">⌘K</kbd>
            </button>
            <span className="mr-1 hidden items-center gap-2 text-xs text-muted md:flex">
              {t("Demo · synthetic data")}
              <DemoGuide className="text-text" />
              <button onClick={() => setConfirmReset(true)} className="rounded-md border border-border px-2 py-0.5 text-text hover:bg-surface-2">
                {t("Reset demo data")}
              </button>
            </span>
            <button onClick={() => setConfirmReset(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text md:hidden" aria-label={t("Reset demo data")}>
              <RotateCcw className="size-4" />
            </button>
            <LangToggle />
            <ThemeToggle />
          </div>
        </header>
        <StorageNotice />
        <main id="main" className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("Reset demo data?")}
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>{t("Cancel")}</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
                toast(t("Demo data was reset."));
              }}
            >
              <RotateCcw /> {t("Reset")}
            </Button>
          </>
        }
      >
        <p className="text-muted">{t("Your chats, replies, article edits and settings are removed and the original synthetic data is restored.")}</p>
      </Modal>
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
