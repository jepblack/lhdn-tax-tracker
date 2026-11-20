import { ReliefCategory, StatusReliefs, TaxYear } from "./types";

/**
 * Dynamic rolling 7-year LHDN Section 82A audit window:
 * Returns current calendar year + 7 prior Years of Assessment (e.g., 2026..2019 in 2026; 2027..2020 in 2027).
 */
export function getSupportedTaxYears(
  referenceYear = new Date().getFullYear()
): TaxYear[] {
  const currentYear = Math.max(2026, referenceYear);
  const years: TaxYear[] = [];
  for (let y = currentYear; y >= currentYear - 7; y--) {
    years.push(y);
  }
  return years;
}

export const SUPPORTED_TAX_YEARS: TaxYear[] = getSupportedTaxYears();

export function isTaxYearRetentionExpired(
  taxYear: TaxYear,
  referenceYear = new Date().getFullYear()
): boolean {
  const currentYear = Math.max(2026, referenceYear);
  return taxYear < currentYear - 7;
}

export const DEFAULT_STATUS_RELIEFS: StatusReliefs = {
  individual: true,
  disabledIndividual: false,
  spouse: false,
  disabledSpouse: false,
  childrenUnder18: 0,
  childrenHigherEd: 0,
  disabledChildren: 0,
  disabledChildrenHigherEd: 0,
};

export interface StatusReliefAmounts {
  individual: number;
  disabledIndividual: number;
  spouse: number;
  disabledSpouse: number;
  childUnder18: number;
  childHigherEd: number;
  disabledChild: number;
  disabledChildHigherEd: number;
}

export function getStatusReliefAmounts(year: TaxYear): StatusReliefAmounts {
  // YA 2025 & YA 2026 updated disability caps from Budget 2025
  if (year >= 2025) {
    return {
      individual: 9000,
      disabledIndividual: 7000,
      spouse: 4000,
      disabledSpouse: 6000,
      childUnder18: 2000,
      childHigherEd: 8000,
      disabledChild: 8000,
      disabledChildHigherEd: 8000,
    };
  }
  return {
    individual: 9000,
    disabledIndividual: 6000,
    spouse: 4000,
    disabledSpouse: 5000,
    childUnder18: 2000,
    childHigherEd: 8000,
    disabledChild: 6000,
    disabledChildHigherEd: 8000,
  };
}

/**
 * LHDN Malaysia Resident Individual Tax Reliefs (YA 2025 & YA 2026)
 * Structured with parent caps and nested sub-limits so the calculator
 * accurately caps both sub-categories and their parent category.
 */
