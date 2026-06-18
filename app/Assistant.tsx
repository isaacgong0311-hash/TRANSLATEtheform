"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in the standard DOM lib).
type SpeechRecognitionResultLike = {
  0: { transcript: string };
};
type SpeechRecognitionEventLike = {
  results: { 0: SpeechRecognitionResultLike };
};
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

export type AssistantContext = {
  documentType: string;
  category: string;
  meaning: string;
  deadline: string | null;
  whatTheyNeed: string[];
  keyDetails: {
    sender: string | null;
    contactPhone: string | null;
    accountNumber: string | null;
    amountDue: string | null;
  };
};

type Lang = { label: string; bcp47: string; tts: string };
type Mode = "ask" | "practice";
type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean };

export default function Assistant({
  context,
  lang,
  simplify,
  dir,
}: {
  context: AssistantContext;
  lang: Lang;
  simplify: boolean;
  dir: "ltr" | "rtl";
}) {
  const [mode, setMode] = useState<Mode>("ask");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    !!((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  function speak(text: string) {
    if (!speakOn || typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang.tts;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function send(history: Msg[]) {
    setSending(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: lang.label,
          simplify,
          mode,
          context,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      const reply = res.ok ? data.reply : data.error || "Sorry, please try again.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      speak(reply);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I couldn't reach the server. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function submit(text: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    void send(next);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setMode(next);
    setMessages([]);
    setInput("");
    if (next === "practice") {
      // Seed a hidden cue so the clerk answers the phone first.
      const seed: Msg[] = [
        { role: "user", content: "(The caller has just dialed your office. Greet them.)", hidden: true },
      ];
      setMessages(seed);
      void send(seed);
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor =
      (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang.tts;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      submit(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  const suggestions =
    mode === "ask"
      ? [
          "What is the most important thing here?",
          "What happens if I miss the deadline?",
          "What if I can't find the documents they want?",
        ]
      : [];

  const visible = messages.filter((m) => !m.hidden);

  return (
    <div
      className="ttf-fade-in overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-100"
      dir={dir}
    >
      <div className="border-b border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-indigo-600 text-white">
            <SparkIcon />
          </span>
          <div>
            <h2 className="text-lg font-bold leading-tight text-slate-900">Talk it through</h2>
            <p className="text-xs text-slate-500">
              Ask about your letter, or rehearse the call out loud — in your language.
            </p>
          </div>
        </div>

        <div role="tablist" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-white/70 p-1 ring-1 ring-indigo-100">
          <button
            role="tab"
            aria-selected={mode === "ask"}
            onClick={() => switchMode("ask")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              mode === "ask" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-indigo-50"
            }`}
          >
            💬 Ask a question
          </button>
          <button
            role="tab"
            aria-selected={mode === "practice"}
            onClick={() => switchMode("practice")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              mode === "practice" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-indigo-50"
            }`}
          >
            📞 Practice the call
          </button>
        </div>
        {mode === "practice" && (
          <p className="mt-2 text-xs text-indigo-700">
            Practice space — you&apos;re talking to a pretend clerk so the real call feels easy.
          </p>
        )}
      </div>

      <div
        ref={scrollRef}
        className="ttf-scroll max-h-80 space-y-3 overflow-y-auto p-5"
        aria-live="polite"
      >
        {visible.length === 0 && !sending && (
          <p className="py-6 text-center text-sm text-slate-400">
            {mode === "ask"
              ? "Ask anything about your letter below."
              : "Starting your practice call…"}
          </p>
        )}
        {visible.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-2.5">
              <span className="flex gap-1">
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </span>
            </div>
          </div>
        )}
      </div>

      {suggestions.length > 0 && visible.length === 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-center gap-2"
        >
          {speechSupported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Speak your message"}
              className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                listening
                  ? "animate-pulse bg-red-500 text-white"
                  : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              <MicIcon />
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : mode === "ask" ? "Type your question…" : "Type what you'd say…"}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex h-11 flex-none items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40"
          >
            Send
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => {
              if (speakOn && typeof window !== "undefined") window.speechSynthesis?.cancel();
              setSpeakOn((v) => !v);
            }}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {speakOn ? "🔊 Speaking replies on" : "🔇 Speaking replies off"}
          </button>
          {speechSupported ? (
            <span className="text-xs text-slate-400">Tap the mic to talk</span>
          ) : (
            <span className="text-xs text-slate-400">Voice input needs Chrome or Safari</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
      style={{ animationDelay: delay }}
    />
  );
}

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
