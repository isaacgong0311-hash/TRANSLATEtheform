import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Conversational follow-up, grounded ONLY in the facts we already extracted from
// the user's letter. Two modes:
//  - "ask":      answer questions about the letter, in the reader's language.
//  - "practice": role-play the office on the phone so the reader can rehearse.
// We never re-send the image; we pass the already-verified extracted facts so the
// assistant stays grounded and cannot drift into invented specifics.

type Msg = { role: "user" | "assistant"; content: string };

type Body = {
  language?: string;
  simplify?: boolean;
  mode?: "ask" | "practice";
  context?: {
    documentType?: string;
    category?: string;
    meaning?: string;
    deadline?: string | null;
    whatTheyNeed?: string[];
    keyDetails?: {
      sender?: string | null;
      contactPhone?: string | null;
      accountNumber?: string | null;
      amountDue?: string | null;
    };
  };
  messages?: Msg[];
};

function buildContext(ctx: NonNullable<Body["context"]>): string {
  const kd = ctx.keyDetails ?? {};
  const lines = [
    `Document type: ${ctx.documentType ?? "unknown"}`,
    `Topic area: ${ctx.category ?? "unknown"}`,
    ctx.meaning ? `Plain-language meaning: ${ctx.meaning}` : "",
    kd.sender ? `Sender: ${kd.sender}` : "",
    kd.contactPhone ? `Phone on letter: ${kd.contactPhone}` : "",
    kd.accountNumber ? `Account/case #: ${kd.accountNumber}` : "",
    kd.amountDue ? `Amount: ${kd.amountDue}` : "",
    ctx.deadline ? `Deadline on letter: ${ctx.deadline}` : "",
    ctx.whatTheyNeed?.length ? `They are asking for: ${ctx.whatTheyNeed.join("; ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const language = body.language || "English";
  const simplify = body.simplify === true;
  const mode = body.mode === "practice" ? "practice" : "ask";
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];

  if (!body.context) {
    return Response.json({ error: "Missing letter context." }, { status: 400 });
  }
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "Missing GROQ_API_KEY." }, { status: 500 });
  }

  const contextBlock = buildContext(body.context);
  const level = simplify
    ? "very simple 3rd-grade reading level — shortest words, very short sentences"
    : "6th-grade reading level";

  const shared = [
    `Reply ONLY in ${language}, at a ${level}.`,
    "You may ONLY rely on the letter facts provided below. Never invent phone numbers, dates, dollar amounts, program names, or eligibility outcomes that are not in those facts.",
    "If asked something the letter does not answer, say plainly that the letter does not say, and suggest confirming with the office named on it.",
    "Never tell the user they definitely do or do not qualify for anything.",
    "",
    "LETTER FACTS:",
    contextBlock,
  ];

  const system =
    mode === "practice"
      ? [
          "You are helping a nervous, possibly non-native speaker REHEARSE a phone call to the office that sent this letter, so they feel ready for the real call.",
          "Play the role of a calm, polite, patient clerk at that office. Keep your turns short (1-3 sentences), realistic, and friendly. Ask one thing at a time, as a real clerk would (verify identity politely, ask why they're calling, guide them).",
          "Never be rude or create pressure. This is a safe practice space. If the user seems stuck, gently offer a simple thing they could say.",
          "Begin the first turn by answering the phone as the office.",
          ...shared,
        ].join("\n")
      : [
          "You are a calm, kind helper answering the user's questions about the specific letter they received. Be clear, practical, and reassuring.",
          "Keep answers short and concrete. When useful, tell them exactly what to do next.",
          ...shared,
        ].join("\n");

  try {
    const { text } = await generateText({
      model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    return Response.json({ reply: text.trim() });
  } catch (err) {
    console.error("ask route error:", err);
    return Response.json(
      { error: "Sorry, I couldn't answer just now. Please try again." },
      { status: 502 },
    );
  }
}
