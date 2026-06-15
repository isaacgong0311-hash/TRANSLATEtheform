export const runtime = "nodejs";
export const maxDuration = 30;

// Decode HTML entities so ElevenLabs doesn't read "&apos;" or "&amp;" aloud.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ElevenLabs text-to-speech proxy.
// Returns audio/mpeg so the frontend can play it via the Audio API.
// Falls back gracefully: if ELEVENLABS_API_KEY is absent, returns 404
// and the frontend degrades to browser SpeechSynthesis.

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — natural across languages
const MODEL_ID = "eleven_multilingual_v2"; // supports ES, ZH, VI, AR, KO, FR, TL, RU

export async function POST(req: Request) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return new Response(null, { status: 404 });
  }

  let text: string;
  try {
    ({ text } = (await req.json()) as { text: string });
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!text?.trim()) return new Response(null, { status: 400 });

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
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.0,
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
