"use client";

import { useEffect, useRef, useState } from "react";
import {
  RESOURCES,
  CRISIS_RESOURCES,
  SCAM_RESOURCE,
  type Category,
  type Resource,
} from "./resources";
import Assistant from "./Assistant";

type Step = { step: string; detail: string };
type ChecklistItem = { item: string; why: string };
type ResponseLetter = { applicable: boolean; kind: string; body: string };

type Result = {
  documentType: string;
  category: Category;
  confidence: number;
  whyThisType: string;
  urgency: "low" | "medium" | "high";
  meaning: string;
  keyDetails: {
    sender: string | null;
    contactPhone: string | null;
    accountNumber: string | null;
    amountDue: string | null;
  };
  whatTheyNeed: string[];
  documentChecklist: ChecklistItem[];
  responseLetter: ResponseLetter;
  nextSteps: Step[];
  phoneScript: string;
  deadline: string | null;
  deadlineISO: string | null;
  isPossibleScam: boolean;
  scamSigns: string[];
  isCrisis: boolean;
  crisisMessage: string;
  userRights: string[];
};

const LANGUAGES: { label: string; bcp47: string; tts: string }[] = [
  { label: "English", bcp47: "en", tts: "en-US" },
  { label: "Spanish", bcp47: "es", tts: "es-ES" },
  { label: "Chinese (Simplified)", bcp47: "zh-Hans", tts: "zh-CN" },
  { label: "Vietnamese", bcp47: "vi", tts: "vi-VN" },
  { label: "Tagalog", bcp47: "tl", tts: "fil-PH" },
  { label: "Arabic", bcp47: "ar", tts: "ar-SA" },
  { label: "French", bcp47: "fr", tts: "fr-FR" },
  { label: "Haitian Creole", bcp47: "ht", tts: "fr-FR" },
  { label: "Korean", bcp47: "ko", tts: "ko-KR" },
  { label: "Russian", bcp47: "ru", tts: "ru-RU" },
];

const RTL_LANGS = new Set(["ar"]);

const URGENCY_STYLES: Record<Result["urgency"], string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

const URGENCY_LABEL: Record<Result["urgency"], string> = {
  high: "Urgent",
  medium: "Time-sensitive",
  low: "Not urgent",
};

const LOADING_MESSAGES = [
  "Reading your letter…",
  "Finding the important dates…",
  "Checking for scam warning signs…",
  "Gathering verified help near you…",
  "Writing your reply letter…",
];