export function getReliefCategories(year: TaxYear): ReliefCategory[] {
  const isYa2025Plus = year >= 2025;

  return [
    {
      id: "lifestyle",
      name: "Lifestyle Relief",
      shortName: "Lifestyle",
      group: "lifestyle",
      maxLimit: 2500,
      formBeRef: "F9",
      icon: "Laptop",
      description:
        "Books, personal computer/smartphone/tablet, broadband internet subscription, and self-enhancement courses.",
      tips: "Keep all 12 monthly Unifi/TIME/Maxis fibre bills — they alone often fill RM1,200–RM2,400 of this cap.",
      subCategories: [
        {
          id: "lifestyle_internet",
          name: "Internet Broadband Subscription",
          maxLimit: 2500,
          description: "Monthly home internet subscription registered under your own name.",
          examples: ["TM Unifi", "TIME Fibre", "Maxis Fibre", "CelcomDigi Fibre"],
        },
        {
          id: "lifestyle_tech",
          name: "PC, Smartphone or Tablet",
          maxLimit: 2500,
          description: "Personal use only (non-business) for self, spouse, or child.",
          examples: ["iPhone / Android", "MacBook / Laptop", "iPad / Tablet"],
        },
        {
          id: "lifestyle_books",
          name: "Books, Journals & Magazines",
          maxLimit: 2500,
          description: "Hardcopy or electronic reading materials (excluding banned publications).",
          examples: ["Kinokuniya", "Popular Bookstore", "Kindle / e-Books", "Digital Newspaper"],
        },
        {
          id: "lifestyle_skills",
          name: "Self-Enhancement Course Fees",
          maxLimit: 2500,
          description: "Courses for self-improvement (language, cooking, photography, coding, etc.).",
          examples: ["Skill workshop", "Language class", "Online course"],
        },
      ],
    },
    {
      id: "sports",
      name: "Sports Equipment & Activities",
      shortName: "Sports",
      group: "lifestyle",
      maxLimit: 1000,
      formBeRef: "F10",
      icon: "Dumbbell",
      description:
        "Separate RM1,000 relief for sports equipment, facility rentals, competition fees, gym memberships, and sports training (for self, spouse, child, or parents).",
      tips: "Claim sports & gym receipts here instead of Lifestyle so you preserve your RM2,500 Lifestyle cap!",
      subCategories: [
        {
          id: "sports_equipment",
          name: "Sports Equipment",
          maxLimit: 1000,
          description: "Sports gear listed under the Sports Development Act 1997 (excludes motorized bikes/wearables).",
          examples: ["Badminton racket", "Running shoes", "Yoga mat", "Decathlon gear"],
        },
        {
          id: "sports_gym",
          name: "Gym Membership & Training",
          maxLimit: 1000,
          description: "Gym membership fees and sports training fees by certified instructors.",
          examples: ["Celebrity Fitness", "Anytime Fitness", "Swimming / Tennis coaching"],
        },
        {
          id: "sports_facility",
          name: "Court Rental & Competition Fees",
          maxLimit: 1000,
          description: "Rental/entry fees to sports facilities and approved competition registration.",
          examples: ["Badminton court booking", "Marathon registration", "Pickleball court"],
        },
      ],
    },
    {
      id: "medical_self",
      name: "Medical Expenses (Self, Spouse & Child)",
      shortName: "Medical",
      group: "medical",
      maxLimit: 10000,
      formBeRef: "F4",
      icon: "HeartPulse",
      description:
        "Serious diseases, fertility treatment, vaccinations, dental treatment, check-ups, mental health, and child learning disability intervention.",
      tips: "Watch the nested sub-limits: Dental (RM1,000), Vaccination (RM1,000), and Check-up/Mental Health (RM1,000) all count toward the RM10,000 overall cap.",
      subCategories: [
        {
          id: "med_serious",
          name: "Serious Diseases & Fertility Treatment",
          maxLimit: 10000,
          description: "Hospitalization/treatment for serious diseases or fertility treatment for self/spouse.",
          examples: ["Hospital specialist bill", "Fertility clinic", "Cancer / heart treatment"],
        },
        {
          id: "med_dental",
          name: "Dental Examination & Treatment",
          maxLimit: 1000,
          description: "Sub-limit RM1,000 — scaling, filling, extraction, dental check-up (registered dentist).",
          examples: ["Dental scaling & polishing", "Tooth filling", "Dental clinic receipt"],
        },
        {
          id: "med_vaccination",
          name: "Vaccination",
          maxLimit: 1000,
          description: "Sub-limit RM1,000 — Pneumococcal, HPV, Influenza, Rotavirus, Varicella, etc.",
          examples: ["Flu jab", "HPV vaccine", "Influenza vaccination"],
        },
        {
          id: "med_checkup",
          name: "Full Check-Up, Mental Health & Self-Test",
          maxLimit: 1000,
          description: "Sub-limit RM1,000 — Complete medical exam, mental health consultation, self-test kits, glucometer/oximeter/BP monitor.",
          examples: ["Annual health screening", "Blood test package", "BP monitor", "Psychologist visit"],
        },
        {
          id: "med_child_disability",
          name: "Child Learning Disability Assessment & Rehab",
          maxLimit: isYa2025Plus ? 6000 : 4000,
          description: `Sub-limit RM${isYa2025Plus ? "6,000" : "4,000"} — Diagnosis, early intervention, and rehabilitation for children under 18 (Autism, ADHD, Dyslexia, etc.).`,
          examples: ["Speech therapy", "Occupational therapy", "Developmental assessment"],
        },
      ],
    },
    {
      id: "parents_medical",
      name: "Parents & Grandparents Medical / Care",
      shortName: "Parents Care",
      group: "family",
      maxLimit: 8000,
      formBeRef: "F2",
      icon: "Users",
      description:
        "Medical treatment, dental, special needs, carer expenses, and complete medical check-ups for parents (and grandparents from YA 2025).",
      tips: "Requires receipts certified by a medical practitioner or registered nursing/care centre.",
      subCategories: [
        {
          id: "parents_treatment",
          name: "Medical Treatment, Dental & Carer",
          maxLimit: 8000,
          description: "Hospital/clinic treatment, dental care, nursing home, or certified carer.",
          examples: ["Parents hospital bill", "Physiotherapy", "Certified carer"],
        },
        {
          id: "parents_checkup",
          name: "Parents Complete Medical Check-Up",
          maxLimit: 1000,
          description: "Sub-limit RM1,000 — Full medical examination and vaccinations for parents/grandparents.",
          examples: ["Senior health screening", "Parents flu vaccine"],
        },
      ],
    },
    {
      id: "epf_life_insurance",
      name: "EPF & Life Insurance / Takaful",
      shortName: "EPF & Life",
      group: "savings",
      maxLimit: 7000,
      formBeRef: "F15",
      icon: "ShieldCheck",
      description:
        "Combined RM7,000 cap split between mandatory/voluntary EPF (RM4,000) and Life Insurance / Family Takaful / additional voluntary EPF (RM3,000).",
      tips: "Most salaried employees hit the RM4,000 EPF cap automatically via payslip. Use Life Takaful or voluntary EPF top-up to fill the remaining RM3,000!",
      subCategories: [
        {
          id: "epf_mandatory",
          name: "EPF (Mandatory / Voluntary)",
          maxLimit: 4000,
          description: "Sub-limit RM4,000 — Employee EPF contributions shown on your EA Form.",
          examples: ["EA Form EPF contribution", "KWSP self-contribution"],
        },
        {
          id: "life_insurance",
          name: "Life Insurance / Takaful / Extra Voluntary EPF",
          maxLimit: 3000,
          description: "Sub-limit RM3,000 — Life insurance/takaful premiums or additional voluntary EPF.",
          examples: ["Prudential / AIA / Great Eastern Life", "Takaful Ikhlas", "Voluntary EPF top-up"],
        },
      ],
    },
    {
      id: "edu_med_insurance",
      name: "Education & Medical Insurance",
      shortName: "Med Insurance",
      group: "savings",
      maxLimit: isYa2025Plus ? 4000 : 3000,
      formBeRef: "F17",
      icon: "ShieldPlus",
      description: `Medical card or education insurance premiums for self, spouse, or child (increased to RM${isYa2025Plus ? "4,000" : "3,000"} for YA ${year}).`,
      tips: "Download your annual Income Tax Statement from your insurer's portal in February/March.",
    },
    {
      id: "prs_annuity",
      name: "Private Retirement Scheme (PRS) & Annuity",
      shortName: "PRS",
      group: "savings",
      maxLimit: 3000,
      formBeRef: "F16",
      icon: "PiggyBank",
      description:
        "Contributions to approved Private Retirement Schemes (PRS) or deferred annuity.",
      tips: "One of the easiest year-end tax maximizers — you keep the money in your own retirement fund while saving up to RM750+ in tax.",
    },
    {
      id: "sspn",
      name: "SSPN Net Savings Deposit",
      shortName: "SSPN",
      group: "savings",
      maxLimit: 8000,
      formBeRef: "F13",
      icon: "GraduationCap",
      description:
        "Net deposit (deposits minus withdrawals during the year) into Skim Simpanan Pendidikan Nasional (Simpan SSPN) for your child.",
      tips: "Only net positive deposits within the calendar year qualify. Great for parents with high marginal tax rates.",
    },
    {
      id: "education_self",
      name: "Education Fees (Self)",
      shortName: "Education",
      group: "lifestyle",
      maxLimit: 7000,
      formBeRef: "F5",
      icon: "BookOpen",
      description:
        "Approved tertiary education fees (law, accounting, tech, science, Islamic finance, or any Master's/PhD) and upskilling courses.",
      tips: "Upskilling / self-enhancement courses recognised by the Dept. of Skills Development are capped at RM2,000 within the RM7,000 limit.",
      subCategories: [
        {
          id: "edu_tertiary",
          name: "Degree / Master's / PhD / Professional",
          maxLimit: 7000,
          description: "Approved institutions in Malaysia (or any field for Master's/PhD).",
          examples: ["University tuition", "ACCA / CPA", "Master's program"],
        },
        {
          id: "edu_upskilling",
          name: "Approved Upskilling Courses",
          maxLimit: 2000,
          description: "Sub-limit RM2,000 — Skills enhancement courses recognized by JPK.",
          examples: ["Certified data/tech course", "HRD/JPK approved training"],
        },
      ],
    },
    {
      id: "first_home_interest",
      name: "First-Home Loan Interest (YA 2025–2027)",
      shortName: "Home Loan",
      group: "housing",
      maxLimit: 7000,
      formBeRef: "F21",
      icon: "Home",
      description:
        "Housing loan interest for first residential home with SPA executed between 1 Jan 2025 and 31 Dec 2027 (RM7,000 for homes ≤ RM500k; RM5,000 for RM500k–RM750k).",
      tips: "Request the annual housing loan interest statement from your bank and retain your stamped SPA.",
      subCategories: [
        {
          id: "home_under_500k",
          name: "First Home ≤ RM500,000",
          maxLimit: 7000,
          description: "Up to RM7,000 per year for 3 consecutive assessment years.",
          examples: ["Bank annual interest statement"],
        },
        {
          id: "home_500k_750k",
          name: "First Home RM500,001 – RM750,000",
          maxLimit: 5000,
          description: "Up to RM5,000 per year for 3 consecutive assessment years.",
          examples: ["Bank annual interest statement"],
        },
      ],
    },
    {
      id: "socso",
      name: "SOCSO / PERKESO Contribution",
      shortName: "SOCSO",
      group: "savings",
      maxLimit: 350,
      formBeRef: "F18",
      icon: "BadgeCheck",
      description: "Employee contribution to PERKESO / SOCSO & EIS (shown on EA Form).",
      tips: "Check your annual EA Form — almost all salaried employees can claim up to RM350 here.",
    },
    {
      id: "childcare",
      name: "Childcare Fees (TASKA / TADIKA)",
      shortName: "Childcare",
      group: "family",
      maxLimit: 3000,
      formBeRef: "F12",
      icon: "Baby",
      description:
        "Fees paid to a registered childcare centre (TASKA) or kindergarten (TADIKA) for children aged 6 years and below.",
      tips: "Claimable by either husband or wife (not both for the same child). Verify the centre's JKM/MOE registration.",
    },
    {
      id: "breastfeeding",
      name: "Breastfeeding Equipment",
      shortName: "Breastfeeding",
      group: "family",
      maxLimit: 1000,
      formBeRef: "F11",
      icon: "Sparkles",
      description:
        "Purchase of breastfeeding equipment for female taxpayers with a child aged 2 years and below (claimable once every 2 years).",
      tips: "Includes breast pump kit, cooler bag, milk storage containers/bags.",
    },
    {
      id: "ev_charging",
      name: "EV Charging & Food Waste Composting",
      shortName: "EV / Green",
      group: "housing",
      maxLimit: 2500,
      formBeRef: "F20",
      icon: "Zap",
      description:
        "Installation, rental, purchase, or subscription of EV charging facilities, or domestic food waste composting machine (non-business use).",
      tips: "Keep official installation invoices or EV charging subscription receipts (e.g., Gentari, JomCharge, ChargEV).",
    },
    {
      id: "supporting_equipment",
      name: "Basic Supporting Equipment (Disability)",
      shortName: "Support Gear",
      group: "medical",
      maxLimit: 6000,
      formBeRef: "F3",
      icon: "Accessibility",
      description:
        "Purchase of basic supporting equipment for disabled self, spouse, child, or parent (registered with JKM).",
      tips: "Examples: wheelchair, hearing aid, dialysis machine, prosthetic limbs.",
    },
    {
      id: "approved_donations",
      name: "Approved Donations — Sec. 44(6) (10% Cap)",
      shortName: "Donations",
      group: "savings",
      maxLimit: 10000, // Dynamically overridden to 10% of Annual Income in calculator.ts
      formBeRef: "D1",
      icon: "HeartHandshake",
      description:
        "Cash donations to LHDN-approved charitable institutions/NGOs/Wakaf under Section 44(6), deductible up to 10% of your aggregate income.",
      tips: "Official receipt MUST state 'Tax Exempt under Section 44(6)' with LHDN reference number. Separate from Zakat rebate!",
    },
  ];
}

/**
 * Malaysia Resident Individual Progressive Tax Brackets (YA 2025 / YA 2026)
 * Source: LHDN Malaysia
 */
export interface TaxBracket {
  min: number;
  max: number;
  rate: number;
  baseTax: number;
}

export const MALAYSIA_TAX_BRACKETS: TaxBracket[] = [
  { min: 0, max: 5000, rate: 0.0, baseTax: 0 },
  { min: 5000, max: 20000, rate: 0.01, baseTax: 0 },
  { min: 20000, max: 35000, rate: 0.03, baseTax: 150 },
  { min: 35000, max: 50000, rate: 0.06, baseTax: 600 },
  { min: 50000, max: 70000, rate: 0.11, baseTax: 1500 },
  { min: 70000, max: 100000, rate: 0.19, baseTax: 3700 },
  { min: 100000, max: 400000, rate: 0.25, baseTax: 9400 },
  { min: 400000, max: 600000, rate: 0.26, baseTax: 84400 },
  { min: 600000, max: 2000000, rate: 0.28, baseTax: 136400 },
  { min: 2000000, max: Infinity, rate: 0.3, baseTax: 528400 },
];
