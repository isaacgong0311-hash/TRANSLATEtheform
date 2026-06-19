"use client";

import { useEffect, useRef, useState } from "react";
import { getBenefitsForCategory } from "./lib/benefits";

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
  scamAgencyFacts: string;
  isCrisis: boolean;
  crisisMessage: string;
  whatHappensIfNothing: string;
  photoQualityNote: string | null;
  detectedLetterLanguage: string | null;
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
  "Finding important dates…",
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

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(y, m - 1, d);
  return Math.ceil((target.getTime() - todayMid.getTime()) / 86_400_000);
}

async function checkPhotoQuality(file: File): Promise<"ok" | "dark"> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const W = 150,
        H = 150;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve("ok");
        return;
      }
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
      URL.revokeObjectURL(url);
      resolve(sum / (data.length / 4) < 60 ? "dark" : "ok");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("ok");
    };
    img.src = url;
  });
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
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [zip, setZip] = useState("");
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [scamExpanded, setScamExpanded] = useState(false);
  const [photoQuality, setPhotoQuality] = useState<"ok" | "dark">("ok");
  const [whyNotOpen, setWhyNotOpen] = useState(false);
  const previewUrl = useRef<string | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);

  const lang = LANGUAGES.find((l) => l.label === language) ?? LANGUAGES[0];
  const dir = RTL_LANGS.has(lang.bcp47) ? "rtl" : "ltr";

  // Auto-detect browser language on first load
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const code = (navigator.language || navigator.languages?.[0] || "en")
      .split("-")[0]
      .toLowerCase();
    const match = LANGUAGES.find(
      (l) => l.bcp47 === code || l.bcp47.split("-")[0] === code,
    );
    if (match) setLanguage(match.label);
  }, []);

  // Restore accessibility prefs
  useEffect(() => {
    try {
      if (localStorage.getItem("lantern-hc") === "1") setHighContrast(true);
      if (localStorage.getItem("lantern-lt") === "1") setLargeText(true);
    } catch {
      /* ignore */
    }
  }, []);

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

  function toggleHC() {
    const next = !highContrast;
    setHighContrast(next);
    try {
      localStorage.setItem("lantern-hc", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function toggleLT() {
    const next = !largeText;
    setLargeText(next);
    try {
      localStorage.setItem("lantern-lt", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(f);
    previewUrl.current = url;
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(url);
    const quality = await checkPhotoQuality(f);
    setPhotoQuality(quality);
  }

  async function explain() {
    if (!file) return;
    stopSpeaking();
    setLoadingMsg(0);
    setLoading(true);
    setError(null);
    setResult(null);
    setScamExpanded(false);
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
        setTimeout(
          () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          150,
        );
      }
    } catch {
      setError(
        "We couldn't reach the server. Please check your connection and try again.",
      );
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
      setPhotoQuality("ok");
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
    setPhotoQuality("ok");
    setScamExpanded(false);
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
      result.whatHappensIfNothing,
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
  const benefits = result ? getBenefitsForCategory(result.category) : [];
  const deadlineDays = result?.deadlineISO ? daysUntil(result.deadlineISO) : null;

  const deadlineAccent =
    deadlineDays === null
      ? ""
      : deadlineDays < 0
        ? "text-red-700 font-bold"
        : deadlineDays <= 7
          ? "text-red-700 font-semibold"
          : deadlineDays <= 30
            ? "text-amber-700 font-semibold"
            : "text-emerald-700 font-medium";

  const deadlineLabel =
    deadlineDays === null
      ? ""
      : deadlineDays < 0
        ? `Past due by ${Math.abs(deadlineDays)} day${Math.abs(deadlineDays) !== 1 ? "s" : ""}`
        : deadlineDays === 0
          ? "Due today!"
          : deadlineDays === 1
            ? "Tomorrow!"
            : `${deadlineDays} days away`;

  return (
    <div
      className="flex min-h-screen flex-col"
      dir={dir}
      data-hc={highContrast ? "true" : undefined}
      data-lt={largeText ? "true" : undefined}
    >
      {result?.isCrisis && <div className="h-1.5 w-full bg-red-500" aria-hidden="true" />}

      {/* Header */}
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <Logo />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight tracking-tight text-slate-900">
              Translate the Form
            </p>
            <p className="truncate text-xs text-slate-500">
              Understand any letter. Know what to do next.
            </p>
          </div>
          <div className="ms-auto flex items-center gap-1.5">
            <button
              onClick={toggleLT}
              aria-pressed={largeText}
              title={largeText ? "Restore normal text size" : "Make text larger"}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                largeText
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              A+
            </button>
            <button
              onClick={toggleHC}
              aria-pressed={highContrast}
              title={highContrast ? "Restore normal contrast" : "High contrast mode"}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                highContrast
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              ◐
            </button>
            <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <LockIcon /> Private
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        {/* Hero */}
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Confused by a letter?
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-base text-slate-600">
            Photo → plain explanation → next steps → scam check → benefits — in your language.
          </p>
        </div>

        {/* Upload card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md ring-1 ring-black/[0.03] print:hidden">

          {/* Language */}
          <label
            htmlFor="language"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Language for the explanation
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

          {/* Reading level */}
          <span className="mb-1 block text-sm font-medium text-slate-700">
            How simple should the words be?
          </span>
          <div
            role="group"
            aria-label="Reading level"
            className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"
          >
            {(
              [
                { label: "Normal", val: false },
                { label: "Extra simple", val: true },
              ] as const
            ).map(({ label, val }) => (
              <button
                key={label}
                type="button"
                onClick={() => setSimplify(val)}
                aria-pressed={simplify === val}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  simplify === val
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ZIP code */}
          <label
            htmlFor="zip"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            ZIP code{" "}
            <span className="font-normal text-slate-400">
              (optional — for local benefit programs)
            </span>
          </label>
          <input
            id="zip"
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="e.g. 90210"
            className="mb-4 w-36 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />

          {/* Drop zone */}
          {!preview && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center transition hover:border-blue-600 hover:bg-blue-50 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600">
              <CameraIcon />
              <span className="mt-3 text-base font-semibold text-slate-800">
                Take a photo or upload your letter
              </span>
              <span className="mt-1 text-sm text-slate-500">JPG or PNG, up to 10 MB</span>
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
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={loadSample}
                className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Don&apos;t have a letter? Try a sample
              </button>
            </div>
          )}

          {/* Photo quality warning */}
          {photoQuality === "dark" && preview && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              <span aria-hidden="true">📷</span>
              This photo looks dark. Move to a brighter spot or turn on more lights, then retake it for a better result.
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="The letter you uploaded"
                className="max-h-64 w-full rounded-xl border border-slate-200 object-contain"
              />
              <div className="flex gap-3">
                <button
                  onClick={explain}
                  disabled={loading}
                  aria-busy={loading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
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

          {/* Privacy explainer accordion */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              onClick={() => setPrivacyOpen((o) => !o)}
              className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-expanded={privacyOpen}
            >
              <LockIcon />
              <span>How your photo is used — exactly</span>
              <ChevronIcon open={privacyOpen} />
            </button>
            {privacyOpen && (
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-xs text-slate-500">
                <li>You take a photo and tap &ldquo;Explain this letter.&rdquo;</li>
                <li>
                  The photo travels directly to the AI model to read — like handing it to a trusted reader.
                  No human sees it.
                </li>
                <li>The AI produces your explanation and the photo is discarded immediately.</li>
                <li>We never store, log, or share your photo or its contents.</li>
                <li>Your explanation appears only on your screen and is never saved to any server.</li>
                <li>No account or login is required. We collect nothing about you.</li>
              </ol>
            )}
          </div>
        </div>

        <div aria-live="polite" className="sr-only">
          {loading ? LOADING_MESSAGES[loadingMsg] : ""}
        </div>

        {error && (
          <div
            role="alert"
            className="ttf-fade-in mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            <span aria-hidden="true">⚠️</span>
            <div>
              <p className="font-semibold">We hit a snag</p>
              <p className="mt-0.5 text-sm">{error}</p>
              <p className="mt-1 text-sm">
                Try a clearer, well-lit photo — or{" "}
                <button onClick={loadSample} className="underline">
                  use the sample letter
                </button>
                .
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <section
            ref={resultsRef}
            className="mt-5 space-y-4"
            lang={lang.bcp47}
            aria-label="Explanation of your letter"
          >
            {/* Human-in-the-loop banner */}
            <div className="ttf-fade-in flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span aria-hidden="true" className="mt-0.5 flex-none">
                🔍
              </span>
              <p>
                <strong>Lantern explains — it doesn&apos;t decide.</strong> Always confirm
                what to do with the office named on your letter.
              </p>
            </div>

            {/* Photo quality note from AI */}
            {result.photoQualityNote && (
              <div
                role="alert"
                className="ttf-fade-in flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                <span aria-hidden="true" className="flex-none">
                  📷
                </span>
                <p>
                  {result.photoQualityNote} — retake with better lighting for a more
                  accurate result.
                </p>
              </div>
            )}

            {/* Scam warning */}
            {result.isPossibleScam && (
              <div
                role="alert"
                className="ttf-fade-in rounded-2xl border-2 border-orange-500 bg-orange-50 p-4"
              >
                <p className="font-bold text-orange-900">
                  🚩 This may be a scam — please be careful
                </p>
                {result.scamSigns.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-orange-900">
                    {result.scamSigns.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setScamExpanded((o) => !o)}
                  className="mt-2 flex items-center gap-1 text-sm font-semibold text-orange-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  aria-expanded={scamExpanded}
                >
                  <ChevronIcon open={scamExpanded} />
                  {scamExpanded ? "Hide details" : "Why we flagged this"}
                </button>
                {scamExpanded && result.scamAgencyFacts && (
                  <div className="mt-2 rounded-xl border border-orange-200 bg-white/70 p-3 text-sm text-orange-900">
                    {result.scamAgencyFacts}
                  </div>
                )}
                <p className="mt-3 text-sm text-orange-800">
                  <strong>Safe step:</strong> Do not send money, gift cards, or personal
                  information. Look up the organization&apos;s official number yourself and call
                  to verify.
                </p>
              </div>
            )}

            {/* Crisis alert */}
            {result.isCrisis && result.crisisMessage && (
              <div
                role="alert"
                className="ttf-fade-in rounded-2xl border-2 border-red-400 bg-red-50 p-4"
              >
                <p className="font-semibold text-red-800">⚠️ This needs immediate attention</p>
                <p className="mt-1 text-red-800">{result.crisisMessage}</p>
              </div>
            )}

            {/* What this means */}
            <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  {result.documentType}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${URGENCY_STYLES[result.urgency]}`}
                >
                  {URGENCY_LABEL[result.urgency]}
                </span>
                {result.detectedLetterLanguage &&
                  result.detectedLetterLanguage.toLowerCase() !== "english" && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      Letter in: {result.detectedLetterLanguage}
                    </span>
                  )}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-slate-900">What this means</h2>
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
                {result.confidence < 50 && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-800">
                    ⚠️ Low confidence — the photo may be blurry or cut off. Retake it in
                    better light, or call 211 for a human helper.
                  </p>
                )}
              </div>
            </div>

            {/* Key details */}
            {hasDetails && (
              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">Key details</h2>
                <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {kd!.sender && <Detail label="From" value={kd!.sender} />}
                  {kd!.contactPhone && <Detail label="Phone" value={kd!.contactPhone} />}
                  {kd!.accountNumber && (
                    <Detail label="Account / case #" value={kd!.accountNumber} />
                  )}
                  {kd!.amountDue && <Detail label="Amount" value={kd!.amountDue} />}
                </dl>
              </div>
            )}

            {/* Deadline with countdown */}
            {result.deadline && (
              <div className="ttf-fade-in rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <p className="font-semibold text-amber-900">📅 Important deadline</p>
                <p className="mt-1 text-amber-900">{result.deadline}</p>
                {deadlineDays !== null && (
                  <p className={`mt-1 text-sm ${deadlineAccent}`}>{deadlineLabel}</p>
                )}
                <p className="mt-1.5 text-xs text-amber-700">
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

            {/* What they need */}
            {result.whatTheyNeed.length > 0 && (
              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">What they need from you</h2>
                <ul className="mt-3 space-y-2">
                  {result.whatTheyNeed.map((item, i) => (
                    <li key={i} className="flex gap-2 text-slate-700">
                      <span className="text-blue-700" aria-hidden="true">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next steps */}
            {result.nextSteps.length > 0 && (
              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">Your next steps</h2>
                <ol className="mt-3 space-y-4">
                  {result.nextSteps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">
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

            {/* What happens if you do nothing */}
            {result.whatHappensIfNothing && (
              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-800">
                  ❓ What happens if you do nothing?
                </p>
                <p className="mt-1 text-slate-700">{result.whatHappensIfNothing}</p>
              </div>
            )}

            {/* Phone script */}
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
                    className="mt-3 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  >
                    Call {kd.contactPhone}
                  </a>
                )}
              </div>
            )}

            {/* Benefits finder */}
            {benefits.length > 0 && (
              <div className="ttf-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">
                  Programs you may qualify for
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Official federal .gov programs and national nonprofits only — no invented
                  results.
                  {zip && (
                    <>
                      {" "}
                      Call 211 and give them your ZIP code ({zip}) for local options in your
                      area.
                    </>
                  )}
                </p>
                <ul className="mt-3 space-y-3">
                  {benefits.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{b.name}</p>
                          <p className="mt-0.5 text-sm text-slate-600">{b.shortDesc}</p>
                          {b.windowNote && (
                            <p className="mt-1 text-xs text-amber-700">⏰ {b.windowNote}</p>
                          )}
                        </div>
                        <div className="flex flex-none flex-col items-end gap-1.5 text-xs">
                          <a
                            href={b.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            Source ↗
                          </a>
                          <a
                            href={b.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            Apply ↗
                          </a>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-500">
                  These programs commonly apply to {result.category} letters. Eligibility
                  varies — confirm with each program.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 pb-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                📄 Print / Save as PDF
              </button>
              <button
                onClick={reset}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Explain another letter
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-6 border-t border-slate-200/70 bg-white/50 py-5 print:hidden">
        <div className="mx-auto max-w-2xl space-y-2 px-5 text-center">
          <p className="text-xs text-slate-500">
            Lantern explains letters — it is not legal or official advice. Always confirm
            with the office named on your document.
          </p>
          <button
            onClick={() => setWhyNotOpen((o) => !o)}
            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline focus-visible:outline-none"
          >
            Why not just paste it into ChatGPT?
          </button>
          {whyNotOpen && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-left text-xs text-slate-600 space-y-2">
              <p>
                <strong>Non-English letters</strong> — Lantern reads the letter directly
                from a photo; you don&apos;t have to type anything.
              </p>
              <p>
                <strong>Scam-aware</strong> — we specifically flag fraud signals and tell
                you exactly what real agencies do vs. what scammers do.
              </p>
              <p>
                <strong>Action-oriented</strong> — you get next steps, a phone script, a
                calendar reminder, and matched benefits — not just a summary.
              </p>
              <p>
                <strong>Privacy-first</strong> — no account, no chat history, photo
                discarded immediately, nothing stored.
              </p>
              <p>
                <strong>Grounded benefits</strong> — programs link to official .gov sources,
                not generated from memory.
              </p>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
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

function Logo() {
  return (
    <span
      className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-emerald-500 text-white shadow-sm"
      aria-hidden="true"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 3h8l4 4v14H6z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M14 3v4h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
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
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="3" stroke="#1d4ed8" strokeWidth="1.6" />
      <path
        d="M8 7l1.5-2.5h5L16 7"
        stroke="#1d4ed8"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" stroke="#1d4ed8" strokeWidth="1.6" />
    </svg>
  );
}
