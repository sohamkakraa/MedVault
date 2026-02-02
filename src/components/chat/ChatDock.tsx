"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { getStore } from "@/lib/store";
import { Bot, MessageCircle, X } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatDock() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I can answer questions about your stored medical history (documents, meds, labs). I will ignore unrelated requests.",
    },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const q = text.trim();
    if (!q || loading) return;

    const store = getStore(); // local store (docs/meds/labs)
    setMessages((m) => [...m, { role: "user", content: q }]);
    setText("");
    setLoading(true);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, store }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Chat failed");
      setMessages((m) => [...m, { role: "assistant", content: j.answer as string }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `I ran into an error: ${e.message ?? "unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-5 right-5 z-50 no-print">
        <Button
          onClick={() => setOpen((v) => !v)}
          className="rounded-2xl shadow-lg gap-2"
          variant={open ? "danger" : "primary"}
        >
          {open ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          {open ? "Close" : "Medical Chat"}
        </Button>
      </div>

      {/* Dock */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[92vw] max-w-md no-print">
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] bg-[var(--panel-2)] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Medical History Agent</p>
                  <p className="text-xs mv-muted">Answers only from your stored records.</p>
                </div>
              </div>
              <Badge>Private</Badge>
            </div>

            <div className="h-80 overflow-auto p-4 space-y-3 bg-[var(--panel)]/60">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={[
                    "max-w-[90%] rounded-2xl px-3 py-2 text-sm border",
                    m.role === "user"
                      ? "ml-auto bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]"
                      : "mr-auto bg-[var(--panel-2)] text-[var(--fg)] border-[var(--border)]",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="border-t border-[var(--border)] p-3 bg-[var(--panel-2)]">
              <div className="flex items-center gap-2">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ask: What meds am I on? What were my latest LDL values?"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                />
                <Button onClick={send} disabled={loading} className="shrink-0">
                  {loading ? "..." : "Send"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] mv-muted">
                Not medical advice. It recalls and summarizes your uploaded information only.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
