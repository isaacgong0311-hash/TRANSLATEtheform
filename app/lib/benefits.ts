export type Benefit = {
  id: string;
  name: string;
  shortDesc: string;
  categories: string[];
  sourceUrl: string;
  applyUrl: string;
  windowNote?: string;
};

export const BENEFITS: Benefit[] = [
  {
    id: "snap",
    name: "SNAP (Food Assistance)",
    shortDesc: "Monthly money on an EBT card to buy groceries for your household.",
    categories: ["benefits", "financial", "housing", "other"],
    sourceUrl: "https://www.fns.usda.gov/snap",
    applyUrl: "https://www.benefits.gov/benefit/361",
  },
  {
    id: "medicaid",
    name: "Medicaid",
    shortDesc: "Free or very low-cost health insurance for people with low income.",
    categories: ["healthcare", "benefits"],
    sourceUrl: "https://www.medicaid.gov/",
    applyUrl: "https://www.healthcare.gov/medicaid-chip/",
  },
  {
    id: "chip",
    name: "CHIP (Children's Health Insurance)",
    shortDesc: "Low-cost health coverage for children whose families earn too much for Medicaid.",
    categories: ["healthcare", "benefits", "school"],
    sourceUrl: "https://www.medicaid.gov/chip/",
    applyUrl: "https://www.insurekidsnow.gov/",
  },
  {
    id: "liheap",
    name: "LIHEAP — Energy Bill Help",
    shortDesc: "Help paying heating and cooling bills for low-income households.",
    categories: ["utilities", "benefits", "housing"],
    sourceUrl: "https://www.acf.hhs.gov/ocs/programs/liheap",
    applyUrl: "https://www.benefits.gov/benefit/623",
    windowNote: "Applications open seasonally — call 211 to check your local window.",
  },
  {
    id: "eitc",
    name: "EITC (Earned Income Tax Credit)",
    shortDesc: "A tax refund you may receive even if you owe no taxes, if you worked this year.",
    categories: ["financial", "benefits"],
    sourceUrl: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
    applyUrl: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
    windowNote: "File your federal tax return to claim — deadline typically April 15.",
  },
  {
    id: "wic",
    name: "WIC (Women, Infants & Children)",
    shortDesc: "Food benefits, nutrition help, and health referrals for pregnant women and children under 5.",
    categories: ["healthcare", "benefits", "school"],
    sourceUrl: "https://www.fns.usda.gov/wic",
    applyUrl: "https://www.benefits.gov/benefit/369",
  },
  {
    id: "section8",
    name: "Housing Choice Voucher (Section 8)",
    shortDesc: "A voucher that pays part of your rent so you pay less.",
    categories: ["housing", "benefits"],
    sourceUrl: "https://www.hud.gov/topics/housing_choice_voucher_program_section_8",
    applyUrl: "https://www.hud.gov/topics/housing_choice_voucher_program_section_8",
    windowNote: "Waitlists are often closed — call 211 or your local housing authority to check.",
  },
  {
    id: "era",
    name: "Emergency Rental Assistance",
    shortDesc: "Help paying overdue rent or utility bills to prevent eviction or shutoff.",
    categories: ["housing", "utilities"],
    sourceUrl: "https://home.treasury.gov/policy-issues/coronavirus/assistance-for-state-local-and-tribal-governments/emergency-rental-assistance-program",
    applyUrl: "https://nlihc.org/era",
    windowNote: "Funding and availability varies by state and locality.",
  },
  {
    id: "ssi",
    name: "SSI (Supplemental Security Income)",
    shortDesc: "Monthly cash payments if you have a disability or are 65+ with low income.",
    categories: ["benefits", "financial", "healthcare"],
    sourceUrl: "https://www.ssa.gov/ssi/",
    applyUrl: "https://www.ssa.gov/applyforbenefits",
  },
  {
    id: "tanf",
    name: "TANF (Cash Assistance)",
    shortDesc: "Short-term cash and employment help for families with children.",
    categories: ["benefits", "financial"],
    sourceUrl: "https://www.acf.hhs.gov/ofa/programs/tanf",
    applyUrl: "https://www.benefits.gov/benefit/613",
    windowNote: "Federal lifetime limit of 60 months of assistance.",
  },
  {
    id: "marketplace",
    name: "ACA Health Insurance Marketplace",
    shortDesc: "Subsidized health plans if you don't have coverage through work.",
    categories: ["healthcare", "benefits"],
    sourceUrl: "https://www.healthcare.gov/",
    applyUrl: "https://www.healthcare.gov/apply-and-enroll/",
    windowNote: "Open Enrollment: Nov 1 – Jan 15. Special enrollment if you lose coverage.",
  },
  {
    id: "legal-aid",
    name: "Free Legal Aid",
    shortDesc: "Free lawyers for eviction, benefits denials, immigration, and family cases.",
    categories: ["legal", "housing", "immigration"],
    sourceUrl: "https://www.lawhelp.org/",
    applyUrl: "https://www.lawhelp.org/",
  },
  {
    id: "211",
    name: "211 — Local Help Finder",
    shortDesc: "Free referral service for food, housing, health, utilities, and more — 24/7, many languages.",
    categories: [
      "housing",
      "healthcare",
      "benefits",
      "utilities",
      "legal",
      "school",
      "financial",
      "immigration",
      "other",
    ],
    sourceUrl: "https://www.211.org/",
    applyUrl: "https://www.211.org/",
  },
  {
    id: "clinic",
    name: "CLINIC — Immigration Legal Help",
    shortDesc: "Accredited legal help for immigration cases at low or no cost.",
    categories: ["immigration"],
    sourceUrl: "https://cliniclegal.org/",
    applyUrl: "https://cliniclegal.org/find-an-agency",
  },
  {
    id: "school-lunch",
    name: "Free & Reduced School Meals",
    shortDesc: "Free or cheaper school breakfast and lunch for qualifying students.",
    categories: ["school", "benefits"],
    sourceUrl: "https://www.fns.usda.gov/nslp",
    applyUrl: "https://www.benefits.gov/benefit/366",
    windowNote: "Apply at the start of each school year through your child's school.",
  },
  {
    id: "head-start",
    name: "Head Start / Early Head Start",
    shortDesc: "Free early education, health, and nutrition services for children under 5 with low income.",
    categories: ["school", "healthcare", "benefits"],
    sourceUrl: "https://eclkc.ohs.acf.hhs.gov/",
    applyUrl: "https://www.benefits.gov/benefit/583",
  },
];

export function getBenefitsForCategory(category: string, limit = 5): Benefit[] {
  return BENEFITS.filter((b) => b.categories.includes(category)).slice(0, limit);
}
