"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function MilkDatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();

  return (
    <div className="flex items-end gap-2">
      <label className="grid gap-1 text-xs text-muted-foreground">
        <span>Log date</span>
        <input
          type="date"
          max={today}
          defaultValue={date}
          onChange={(event) => {
            const value = event.target.value;
            router.push(!value || value === today ? "/milk" : `/milk?date=${value}`);
          }}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
        />
      </label>
      {date !== today ? (
        <Link href="/milk" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
          Today
        </Link>
      ) : null}
    </div>
  );
}
