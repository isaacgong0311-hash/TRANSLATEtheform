export const runtime = "nodejs";

export async function GET() {
  const keys = {
    groq: !!process.env.GROQ_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    perplexity: !!process.env.PERPLEXITY_API_KEY,
  };
  const allRequired = keys.groq;
  return Response.json(
    {
      status: allRequired ? "ok" : "degraded",
      keys,
      ts: new Date().toISOString(),
    },
    { status: allRequired ? 200 : 503 },
  );
}
