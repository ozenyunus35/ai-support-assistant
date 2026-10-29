import { cx } from "./ui";

/** Relay, the support product being demoed. */
export function RelayMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-md bg-text text-bg", className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.64, height: size * 0.64 }} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M4.5 5.5h15v10h-8.5l-4.5 3.5v-3.5h-2z" />
      </svg>
    </span>
  );
}

/** Northfold, the fictional store whose help center the assistant answers from. */
export function NorthfoldMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-md border border-border-strong bg-surface-3 text-text", className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.66, height: size * 0.66 }} fill="currentColor">
        <path d="M2.5 19 9.5 6.5l4 7 2.2-3.4L21.5 19z" />
      </svg>
    </span>
  );
}

export const NorthfoldLogo = () => (
  <span className="flex items-center gap-2">
    <NorthfoldMark />
    <span className="text-[14px] font-semibold tracking-[-0.01em]">Northfold</span>
  </span>
);
