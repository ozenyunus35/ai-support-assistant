"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { updateSettings } from "@/lib/api";
import { pct } from "@/lib/format";
import { DEFAULT_SETTINGS } from "@/lib/seed";
import { handoffShareAt } from "@/lib/stats";
import { engineFor, useStore } from "@/lib/store";
import { useNow } from "@/lib/use-now";
import type { DemoState, Settings as SettingsType } from "@/lib/types";
import { useToast } from "../toast";
import { Button, Card, CardHeader, Field, PageHeader, Spinner, cx, inputClass } from "../ui";

const SNIPPET = `<script src="https://cdn.relay.example/widget.js"
  data-workspace="northfold"
  data-position="bottom-right" async></script>`;

function Form({ state }: { state: DemoState }) {
  const [s, setS] = useState<SettingsType>(state.settings);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const now = useNow();
  const set = <K extends keyof SettingsType>(k: K, v: SettingsType[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(state.settings);

  // Confidence the assistant had for every first question in the last 30 days, to preview the threshold.
  const confidences = useMemo(() => {
    const engine = engineFor(state);
    const from = now - 30 * 86_400_000;
    return state.conversations
      .filter((c) => Date.parse(c.startedAt) >= from)
      .map((c) => c.messages.find((m) => m.role === "customer")?.text ?? "")
      .filter(Boolean)
      .map((q) => engine.explain(q, { threshold: 0 }))
      .filter((x) => x.reply.kind === "answer")
      .map((x) => x.confidence);
  }, [state, now]);
  const share = handoffShareAt(confidences, s.threshold);

  return (
    <form
      className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]"
      onSubmit={(e) => {
        e.preventDefault();
        updateSettings({ ...s, suggestions: s.suggestions.map((x) => x.trim()).filter(Boolean) });
        toast("Settings saved. The widget uses them right away.");
      }}
    >
      <div className="space-y-3">
        <Card>
          <CardHeader title="Assistant" />
          <div className="space-y-4 p-4">
            <Field label="Name shown in the widget">{(id) => <input id={id} className={inputClass} value={s.assistantName} onChange={(e) => set("assistantName", e.target.value)} />}</Field>
            <Field label="Greeting">{(id) => <textarea id={id} rows={3} className={cx(inputClass, "h-auto py-2")} value={s.greeting} onChange={(e) => set("greeting", e.target.value)} />}</Field>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-muted">Suggested questions</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <input
                    key={i}
                    aria-label={`Suggested question ${i + 1}`}
                    className={inputClass}
                    value={s.suggestions[i] ?? ""}
                    onChange={(e) => {
                      const next = [...s.suggestions];
                      next[i] = e.target.value;
                      set("suggestions", next);
                    }}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        <Card>
          <CardHeader title="Handoff to a person" />
          <div className="space-y-4 p-4">
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="threshold" className="text-xs font-medium text-muted">
                  Confidence threshold
                </label>
                <span className="font-medium tabular-nums">{pct(s.threshold)}</span>
              </div>
              <input id="threshold" type="range" min={0.2} max={0.8} step={0.05} value={s.threshold} onChange={(e) => set("threshold", Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
              <p className="mt-1 text-muted" data-testid="threshold-impact">
                At {pct(s.threshold)}, <span className="font-medium text-text">{pct(share)}</span> of the answers the assistant gave in the last 30 days would have gone to a person instead.
              </p>
              <p className="mt-1 text-xs text-faint">Lower means more automated answers; higher means fewer wrong ones. Questions outside the help center are handed off at any setting.</p>
            </div>
            <Field label="Message when handing off">{(id) => <textarea id={id} rows={2} className={cx(inputClass, "h-auto py-2")} value={s.handoffMessage} onChange={(e) => set("handoffMessage", e.target.value)} />}</Field>
            <Field label="Reply time shown while waiting">{(id) => <input id={id} className={inputClass} value={s.replyTime} onChange={(e) => set("replyTime", e.target.value)} />}</Field>
          </div>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!dirty}>
            Save settings
          </Button>
          <Button type="button" variant="ghost" onClick={() => setS(DEFAULT_SETTINGS)}>
            Restore defaults
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader title="Install on a website" />
          <div className="p-4">
            <p className="text-muted">Paste before the closing body tag. In this demo the widget is already on the Northfold help center.</p>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[11px] leading-5 text-muted">{SNIPPET}</pre>
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={() => {
                navigator.clipboard?.writeText(SNIPPET).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy snippet"}
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="How answers are made" />
          <ul className="space-y-2 p-4 text-muted">
            <li>Retrieval runs in the browser: BM25 over {state.articles.length} articles, with synonyms and typo fixes.</li>
            <li>Answers quote the best section and always link the source.</li>
            <li>In production the same retrieval feeds an LLM, which writes the reply from those sources only.</li>
          </ul>
        </Card>
      </div>
    </form>
  );
}

export function Settings() {
  const state = useStore();
  if (!state) return <Spinner />;
  return (
    <>
      <PageHeader title="Settings" description="What the widget says and when the assistant hands a chat to the team." />
      <Form key={JSON.stringify(state.settings)} state={state} />
    </>
  );
}
