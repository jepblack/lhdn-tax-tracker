import { StatusReliefs, TaxpayerMode } from "./types";

export type AppLanguage = "en" | "bm";

export type LifeStagePresetId =
  | "single"
  | "family"
  | "freelancer"
  | "homebuyer";

export interface UserPersonalization {
  language: AppLanguage;
  lifeStage?: LifeStagePresetId;
  pinnedCategoryIds: string[];
  taxSavingGoal: number;
  paydayDay: number | null;
}

export interface RecurringBillTemplate {
  id: string;
  merchant: string;
  categoryId: string;
  subCategoryId?: string | null;
  amount: number;
  description: string;
  lastLoggedMonth?: string; // YYYY-MM to prevent double-logging in the same month
}

export interface LifeStagePreset {
  id: LifeStagePresetId;
  titleEn: string;
  titleBm: string;
  subtitleEn: string;
  subtitleBm: string;
  badge: string;
  taxpayerMode: TaxpayerMode;
  pinnedCategoryIds: string[];
  statusReliefsPatch: Partial<StatusReliefs>;
}

const PERSONALIZATION_KEY = "cukaiku_personalization_v1";
const RECURRING_BILLS_KEY = "cukaiku_recurring_bills_v1";

export const DEFAULT_PINNED_CATEGORIES = [
  "lifestyle",
  "medical_self",
  "sspn",
  "ev_charging",
  "epf_life_insurance",
];

export const DEFAULT_PERSONALIZATION: UserPersonalization = {
  language: "en",
  pinnedCategoryIds: DEFAULT_PINNED_CATEGORIES,
  taxSavingGoal: 1500,
  paydayDay: null,
};

export const LIFE_STAGE_PRESETS: LifeStagePreset[] = [
  {
    id: "single",
    titleEn: "Single Professional",
    titleBm: "Bujang / Profesional",
    subtitleEn: "Salaried (e-BE) • Lifestyle, Sports, Medical & PRS",
    subtitleBm: "Makan Gaji (e-BE) • Gaya Hidup, Sukan, Perubatan & PRS",
    badge: "e-BE",
    taxpayerMode: "e-BE",
    pinnedCategoryIds: [
      "lifestyle",
      "sports",
      "medical_self",
      "prs_annuity",
      "epf_life_insurance",
    ],
    statusReliefsPatch: {
      individual: true,
      spouse: false,
      childrenUnder18: 0,
    },
  },
  {
    id: "family",
    titleEn: "Married / Young Family",
    titleBm: "Berkahwin / Keluarga",
    subtitleEn: "Pins SSPN (RM 8k), Childcare (RM 3k) & Family Medical",
    subtitleBm: "Pin SSPN (RM 8k), Taska/Tadika (RM 3k) & Perubatan",
    badge: "Family",
    taxpayerMode: "e-BE",
    pinnedCategoryIds: [
      "sspn",
      "childcare",
      "medical_self",
      "edu_med_insurance",
      "lifestyle",
    ],
    statusReliefsPatch: {
      individual: true,
      spouse: true,
      childrenUnder18: 1,
    },
  },
  {
    id: "freelancer",
    titleEn: "Freelancer / Side Income",
    titleBm: "Pekerja Bebas / Perniagaan",
    subtitleEn: "Form e-B • Business Expenses (Sec 33) + CP500",
    subtitleBm: "Borang e-B • Perbelanjaan Perniagaan (Sek 33) + CP500",
    badge: "e-B",
    taxpayerMode: "e-B",
    pinnedCategoryIds: [
      "lifestyle",
      "medical_self",
      "prs_annuity",
      "education_self",
      "ev_charging",
    ],
    statusReliefsPatch: {
      individual: true,
    },
  },
  {
    id: "homebuyer",
    titleEn: "First-Time Homebuyer",
    titleBm: "Pembeli Rumah Pertama",
    subtitleEn: "Pins Housing Loan Interest (RM 7k / RM 5k) + Lifestyle",
    subtitleBm: "Pin Faedah Pinjaman Rumah (RM 7k / RM 5k) + Gaya Hidup",
    badge: "2025–2027",
    taxpayerMode: "e-BE",
    pinnedCategoryIds: [
      "first_home_interest",
      "lifestyle",
      "medical_self",
      "epf_life_insurance",
      "ev_charging",
    ],
    statusReliefsPatch: {
      individual: true,
    },
  },
];

export const STARTER_RECURRING_BILLS: RecurringBillTemplate[] = [
  {
    id: "tpl-unifi",
    merchant: "Unifi / TIME Fibre",
    categoryId: "lifestyle",
    subCategoryId: "lifestyle_internet",
    amount: 129,
    description: "Monthly home broadband internet",
  },
  {
    id: "tpl-gym",
    merchant: "Gym / Fitness Membership",
    categoryId: "sports",
    subCategoryId: "sports_gym",
    amount: 150,
    description: "Monthly gym membership fee",
  },
  {
    id: "tpl-insurance",
    merchant: "Medical / Education Insurance",
    categoryId: "edu_med_insurance",
    subCategoryId: null,
    amount: 250,
    description: "Monthly medical / takaful policy",
  },
];

