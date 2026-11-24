import { getSupabaseClient } from "./supabase";
import {
  PartnerOffer,
  PaymentGatewayId,
  PlanTier,
  ReliefOpportunity,
  UserSubscription,
} from "./types";

const LOCAL_SUBSCRIPTION_KEY = "cukaiku_subscription_v1";

export const FREE_AI_SCAN_LIMIT = 5;
export const PRO_AI_SCAN_LIMIT = 300;
export const FAMILY_AI_SCAN_LIMIT = 600;

export interface PackageResourceLimits {
  maxAiScans: number;
  maxFileSizeMb: number;
  maxBatchFiles: number;
  cloudVault: boolean;
  auditZipExport: boolean;
}

export function getPackageResourceLimits(tier: PlanTier): PackageResourceLimits {
  if (tier === "family") {
    return {
      maxAiScans: FAMILY_AI_SCAN_LIMIT,
      maxFileSizeMb: 15,
      maxBatchFiles: 50,
      cloudVault: true,
      auditZipExport: true,
    };
  }
  if (tier === "pro") {
    return {
      maxAiScans: PRO_AI_SCAN_LIMIT,
      maxFileSizeMb: 10,
      maxBatchFiles: 20,
      cloudVault: true,
      auditZipExport: true,
    };
  }
  return {
    maxAiScans: FREE_AI_SCAN_LIMIT,
    maxFileSizeMb: 5,
    maxBatchFiles: 3,
    cloudVault: false,
    auditZipExport: false,
  };
}

export interface PricingPlanInfo {
  id: PlanTier;
  name: string;
  tagline: string;
  priceRm: number;
  periodLabel: string;
  badge?: string;
  aiScansLimit: number;
  features: string[];
}

export const PRICING_PLANS: PricingPlanInfo[] = [
  {
    id: "free",
    name: "Free Starter",
    tagline: "Local receipt tracking & built-in OCR",
    priceRm: 0,
    periodLabel: "Forever free",
    aiScansLimit: FREE_AI_SCAN_LIMIT,
    features: [
      `${FREE_AI_SCAN_LIMIT} AI Vision receipt scans included`,
      "Unlimited built-in On-Device Free OCR",
      "All 15 YA 2025/2026 LHDN relief categories & sub-caps",
      "Local browser storage & CSV export",
    ],
  },
  {
    id: "pro",
    name: "CukaiKu Pro Pass",
    tagline: "Full AI Vision & 7-Year LHDN Audit Vault",
    priceRm: 29,
    periodLabel: "per Year of Assessment",
    badge: "Most Popular",
    aiScansLimit: PRO_AI_SCAN_LIMIT,
    features: [
      `${PRO_AI_SCAN_LIMIT} Gemini / Llama Vision AI receipt scans`,
      "1-Click LHDN 7-Year Audit Pack ZIP (PDFs + JSON + Form BE)",
      "Batch Multi-Receipt Import & EA Form / Payslip Auto-Extractor",
      "Cloud Sync across Phone & PC (Supabase + Google Drive)",
      "Priority LHDN eligibility & mixed-receipt item splitting",
    ],
  },
  {
    id: "family",
    name: "Family & Joint Pass",
    tagline: "Maximize combined household tax refund",
    priceRm: 59,
    periodLabel: "per Year of Assessment",
    badge: "Best for Couples",
    aiScansLimit: FAMILY_AI_SCAN_LIMIT,
    features: [
      `${FAMILY_AI_SCAN_LIMIT} AI Vision receipt scans for household`,
      "Everything in CukaiKu Pro Pass",
      "Joint vs. Separate Assessment Optimizer & Child Relief Split",
      "Freelancer / Side-Income (Form B) business expense tagging",
    ],
  },
];