function buildIcs(dateISO: string, summary: string): string {
  const d = dateISO.replaceAll("-", "");
  const dt = new Date(dateISO);
  dt.setDate(dt.getDate() + 1);
  const end = dt.toISOString().slice(0, 10).replaceAll("-", "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Translate the Form//EN",
    "BEGIN:VEVENT",
    `UID:${stamp}-translateform@local`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${summary.replace(/\n/g, " ")}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export default function Home() {
  const [language, setLanguage] = useState("English");
  const [simplify, setSimplify] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [translatedLetter, setTranslatedLetter] = useState<string | null>(null);
  const [translatingLetter, setTranslatingLetter] = useState(false);
  const previewUrl = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const lang = LANGUAGES.find((l) => l.label === language) ?? LANGUAGES[0];
  const dir = RTL_LANGS.has(lang.bcp47) ? "rtl" : "ltr";

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(
      () => setLoadingMsg((m) => (m + 1) % LOADING_MESSAGES.length),
      1800,
    );
    return () => clearInterval(id);
  }, [loading]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(f);
    previewUrl.current = url;
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(url);
  }

  async function explain() {
    if (!file) return;
    stopSpeaking();
    setLoadingMsg(0);
    setLoading(true);
    setError(null);
    setResult(null);
    setChecked(new Set());
    setCopiedLetter(false);
    setTranslatedLetter(null);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("language", language);
      body.append("readingLevel", simplify ? "simple" : "standard");
      const res = await fetch("/api/explain", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setResult(data as Result);
      }
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSample() {
    try {
      const res = await fetch("/sample-letter.png");
      const blob = await res.blob();
      const f = new File([blob], "sample-letter.png", { type: "image/png" });
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      const url = URL.createObjectURL(f);
      previewUrl.current = url;
      setFile(f);
      setResult(null);
      setError(null);
      setPreview(url);
    } catch {
      setError("Could not load the sample. Please upload your own photo.");
    }
  }

  function reset() {
    stopSpeaking();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  }

  async function readAloud() {
    if (!result || typeof window === "undefined") return;
    if (speaking) { stopSpeaking(); return; }

    const text = [
      result.meaning,
      result.whatTheyNeed.join(". "),
      ...result.nextSteps.map((s) => `${s.step}. ${s.detail}`),
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2500);

    // Try ElevenLabs high-quality multilingual TTS first.
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setSpeaking(true);
        audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
        audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
        void audio.play();
        return;
      }
    } catch {
      // fall through to browser TTS
    }

    // Browser SpeechSynthesis fallback (always available in Chrome/Safari).
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang.tts;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  function downloadCalendar() {
    if (!result?.deadlineISO) return;
    const ics = buildIcs(result.deadlineISO, `Deadline: ${result.documentType}`);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deadline.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleChecked(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function copyLetter() {
    const body = translatedLetter ?? result?.responseLetter.body;
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopiedLetter(true);
      setTimeout(() => setCopiedLetter(false), 2000);
    } catch {
      // Clipboard can be blocked; the download button is the fallback.
    }
  }

  function downloadLetter() {
    const body = translatedLetter ?? result?.responseLetter.body;
    if (!body) return;
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-reply-letter.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function printLetter() {
    const body = result?.responseLetter.body;
    if (!body || typeof window === "undefined") return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const safe = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    w.document.write(
      `<pre style="font:14px/1.6 Georgia,serif;white-space:pre-wrap;padding:48px;max-width:680px;margin:auto">${safe}</pre>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  async function translateLetter() {
    const body = result?.responseLetter.body;
    if (!body || lang.label === "English") return;
    if (translatedLetter) { setTranslatedLetter(null); return; } // toggle off
    setTranslatingLetter(true);
    try {
      const res = await fetch("/api/translate-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body, language: lang.label }),
      });
      const data = (await res.json()) as { translation?: string; error?: string };
      if (res.ok && data.translation) setTranslatedLetter(data.translation);
    } catch { /* silent — original still shown */ } finally {
      setTranslatingLetter(false);
    }
  }

  const kd = result?.keyDetails;
  const hasDetails =
    kd && (kd.sender || kd.contactPhone || kd.accountNumber || kd.amountDue);
  const hasActions =
    !!result &&
    (result.nextSteps.length > 0 ||
      result.whatTheyNeed.length > 0 ||
      result.documentChecklist.length > 0 ||
      (result.responseLetter.applicable && !!result.responseLetter.body) ||
      !!result.phoneScript);

  return (
    <div className="flex min-h-screen flex-col" dir={dir}>
      {/* Crisis accent: a calm but clear signal at the top of the page. */}
      {result?.isCrisis && (
        <div className="h-1.5 w-full bg-red-500" aria-hidden="true" />
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <Logo />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight tracking-tight text-slate-900">
              CivicBridge AI
            </p>
            <p className="truncate text-xs text-slate-500">
              Democratizing civic justice through intelligent advocacy.
            </p>
          </div>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            <LockIcon /> Private
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <div className="mb-7 text-center">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Free · Private · 10+ languages
          </span>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Bridging the Gap Between Complex Policy and Citizen Action
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-base leading-relaxed text-slate-600">
            CivicBridge AI transforms confusing government notices, healthcare forms, and legal documents into clear, actionable advocacy plans. Snap a photo and get an AI-powered explanation of your rights, next steps, and how to advocate for yourself — in over 10 languages.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {[
              "Medical bill",
              "Benefits letter",
              "Utility notice",
              "School form",
              "Legal notice",
              "Immigration letter",
            ].map((ex) => (
              <span
                key={ex}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
              >
                {ex}
              </span>
            ))}
          </div>
        </div>

        {!preview && !result && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PersonaCard
                icon="⚖️"
                title="Immigrants & Newcomers"
                desc="Government letters feel impossible when English isn't your first language. We translate every word, explain your legal rights, and empower you to advocate for yourself."
              />
              <PersonaCard
                icon="🛡️"
                title="Seniors & Vulnerable Populations"
                desc="Medical bills, Medicare notices, Social Security letters — we identify scams, explain your rights, and help you navigate complex systems with confidence."
              />
              <PersonaCard
                icon="📋"
                title="Families & Students"
                desc="School forms, housing notices, legal letters — we cut through the jargon, identify your rights, and help you take action when decisions feel unfair."
              />
            </div>
            <HowItWorks />
          </>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-black/[0.02]">
          <label
            htmlFor="language"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Show me the explanation in
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {LANGUAGES.map((l) => (
              <option key={l.bcp47} value={l.label}>
                {l.label}
              </option>
            ))}
          </select>

          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            How simple should the words be?
          </span>
          <div
            role="group"
            aria-label="Reading level"
            className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"
          >
            <button
              type="button"
              onClick={() => setSimplify(false)}
              aria-pressed={!simplify}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                !simplify ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setSimplify(true)}
              aria-pressed={simplify}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                simplify ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Extra simple
            </button>
          </div>

          {!preview && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center transition hover:border-blue-500 hover:bg-blue-50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-600">
              <CameraIcon />
              <span className="mt-3 text-base font-semibold text-slate-800">
                Take a photo or upload your letter
              </span>
              <span className="mt-1 text-sm text-slate-500">
                JPG or PNG, up to 10&nbsp;MB
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPick}
                className="sr-only"
                aria-label="Take a photo or upload a picture of your letter"
              />
            </label>
          )}

          {!preview && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={loadSample}
                className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Don&apos;t have a letter? Try a sample
              </button>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="The letter you uploaded"
                className="max-h-72 w-full rounded-xl border border-slate-200 object-contain"
              />
              <div className="flex gap-3">
                <button
                  onClick={explain}
                  disabled={loading}
                  aria-busy={loading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? (
                    <>
                      <Spinner /> {LOADING_MESSAGES[loadingMsg]}
                    </>
                  ) : (
                    "Explain this letter"
                  )}
                </button>
                <button
                  onClick={reset}
                  disabled={loading}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60"
                >
                  New photo
                </button>
              </div>
            </div>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <LockIcon /> Your photo is read once and never saved or stored.
          </p>
        </div>

        <div aria-live="polite" className="sr-only">
          {loading ? LOADING_MESSAGES[loadingMsg] : ""}
        </div>

        {error && (
          <div
            role="alert"
            className="ttf-fade-in mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            <span aria-hidden="true">⚠️</span>
            <div>
              <p className="font-semibold">We hit a snag</p>
              <p className="mt-0.5 text-sm">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <section
            className="mt-6 space-y-7"
            lang={lang.bcp47}
            aria-label="Explanation of your letter"
          >
            {result.isPossibleScam && (
              <div
                role="alert"
                className="ttf-fade-in rounded-2xl border-2 border-orange-500 bg-orange-50 p-4"
              >
                <p className="font-bold text-orange-900">
                  🚩 This may be a scam — please be careful
                </p>
                {result.scamSigns.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-orange-900">
                    {result.scamSigns.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-sm text-orange-800">
                  Do not send money, gift cards, or personal information until you
                  confirm this is real by contacting the organization through an
                  official phone number you look up yourself.
                </p>
              </div>
            )}

            {result.isCrisis && result.crisisMessage && (
              <div
                role="alert"
                className="ttf-fade-in rounded-2xl border-2 border-red-400 bg-red-50 p-4"
              >
                <p className="font-semibold text-red-800">⚠️ This needs attention soon</p>
                <p className="mt-1 text-red-800">{result.crisisMessage}</p>
              </div>
            )}

            {/* ① Understand */}
            <div className="space-y-4">
              <SectionHeader n={1} title="Understand Your Rights" />

              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
                    {result.documentType}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${URGENCY_STYLES[result.urgency]}`}
                  >
                    {URGENCY_LABEL[result.urgency]}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">What this means</h2>
                  <button
                    onClick={readAloud}
                    className="flex flex-none items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    aria-pressed={speaking}
                  >
                    {speaking ? "⏹ Stop" : "🔊 Read aloud"}
                  </button>
                </div>

                <p className="mt-2 text-base leading-relaxed text-slate-700">
                  {result.meaning}
                </p>

                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold">Why I think this:</span>{" "}
                    {result.whyThisType}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-semibold">Confidence:</span>
                    <span className="inline-flex h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                      <span
                        className={`h-full ${result.confidence >= 60 ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${result.confidence}%` }}
                      />
                    </span>
                    <span>{result.confidence}%</span>
                  </div>
                  {result.confidence < 60 && (
                    <p className="mt-1 text-amber-700">
                      Please double-check — the photo may be unclear.
                    </p>
                  )}
                </div>
              </div>

              {result.userRights.length > 0 && (
                <div className="ttf-fade-in rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-900">⚖️ Your Legal Rights</p>
                  <ul className="mt-2 space-y-1 text-emerald-900">
                    {result.userRights.map((right, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-emerald-600">✓</span>
                        <span>{right}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.deadline && (
                <div className="ttf-fade-in rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  <p className="font-semibold text-amber-900">📅 Important date</p>
                  <p className="mt-1 text-amber-900">{result.deadline}</p>
                  <p className="mt-1 text-sm text-amber-700">
                    Double-check this date on the letter yourself before acting.
                  </p>
                  {result.deadlineISO && (
                    <button
                      onClick={downloadCalendar}
                      className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      Add reminder to calendar
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ② Take action */}
            {hasActions && (
              <div className="space-y-4">
                <SectionHeader n={2} title="Build Your Advocacy Plan" />

                {result.nextSteps.length > 0 && (
                  <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xl font-bold">Your next steps</h2>
                    <ol className="mt-3 space-y-4">
                      {result.nextSteps.map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900">{s.step}</p>
                            <p className="text-slate-700">{s.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {result.whatTheyNeed.length > 0 && (
                  <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xl font-bold">What they need from you</h2>
                    <ul className="mt-3 space-y-2">
                      {result.whatTheyNeed.map((item, i) => (
                        <li key={i} className="flex gap-2 text-slate-700">
                          <span className="text-blue-600">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.documentChecklist.length > 0 && (
                  <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-xl font-bold">Documents to gather</h2>
                      <span className="text-sm font-medium text-slate-500">
                        {checked.size} of {result.documentChecklist.length} ready
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Check each one off as you find it.
                    </p>
                    <ul className="mt-3 space-y-2">
                      {result.documentChecklist.map((c, i) => {
                        const done = checked.has(i);
                        return (
                          <li key={i}>
                            <label
                              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                                done
                                  ? "border-emerald-300 bg-emerald-50"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={done}
                                onChange={() => toggleChecked(i)}
                                className="mt-0.5 h-5 w-5 flex-none rounded border-slate-300 text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                              />
                              <span>
                                <span
                                  className={`font-medium ${done ? "text-emerald-900 line-through" : "text-slate-900"}`}
                                >
                                  {c.item}
                                </span>
                                {c.why && (
                                  <span className="block text-sm text-slate-500">{c.why}</span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {result.responseLetter.applicable && result.responseLetter.body && (
                  <Collapsible
                    accent
                    icon={
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-blue-100 text-base">
                        ✍️
                      </span>
                    }
                    title="Your reply, already written"
                    subtitle={
                      result.responseLetter.kind
                        ? `${result.responseLetter.kind} · tap to read, print, or send`
                        : "Tap to read, print, or send"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-600">
                        We drafted a reply you can print, sign, and send. It&apos;s
                        written in English because that&apos;s what the office reads.
                        Fill in anything in [brackets] and check it before sending.
                      </p>
                      {lang.label !== "English" && (
                        <button
                          onClick={() => void translateLetter()}
                          disabled={translatingLetter}
                          className="flex-none rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          {translatingLetter
                            ? "Translating…"
                            : translatedLetter
                            ? "Show English"
                            : `Translate to ${lang.label}`}
                        </button>
                      )}
                    </div>
                    {translatedLetter && (
                      <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
                        Showing {lang.label} translation — send the English version above to the office.
                      </p>
                    )}
                    <pre className="ttf-scroll mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-serif text-sm leading-relaxed text-slate-800">
                      {translatedLetter ?? result.responseLetter.body}
                    </pre>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={copyLetter}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                      >
                        {copiedLetter ? "✓ Copied" : "Copy"}
                      </button>
                      <button
                        onClick={downloadLetter}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Download
                      </button>
                      <button
                        onClick={printLetter}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Print
                      </button>
                    </div>
                  </Collapsible>
                )}

                {result.phoneScript && (
                  <div className="ttf-fade-in rounded-2xl border border-blue-200 bg-blue-50 p-5">
                    <h2 className="text-xl font-bold text-blue-900">
                      📞 What to say when you call
                    </h2>
                    <p className="mt-2 italic leading-relaxed text-blue-900">
                      &ldquo;{result.phoneScript}&rdquo;
                    </p>
                    <div className="mt-4 flex flex-wrap items-start gap-4">
                      {kd?.contactPhone && (
                        <a
                          href={`tel:${kd.contactPhone.replace(/[^+\d]/g, "")}`}
                          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                        >
                          Call {kd.contactPhone}
                        </a>
                      )}
                      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=88x88&format=png&data=${encodeURIComponent(
                            result.phoneScript +
                              (kd?.contactPhone ? `\n\nCall: ${kd.contactPhone}` : ""),
                          )}`}
                          alt="QR code — scan to save the phone script on your phone"
                          width={88}
                          height={88}
                          className="rounded-lg"
                        />
                        <p className="max-w-[120px] text-xs leading-relaxed text-slate-600">
                          Scan to get this script on your phone
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ③ Talk it through & get help */}
            <div className="space-y-4">
              <SectionHeader n={3} title="Practice & Get Support" />

              <Assistant
                context={{
                  documentType: result.documentType,
                  category: result.category,
                  meaning: result.meaning,
                  deadline: result.deadline,
                  whatTheyNeed: result.whatTheyNeed,
                  keyDetails: result.keyDetails,
                }}
                lang={lang}
                simplify={simplify}
                dir={dir}
              />

              {hasDetails && (
                <Collapsible
                  title="Key details"
                  subtitle="Read from your letter by AI — double-check against the original"
                >
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {kd!.sender && <Detail label="From" value={kd!.sender} />}
                    {kd!.contactPhone && (
                      <Detail label="Phone" value={kd!.contactPhone} />
                    )}
                    {kd!.accountNumber && (
                      <Detail label="Account / case #" value={kd!.accountNumber} />
                    )}
                    {kd!.amountDue && <Detail label="Amount" value={kd!.amountDue} />}
                  </dl>
                </Collapsible>
              )}

              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">Real help you can use now</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    ✓ Verified
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  These are real national programs from official sources — not
                  AI-generated. We never invent phone numbers.
                </p>
                <ul className="mt-3 space-y-2">
                  {result.isPossibleScam && (
                    <ResourceRow resource={SCAM_RESOURCE} />
                  )}
                  {result.isCrisis &&
                    CRISIS_RESOURCES.map((r) => (
                      <ResourceRow key={r.name} resource={r} />
                    ))}
                  {RESOURCES[result.category].map((r) => (
                    <ResourceRow key={r.name} resource={r} />
                  ))}
                </ul>
              </div>

              <LocalHelpFinder category={result.category} />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-semibold">⚠️ AI can make mistakes.</span>{" "}
              Always verify critical dates, amounts, and requirements directly on
              your original letter before acting. For legal or immigration
              matters, consult a qualified professional.
            </div>

            <div className="flex justify-center pt-1">
              <button
                onClick={reset}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Explain another letter
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-8 border-t border-slate-200/70 bg-white/50 py-5">
        <div className="mx-auto max-w-2xl px-5 text-center text-xs text-slate-500">
          This tool helps you understand a letter — it is not legal or official
          advice. Always confirm with the office named on your document.
        </div>
      </footer>
    </div>
  );
}

type LocalResource = {
  name: string;
  phone: string | null;
  address: string | null;
  url: string | null;
  desc: string;
};

function LocalHelpFinder({ category }: { category: Category }) {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState<LocalResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function search() {
    if (!state.trim()) return;
    setLoading(true);
    setError(null);
    setResources(null);
    try {
      const res = await fetch("/api/local-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, city: city.trim(), state: state.trim() }),
      });
      const data = (await res.json()) as { resources?: LocalResource[]; error?: string };
      if (res.status === 503) { setUnavailable(true); return; }
      if (!res.ok) { setError(data.error ?? "Search failed."); return; }
      setResources(data.resources ?? []);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (unavailable) return null;

  return (
    <div className="ttf-fade-in overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white shadow-sm">
      <div className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-indigo-100 text-lg">
            🔍
          </span>
          <div>
            <h3 className="font-bold text-slate-900">Find local help near you</h3>
            <p className="text-xs text-slate-500">
              Live web search for{" "}
              <span className="font-medium">{category}</span> programs in your
              area — beyond the national list.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (optional)"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="State *"
            className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
          <button
            onClick={() => void search()}
            disabled={loading || !state.trim()}
            className="flex-none rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40"
          >
            {loading ? <Spinner /> : "Search"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {resources !== null && (
        <div className="border-t border-indigo-100 px-5 pb-5">
          {resources.length === 0 ? (
            <p className="pt-4 text-sm text-slate-500">
              No results found for {city || state}. Try a broader location.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {resources.map((r, i) => (
                <li key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{r.name}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{r.desc}</p>
                      {r.address && (
                        <p className="mt-0.5 text-xs text-slate-400">{r.address}</p>
                      )}
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block break-all text-xs font-medium text-blue-700 underline-offset-2 hover:underline"
                        >
                          {r.url.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </div>
                    {r.phone && (
                      <a
                        href={`tel:${r.phone.replace(/[^+\d]/g, "")}`}
                        className="flex-none rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-slate-100"
                      >
                        Call {r.phone}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-400">
            ⚠️ AI-generated from live web search — verify details before
            calling.
          </p>
        </div>
      )}
    </div>
  );
}

function PersonaCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-2xl">{icon}</span>
      <h3 className="mt-2 font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{desc}</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: "📸",
      label: "Take a photo",
      desc: "Snap or upload any letter, bill, or notice — up to 10 MB.",
    },
    {
      icon: "🤖",
      label: "AI reads it",
      desc: "Extracts every date, name, amount, and warning sign.",
    },
    {
      icon: "🌐",
      label: "Plain language",
      desc: "Explains what it means in 10+ languages.",
    },
    {
      icon: "✅",
      label: "Know what to do",
      desc: "Checklist, reply letter, and phone script — all ready.",
    },
  ];
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">
        How it works
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col items-center text-center">
            <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl">
              {s.icon}
            </span>
            <p className="text-sm font-semibold text-slate-800">{s.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="ttf-fade-in flex items-center gap-2.5 px-1 pt-2">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
        {n}
      </span>
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
    </div>
  );
}

function Collapsible({
  title,
  subtitle,
  icon,
  accent = false,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={`ttf-fade-in group overflow-hidden rounded-2xl shadow-sm [&_summary::-webkit-details-marker]:hidden ${
        accent ? "border-2 border-blue-300 bg-white" : "border border-slate-200 bg-white"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <Chevron />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

function Chevron() {
  return (
    <svg
      className="h-5 w-5 flex-none text-slate-400 transition-transform group-open:rotate-180"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function ResourceRow({ resource }: { resource: Resource }) {
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{resource.name}</p>
          <p className="mt-0.5 text-sm text-slate-600">{resource.desc}</p>
          {resource.url && (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block break-all text-xs font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {resource.url.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
        {resource.phone && (
          <a
            href={`tel:${resource.phone.replace(/[^+\d]/g, "")}`}
            className="flex-none rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Call {resource.phone}
          </a>
        )}
      </div>
    </li>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}

function Logo() {
  return (
    <span
      className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow-sm"
      aria-hidden="true"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 3h8l4 4v14H6z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path
          d="M8.5 12.5l2 2 4-4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="7"
        width="18"
        height="13"
        rx="3"
        stroke="#2563eb"
        strokeWidth="1.6"
      />
      <path d="M8 7l1.5-2.5h5L16 7" stroke="#2563eb" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="13.5" r="3.2" stroke="#2563eb" strokeWidth="1.6" />
    </svg>
  );
}
