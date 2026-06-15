export const runtime = "nodejs";
export const maxDuration = 30;

// Perplexity Sonar (web-search-grounded) API.
// Finds real local social service resources for the user's city/state.
// Falls back with 503 if PERPLEXITY_API_KEY is absent.

type LocalResource = {
  name: string;
  phone: string | null;
  address: string | null;
  url: string | null;
  desc: string;
};

function extractJson(text: string): LocalResource[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    return JSON.parse(m[0]) as LocalResource[];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  if (!process.env.PERPLEXITY_API_KEY) {
    return Response.json({ error: "Local search unavailable." }, { status: 503 });
  }

  let body: { category?: string; city?: string; state?: string; language?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Sanitize: strip characters that could alter the prompt structure.
  const sanitize = (s: string) =>
    s.replace(/[^\w\s,.\-']/g, "").slice(0, 60).trim();

  const category = sanitize(body.category ?? "general") || "general";
  const city = sanitize(body.city ?? "");
  const state = sanitize(body.state ?? "");

  if (!state) {
    return Response.json({ error: "State is required." }, { status: 400 });
  }

  const location = city ? `${city}, ${state}` : state;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "You are a social-services directory assistant. Return ONLY a valid JSON array — no prose, no markdown, no code fences. Each element: {\"name\":string, \"phone\":string|null, \"address\":string|null, \"url\":string|null, \"desc\":string}. Include up to 5 real, currently-operating local programs. Set phone/address/url to null if you are not certain — never fabricate contact details.",
        },
        {
          role: "user",
          content: `Find real local ${category} assistance programs for low-income residents in ${location}. Include community nonprofits, local government offices, food banks, legal aid, or community action agencies relevant to "${category}". Return JSON only.`,
        },
      ],
      search_recency_filter: "month",
      return_citations: false,
    }),
  });

  if (!res.ok) {
    console.error("Perplexity error:", res.status);
    return Response.json({ error: "Search failed. Try again." }, { status: 502 });
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "[]";
  const resources = extractJson(content);

  return Response.json({ resources });
}
