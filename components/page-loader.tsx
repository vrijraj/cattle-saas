export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <span className="loader-spin size-8 rounded-full border-2 border-primary/20 border-t-primary" />
        Loading records
      </div>
    </div>
  );
}
