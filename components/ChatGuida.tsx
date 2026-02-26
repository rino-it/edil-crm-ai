"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  link?: string;
  linkLabel?: string;
};

function getQuickActions(pathname: string): string[] {
  if (pathname.startsWith("/cantieri")) {
    return [
      "Come aggiungo un cantiere?",
      "Come registro le presenze?",
      "Dove carico i documenti del cantiere?",
    ];
  }

  if (pathname.startsWith("/finanza")) {
    return [
      "Come leggo il cashflow?",
      "Come riconcilio il conto?",
      "Come importo un XML FatturaPA?",
    ];
  }

  if (pathname.startsWith("/scadenze")) {
    return [
      "Come registro un pagamento?",
      "Come importo le fatture?",
      "Come smisto una fattura?",
    ];
  }

  return [
    "Come registro una spesa?",
    "Come importo le fatture?",
    "Dove vedo le scadenze?",
    "Come funziona la riconciliazione?",
  ];
}

function TypingDots() {
  return (
    <div className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl bg-muted/70 border border-border/60">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-blue-600"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

export default function ChatGuida() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const quickActions = useMemo(() => getQuickActions(pathname), [pathname]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function askAssistant(message: string) {
    const cleanMessage = message.trim();
    if (!cleanMessage || loading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: cleanMessage,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat-guida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: cleanMessage }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Errore richiesta");
      }

      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.reply || "Ti aiuto subito: prova a riformulare l'obiettivo in una frase.",
        link: typeof data.link === "string" ? data.link : undefined,
        linkLabel: typeof data.linkLabel === "string" ? data.linkLabel : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: "Non riesco a rispondere ora. Riprova tra pochi secondi.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function closeChat() {
    setOpen(false);
    setInput("");
    setMessages([]);
    setLoading(false);
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[70] h-12 w-12 rounded-full bg-blue-600 text-white shadow-xl hover:bg-blue-700 flex items-center justify-center"
        aria-label="Apri EdilCRM Assistant"
      >
        <MessageCircle className="h-5 w-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              aria-label="Chiudi chat"
              className="fixed inset-0 bg-black/35 z-[80]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeChat}
            />

            <motion.section
              role="dialog"
              aria-modal="true"
              initial={isDesktop ? { opacity: 0, scale: 0.95, y: 8 } : { opacity: 0, y: 24 }}
              animate={isDesktop ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, y: 0 }}
              exit={isDesktop ? { opacity: 0, scale: 0.95, y: 8 } : { opacity: 0, y: 24 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className={cn(
                "fixed z-[90] bg-background border border-border/60",
                "inset-x-0 bottom-0 h-[70vh] rounded-t-2xl",
                "md:inset-auto md:bottom-20 md:right-6 md:w-96 md:h-[500px] md:rounded-2xl md:shadow-2xl",
                "flex flex-col overflow-hidden"
              )}
            >
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-blue-600/10 text-blue-700 flex items-center justify-center">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">EdilCRM Assistant</p>
                    <p className="text-[11px] text-muted-foreground">Guida rapida alle funzioni</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={closeChat} aria-label="Chiudi">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="px-4 py-3 border-b border-border/60">
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => askAssistant(action)}
                      className="text-xs px-2.5 py-1.5 rounded-full border border-border/70 bg-muted/40 hover:bg-muted transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && !loading && (
                  <div className="text-xs text-muted-foreground bg-muted/40 border border-border/60 rounded-xl p-3">
                    Scrivi cosa vuoi fare e ti indico pagina, passaggio e link diretto.
                  </div>
                )}

                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-muted/70 border border-border/60 text-foreground"
                      )}
                    >
                      <p>{msg.text}</p>
                      {msg.role === "assistant" && msg.link && (
                        <button
                          type="button"
                          onClick={() => {
                            router.push(msg.link!);
                            closeChat();
                          }}
                          className="mt-2 inline-flex text-xs font-medium px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        >
                          {msg.linkLabel || "Apri pagina suggerita"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {loading && <TypingDots />}
              </div>

              <form
                className="border-t border-border/60 px-3 py-3 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void askAssistant(input);
                }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Es: Come registro un pagamento fornitore?"
                  className="h-10"
                />
                <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Invia domanda">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
