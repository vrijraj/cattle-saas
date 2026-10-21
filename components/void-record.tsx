import { voidRecord } from "@/app/(farm)/herd/actions";

export function VoidRecord({
  entity,
  id,
  returnTo,
  restoreStraw = false,
}: {
  entity: string;
  id: string;
  returnTo: string;
  restoreStraw?: boolean;
}) {
  return (
    <form action={voidRecord} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {restoreStraw ? (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" name="restoreStraw" />
          Straw unused
        </label>
      ) : null}
      <input name="reason" required placeholder="Reason" className="h-8 w-36 rounded-lg border border-border bg-background px-2 text-xs" />
      <button type="submit" className="text-xs font-medium text-danger">
        Void
      </button>
    </form>
  );
}
