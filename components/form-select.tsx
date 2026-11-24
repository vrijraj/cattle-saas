"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FormSelect({
  name,
  value,
  defaultValue,
  onValueChange,
  required = false,
  placeholder,
  options,
  className,
}: {
  name: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const initial = value !== undefined ? undefined : defaultValue !== undefined ? defaultValue : options[0]?.value;
  const empty = options.find((option) => option.value === "");

  if (options.length === 0) {
    return (
      <div className={`relative flex h-11 w-full items-center rounded-xl border border-border bg-muted px-3 text-sm text-muted-foreground ${className ?? ""}`}>
        <span>{placeholder ?? "Nothing to choose"}</span>
        <input
          name={name}
          value=""
          readOnly
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      </div>
    );
  }

  return (
    <Select
      name={name}
      items={options}
      value={value}
      defaultValue={initial}
      onValueChange={(next) => {
        if (onValueChange) onValueChange(next == null ? "" : String(next));
      }}
      required={required}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder ?? empty?.label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option, index) => (
          <SelectItem key={`${option.value === "" ? "__empty__" : option.value}-${index}`} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