export function loadPersonalization(): UserPersonalization {
  if (typeof window === "undefined") return DEFAULT_PERSONALIZATION;
  try {
    const raw = window.localStorage.getItem(PERSONALIZATION_KEY);
    if (!raw) return DEFAULT_PERSONALIZATION;
    const parsed = JSON.parse(raw) as Partial<UserPersonalization>;
    return {
      language: parsed.language === "bm" ? "bm" : "en",
      lifeStage: parsed.lifeStage,
      pinnedCategoryIds:
        Array.isArray(parsed.pinnedCategoryIds) &&
        parsed.pinnedCategoryIds.length > 0
          ? parsed.pinnedCategoryIds
          : DEFAULT_PINNED_CATEGORIES,
      taxSavingGoal:
        typeof parsed.taxSavingGoal === "number" && parsed.taxSavingGoal >= 0
          ? parsed.taxSavingGoal
          : 1500,
      paydayDay:
        typeof parsed.paydayDay === "number" &&
        parsed.paydayDay >= 1 &&
        parsed.paydayDay <= 31
          ? parsed.paydayDay
          : null,
    };
  } catch {
    return DEFAULT_PERSONALIZATION;
  }
}

export function savePersonalization(next: UserPersonalization): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function loadRecurringBills(): RecurringBillTemplate[] {
  if (typeof window === "undefined") return STARTER_RECURRING_BILLS;
  try {
    const raw = window.localStorage.getItem(RECURRING_BILLS_KEY);
    if (!raw) return STARTER_RECURRING_BILLS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : STARTER_RECURRING_BILLS;
  } catch {
    return STARTER_RECURRING_BILLS;
  }
}

export function saveRecurringBills(bills: RecurringBillTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECURRING_BILLS_KEY, JSON.stringify(bills));
  } catch {
    // ignore storage errors
  }
}

export function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isNearPayday(paydayDay: number | null): boolean {
  if (!paydayDay) return false;
  const today = new Date().getDate();
  return Math.abs(today - paydayDay) <= 2;
}

export function getUiCopy(lang: AppLanguage) {
  if (lang === "bm") {
    return {
      navDashboard: "Utama",
      navReceipts: "Resit",
      navScan: "Imbas",
      navReliefs: "Pelepasan",
      navSubmissions: "Profil",
      navSubmissionsDesktop: "Profil & e-Filing",
      tagline: "Pelepasan LHDN & Arkib e-Invois",
      filingProfile: "Profil Cukai LHDN:",
      salariedMode: "Makan Gaji (e-BE)",
      freelancerMode: "Pekerja Bebas / Campuran (e-B)",
      totalReliefsTitle: "Jumlah Pelepasan Cukai",
      businessExpensesTitle: "Perbelanjaan Perniagaan (Sek 33)",
      taxBracket: "Kadar Cukai",
      taxSavedReceipts: "Cukai Dijimat (Resit)",
      estRefund: "Anggaran Lebihan (Refund)",
      estBalanceDue: "Anggaran Baki Cukai",
      pinnedCapsTitle: "Had Pelepasan Dipin",
      customizePins: "Ubah Pin",
      recurringTitle: "Bil Bulanan Berulang (1-Tap)",
      logBillNow: "Rekod Bulan Ini",
      loggedThisMonth: "Direkod",
      goalTitle: "Sasaran Penjimatan Cukai",
      paydayBanner: "Hari Gaji Tiba! Jangan lupa muat naik slip gaji & bil bulanan.",
      lifeStageTitle: "Pilih Profil Kehidupan Anda (1-Tap)",
    };
  }

  return {
    navDashboard: "Dashboard",
    navReceipts: "Receipts",
    navScan: "Scan",
    navReliefs: "Reliefs",
    navSubmissions: "Submissions",
    navSubmissionsDesktop: "Submissions & Profile",
    tagline: "LHDN Relief & e-Invoice Vault",
    filingProfile: "LHDN Filing Profile:",
    salariedMode: "Salaried (e-BE)",
    freelancerMode: "Freelancer / Mixed (e-B)",
    totalReliefsTitle: "Total Claimable Reliefs",
    businessExpensesTitle: "Business Deductible Expenses (Sec 33)",
    taxBracket: "Tax Bracket",
    taxSavedReceipts: "Tax Saved (Receipts)",
    estRefund: "Est. LHDN Refund",
    estBalanceDue: "Est. Balance Due",
    pinnedCapsTitle: "Pinned Relief Progress",
    customizePins: "Customize Pins",
    recurringTitle: "1-Tap Monthly Recurring Bills",
    logBillNow: "Log This Month",
    loggedThisMonth: "Logged",
    goalTitle: "Personal Tax-Saving Goal",
    paydayBanner: "Payday Reminder! Log your latest payslip & monthly bills now.",
    lifeStageTitle: "1-Tap Life-Stage Setup",
  };
}
