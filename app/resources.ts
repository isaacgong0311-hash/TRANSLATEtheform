// Verified U.S. national help resources, curated by hand from official sources.
//
// This is the project's "grounded" layer: the AI reads the letter, but the
// contacts and programs we recommend come from THIS hand-checked list — never
// from the model. That is the core trust difference vs. a general chatbot,
// which will happily invent plausible-looking phone numbers.
//
// Every phone number and URL below is a real, national, public resource.

export type Category =
  | "housing"
  | "healthcare"
  | "benefits"
  | "utilities"
  | "legal"
  | "school"
  | "financial"
  | "immigration"
  | "other";

export type Resource = {
  name: string;
  desc: string;
  phone?: string;
  url?: string;
};

// Shown for every category — the universal front door to local help.
const TWO_ONE_ONE: Resource = {
  name: "211",
  desc: "Free, confidential 24/7 line that connects you to local help in many languages.",
  phone: "211",
  url: "https://www.211.org",
};

export const RESOURCES: Record<Category, Resource[]> = {
  housing: [
    {
      name: "HUD Housing Counseling",
      desc: "Free HUD-approved counselors for rent, eviction, and foreclosure help.",
      phone: "1-800-569-4287",
      url: "https://www.hud.gov/findacounselor",
    },
    {
      name: "LawHelp.org",
      desc: "Find free legal aid near you for eviction and housing disputes.",
      url: "https://www.lawhelp.org",
    },
    TWO_ONE_ONE,
  ],
  healthcare: [
    {
      name: "Health Insurance Marketplace",
      desc: "Help with Medicaid, CHIP, and Marketplace health coverage.",
      phone: "1-800-318-2596",
      url: "https://www.healthcare.gov",
    },
    {
      name: "Medicaid.gov",
      desc: "Official Medicaid info and links to your state's Medicaid office.",
      url: "https://www.medicaid.gov",
    },
    TWO_ONE_ONE,
  ],
  benefits: [
    {
      name: "National Hunger Hotline",
      desc: "Help finding food assistance and SNAP/food-stamp resources.",
      phone: "1-866-348-6479",
      url: "https://www.fns.usda.gov/snap",
    },
    {
      name: "Benefits.gov",
      desc: "Official tool to find government benefits you may qualify for.",
      url: "https://www.benefits.gov",
    },
    TWO_ONE_ONE,
  ],
  utilities: [
    {
      name: "LIHEAP Energy Assistance (NEAR)",
      desc: "Help paying heating, cooling, and utility bills.",
      phone: "1-866-674-6327",
      url: "https://www.acf.hhs.gov/ocs/programs/liheap",
    },
    TWO_ONE_ONE,
  ],
  legal: [
    {
      name: "LawHelp.org",
      desc: "Find free or low-cost legal aid programs near you.",
      url: "https://www.lawhelp.org",
    },
    {
      name: "Legal Services Corporation",
      desc: "Directory of nonprofit legal-aid offices nationwide.",
      url: "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help",
    },
    TWO_ONE_ONE,
  ],
  school: [
    {
      name: "Federal Student Aid",
      desc: "Help with FAFSA, student loans, and college financial aid.",
      phone: "1-800-433-3243",
      url: "https://studentaid.gov",
    },
    TWO_ONE_ONE,
  ],
  financial: [
    {
      name: "Consumer Financial Protection Bureau",
      desc: "Help with debts, bills, and complaints against financial companies.",
      phone: "1-855-411-2372",
      url: "https://www.consumerfinance.gov/complaint",
    },
    {
      name: "National Foundation for Credit Counseling",
      desc: "Free and low-cost nonprofit credit and debt counseling.",
      phone: "1-800-388-2227",
      url: "https://www.nfcc.org",
    },
    TWO_ONE_ONE,
  ],
  immigration: [
    {
      name: "USCIS Contact Center",
      desc: "Official help with immigration cases, notices, and appointments.",
      phone: "1-800-375-5283",
      url: "https://www.uscis.gov",
    },
    {
      name: "National Immigration Legal Services Directory",
      desc: "Find trusted, low-cost immigration legal help near you.",
      url: "https://www.immigrationadvocates.org/nonprofit/legaldirectory",
    },
    TWO_ONE_ONE,
  ],
  other: [TWO_ONE_ONE],
};

// Surfaced only when the AI flags a safety crisis — regardless of category.
export const CRISIS_RESOURCES: Resource[] = [
  {
    name: "988 Suicide & Crisis Lifeline",
    desc: "Free, 24/7 support for mental-health or suicidal crisis. Call or text 988.",
    phone: "988",
    url: "https://988lifeline.org",
  },
  {
    name: "National Domestic Violence Hotline",
    desc: "Confidential 24/7 support for anyone facing abuse or feeling unsafe.",
    phone: "1-800-799-7233",
    url: "https://www.thehotline.org",
  },
];

// Surfaced only when the AI flags a possible scam.
export const SCAM_RESOURCE: Resource = {
  name: "FTC — Report Fraud",
  desc: "Report scams and get recovery steps from the Federal Trade Commission.",
  phone: "1-877-382-4357",
  url: "https://reportfraud.ftc.gov",
};
