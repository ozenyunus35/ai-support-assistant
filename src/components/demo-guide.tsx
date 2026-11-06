"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { Modal, cx } from "./ui";
import { useLang } from "@/lib/i18n";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The honest description of what runs here, plus a short route through the demo. Opened on request, never pushed into the chat. */
export function DemoGuide({ className }: { className?: string }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("inline-flex items-center gap-1 font-medium hover:text-accent", className)} data-testid="demo-guide-open">
        <Info className="size-3.5" aria-hidden /> {t("How this demo works")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("How this demo works")}>
        <div className="space-y-4" data-testid="demo-guide">
          <section>
            <h3 className="font-medium">{t("What is real and what is not")}</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
              <li>{t("Northfold is a fictional store. Orders, customers, chats and policies are synthetic.")}</li>
              <li>{t("Everything runs in your browser. There is no server, no account and no language-model call; chats are kept in localStorage.")}</li>
              <li>
                {t("Answers come from two parts: policy rules that read the facts in your message (country, days, used or unused, order status) and keep them across messages, and BM25 search over the help center for everything the rules don't cover.")}
              </li>
              <li>{t("\"Retrieval match\" says how well the best help center section fits the question. It is not the chance that the answer is right.")}</li>
              <li>{t("The assistant can only inform in this demo. It does not cancel, refund or ship anything, and it says so.")}</li>
              <li>{t("The customer chat and the admin console are two tabs of the same browser that share its storage. This is not a multi-user system.")}</li>
            </ul>
          </section>
          <section>
            <h3 className="font-medium">{t("A 90-second route")}</h3>
            {lang === "tr" ? (
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-muted">
                <li>
                  Sohbette şunu sorun: <em>&quot;Do you ship to Canada and can I return a used tent after 45 days?&quot;</em> İki soru da kaynağıyla birlikte cevaplanır.
                </li>
                <li>
                  <em>NF-20481</em> gönderip sipariş kartını alın, ardından <em>&quot;Cancel that order, please.&quot;</em> yazın: asistan siparişin durumuna göre cevap verir.
                </li>
                <li>&quot;Talk to a person&quot; düğmesine basın. Sohbet, devir kuyruğuna girer.</li>
                <li>
                  İkinci bir sekmede{" "}
                  <a href={`${base}/admin/inbox/`} target="_blank" rel="noreferrer" className="font-medium text-accent underline">
                    yönetim gelen kutusunu
                  </a>{" "}
                  açın, Live işaretli sohbeti bulun ve cevap yazın.
                </li>
                <li>İlk sekmeye dönün: cevabınız sohbette.</li>
                <li>
                  Herhangi bir cevabın arkasındaki istekleri, bilgileri, kuralı ve kaynakları görmek için{" "}
                  <a href={`${base}/admin/playground/`} target="_blank" rel="noreferrer" className="font-medium text-accent underline">
                    cevap oyun alanını
                  </a>{" "}
                  açın.
                </li>
              </ol>
            ) : (
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
            )}
          </section>
          <p className="text-xs text-faint">{t("Free questions stay open: ask anything a customer might. What the help center doesn't cover goes to a person.")}</p>
        </div>
      </Modal>
    </>
  );
}
