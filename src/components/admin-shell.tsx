"use client";

import { ArrowUpRight, BookOpen, ChevronRight, FlaskConical, Inbox, LayoutDashboard, Menu, RotateCcw, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ME } from "@/lib/seed";
import { resetDemo, useStore } from "@/lib/store";
import type { DemoState } from "@/lib/types";
import { RelayMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { useToast } from "./toast";
import { Avatar, Button, Modal, Spinner, cx } from "./ui";

export const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { href: "/admin/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/admin/playground", label: "Answer playground", icon: FlaskConical },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function Sidebar({ state, path, onNavigate }: { state: DemoState; path: string; onNavigate?: () => void }) {
  const waiting = state.conversations.filter((c) => c.status === "needs-human").length;
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-px overflow-y-auto px-2 py-2">
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
            {n.label}
            {n.href === "/admin/inbox" && waiting > 0 && (
              <span className="ml-auto rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent tabular-nums" aria-label={`${waiting} waiting for a person`}>
                {waiting}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-auto pt-4">
        <Link href="/" className="flex h-7 items-center gap-2.5 rounded-md px-2 text-muted hover:bg-surface-2 hover:text-text">
          <ArrowUpRight className="size-4 text-faint" aria-hidden />
          Help center and widget
        </Link>
      </div>
    </nav>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const state = useStore();
  const path = (usePathname() || "/admin").replace(/\/$/, "") || "/admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast } = useToast();

  if (!state) return <Spinner />;
  const navItem = [...NAV].reverse().find((n) => (n.href === "/admin" ? path === "/admin" : path.startsWith(n.href)));

  const workspace = (
    <div className="flex h-12 items-center gap-2 px-4">
      <RelayMark />
      <p className="truncate text-[13px] font-semibold">Relay</p>
      <span className="truncate text-muted">· Northfold</span>
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
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85%] animate-drawer flex-col border-r border-border bg-bg">
            <div className="flex items-center justify-between pr-2">
              {workspace}
              <button onClick={() => setMenuOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Close menu">
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
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-4" />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-muted">
            <span className="hidden truncate sm:inline">Northfold</span>
            <ChevronRight className="hidden size-3.5 text-faint sm:block" aria-hidden />
            <span className="truncate font-medium text-text">{navItem?.label ?? "Overview"}</span>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 hidden items-center gap-2 text-xs text-muted md:flex">
              Demo · synthetic data
              <button onClick={() => setConfirmReset(true)} className="rounded-md border border-border px-2 py-0.5 text-text hover:bg-surface-2">
                Reset demo data
              </button>
            </span>
            <button onClick={() => setConfirmReset(true)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text md:hidden" aria-label="Reset demo data">
              <RotateCcw className="size-4" />
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
                toast("Demo data was reset.");
              }}
            >
              <RotateCcw /> Reset
            </Button>
          </>
        }
      >
        <p className="text-muted">Your chats, replies, article edits and settings are removed and the original synthetic data is restored.</p>
      </Modal>
    </div>
  );
}
