import { cx } from "./ui";

/** Renders the light markup used by articles and answers: paragraphs and "- " bullet lists. */
export function RichText({ text, className, dense }: { text: string; className?: string; dense?: boolean }) {
  const blocks: Array<{ type: "p"; text: string } | { type: "ul"; items: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("- ")) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items.push(line.slice(2));
      else blocks.push({ type: "ul", items: [line.slice(2)] });
    } else blocks.push({ type: "p", text: line });
  }
  return (
    <div className={cx(dense ? "space-y-1.5" : "space-y-3", className)}>
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i} className="space-y-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2">
                <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-faint" aria-hidden />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
