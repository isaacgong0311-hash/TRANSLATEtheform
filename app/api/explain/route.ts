import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const ResultSchema = z.object({
  documentType: z
    .string()
    .describe("Short label for what this document is, e.g. 'Medicaid denial letter'."),
  category: z
    .enum([
      "housing",
      "healthcare",
      "benefits",
      "utilities",
      "legal",
      "school",
      "financial",
      "immigration",
      "other",
    ])
    .describe("The life area this document belongs to."),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "How confident you are in the document type, 0-100. Be honest: lower it when the image is blurry, cut off, or ambiguous.",
    ),
  whyThisType: z
    .string()
    .describe(
      "One sentence explaining HOW you identified the type, citing specific words or features you saw (e.g. \"the phrase 'notice to quit' and a court case number\").",
    ),
  urgency: z
    .enum(["low", "medium", "high"])
    .describe("How time-sensitive the document is for the reader."),
  meaning: z
    .string()
    .describe("Plain-language explanation of what this letter means, at a 6th-grade reading level."),
  keyDetails: z
    .object({
      sender: z.string().nullable().describe("Who sent this, if visible."),
      contactPhone: z.string().nullable().describe("Phone number to call, copied exactly, if visible."),
      accountNumber: z.string().nullable().describe("Account/case number, copied exactly, if visible."),
      amountDue: z.string().nullable().describe("Any money amount owed or referenced, copied exactly, if visible."),
    })
    .describe("Key facts pulled from the document. Use null for anything not clearly visible."),
  whatTheyNeed: z
    .array(z.string())
    .describe("Concrete things this document is asking the reader to provide or do. Empty if none."),
  nextSteps: z
    .array(
      z.object({
        step: z.string().describe("Short action title."),
        detail: z.string().describe("One or two sentences on how to do it."),
      }),
    )
    .describe("Ordered, practical next steps the reader should take."),
  phoneScript: z
    .string()
    .describe(
      "If the reader should call someone, a short, polite script (2-4 sentences) of what to say, written in the chosen language. Empty string if no call is needed.",
    ),
  deadline: z
    .string()
    .nullable()
    .describe("Any deadline or important date found, copied exactly as written. Null if none found."),
  deadlineISO: z
    .string()
    .nullable()
    .describe(
      "The deadline as a YYYY-MM-DD date ONLY if a full, unambiguous date is clearly visible in the document. Otherwise null. Never guess or calculate.",
    ),
  isPossibleScam: z
    .boolean()
    .describe(
      "True if the document shows common scam/fraud signals: demands payment by gift card/wire/crypto, threats of arrest, requests for passwords or full SSN, urgent prize claims, mismatched or lookalike sender, or pressure to act in minutes.",
    ),
  scamSigns: z
    .array(z.string())
    .describe("If isPossibleScam is true, the specific warning signs you noticed. Otherwise empty."),
  scamAgencyFacts: z
    .string()
    .describe(
      "If isPossibleScam is true: state briefly what the REAL agency would and would NOT do (e.g. 'The real IRS sends letters by mail first and never demands gift cards or wire transfers. Call the real IRS at 1-800-829-1040 to verify.'). Empty string if not a scam.",
    ),
  isCrisis: z
    .boolean()
    .describe(
      "True ONLY if the document involves an immediate safety crisis (eviction within days, utility shutoff in 24-48h, abuse, self-harm, medical emergency, or ICE enforcement).",
    ),
  crisisMessage: z
    .string()
    .describe("If isCrisis is true, a short message telling the reader to seek immediate human help. Otherwise empty."),
  whatHappensIfNothing: z
    .string()
    .describe(
      "In 1-2 sentences, the likely consequence if the reader takes no action on this document. Be factual and calm, not alarmist. Empty string if no action is required.",
    ),
  photoQualityNote: z
    .string()
    .nullable()
    .describe(
      "If the photo is too dark, blurry, cropped, or otherwise hard to read clearly, describe the specific problem in one sentence so the user knows to retake it. null if the photo quality is fine.",
    ),
  detectedLetterLanguage: z
    .string()
    .nullable()
    .describe(
      "The language the letter itself is written in, e.g. 'English', 'Spanish', 'Chinese'. null if cannot be determined.",
    ),
});

