export const runtime = "nodejs";
export const maxDuration = 30;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — warm, clear, multilingual
const MODEL_ID = "eleven_multilingual_v2";

// BCP47 prefix → ElevenLabs language_code (ISO 639-1)
// Passing this helps the model dial in pronunciation for each language.
const LANG_CODE: Record<string, string> = {
  en: "en",
  es: "es",
  zh: "zh",
  vi: "vi",
  tl: "fil",
  ar: "ar",
  fr: "fr",
  ht: "fr", // Haitian Creole — closest supported
  ko: "ko",
  ru: "ru",
};

export async function POST(req: Request) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return new Response(null, { status: 404 });
  }

  let text: string;
  let bcp47 = "en";
  try {
    ({ text, bcp47 = "en" } = (await req.json()) as { text: string; bcp47?: string });
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!text?.trim()) return new Response(null, { status: 400 });

  const langPrefix = bcp47.split("-")[0].toLowerCase();
  const languageCode = LANG_CODE[langPrefix] ?? "en";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: decodeEntities(text).slice(0, 2500),
        model_id: MODEL_ID,
        language_code: languageCode,
        voice_settings: {
          stability: 0.38,        // slight variation = more natural prosody
          similarity_boost: 0.82,
          style: 0.32,            // expressiveness for clearer sentence flow
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    console.error("ElevenLabs error:", res.status, await res.text());
    return new Response(null, { status: 502 });
  }

  const audio = await res.arrayBuffer();
  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
