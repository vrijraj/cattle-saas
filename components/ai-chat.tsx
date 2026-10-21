"use client";

import { FormEvent, useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowUp, Bell, Beef, Droplets, FileBarChart, HeartPulse, LayoutDashboard, Milk, Plus, Scale, ShoppingBag, Sparkles, Sprout, Stethoscope, User, Users, Wallet, Wheat, X } from "lucide-react";

type ConfirmCard = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  decided?: "saved" | "cancelled";
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: string[];
  pending?: boolean;
  confirm?: ConfirmCard;
};

const STORAGE_KEY = "farm-ai-chat";

const suggestions: { label: string; prompt: string; icon: ComponentType<{ className?: string }> }[] = [
  { label: "Herd", prompt: "How is the herd today?", icon: Beef },
  { label: "Calving", prompt: "Who is due to calve?", icon: HeartPulse },
  { label: "Milk", prompt: "Which cows are in milk?", icon: Milk },
  { label: "Feed", prompt: "What feed is running low?", icon: Wheat },
  { label: "Alerts", prompt: "Show open alerts", icon: Bell },
  { label: "Breeding", prompt: "Which animals are pregnant?", icon: Sprout },
];

const toolIcons: Record<string, ComponentType<{ className?: string }>> = {
  herd_overview: Beef,
  search_cattle: Beef,
  animal_profile: Beef,
  add_animal: Beef,
  breeding_records: HeartPulse,
  record_heat: HeartPulse,
  record_insemination: HeartPulse,
  record_pregnancy_check: HeartPulse,
  record_calving: HeartPulse,
  mating_check: HeartPulse,
  health_records: Stethoscope,
  record_treatment: Stethoscope,
  record_vaccine: Stethoscope,
  record_deworming: Stethoscope,
  milk_records: Milk,
  record_milk: Milk,
  feed_stock: Wheat,
  record_feed: Wheat,
  semen_inventory: Droplets,
  receive_straws: Droplets,
  embryo_stock: Sprout,
  add_embryo: Sprout,
  record_embryo_transfer: Sprout,
  finance_summary: Wallet,
  record_finance: Wallet,
  open_alerts: Bell,
  shop_overview: ShoppingBag,
  publish_listing: ShoppingBag,
  add_product: ShoppingBag,
  people_and_audit: Users,
  invite_staff: Users,
  report_catalogue: FileBarChart,
  workspace_map: LayoutDashboard,
  record_weight: Scale,
  void_record: X,
};

const toolLabels: Record<string, string> = {
  herd_overview: "Herd",
  search_cattle: "Cattle",
  animal_profile: "Profile",
  breeding_records: "Breeding",
  health_records: "Health",
  milk_records: "Milk",
  feed_stock: "Feed",
  semen_inventory: "Semen",
  mating_check: "Mating",
  embryo_stock: "Embryos",
  finance_summary: "Finance",
  open_alerts: "Alerts",
  shop_overview: "Shop",
  people_and_audit: "Team",
  report_catalogue: "Reports",
  workspace_map: "Screens",
  record_heat: "Record heat",
  record_insemination: "Record insemination",
  record_pregnancy_check: "Record pregnancy check",
  record_calving: "Record calving",
  record_treatment: "Record treatment",
  record_vaccine: "Record vaccine",
  record_deworming: "Record deworming",
  record_weight: "Record weight",
  record_milk: "Record milk",
  record_feed: "Record feed",
  record_finance: "Record finance",
  add_animal: "Add animal",
  void_record: "Void record",
  receive_straws: "Receive straws",
  add_embryo: "Add embryo",
  record_embryo_transfer: "Record transfer",
  publish_listing: "Publish listing",
  add_product: "Add product",
  invite_staff: "Invite staff",
};

function ToolGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = toolIcons[name] ?? Sparkles;
  return <Icon className={className} />;
}

