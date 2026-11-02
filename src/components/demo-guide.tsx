"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { Modal, cx } from "./ui";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The honest description of what runs here, plus a short route through the demo. Opened on request, never pushed into the chat. */
export function DemoGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("inline-flex items-center gap-1 font-medium hover:text-accent", className)} data-testid="demo-guide-open">
        <Info className="size-3.5" aria-hidden /> How this demo works
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="How this demo works">
        <div className="space-y-4" data-testid="demo-guide">
          <section>
            <h3 className="font-medium">What is real and what is not</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
              <li>Northfold is a fictional store. Orders, customers, chats and policies are synthetic.</li>
              <li>Everything runs in your browser. There is no server, no account and no language-model call; chats are kept in localStorage.</li>
              <li>
                Answers come from two parts: policy rules that read the facts in your message (country, days, used or unused, order status) and keep them across messages, and BM25 search over the help center for everything the rules don&apos;t cover.
              </li>
              <li>&quot;Retrieval match&quot; says how well the best help center section fits the question. It is not the chance that the answer is right.</li>
              <li>The assistant can only inform in this demo. It does not cancel, refund or ship anything, and it says so.</li>
              <li>The customer chat and the admin console are two tabs of the same browser that share its storage. This is not a multi-user system.</li>
            </ul>
          </section>
          <section>
            <h3 className="font-medium">A 90-second route</h3>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-muted">
              <li>
                In the chat, ask <em>&quot;Do you ship to Canada and can I return a used tent after 45 days?&quot;</em>. Both questions are answered, each with its source.
              </li>
              <li>
                Send <em>NF-20481</em> to get an order card, then <em>&quot;Cancel that order, please.&quot;</em> to see it use the order&apos;s status.
              </li>
              <li>Press &quot;Talk to a person&quot;. The chat joins the handoff queue.</li>
              <li>
                Open the{" "}
                <a href={`${base}/admin/inbox/`} target="_blank" rel="noreferrer" className="font-medium text-accent underline">
                  admin inbox
                </a>{" "}
                in a second tab, find the chat marked Live and reply.
              </li>
              <li>Go back to the first tab: the reply is in the chat.</li>
              <li>
                Open the{" "}
                <a href={`${base}/admin/playground/`} target="_blank" rel="noreferrer" className="font-medium text-accent underline">
                  answer playground
                </a>{" "}
                to see the requests, facts, rule and sources behind any answer.
              </li>
            </ol>
          </section>
          <p className="text-xs text-faint">Free questions stay open: ask anything a customer might. What the help center doesn&apos;t cover goes to a person.</p>
        </div>
      </Modal>
    </>
  );
}