// Curated Malaysian Tax-Saving Partner Offers (Affiliate / Lead-Gen Engine)
export const MALAYSIA_PARTNER_OFFERS: PartnerOffer[] = [
  {
    id: "prs-versa",
    categoryId: "prs_annuity",
    partnerName: "Versa / Principal PRS",
    badgeText: "Up to RM 3,000 Relief",
    headline: "Top up PRS online before 31 Dec",
    description:
      "Invest in Shariah or conventional Private Retirement Scheme funds from RM 100 with 0% sales charge.",
    ctaLabel: "Claim PRS Bonus",
    affiliateUrl: "https://versa.com.my/prs/",
    promoCode: "CUKAIKUPRS",
    maxReliefAmount: 3000,
  },
  {
    id: "sspn-ptptn",
    categoryId: "sspn",
    partnerName: "PTPTN Simpan SSPN Prime",
    badgeText: "Up to RM 8,000 Relief",
    headline: "Net deposit into child's SSPN account",
    description:
      "Government-guaranteed savings with competitive dividend + up to RM 8,000 net deposit tax deduction.",
    ctaLabel: "Top Up SSPN Online",
    affiliateUrl: "https://www.ptptn.gov.my/simpan-sspn/",
    maxReliefAmount: 8000,
  },
  {
    id: "med-checkup-bookdoc",
    categoryId: "medical_self",
    subCategoryId: "med_checkup",
    partnerName: "Pathlab & BookDoc Screening",
    badgeText: "RM 1,000 Sub-Cap",
    headline: "Full blood & health screening package",
    description:
      "Use your RM 1,000 medical check-up, dental, or mental health consultation sub-limit before year-end.",
    ctaLabel: "View Health Packages",
    affiliateUrl: "https://www.bookdoc.com/",
    promoCode: "CUKAIKUHEALTH",
    maxReliefAmount: 1000,
  },
  {
    id: "life-takaful-filife",
    categoryId: "epf_life_insurance",
    subCategoryId: "life_insurance",
    partnerName: "Fi Life / Etiqa Digital Takaful",
    badgeText: "Up to RM 3,000 Relief",
    headline: "Direct online term life & family Takaful",
    description:
      "Fill your remaining RM 3,000 Life Insurance / Takaful & Voluntary EPF bucket with commission-free coverage.",
    ctaLabel: "Calculate Instant Quote",
    affiliateUrl: "https://www.filife.com.my/",
    maxReliefAmount: 3000,
  },
  {
    id: "med-card-fwd",
    categoryId: "edu_med_insurance",
    partnerName: "FWD Takaful / Allianz Medical",
    badgeText: "Up to RM 4,000 Relief",
    headline: "Medical & Education Takaful protection",
    description:
      "Standalone medical card or child education policy qualifies for up to RM 4,000 annual relief.",
    ctaLabel: "Check Eligibility",
    affiliateUrl: "https://www.fwd.com.my/",
    maxReliefAmount: 4000,
  },
  {
    id: "lifestyle-popular",
    categoryId: "lifestyle",
    partnerName: " Kindle / MPH / Home Fibre",
    badgeText: "Up to RM 2,500 Relief",
    headline: "Books, tablet, smartphone, or home fibre bill",
    description:
      "Don't leave your RM 2,500 lifestyle cap unused—log your monthly Time/Unifi broadband bills or book purchases.",
    ctaLabel: "Log Broadband / Tech",
    affiliateUrl: "#quick-log-broadband",
    maxReliefAmount: 2500,
  },
  {
    id: "sports-decathlon",
    categoryId: "sports",
    partnerName: "Decathlon / Gym & Sports Courts",
    badgeText: "Dedicated RM 1,000 Cap",
    headline: "Running shoes, rackets, gym or badminton court bookings",
    description:
      "Separate RM 1,000 sports equipment, facility rental, and tournament registration relief (outside Lifestyle).",
    ctaLabel: "Log Sports Receipt",
    affiliateUrl: "#quick-add-sports",
    maxReliefAmount: 1000,
  },
];

export function getDefaultSubscription(): UserSubscription {
  return {
    planTier: "free",
    aiScansUsed: 0,
    aiScansLimit: FREE_AI_SCAN_LIMIT,
    expiresAt: null,
    gateway: null,
    updatedAt: new Date().toISOString(),
  };
}

export function getLimitForPlan(tier: PlanTier): number {
  if (tier === "family") return FAMILY_AI_SCAN_LIMIT;
  if (tier === "pro") return PRO_AI_SCAN_LIMIT;
  return FREE_AI_SCAN_LIMIT;
}

