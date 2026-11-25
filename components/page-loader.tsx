export function PageLoader({
  label = "Loading records",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex min-h-[16rem] w-full items-center justify-center py-8"
          : "flex min-h-[50vh] w-full flex-1 items-center justify-center py-12"
      }
      role="status"
      aria-live="polite"
    >
      <div className="page-enter flex flex-col items-center gap-3 text-center">
        <span
          className="grid size-11 place-items-center rounded-2xl border border-black/[0.06] bg-white shadow-[0_4px_16px_-6px_rgba(15,23,42,0.12)]"
          aria-hidden
        >
          <span className="loader-spin size-5 rounded-full border-2 border-primary/20 border-t-primary" />
        </span>
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
