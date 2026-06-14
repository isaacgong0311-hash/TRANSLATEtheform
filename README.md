# Translate the Form

**Snap a photo of any confusing official letter and find out what it means, what they need from you, and exactly what to do next — in your language.**

USAII Global AI Hackathon 2026 · High School Track · "AI for Everyday Good" · Community Challenge: *Help is Hard to Find — Make Support Obvious*

---

## The problem

Help already exists — food assistance, Medicaid, housing aid, financial aid. People miss it because the *letters* are confusing: dense legalese, English-only, no clear next step. A denial notice or a "respond by" letter is the exact moment help becomes invisible. We make that moment readable.

## What it does

1. You photograph a letter (benefits, healthcare, housing, school, legal).
2. A vision AI reads it and returns four things in plain, 6th-grade language **in your chosen language**:
   - **What this means** (with a **read-aloud** button for low-literacy / low-vision users)
   - **Why I think this** + a **confidence score** (explainable AI)
   - **Key details** pulled out: sender, phone, account/case #, amount
   - **What they need from you** and numbered **next steps**
   - **A phone script** — exactly what to say when you call, in your language
   - **Important dates** with one-tap **add-to-calendar**, plus an **urgency** badge
   - A **scam/fraud warning** when the letter shows known red flags
   - A **crisis flag** for emergencies, and **211** help-line referrals by topic

## Run it locally

```bash
npm install
cp .env.local.example .env.local   # then paste your free key
npm run dev                          # http://localhost:3000
```

Get a free API key at https://console.groq.com/keys (Groq — free tier covers the demo).

## Tech

- Next.js 16 (App Router) + TypeScript + Tailwind
- Vercel AI SDK v6 → Groq Llama 4 Scout (vision), JSON output validated with Zod
- No database. The uploaded image is read once in memory and never stored.

---

## Submission field drafts (copy-paste into Devpost)

> Character counts are within the limits in the brief. Tweak wording to your voice.

### Title
Translate the Form

### Tagline
Understand any confusing official letter — and know what to do next — in your language.

### AI Architecture (≤600 chars)
Input: a photo of an official letter plus a chosen language. The image goes to a vision LLM (Groq's Llama 4 Scout) via the Vercel AI SDK. A constrained system prompt makes the model return a typed JSON object validated with Zod: document type + category, a confidence score and the reasoning behind it, urgency, extracted entities (sender, phone, account, amount), plain-language meaning, required items, ordered steps, a phone script, a verbatim deadline (and ISO date if unambiguous), and scam + crisis flags. The frontend renders cards, read-aloud, and add-to-calendar.

### Human-in-the-Loop (≤500 chars)
The eligibility decision stays with humans. The AI never tells a user they "qualify" or are "denied" — it explains what the letter says and always directs them to confirm with the office named on the document. Deadlines are copied exactly, never calculated, and the UI explicitly asks the user to re-check the date on the original letter before acting. The user, not the model, takes the final step.

### Responsible AI Guardrail (≤500 chars)
Risk: a stressed user could over-trust an AI summary of a sensitive document. Mitigations: (1) the model never invents programs, dates, or contacts not visible, and lowers its shown confidence score when text is unclear; (2) images are never stored — read once in memory; (3) a scam detector warns before the user sends money or data; (4) crisis cases surface a banner urging immediate human help; (5) eligibility stays with humans, and a standing disclaimer notes this is understanding, not legal advice.

### AI Tools Used (≤800 chars)
- Groq Llama 4 Scout — vision + language model that reads the letter and generates the explanation. FREE tier (Groq Cloud).
- Vercel AI SDK v6 (`ai`, `@ai-sdk/groq`) — open-source library for calling the model and parsing its output. FREE.
- Zod — open-source schema validation for the AI's JSON output. FREE.
- Next.js 16 + Tailwind CSS — open-source web framework and styling. FREE.
- Deployed on Vercel free Hobby tier. FREE.
No paid AI tools were used.

### Data Sources (≤800 chars)
The app uses no external dataset and no training data of our own. The only data processed is the single letter image the user chooses to upload, supplied at runtime. That image is held in memory for one request and never written to disk, logged, or stored. For testing we used sample/redacted letters and publicly available example government notices — no real personal data from third parties. No user data is collected, retained, or shared.

### Pitch video outline (3–5 min)
1. **0:00 Hook** — hold up a real, scary-looking denial letter. "Imagine this came for your family, and English isn't your first language."
2. **0:30 Problem** — help exists; the letter is the wall. Cite how confusing systems block people.
3. **1:15 Demo** — photograph the letter → switch language to Spanish → cards appear; tap **read-aloud**; show the **phone script** and **add-to-calendar**.
4. **2:30 The "wow"** — scan a fake IRS/gift-card letter → the **scam warning** fires with the exact red flags. This is your memorable moment.
5. **3:30 Responsible AI** — no storage, no invented facts, confidence score, human confirms eligibility, crisis escalation.
6. **4:15 Impact** — who this reaches (non-English families, low-literacy, seniors) and why it scales for free via 211.