export function loadLocalSubscription(): UserSubscription {
  if (typeof window === "undefined") return getDefaultSubscription();
  try {
    const raw = window.localStorage.getItem(LOCAL_SUBSCRIPTION_KEY);
    if (!raw) return getDefaultSubscription();
    const parsed = JSON.parse(raw) as Partial<UserSubscription>;
    const tier: PlanTier =
      parsed.planTier === "pro" || parsed.planTier === "family"
        ? parsed.planTier
        : "free";
    return {
      planTier: tier,
      aiScansUsed: Math.max(0, Number(parsed.aiScansUsed) || 0),
      aiScansLimit: Number(parsed.aiScansLimit) || getLimitForPlan(tier),
      expiresAt: parsed.expiresAt || null,
      gateway: parsed.gateway || null,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return getDefaultSubscription();
  }
}

export function saveLocalSubscription(sub: UserSubscription): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_SUBSCRIPTION_KEY, JSON.stringify(sub));
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchSubscription(
  userId?: string | null
): Promise<UserSubscription> {
  const local = loadLocalSubscription();
  const supabase = getSupabaseClient();
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        const cloudTier: PlanTier =
          data.plan_tier === "pro" || data.plan_tier === "family"
            ? data.plan_tier
            : "free";
        const localNewer =
          new Date(local.updatedAt).getTime() >
          new Date(data.updated_at || 0).getTime();

        // If user upgraded offline (local has paid tier & newer timestamp while cloud is still free), push local up
        if (local.planTier !== "free" && cloudTier === "free" && localNewer) {
          return await persistSubscription(
            {
              ...local,
              aiScansUsed: Math.max(
                local.aiScansUsed,
                Number(data.ai_scans_used) || 0
              ),
            },
            userId
          );
        }

        const merged: UserSubscription = {
          planTier: cloudTier,
          aiScansUsed: Math.max(local.aiScansUsed, Number(data.ai_scans_used) || 0),
          aiScansLimit: Number(data.ai_scans_limit) || getLimitForPlan(cloudTier),
          expiresAt: data.expires_at || null,
          gateway: (data.gateway as PaymentGatewayId) || null,
          updatedAt: data.updated_at || new Date().toISOString(),
        };
        saveLocalSubscription(merged);
        return merged;
      } else if (!error && !data && (local.planTier !== "free" || local.aiScansUsed > 0)) {
        // Cloud row doesn't exist yet for this user — sync local package & usage up
        return await persistSubscription(local, userId);
      }
    } catch {
      // Table may not be migrated yet; fall back cleanly to local state
    }
  }
  return local;
}

export async function persistSubscription(
  sub: UserSubscription,
  userId?: string | null
): Promise<UserSubscription> {
  const updated: UserSubscription = {
    ...sub,
    aiScansLimit: getLimitForPlan(sub.planTier),
    updatedAt: new Date().toISOString(),
  };
  saveLocalSubscription(updated);

  const supabase = getSupabaseClient();
  if (supabase && userId) {
    try {
      await supabase.from("user_subscriptions").upsert(
        {
          user_id: userId,
          plan_tier: updated.planTier,
          ai_scans_used: updated.aiScansUsed,
          ai_scans_limit: updated.aiScansLimit,
          gateway: updated.gateway || null,
          expires_at: updated.expiresAt || null,
          updated_at: updated.updatedAt,
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Ignore if table not created in Supabase yet
    }
  }
  return updated;
}

export async function incrementAiScanUsage(
  current: UserSubscription,
  userId?: string | null
): Promise<UserSubscription> {
  const next: UserSubscription = {
    ...current,
    aiScansUsed: current.aiScansUsed + 1,
  };
  return persistSubscription(next, userId);
}

export function canUseCloudAiScan(sub: UserSubscription): boolean {
  if (sub.planTier === "pro" || sub.planTier === "family") {
    return sub.aiScansUsed < sub.aiScansLimit;
  }
  return sub.aiScansUsed < FREE_AI_SCAN_LIMIT;
}

export function isProOrFamily(sub: UserSubscription): boolean {
  return sub.planTier === "pro" || sub.planTier === "family";
}

export function matchPartnerOffersToOpportunities(
  opportunities: ReliefOpportunity[],
  marginalRate: number
): Array<{
  offer: PartnerOffer;
  remainingCap: number;
  estimatedTaxSaved: number;
}> {
  const oppMap = new Map(opportunities.map((o) => [o.categoryId, o]));
  const matched: Array<{
    offer: PartnerOffer;
    remainingCap: number;
    estimatedTaxSaved: number;
  }> = [];

  for (const offer of MALAYSIA_PARTNER_OFFERS) {
    const opp = oppMap.get(offer.categoryId);
    if (opp && opp.remainingCap >= 100) {
      const cap = Math.min(opp.remainingCap, offer.maxReliefAmount);
      const estimatedTaxSaved = Math.round(cap * marginalRate);
      matched.push({
        offer,
        remainingCap: cap,
        estimatedTaxSaved,
      });
    }
  }

  return matched.sort((a, b) => b.estimatedTaxSaved - a.estimatedTaxSaved);
}