function renderText(text: string) {
  const tokens = text.split(/(\[[^\]]+\]\([^)]+\)|\/[A-Za-z0-9][A-Za-z0-9/_?&=%.-]*)/g);
  return tokens.map((token, index) => {
    const linked = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const href = linked?.[2] ?? (token.startsWith("/") ? token : null);
    const label = linked?.[1] ?? token;
    if (href?.startsWith("/")) {
      return (
        <a key={index} href={href} className="font-medium text-primary underline-offset-2 hover:underline">
          {label}
        </a>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

export function AiChat({ farmName, configured }: { farmName: string; configured: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(configured ? null : "Add GEMINI_API_KEY to .env and restart the server.");
  const sessionId = useRef<string | null>(null);
  const settledIds = useRef<Set<string>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { sessionId?: string; messages?: ChatMessage[] };
        sessionId.current = parsed.sessionId ?? null;
        const stored = (parsed.messages ?? []).filter((message) => !message.pending);
        settledIds.current = new Set(stored.map((message) => message.id));
        setMessages(stored);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessionId: sessionId.current, messages: messages.filter((message) => !message.pending) }),
    );
  }, [messages, ready]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function send(raw: string, confirmation?: { id: string; confirmed: boolean }) {
    const text = raw.trim();
    if (busy || (!confirmation && !text)) return;
    setDraft("");
    setNotice(null);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text, tools: [] };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", text: "", tools: [], pending: true }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const patch = (update: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) => current.map((message) => (message.id === assistantId ? update(message) : message)));
    };

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: confirmation ? undefined : text, confirmation, sessionId: sessionId.current }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        patch((message) => ({ ...message, pending: false, text: payload?.error ?? "The assistant could not answer." }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim()) as {
            type: string;
            id?: string;
            fresh?: boolean;
            text?: string;
            name?: string;
            message?: string;
            tool?: string;
            args?: Record<string, unknown>;
          };
          if (event.type === "session" && event.id) {
            if (event.fresh && sessionId.current) setNotice("This reply starts a new chat. The earlier one was no longer on the server.");
            sessionId.current = event.id;
          } else if (event.type === "delta" && event.text) {
            patch((message) => ({ ...message, text: message.text + event.text }));
          } else if (event.type === "replace" && event.text) {
            patch((message) => ({ ...message, text: event.text ?? "" }));
          } else if (event.type === "tool" && event.name) {
            patch((message) => ({ ...message, tools: message.tools.includes(event.name!) ? message.tools : [...message.tools, event.name!] }));
          } else if (event.type === "confirm" && event.id && event.tool) {
            patch((message) => ({ ...message, confirm: { id: event.id!, tool: event.tool!, args: event.args ?? {} } }));
          } else if (event.type === "error" && event.message) {
            patch((message) => ({ ...message, text: message.text || event.message || "" }));
          }
        }
      }
      patch((message) => ({
        ...message,
        pending: false,
        text: message.text || (message.confirm ? "" : "The assistant returned an empty reply."),
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        patch((message) => ({ ...message, pending: false, text: message.text || "Stopped." }));
      } else {
        patch((message) => ({ ...message, pending: false, text: "The assistant could not be reached." }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function reset() {
    abortRef.current?.abort();
    sessionId.current = null;
    localStorage.removeItem(STORAGE_KEY);
    setMessages([]);
    setNotice(configured ? null : "Add GEMINI_API_KEY to .env and restart the server.");
    setBusy(false);
  }

  const composer = (
    <form onSubmit={onSubmit}>
      <div className="assistant-composer flex items-end gap-2 rounded-3xl border border-border bg-card p-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          placeholder={configured ? "Ask about cattle, milk, breeding, money…" : "Gemini key needed before the first question"}
          className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="h-11 shrink-0 rounded-full border border-border px-4 text-sm font-medium">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
            <ArrowUp className="size-4" />
            <span className="sr-only">Send</span>
          </button>
        )}
      </div>
      <p className="mt-2 px-3 text-xs text-muted-foreground">Enter sends the question. Shift Enter starts a new line. A save waits until you confirm it.</p>
    </form>
  );

  if (!ready) return <section className="min-h-[50vh]" />;

  if (messages.length === 0) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5">
        <div className="ai-rise rounded-3xl bg-[#e7f6ee] px-5 py-6 sm:px-7">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary">
            <Sparkles className="ai-sparkle size-3.5" />
            ASSISTANT
          </p>
          <h1 className="mt-2 max-w-lg text-3xl sm:text-4xl">Ask about the farm</h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{farmName}. Questions can cover cattle, milk, breeding, health, feed, and money.</p>
        </div>
        {notice ? <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{notice}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.prompt}
              type="button"
              disabled={!configured || busy}
              onClick={() => void send(suggestion.prompt)}
              style={{ animationDelay: `${120 + index * 55}ms` }}
              className="ai-card flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:bg-muted disabled:opacity-50"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                <suggestion.icon className="size-4" />
              </span>
              <span>
                <span className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">{suggestion.label}</span>
                <span className="mt-1 block text-sm">{suggestion.prompt}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="ai-card" style={{ animationDelay: "460ms" }}>
          {composer}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <Sparkles className="ai-sparkle size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl">Assistant</h1>
            <p className="truncate text-xs text-muted-foreground">{farmName}</p>
          </div>
        </div>
        <button type="button" onClick={reset} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-muted">
          <Plus className="size-4" />
          New chat
        </button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 pb-4">
          {notice ? <p className="rounded-2xl border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">{notice}</p> : null}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`${message.role === "user" ? "flex justify-end" : "flex justify-start"} items-end gap-2 ${settledIds.current.has(message.id) ? "" : message.role === "user" ? "ai-in-user" : "ai-in"}`}
            >
              {message.role === "assistant" ? (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                  <Sparkles className="size-3.5" />
                </span>
              ) : null}
              <div className={message.role === "user" ? "max-w-[85%] rounded-3xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground" : "max-w-[85%]"}>
                {message.role === "assistant" && message.tools.length > 0 ? (
                  <p className="mb-2 flex flex-wrap gap-1.5">
                    {message.tools.map((tool) => (
                      <span key={tool} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                        <ToolGlyph name={tool} className="size-3" />
                        {toolLabels[tool] ?? tool.replaceAll("_", " ")}
                      </span>
                    ))}
                  </p>
                ) : null}
                {message.confirm ? (
                  <div className="mb-2 rounded-2xl border border-border bg-card p-4 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <ToolGlyph name={message.confirm.tool} className="size-4 text-primary" />
                      {toolLabels[message.confirm.tool] ?? message.confirm.tool}
                    </p>
                    <dl className="mt-3 space-y-1.5 text-muted-foreground">
                      {Object.entries(message.confirm.args).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <dt className="capitalize">{key.replaceAll(/([A-Z])/g, " $1")}</dt>
                          <dd className="text-foreground">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                    {message.confirm.decided ? (
                      <p className="mt-3 text-xs font-medium text-primary">{message.confirm.decided === "saved" ? "Confirmed" : "Left unsaved"}</p>
                    ) : (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const id = message.confirm!.id;
                            setMessages((current) =>
                              current.map((item) =>
                                item.confirm?.id === id ? { ...item, confirm: { ...item.confirm!, decided: "saved" } } : item,
                              ),
                            );
                            void send("Save this record", { id, confirmed: true });
                          }}
                          className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const id = message.confirm!.id;
                            setMessages((current) =>
                              current.map((item) =>
                                item.confirm?.id === id ? { ...item, confirm: { ...item.confirm!, decided: "cancelled" } } : item,
                              ),
                            );
                            void send("Don't save this", { id, confirmed: false });
                          }}
                          className="h-10 rounded-full border border-border px-4 text-sm font-medium disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {message.role === "assistant" && (message.text || message.pending) ? (
                  <div className="rounded-3xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm leading-6 whitespace-pre-wrap">
                      {message.text ? (
                        renderText(message.text)
                      ) : (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          Looking through the farm
                          <span className="ai-dots" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                        </span>
                      )}
                  </div>
                ) : message.role === "user" ? (
                  <p className="whitespace-pre-wrap">{message.text}</p>
                ) : null}
              </div>
              {message.role === "user" ? (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <User className="size-3.5" />
                </span>
              ) : null}
            </article>
          ))}
        </div>
      </div>
      {composer}
    </section>
  );
}
