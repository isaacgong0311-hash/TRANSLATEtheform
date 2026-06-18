import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// We never persist the uploaded image. It lives only in memory for the
// duration of this request, then is discarded when the function returns.

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
  documentChecklist: z
    .array(
      z.object({
        item: z.string().describe("A specific document or item to gather, e.g. 'Pay stubs from the last 30 days'."),
        why: z.string().describe("One short phrase on why it is needed, in the chosen language."),
      }),
    )
    .describe(
      "A practical checklist of documents/items the reader should gather to respond. Only include items the letter actually implies. Empty if none.",
    ),
  responseLetter: z
    .object({
      applicable: z
        .boolean()
        .describe("True only if a written reply (appeal, response, or request) would genuinely help the reader respond to this letter."),
      kind: z
        .string()
        .describe("Short label for the letter type in the chosen language, e.g. 'Appeal letter' or 'Response letter'. Empty if not applicable."),
      body: z
        .string()
        .describe(
          "If applicable, a complete, ready-to-send formal letter WRITTEN IN ENGLISH (because the receiving office reads English), filled in with the sender/case number/details visible in the document. Use clearly marked blanks like [Your full name], [Your address], [Today's date] for anything the reader must add. Polite, concise, and correctly structured (date, recipient, subject, body, sign-off). Empty string if not applicable.",
        ),
    })
    .describe("A generated written reply the reader can print, sign, and send."),
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
    .transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v : null))
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
  isCrisis: z
    .boolean()
    .describe(
      "True ONLY if the document involves an immediate safety crisis (eviction within days, utility shutoff, abuse, self-harm, medical emergency).",
    ),
  crisisMessage: z
    .string()
    .describe("If isCrisis is true, a short message telling the reader to seek immediate human help. Otherwise empty."),
});

// A compact, human-readable description of the exact JSON the model must emit.
// We describe the shape in the prompt (rather than relying on Groq's structured
// output mode) because Llama 4 Scout echoes the JSON Schema back instead of data.
const JSON_SHAPE = `{
  "documentType": string,            // short label, e.g. "Medicaid denial letter"
  "category": one of "housing" | "healthcare" | "benefits" | "utilities" | "legal" | "school" | "financial" | "immigration" | "other",
  "confidence": number 0-100,        // be honest; lower it when blurry/cut off/ambiguous
  "whyThisType": string,             // one sentence citing specific words/features you saw
  "urgency": one of "low" | "medium" | "high",
  "meaning": string,                 // plain-language explanation of what the letter means
  "keyDetails": {
    "sender": string or null,
    "contactPhone": string or null,
    "accountNumber": string or null,
    "amountDue": string or null
  },
  "whatTheyNeed": string[],          // things the reader must provide/do; [] if none
  "documentChecklist": [ { "item": string, "why": string } ],  // documents/items to gather; [] if none. "why" in the chosen language
  "responseLetter": {
    "applicable": boolean,           // true only if a written reply would genuinely help
    "kind": string,                  // e.g. "Appeal letter" (in chosen language); "" if not applicable
    "body": string                   // a complete ready-to-send letter IN ENGLISH, filled with visible details, using [bracketed blanks] for what the reader must add; "" if not applicable
  },
  "nextSteps": [ { "step": string, "detail": string } ],
  "phoneScript": string,             // polite 2-4 sentence call script, or "" if no call needed
  "deadline": string or null,        // copied exactly as written, or null
  "deadlineISO": string or null,     // "YYYY-MM-DD" only if a full unambiguous date is visible, else null
  "isPossibleScam": boolean,
  "scamSigns": string[],             // specific warning signs if isPossibleScam, else []
  "isCrisis": boolean,
  "crisisMessage": string            // message to seek immediate help if isCrisis, else ""
}`;

// Strip code fences then use bracket-counting to find the outermost {...}.
// lastIndexOf("}") is unreliable when the model appends prose after the JSON.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  let depth = 0;
  let start = -1;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          start = -1; // try next object if any
        }
      }
    }
  }
  return null;
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
    // Llama 4 Scout on Groq mishandles json_schema/structured-output mode (it
    // echoes the schema instead of data). So we use plain text generation with
    // an explicit JSON-shape instruction, then parse and validate with Zod here.
    const { text } = await generateText({
      model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
      messages: [
        {
          role: "system",
          content: [
            "You help people understand confusing official letters and forms (government benefits, healthcare, housing, school, legal).",
            "Many readers are stressed, low-literacy, or non-native speakers. Be calm, clear, and kind.",
            `Write ALL human-readable output (meaning, steps, scripts, reasons) in ${language}, at a ${
              simplify ? "very simple 3rd-grade reading level — use the shortest, most common words and very short sentences" : "6th-grade reading level"
            }. Keep copied facts like names, numbers, and dates exactly as printed.`,
            "Rules you must follow:",
            "- Never invent facts, deadlines, program names, phone numbers, or account numbers that are not visible in the document.",
            "- If something is unclear or cut off, say so plainly instead of guessing, and lower your confidence score.",
            "- Never state that the reader definitely qualifies or is definitely denied benefits — explain what the letter says and tell them to confirm with the listed office.",
            "- Copy deadlines, dates, amounts, and account numbers exactly as written; do not calculate or assume them.",
            "- Only set deadlineISO when a complete, unambiguous calendar date is visible. If only a relative term like 'within 10 days' appears, leave deadlineISO null.",
            "- For scam detection, only flag real warning signs you can see; do not accuse legitimate official letters of being scams. When unsure, set isPossibleScam to false but you may still mention caution in a next step.",
            "- The phone script must be polite, simple, and something a nervous, non-native speaker could read aloud.",
            "- The responseLetter.body must be written in ENGLISH (the receiving office reads English), even though everything else is in the chosen language. Only fill in facts visible in the document; use [bracketed blanks] for anything the reader must supply. Set applicable to false (and use empty strings) when no written reply makes sense.",
            "- documentChecklist items must be real documents the letter implies the reader needs; never pad the list.",
            "",
            "Respond with ONLY a single valid JSON object — no markdown, no code fences, no text before or after. Use EXACTLY these keys and value types:",
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
