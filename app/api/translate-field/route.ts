import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 20;

// Translates a single text block (e.g. the English reply letter) to the
// user's chosen language so they can understand it before sending.
// Bracketed placeholders like [Your name] are preserved verbatim.

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "Missing GROQ_API_KEY." }, { status: 500 });
  }

  let body: { text?: string; language?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = body.text?.trim();
  const language = body.language?.trim() || "English";

  if (!text) return Response.json({ error: "No text provided." }, { status: 400 });
  if (language === "English")
    return Response.json({ translation: text }); // no-op

  try {
    const { text: translation } = await generateText({
      model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
      messages: [
        {
          role: "system",
          content: [
            `Translate the following text to ${language}.`,
            "Preserve all formatting, line breaks, and punctuation.",
            "Keep every bracketed placeholder exactly as written — e.g. [Your full name], [Today's date]. Do NOT translate the text inside brackets.",
            "Output ONLY the translation — no preamble, no explanation.",
          ].join("\n"),
        },
        { role: "user", content: text.slice(0, 6000) },
      ],
    });
    return Response.json({ translation: translation.trim() });
  } catch (err) {
    console.error("translate-field error:", err);
    return Response.json({ error: "Translation failed." }, { status: 502 });
  }
}
