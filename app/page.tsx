"use client";

import { useEffect, useRef, useState } from "react";

type Step = { step: string; detail: string };
type Category =
  | "housing"
  | "healthcare"
  | "benefits"
  | "utilities"
  | "legal"
  | "school"
  | "financial"
  | "immigration"
  | "other";

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
  nextSteps: Step[];
  phoneScript: string;
  deadline: string | null;
  deadlineISO: string | null;
  isPossibleScam: boolean;
  scamSigns: string[];
  isCrisis: boolean;
  crisisMessage: string;
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

// Verified U.S. national help lines. Kept small and accurate on purpose —
// we never invent local numbers we cannot confirm.
const HOTLINES: Record<Category, { name: string; phone: string }[]> = {
  housing: [{ name: "211 — local housing & basic-needs help", phone: "211" }],
  healthcare: [{ name: "211 — local health & benefits help", phone: "211" }],
  benefits: [{ name: "211 — local benefits help", phone: "211" }],
  utilities: [{ name: "211 — utility & energy assistance", phone: "211" }],
  legal: [{ name: "211 — referral to free legal aid", phone: "211" }],
  school: [{ name: "211 — local family & school resources", phone: "211" }],
  financial: [{ name: "211 — financial & basic-needs help", phone: "211" }],
  immigration: [{ name: "211 — local immigrant services referral", phone: "211" }],
  other: [{ name: "211 — connects you to local help", phone: "211" }],
};

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
  "Writing your next steps…",
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
  const previewUrl = useRef<string | null>(null);

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
    setSpeaking(false);
  }

  function readAloud() {
    if (!result || typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) {
      stopSpeaking();
      return;
    }
    const parts = [
      result.meaning,
      result.whatTheyNeed.join(". "),
      ...result.nextSteps.map((s) => `${s.step}. ${s.detail}`),
    ].filter(Boolean);
    const u = new SpeechSynthesisUtterance(parts.join(". "));
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

  const kd = result?.keyDetails;
  const hasDetails =
    kd && (kd.sender || kd.contactPhone || kd.accountNumber || kd.amountDue);

  return (
    <div className="flex min-h-screen flex-col" dir={dir}>
      {/* Crisis accent: a calm but clear signal at the top of the page. */}
      {result?.isCrisis && (
        <div className="h-1.5 w-full bg-red-500" aria-hidden="true" />
      )}

      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <Logo />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight tracking-tight text-slate-900">
              Translate the Form
            </p>
            <p className="truncate text-xs text-slate-500">
              Understand any letter. Know what to do next.
            </p>
          </div>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            <LockIcon /> Private
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Confused by a letter? We&apos;ll explain it.
          </h1>
          <p className="mx-auto mt-2 max-w-md text-base text-slate-600">
            Take a photo of a bill, notice, or form. We&apos;ll tell you what it
            means, warn you if it looks like a scam, and show you exactly what to
            do — in your language.
          </p>
        </div>

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
            className="mt-6 space-y-5"
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

            {hasDetails && (
              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold">Key details</h2>
                <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {kd!.sender && <Detail label="From" value={kd!.sender} />}
                  {kd!.contactPhone && (
                    <Detail label="Phone" value={kd!.contactPhone} />
                  )}
                  {kd!.accountNumber && (
                    <Detail label="Account / case #" value={kd!.accountNumber} />
                  )}
                  {kd!.amountDue && <Detail label="Amount" value={kd!.amountDue} />}
                </dl>
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

            {result.phoneScript && (
              <div className="ttf-fade-in rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <h2 className="text-xl font-bold text-blue-900">
                  📞 What to say when you call
                </h2>
                <p className="mt-2 italic leading-relaxed text-blue-900">
                  &ldquo;{result.phoneScript}&rdquo;
                </p>
                {kd?.contactPhone && (
                  <a
                    href={`tel:${kd.contactPhone.replace(/[^+\d]/g, "")}`}
                    className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  >
                    Call {kd.contactPhone}
                  </a>
                )}
              </div>
            )}

            <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">Where to get more help</h2>
              <ul className="mt-3 space-y-2">
                {HOTLINES[result.category].map((h) => (
                  <li key={h.phone} className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">{h.name}</span>
                    <a
                      href={`tel:${h.phone}`}
                      className="flex-none rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-slate-100"
                    >
                      Call {h.phone}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                211 is a free, confidential U.S. service that connects you to local
                help in many languages, 24/7.
              </p>
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