const JSON_SHAPE = `{
  "documentType": string,
  "category": one of "housing" | "healthcare" | "benefits" | "utilities" | "legal" | "school" | "financial" | "immigration" | "other",
  "confidence": number 0-100,
  "whyThisType": string,
  "urgency": one of "low" | "medium" | "high",
  "meaning": string,
  "keyDetails": {
    "sender": string or null,
    "contactPhone": string or null,
    "accountNumber": string or null,
    "amountDue": string or null
  },
  "whatTheyNeed": string[],
  "nextSteps": [ { "step": string, "detail": string } ],
  "phoneScript": string,
  "deadline": string or null,
  "deadlineISO": string or null,
  "isPossibleScam": boolean,
  "scamSigns": string[],
  "scamAgencyFacts": string,
  "isCrisis": boolean,
  "crisisMessage": string,
  "whatHappensIfNothing": string,
  "photoQualityNote": string or null,
  "detectedLetterLanguage": string or null
}`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("image");
  const language = (form.get("language") as string) || "English";
  const simplify = form.get("readingLevel") === "simple";

  if (!(file instanceof File)) {
    return Response.json({ error: "No image was uploaded." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Uploaded file is not an image." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Image is too large (max 10 MB)." }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return Response.json(
      { error: "Missing GROQ_API_KEY. Add it to .env.local — see the README." },
      { status: 500 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const { text } = await generateText({
      model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
      messages: [
        {
          role: "system",
          content: [
            "You help people understand confusing official letters and forms (government benefits, healthcare, housing, school, legal, immigration).",
            "Many readers are stressed, low-literacy, or non-native speakers. Be calm, clear, and kind.",
            `Write ALL human-readable output (meaning, steps, scripts, reasons) in ${language}, at a ${
              simplify
                ? "very simple 3rd-grade reading level — use the shortest, most common words and very short sentences"
                : "6th-grade reading level"
            }. Keep copied facts like names, numbers, and dates exactly as printed.`,
            "Rules you must follow:",
            "- Never invent facts, deadlines, program names, phone numbers, or account numbers not visible in the document.",
            "- If something is unclear or cut off, say so plainly and lower your confidence score.",
            "- Never state that the reader definitely qualifies or is denied benefits — explain what the letter says and tell them to confirm.",
            "- Copy deadlines, dates, amounts, and account numbers exactly as written; never calculate or assume them.",
            "- Only set deadlineISO when a complete, unambiguous calendar date is visible. Relative terms ('within 10 days') → deadlineISO null.",
            "- For scam detection, only flag real warning signs you can see. For scamAgencyFacts, cite what the REAL agency does vs. the scam tactic.",
            "- Hard fallback: if the letter involves eviction, ICE/immigration enforcement, medical emergency, or utility shutoff within 48 hours, set isCrisis true and give the hotline in crisisMessage.",
            "- The phone script must be polite, simple, and readable aloud by a nervous non-native speaker.",
            "- For whatHappensIfNothing: be factual and calm — 'Your account may be closed' not 'You will lose everything'.",
            "- For photoQualityNote: only flag if the photo prevents you from reading key parts. null if acceptable.",
            "",
            "Respond with ONLY a single valid JSON object — no markdown, no code fences, no text before or after:",
            JSON_SHAPE,
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Here is a photo of a letter or form I received. Explain it and tell me what to do. Reply with only the JSON object described above.",
            },
            { type: "image", image: bytes, mediaType: file.type },
          ],
        },
      ],
    });

    const parsed = ResultSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.error("explain route schema error:", parsed.error, "\nraw:", text.slice(0, 2000));
      return Response.json(
        { error: "Could not read this document. Try a clearer, well-lit photo." },
        { status: 502 },
      );
    }

    return Response.json(parsed.data);
  } catch (err) {
    console.error("explain route error:", err);
    return Response.json(
      { error: "Could not read this document. Try a clearer, well-lit photo." },
      { status: 502 },
    );
  }
}
