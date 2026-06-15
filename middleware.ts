import { NextRequest, NextResponse } from "next/server";

// Simple per-IP rate limiter using in-memory state.
// Limits protect the Groq / ElevenLabs / Perplexity keys from abuse.
// State lives per function instance (not globally coordinated) which is fine
// for a demo; swap to Vercel KV for multi-instance production hardening.

const WINDOW_MS = 60_000; // 1-minute sliding window
const LIMITS: Record<string, number> = {
  "/api/explain": 10,        // vision + generation — most expensive
  "/api/speak": 30,          // ElevenLabs audio
  "/api/local-help": 10,     // Perplexity search
  "/api/ask": 40,            // chat turn
  "/api/translate-field": 20, // translation
};
const DEFAULT_LIMIT = 60;

type Entry = { count: number; reset: number };
const store = new Map<string, Entry>();

// Prune expired entries every 500 lookups to prevent unbounded growth.
let pruneCounter = 0;
function pruneIfNeeded() {
  if (++pruneCounter < 500) return;
  pruneCounter = 0;
  const now = Date.now();
  for (const [k, v] of store) if (now > v.reset) store.delete(k);
}

function allow(ip: string, path: string): boolean {
  pruneIfNeeded();
  const prefix = Object.keys(LIMITS).find((p) => path.startsWith(p));
  const max = prefix ? LIMITS[prefix] : DEFAULT_LIMIT;
  const key = `${prefix ?? "misc"}:${ip}`;
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/api/") || path === "/api/health") {
    return NextResponse.next();
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!allow(ip, path)) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
