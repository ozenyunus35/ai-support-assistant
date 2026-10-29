"use client";

import { BookOpen, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteArticle, saveArticle, saveSynonyms, slugFor, uid } from "@/lib/api";
import { sections } from "@/lib/engine";
import { formatDate } from "@/lib/format";
import { CATEGORIES } from "@/lib/kb";
import { overview } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { Article, Category, DemoState, SynonymGroup } from "@/lib/types";
import { RichText } from "../rich-text";
import { useToast } from "../toast";
import { Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, cx, inputClass } from "../ui";

const TEMPLATE = (question: string) => `Customers ask: “${question}”. Answer it in the first sentence, in plain words.

## Details
Add the policy, the numbers and any exceptions.`;

function Editor({ article, state, onClose }: { article: Article; state: DemoState; onClose: () => void }) {
  const [title, setTitle] = useState(article.title);
  const [category, setCategory] = useState<Category>(article.category);
  const [body, setBody] = useState(article.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const isNew = !state.articles.some((a) => a.id === article.id);
  const secs = sections(body);
  const titleError = !title.trim() ? "Add a title." : undefined;

  const save = () => {
    if (titleError || !body.trim()) return;
    const id = isNew ? slugFor(title, state.articles.map((a) => a.id)) : article.id;
    saveArticle({ ...article, id, title: title.trim(), category, body: body.trim() });
    toast(isNew ? "Article published. The assistant can use it right away." : "Article saved. The assistant uses the new text right away.");
    onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={isNew ? "New article" : "Edit article"}
      footer={
        <>
          {!isNew &&
            (confirmDelete ? (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => {
                  deleteArticle(article.id);
                  toast("Article deleted.");
                  onClose();
                }}
              >
                <Trash2 /> Confirm delete
              </Button>
            ) : (
              <Button variant="ghost" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            ))}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!!titleError || !body.trim()}>
            {isNew ? "Publish" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Title" error={title === article.title ? undefined : titleError}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!titleError} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label="Category">
            {(id) => (
              <select id={id} className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIES[c].label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Body" hint="Blank lines separate paragraphs. Start a line with ## for a section heading, or - for a bullet.">
            {(id, d) => <textarea id={id} aria-describedby={d} rows={16} className={cx(inputClass, "h-auto py-2 font-mono text-xs leading-5")} value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">Preview</p>
          <div className="mt-1.5 rounded-lg border border-border p-4">
            <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{title || "Untitled"}</h3>
            <div className="mt-3 space-y-4">
              {secs.map((s, i) => (
                <section key={i}>
                  {s.heading && <h4 className="mb-1.5 font-semibold">{s.heading}</h4>}
                  <RichText text={s.text} dense />
                </section>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-faint">
            Indexed as {secs.length} {secs.length === 1 ? "section" : "sections"}. The assistant cites the section it answers from.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Synonyms({ state }: { state: DemoState }) {
  const [groups, setGroups] = useState<SynonymGroup[]>(state.synonyms);
  const [adding, setAdding] = useState("");
  const { toast } = useToast();
  const dirty = JSON.stringify(groups) !== JSON.stringify(state.synonyms);

  const edit = (id: string, terms: string[]) => setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, terms } : g)));
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="max-w-2xl text-muted">Words customers use, mapped to the words the help center uses. The first term in each group is the one articles are indexed under.</p>
        <Button
          variant="primary"
          disabled={!dirty}
          onClick={() => {
            saveSynonyms(groups);
            toast("Synonyms saved and the index rebuilt.");
          }}
        >
          Save changes
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {groups.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
            {g.terms.map((t, i) => (
              <span key={t + i} className={cx("inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs", i === 0 ? "border-accent/40 bg-accent-soft font-medium text-text" : "border-border text-muted")}>
                {t}
                {i > 0 && (
                  <button onClick={() => edit(g.id, g.terms.filter((_, j) => j !== i))} className="text-faint hover:text-text" aria-label={`Remove ${t}`}>
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            <input
              aria-label={`Add a term to ${g.terms[0]}`}
              placeholder="Add term"
              className="h-6 w-24 rounded-md bg-transparent px-1.5 text-xs placeholder:text-faint focus:bg-surface-2 focus:outline-none"
              onKeyDown={(e) => {
                const v = e.currentTarget.value.trim().toLowerCase();
                if (e.key === "Enter" && v && !g.terms.includes(v)) {
                  edit(g.id, [...g.terms, v]);
                  e.currentTarget.value = "";
                }
              }}
            />
            <button onClick={() => setGroups((gs) => gs.filter((x) => x.id !== g.id))} className="ml-auto rounded-md p-1 text-faint hover:bg-surface-2 hover:text-text" aria-label={`Delete the ${g.terms[0]} group`}>
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const terms = adding
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
          if (terms.length < 2) return;
          setGroups((gs) => [...gs, { id: uid("syn-"), terms }]);
          setAdding("");
        }}
      >
        <input value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="New synonym group" placeholder="New group, comma separated: refund, money back" className={cx(inputClass, "max-w-md flex-1")} />
        <Button type="submit" disabled={adding.split(",").filter((t) => t.trim()).length < 2}>
          <Plus /> Add group
        </Button>
      </form>
    </Card>
  );
}

export function KnowledgeBase() {
  const state = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<"articles" | "synonyms">("articles");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "">("");
  const [editing, setEditing] = useState<Article | null>(null);
  const newQuestion = params.get("new");
  const cited = useMemo(() => new Map(state ? overview(state).topArticles.map((a) => [a.id, a.count]) : []), [state]);

  if (!state) return <Spinner />;
  const draftFromGap: Article | null = newQuestion ? { id: uid("new-"), title: newQuestion.replace(/\?$/, ""), category: "orders", body: TEMPLATE(newQuestion), updatedAt: new Date().toISOString() } : null;
  const open = editing ?? draftFromGap;
  const close = () => {
    setEditing(null);
    if (newQuestion) router.replace("/admin/knowledge/", { scroll: false });
  };

  const needle = q.trim().toLowerCase();
  const rows = state.articles.filter((a) => (!cat || a.category === cat) && (!needle || a.title.toLowerCase().includes(needle) || a.body.toLowerCase().includes(needle)));

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="The articles the assistant answers from. Edits are re-indexed instantly, no training step."
        actions={
          <Button variant="primary" onClick={() => setEditing({ id: uid("new-"), title: "", category: "orders", body: "", updatedAt: new Date().toISOString() })}>
            <Plus /> New article
          </Button>
        }
      />
      <div role="tablist" aria-label="Knowledge base" className="mb-4 flex gap-1 border-b border-border">
        {(["articles", "synonyms"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("-mb-px border-b-2 px-2.5 pb-2 font-medium", tab === t ? "border-accent text-text" : "border-transparent text-muted hover:text-text")}>
            {t === "articles" ? "Articles" : "Synonyms"} <span className="text-faint tabular-nums">{t === "articles" ? state.articles.length : state.synonyms.length}</span>
          </button>
        ))}
      </div>

      {tab === "synonyms" ? (
        <Synonyms state={state} />
      ) : (
        <Card>
          <div className="flex flex-wrap gap-2 border-b border-border p-3">
            <div className="flex h-8 min-w-48 flex-1 items-center gap-2 rounded-md border border-border bg-bg px-2.5 focus-within:border-accent sm:max-w-xs">
              <Search className="size-3.5 text-faint" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search articles" placeholder="Search articles" className="min-w-0 flex-1 bg-transparent placeholder:text-faint focus:outline-none" />
            </div>
            <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value as Category | "")} className={cx(inputClass, "w-auto")}>
              <option value="">All categories</option>
              {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORIES[c].label}
                </option>
              ))}
            </select>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={BookOpen} title="No articles found" text="Try another search or category." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Article</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Cited, 30 d</th>
                    <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((a) => (
                    <tr key={a.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setEditing(a)}>
                      <td className="max-w-0 px-4 py-2.5">
                        <button className="block max-w-full truncate text-left font-medium hover:text-accent" onClick={() => setEditing(a)}>
                          {a.title}
                        </button>
                        <p className="truncate text-xs text-faint">{sections(a.body).length} sections</p>
                      </td>
                      <td className="hidden px-3 py-2.5 text-muted md:table-cell">{CATEGORIES[a.category].label}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{cited.get(a.id) ?? 0}</td>
                      <td className="hidden px-4 py-2.5 text-right text-muted sm:table-cell">{formatDate(a.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {open && <Editor key={open.id} article={open} state={state} onClose={close} />}
    </>
  );
}
