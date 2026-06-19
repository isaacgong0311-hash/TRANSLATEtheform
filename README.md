# Translate the Form

**Snap a photo of any confusing official letter and find out what it means, what they need from you, and exactly what to do next — in your language.**

USAII Global AI Hackathon 2026 · High School Track · "AI for Everyday Good" · Community Challenge: *Help is Hard to Find — Make Support Obvious*

---

## The problem

Help already exists — food assistance, Medicaid, housing aid, financial aid. People miss it because the *letters* are confusing: dense legalese, English-only, no clear next step. A denial notice or a "respond by" letter is the exact moment help becomes invisible. We make that moment readable.

## What it does

1. You photograph a letter (benefits, healthcare, housing, school, legal).
2. A vision AI reads it and returns, in plain language **in your chosen language**:
   - **What this means** (with a **read-aloud** button for low-literacy / low-vision users)
   - **Why I think this** + a **confidence score** (explainable AI)
   - **Key details** pulled out: sender, phone, account/case #, amount
   - **What they need from you**, plus an **interactive document checklist** you can tick off as you gather each item
   - **A reply, already written for you** — a complete, ready-to-print response/appeal letter in English (the language the office reads), filled with your letter's details, with **Copy / Download / Print** buttons. This is the part a chatbot won't hand you.
   - **A phone script** — exactly what to say when you call, in your language
   - **Talk it through (voice)** — a grounded assistant that does two things, hands-free, in your language: **Ask a question** about *your specific* letter, and **Practice the call** — the AI role-plays the office clerk on the phone so you can rehearse the scary call out loud before making it for real. Speak with your voice; it speaks back. It only knows the facts we read from your letter, so it can't wander off and invent specifics.
   - **Important dates** with one-tap **add-to-calendar**, plus an **urgency** badge
   - A **scam/fraud warning** when the letter shows known red flags
   - **Real, verified help** — a curated directory of *official* national programs (HUD, LIHEAP, Medicaid, USCIS, CFPB, 211, 988…) matched to the letter's topic, with real phone numbers and source links. These come from a hand-checked list, **never invented by the model.**

### Why this isn't "just ChatGPT with a photo"
- **Grounded, not guessed.** Every recommended contact comes from a verified directory in the codebase — a general chatbot will happily hallucinate a plausible-looking phone number. We separate facts *read from your letter* (AI, double-check it) from *verified directory* help (official sources).
- **It produces the artifact, not just advice.** The hard part of getting help isn't understanding the letter — it's *responding* to it. We generate the actual reply letter, ready to send.
- **It rehearses the hard part with you.** Beyond text, you can *practice the phone call out loud* — the AI plays the clerk, in your language, grounded only in your letter's facts. A general chatbot won't put you in the chair before the real call.
- **Built for the people support is hard to find for** — non-English speakers, low-literacy and low-vision users — with translation, read-aloud, an extra-simple reading level, and right-to-left support.

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
Input: a photo of an official letter plus a chosen language. The image goes to a vision LLM (Groq's Llama 4 Scout) via the Vercel AI SDK. A constrained system prompt makes the model return a typed JSON object validated with Zod: document type + category, a confidence score and reasoning, urgency, extracted entities, plain-language meaning, a document checklist, an ordered step list, a phone script, a verbatim deadline, scam + crisis flags, and a complete ready-to-send English reply letter. The app then GROUNDS its recommendations: instead of letting the model invent help-line numbers, it maps the detected category to a hand-verified directory of official national programs. The frontend renders cards, an interactive checklist, the printable reply letter, read-aloud, and add-to-calendar.

### Human-in-the-Loop (≤500 chars)
The eligibility decision stays with humans. The AI never tells a user they "qualify" or are "denied" — it explains what the letter says and always directs them to confirm with the office named on the document. Deadlines are copied exactly, never calculated, and the UI explicitly asks the user to re-check the date on the original letter before acting. The user, not the model, takes the final step.

### Responsible AI Guardrail (≤500 chars)
Risk: a stressed user could over-trust an AI summary of a sensitive document. Mitigations: (1) recommended help-lines come from a hand-verified directory in the code, never generated by the model, so we can't hallucinate a fake phone number — and the UI labels what was "read from your letter" vs. "verified official source"; (2) the model never invents dates or contacts, and lowers its shown confidence when text is unclear; (3) images are never stored — read once in memory; (4) a scam detector warns before the user sends money or data; (5) crisis cases surface immediate human help; (6) eligibility stays with humans; the generated reply letter uses [bracketed blanks] the user must fill and review before sending.

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
3. **1:15 Demo** — photograph the letter → switch language to Spanish → cards appear; tap **read-aloud**; open **Practice the call** and rehearse out loud with the AI clerk in Spanish; show **add-to-calendar**.
4. **2:30 The "wow"** — scan a fake IRS/gift-card letter → the **scam warning** fires with the exact red flags. This is your memorable moment.
5. **3:30 Responsible AI** — no storage, no invented facts, confidence score, human confirms eligibility, crisis escalation.
6. **4:15 Impact** — who this reaches (non-English families, low-literacy, seniors) and why it scales for free via 211.
