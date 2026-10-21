"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FormSelect({
  name,
  defaultValue,
  required = false,
  placeholder,
  options,
  className,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const initial = defaultValue !== undefined ? defaultValue : options[0]?.value;
  const empty = options.find((option) => option.value === "");

  if (options.length === 0) {
    return (
      <div className={`flex h-11 w-full items-center rounded-xl border border-border bg-muted px-3 text-sm text-muted-foreground ${className ?? ""}`}>
        {placeholder ?? "Nothing to choose"}
      </div>
    );
  }

  return (
    <Select name={name} items={options} defaultValue={initial} required={required}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? empty?.label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || "empty"} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
