"use client";

import { TriangleAlert } from "lucide-react";
import { resetDemo, useSaved } from "@/lib/store";

/** Shown when the browser refuses to save (storage full or blocked), so changes aren't lost silently. */
export function StorageNotice() {
  const saved = useSaved();
  if (saved) return null;
  return (
    <div role="alert" className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-text sm:px-6">
        <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="min-w-0 flex-1">This browser can&apos;t save the demo right now (storage is full or blocked). Your latest changes will be lost when you close the tab.</span>
        <button type="button" onClick={resetDemo} className="shrink-0 font-medium underline hover:text-accent">
          Reset the demo to free space
        </button>
      </div>
    </div>
  );
}
