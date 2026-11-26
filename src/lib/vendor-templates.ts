import { getSupabaseAdminClient } from "./api-security";
import { ReceiptScanResult } from "./types";

export interface VendorReceiptTemplate {
  vendor_key: string;
  vendor_name: string;
  vendor_keywords: string[];
  amount_anchor: string;
  date_anchor: string;
  invoice_anchor: string;
  sst_anchor: string;
  category_id: string;
  sub_category_id: string | null;
  exclude_sst: boolean;
  hit_count: number;
}

// Built-in Malaysian recurring bill presets (instant zero-AI extraction out of the box)
const BUILTIN_TEMPLATES: VendorReceiptTemplate[] = [
  {
    vendor_key: "tm-unifi",
    vendor_name: "TM Unifi",
    vendor_keywords: [
      "TM TECHNOLOGY",
      "TELEKOM MALAYSIA",
      "200201003726",
      "571389-H",
      "UNIFI.COM.MY",
      "TM.COM.MY",
      "UNIFI",
    ],
    amount_anchor: "Current Charges",
    date_anchor: "Bill Date",
    invoice_anchor: "Bill No",
    sst_anchor: "Service Tax",
    category_id: "lifestyle",
    sub_category_id: "lifestyle_internet",
    exclude_sst: true,
    hit_count: 10,
  },
  {
    vendor_key: "time-fibre",
    vendor_name: "TIME Fibre",
    vendor_keywords: [
      "TT DOTCOM",
      "TIME DOTCOM",
      "TIME FIBRE",
      "197901008085",
      "52371-A",
      "B16-1808-31031789",
      "TIME.COM.MY",
    ],
    amount_anchor: "Total Current Charges",
    date_anchor: "Bill Date",
    invoice_anchor: "Invoice No",
    sst_anchor: "Service Tax",
    category_id: "lifestyle",
    sub_category_id: "lifestyle_internet",
    exclude_sst: true,
    hit_count: 10,
  },
  {
    vendor_key: "maxis-fibre",
    vendor_name: "Maxis",
    vendor_keywords: ["MAXIS", "199201002549", "234053-D", "W10-1808-32000489"],
    amount_anchor: "Current Charges",
    date_anchor: "Statement Date",
    invoice_anchor: "Bill No",
    sst_anchor: "Service Tax",
    category_id: "lifestyle",
    sub_category_id: "lifestyle_internet",
    exclude_sst: true,
    hit_count: 10,
  },
  {
    vendor_key: "celcomdigi",
    vendor_name: "CelcomDigi",
    vendor_keywords: ["CELCOMDIGI", "CELCOM", "DIGI", "199701009694", "425190-X"],
    amount_anchor: "Current Charges",
    date_anchor: "Bill Date",
    invoice_anchor: "Bill No",
    sst_anchor: "Service Tax",
    category_id: "lifestyle",
    sub_category_id: "lifestyle_internet",
    exclude_sst: true,
    hit_count: 10,
  },
  {
    vendor_key: "u-mobile",
    vendor_name: "U Mobile",
    vendor_keywords: [
      "U MOBILE SDN BHD",
      "U MOBILE",
      "UMOBILE",
      "199101013657",
      "223969-U",
      "W10-1808-32000028",
    ],
    amount_anchor: "Current Charges",
    date_anchor: "Bill Date",
    invoice_anchor: "Bill No",
    sst_anchor: "Service Tax",
    category_id: "lifestyle",
    sub_category_id: "lifestyle_internet",
    exclude_sst: true,
    hit_count: 10,
  },
  {
    vendor_key: "yes-5g",
    vendor_name: "Yes 5G",
    vendor_keywords: [
      "YTL COMMUNICATIONS",
      "YES 5G",
      "YES.MY",
      "200701035605",
      "793634-V",
      "W10-1808-32000311",
    ],
    amount_anchor: "Current Charges",
    date_anchor: "Statement Date",
    invoice_anchor: "Invoice No",
    sst_anchor: "Service Tax",
    category_id: "lifestyle",
    sub_category_id: "lifestyle_internet",
    exclude_sst: true,
    hit_count: 10,
  },
  {
    vendor_key: "astro-fibre",
    vendor_name: "Astro Fibre",
    vendor_keywords: ["ASTRO FIBRE", "MEASAT BROADCAST", "ASTRO"],
    amount_anchor: "Current Charges",
    date_anchor: "Bill Date",
    invoice_anchor: "Invoice No",
    sst_anchor: "Service Tax",
    category_id: "lifestyle",
    sub_category_id: "lifestyle_internet",
    exclude_sst: true,
    hit_count: 10,
  },
];

// Process-local cache so repeated uploads don't hit Supabase every time
let cachedTemplates: VendorReceiptTemplate[] | null = null;
let cachedAt = 0;

function normalizeVendorKey(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/\b(sdn\.?\s*bhd\.?|bhd\.?|berhad|enterprise|trading|plt)\b/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Strips digits and personal/account identifiers from an anchor label
 * so only generic structural text (e.g. "Bill Date", "Current Charges") is ever persisted.
 */
function sanitizeAnchorLabel(raw: string): string {
  return raw
    .replace(/[0-9]/g, " ")
    .replace(/[:#|•\-_/]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateToken(raw: string): string {
  const iso = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const dmy = raw.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", mei: "05",
    jun: "06", jul: "07", aug: "08", ogos: "08", sep: "09", oct: "10",
    okt: "10", nov: "11", dec: "12", dis: "12",
  };
  const named = raw.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (named) {
    const mm = months[named[2].toLowerCase().slice(0, 4)] || months[named[2].toLowerCase().slice(0, 3)];
    if (mm) return `${named[3]}-${mm}-${named[1].padStart(2, "0")}`;
  }
  return "";
}

function findAnchorBeforeValue(flatText: string, valuePattern: RegExp): string {
  const m = flatText.match(valuePattern);
  if (!m || m.index === undefined) return "";
  const before = flatText.slice(Math.max(0, m.index - 64), m.index);
  // Take the last 2-5 words right before the value
  const words = sanitizeAnchorLabel(before)
    .split(" ")
    .filter((w) => w.length >= 2);
  if (words.length === 0) return "";
  return words.slice(-4).join(" ");
}

function extractValueAfterAnchor(flatText: string, anchor: string, valueRegex: RegExp): string {
  if (!anchor) return "";
  const rx = new RegExp(`${escapeRegex(anchor)}[^\\n]{0,45}`, "i");
  const seg = flatText.match(rx);
  if (!seg) return "";
  const tail = seg[0].slice(anchor.length);
  const val = tail.match(valueRegex);
  return val ? val[1] || val[0] : "";
}

export async function loadPublicVendorTemplates(): Promise<VendorReceiptTemplate[]> {
  if (cachedTemplates && Date.now() - cachedAt < 5 * 60 * 1000) {
    return cachedTemplates;
  }
  const merged = new Map<string, VendorReceiptTemplate>();
  for (const t of BUILTIN_TEMPLATES) merged.set(t.vendor_key, t);

  try {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("vendor_receipt_templates")
        .select("*")
        .order("hit_count", { ascending: false })
        .limit(200);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.vendor_key && row.amount_anchor && Array.isArray(row.vendor_keywords)) {
            merged.set(row.vendor_key, row as VendorReceiptTemplate);
          }
        }
      }
    }
  } catch {
    // Table may not be migrated yet; built-ins + memory cache still work
  }

  cachedTemplates = Array.from(merged.values());
  cachedAt = Date.now();
  return cachedTemplates;
}

function extractCurrentPeriodTotalAfterTax(
  flatText: string,
  primaryAnchor: string
): number {
  const anchors = [
    primaryAnchor,
    "This month's charges",
    "Total Current Charges",
    "Current Charges",
    "Caj Semasa",
    "Monthly Charges",
  ].filter(Boolean);

  for (const anchor of anchors) {
    // Reject if the matched line actually refers to Total Amount Due / Previous Balance / Overdue / Brought Forward
    const rx = new RegExp(`${escapeRegex(anchor)}[^\\n]{0,55}`, "i");
    const seg = flatText.match(rx)?.[0] || "";
    if (!seg) continue;
    const tail = seg.slice(anchor.length);
    if (
      /\b(previous\s+balance|brought\s+forward|overdue|total\s+amount\s+due|balance\s+b\/f|bayaran\s+diterima|baki\s+terdahulu)\b/i.test(
        seg
      )
    ) {
      continue;
    }
    // Skip if it's explicitly "(excl. tax)" / "(before tax)" — handled by extractPreTaxCurrentCharges
    if (
      /\((?:excl|before|sebelum|tidak\s+termasuk)[^)]*(?:tax|sst|cukai)/i.test(
        seg
      )
    ) {
      continue;
    }
    const val = tail.match(/(?:RM|MYR)?\s*([\d,]+\.\d{2})/i);
    if (val) {
      const n = Number(val[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

function extractPreTaxCurrentCharges(flatText: string): number {
  const rx =
    /(?:Total\s+(?:Current\s+)?Charges\s*\(?(?:excl(?:uding)?\.?\s*(?:Svc\.?|Service)\s*Tax|before\s*(?:SST|tax))\)?|Current\s+Charges\s*\(?(?:excl(?:uding)?\.?\s*(?:Svc\.?|Service)\s*Tax|before\s*(?:SST|tax))\)?|Caj\s+Semasa\s*\(?(?:sebelum\s+cukai|tidak\s+termasuk\s+cukai)\)?|Sub-?total\s*\(?(?:before\s*(?:SST|tax)|excl\.?\s*tax)\)?)[^\d\n]{0,35}(?:RM|MYR)?\s*([\d,]+\.\d{2})/i;
  const m = flatText.match(rx);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function extractSstAmount(flatText: string, sstAnchor: string, totalAmt: number): number {
  const candidates: number[] = [];
  if (sstAnchor) {
    const raw = extractValueAfterAnchor(flatText, sstAnchor, /(?:RM|MYR)?\s*([\d,]+\.\d{2})/i);
    if (raw) {
      const n = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) candidates.push(n);
    }
  }
  const rx = /(?:Total\s+Service\s+Tax|Service\s+Tax(?:\s*\(\d+%\))?|Cukai\s+Perkhidmatan(?:\s*\(\d+%\))?|\bST\s*\(\d+%\)|\bST\b\s*(?:\d+%)?)[^\d\n]{0,35}(?:RM|MYR)?\s*([\d,]+\.\d{2})/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(flatText)) !== null) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && (totalAmt <= 0 || n < totalAmt * 0.2)) {
      candidates.push(n);
    }
  }
  return candidates.length > 0 ? candidates[candidates.length - 1] : 0;
}

export async function matchPublicVendorTemplate(
  pdfText: string
): Promise<(ReceiptScanResult & { learnedTemplateVendor?: string }) | null> {
  if (!pdfText || pdfText.length < 40) return null;
  const flat = pdfText.replace(/\s+/g, " ");
  // Phase 1: Inspect Page 1 (first 2,500 chars) to identify the bill issuer,
  // avoiding false matches from itemized call logs on later pages (e.g. "To: Maxis / Digi / Celcom").
  const headerUpper = flat.slice(0, 1200).toUpperCase();
  const page1Upper = flat.slice(0, 2500).toUpperCase();
  const templates = await loadPublicVendorTemplates();

  const scoreTemplate = (tpl: VendorReceiptTemplate): number => {
    let score = 0;
    for (const kw of tpl.vendor_keywords) {
      const k = kw.toUpperCase();
      const inHeader = headerUpper.includes(k);
      const inPage1 = page1Upper.includes(k);
      if (!inPage1) continue;
      const isStrongId =
        /^\d{12}$/.test(k) ||
        /^\d{5,7}-[A-Z]$/.test(k) ||
        /^[A-Z]\d{2}-\d{4}-\d{8}$/.test(k) ||
        /\b(SDN\s*BHD|BERHAD|TELEKOM|DOTCOM|COMMUNICATIONS|BROADBAND)\b/.test(k);
      score += isStrongId ? 10 : inHeader ? 4 : 2;
    }
    return score;
  };

  const sortedTemplates = [...templates]
    .map((tpl) => ({ tpl, score: scoreTemplate(tpl) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.tpl);

  for (const tpl of sortedTemplates) {
    if (!tpl.vendor_keywords.length) continue;
    const isBuiltinTelco = [
      "tm-unifi",
      "time-fibre",
      "maxis-fibre",
      "celcomdigi",
      "u-mobile",
      "yes-5g",
      "astro-fibre",
    ].includes(tpl.vendor_key);
    const matchedKwCount = tpl.vendor_keywords.filter((kw) =>
      page1Upper.includes(kw.toUpperCase())
    ).length;
    const requiredMatches = isBuiltinTelco
      ? 1
      : Math.min(2, tpl.vendor_keywords.length);
    if (matchedKwCount < requiredMatches) continue;

    const upper = flat.toUpperCase();
    // If an internet bill is bundled with TV/entertainment/device packs (e.g. Unifi TV),
    // try extracting the eligible internet line item directly before falling back to AI.
    const isBundledInternet =
      tpl.sub_category_id === "lifestyle_internet" &&
      /(UNIFI\s*TV|HYPPTV|ASTRO|ENTERTAINMENT\s*PACK|ULTIMATE\s*PACK|DEVICE\s*INSTALLMENT)/i.test(
        upper
      );

    if (isBundledInternet) {
      const lineMatch = flat.match(
        /(?:Residential\s+High\s+Speed\s+Internet|unifi\s+\d+\s*(?:Mbps|Gbps)|High\s+Speed\s+Broadband)[^\n]{0,100}?(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
      );
      const grossLineAmt = lineMatch ? Number(lineMatch[1].replace(/,/g, "")) : 0;

      const totalStr = extractValueAfterAnchor(
        flat,
        tpl.amount_anchor,
        /(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
      );
      const totalAmt = totalStr ? Number(totalStr.replace(/,/g, "")) : 0;
      const sstAmt = extractSstAmount(flat, tpl.sst_anchor, totalAmt);

      // Check for discount/rebate near the internet line (e.g. "-70.00" or "(70.00)")
      let discountAmt = 0;
      if (lineMatch && lineMatch.index !== undefined) {
        const afterLine = flat.slice(lineMatch.index, lineMatch.index + 240);
        const discMatch = afterLine.match(
          /(?:Discount|Diskaun|Rebate|Rebat|Promo)[^\d\-]{0,40}[-(]?\s*(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
        );
        if (discMatch) {
          discountAmt = Number(discMatch[1].replace(/,/g, "")) || 0;
        }
      }

      // Also check for non-zero Unifi TV / Pack charge to subtract from (Current Charges - SST)
      const tvMatch = flat.match(
        /(?:unifi\s*TV|HyppTV|Ultimate\s*Pack|Entertainment\s*Pack)[^\n]{0,80}?(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
      );
      const tvAmt = tvMatch ? Number(tvMatch[1].replace(/,/g, "")) || 0 : 0;

      let netLineAmt = 0;
      if (totalAmt > sstAmt && totalAmt > 0) {
        const netBeforeSst = Math.round((totalAmt - sstAmt) * 100) / 100;
        if (grossLineAmt > 0 && discountAmt > 0 && grossLineAmt > discountAmt) {
          netLineAmt = Math.round((grossLineAmt - discountAmt) * 100) / 100;
        } else if (tvAmt >= 0 && netBeforeSst > tvAmt) {
          netLineAmt = Math.round((netBeforeSst - tvAmt) * 100) / 100;
        }
      } else if (grossLineAmt > 0) {
        netLineAmt =
          discountAmt > 0 && grossLineAmt > discountAmt
            ? Math.round((grossLineAmt - discountAmt) * 100) / 100
            : grossLineAmt;
      }

      if (Number.isFinite(netLineAmt) && netLineAmt > 0 && netLineAmt < 1000) {
        const dateSeg = tpl.date_anchor
          ? flat.match(new RegExp(`${escapeRegex(tpl.date_anchor)}[^\\n]{0,45}`, "i"))?.[0] || ""
          : "";
        const parsedDate = parseDateToken(dateSeg);
        const invStr = tpl.invoice_anchor
          ? extractValueAfterAnchor(
              flat,
              tpl.invoice_anchor,
              /[:#\s]+([A-Z0-9][A-Z0-9\-\/]{4,28})/i
            )
          : "";
        return {
          eligibility: "partial",
          merchant: tpl.vendor_name,
          date: parsedDate,
          amount: netLineAmt,
          totalAmount: totalAmt > netLineAmt ? totalAmt : netLineAmt,
          sstOrTaxAmount: sstAmt,
          taxInclusive: true,
          currency: "MYR",
          invoiceNumber: invStr,
          archiveCategory: "personal",
          description: `${tpl.vendor_name} — Net internet charge after discounts (TV & SST excluded via shared template)`,
          suggestedCategoryId: tpl.category_id,
          suggestedSubCategoryId: tpl.sub_category_id,
          confidence: "high",
          reasoning: `Matched shared CukaiKu layout template for ${tpl.vendor_name}; isolated net internet subscription (RM ${netLineAmt.toFixed(2)}) after discounts, excluding bundled TV/SST.`,
          scanEngine: "local-ocr",
          learnedTemplateVendor: tpl.vendor_key,
        };
      }
      continue;
    }

    const preTaxCurrent = extractPreTaxCurrentCharges(flat);
    const currentAfterTax = extractCurrentPeriodTotalAfterTax(
      flat,
      tpl.amount_anchor
    );
    if (preTaxCurrent <= 0 && currentAfterTax <= 0) {
      // Cannot reliably determine current-period charges (do not guess from Total Amount Due / Previous Balance)
      continue;
    }

    const refTotal = currentAfterTax > 0 ? currentAfterTax : preTaxCurrent;
    const sstAmt = extractSstAmount(flat, tpl.sst_anchor, refTotal);

    // Prefer explicit current-period pre-tax subtotal; otherwise calculate (current_period_total_after_tax - tax_amount)
    let claimable = 0;
    let needsReview = false;
    let validationNote = "";

    if (tpl.exclude_sst) {
      if (preTaxCurrent > 0) {
        claimable = preTaxCurrent;
        if (
          currentAfterTax > 0 &&
          sstAmt > 0 &&
          Math.abs(preTaxCurrent + sstAmt - currentAfterTax) > 0.5
        ) {
          needsReview = true;
          validationNote = `Pre-tax subtotal (RM ${preTaxCurrent.toFixed(2)}) + SST (RM ${sstAmt.toFixed(2)}) differs from current-period total (RM ${currentAfterTax.toFixed(2)}); please verify.`;
        }
      } else if (currentAfterTax > 0 && sstAmt > 0 && currentAfterTax > sstAmt) {
        claimable = Math.round((currentAfterTax - sstAmt) * 100) / 100;
      } else if (currentAfterTax > 0 && sstAmt === 0) {
        // Current-period total found without a separate tax line — do not guess tax, flag for review
        claimable = currentAfterTax;
        needsReview = true;
        validationNote =
          "Current-period charges found, but no separate SST/Service Tax line was detected — verify whether tax is included.";
      }
    } else {
      claimable = currentAfterTax > 0 ? currentAfterTax : preTaxCurrent;
    }

    if (!Number.isFinite(claimable) || claimable <= 0) continue;

    const displayTotal =
      currentAfterTax > 0
        ? currentAfterTax
        : sstAmt > 0
        ? Math.round((claimable + sstAmt) * 100) / 100
        : claimable;

    const dateSeg = tpl.date_anchor
      ? flat.match(new RegExp(`${escapeRegex(tpl.date_anchor)}[^\\n]{0,45}`, "i"))?.[0] ||
        flat.match(/(?:Statement\s+Date|Tarikh\s+Penyata|Bill\s+Date|Invoice\s+Date)[^\n]{0,45}/i)?.[0] ||
        ""
      : "";
    const parsedDate = parseDateToken(dateSeg);

    const invStr = tpl.invoice_anchor
      ? extractValueAfterAnchor(
          flat,
          tpl.invoice_anchor,
          /[:#\s]+([A-Z0-9][A-Z0-9\-\/]{4,28})/i
        ) ||
        extractValueAfterAnchor(
          flat,
          "Invoice No",
          /[:#\s]+([A-Z0-9][A-Z0-9\-\/]{4,28})/i
        )
      : "";

    const isMobileTelcoWithoutBroadband =
      ["celcomdigi", "u-mobile", "yes-5g", "maxis-fibre"].includes(tpl.vendor_key) &&
      !/(FIBRE|BROADBAND|U\s*HOME|HOME\s*5G|HOME\s*FIBRE|UNIFI)/i.test(upper);

    // Increment hit count asynchronously
    const admin = getSupabaseAdminClient();
    if (admin) {
      Promise.resolve(
        admin
          .from("vendor_receipt_templates")
          .update({
            hit_count: (tpl.hit_count || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("vendor_key", tpl.vendor_key)
      ).catch(() => {});
    }

    const finalNeedsReview = isMobileTelcoWithoutBroadband || needsReview;
    const finalReviewReason = isMobileTelcoWithoutBroadband
      ? "No clear voice vs. data breakdown detected on this telco bill. Extracted current-period recurring charges (excl. SST); verify under LHDN rules (only home broadband/data plans qualify)."
      : validationNote || undefined;

    return {
      eligibility: finalNeedsReview ? "uncertain" : "eligible",
      merchant: tpl.vendor_name,
      date: parsedDate,
      amount: claimable,
      totalAmount: displayTotal,
      sstOrTaxAmount: sstAmt,
      taxInclusive: true,
      currency: "MYR",
      invoiceNumber: invStr,
      archiveCategory:
        tpl.sub_category_id === "lifestyle_internet" ? "personal" : "other",
      description: isMobileTelcoWithoutBroadband
        ? `${tpl.vendor_name} — Current-period recurring charges excl. SST (verify LHDN eligibility)`
        : `${tpl.vendor_name} (auto-extracted via shared layout template)`,
      suggestedCategoryId: tpl.category_id,
      suggestedSubCategoryId: tpl.sub_category_id,
      needsReview: finalNeedsReview,
      reviewReason: finalReviewReason,
      confidence: finalNeedsReview ? "medium" : "high",
      reasoning: isMobileTelcoWithoutBroadband
        ? `Matched shared ${tpl.vendor_name} template; extracted current-period charges (RM ${claimable.toFixed(2)}) excluding SST & prior balances. Note: LHDN Lifestyle relief only covers home broadband/dedicated data plans.`
        : validationNote ||
          `Matched shared CukaiKu layout template for ${tpl.vendor_name} (current-period pre-tax RM ${claimable.toFixed(2)}).`,
      scanEngine: "local-ocr",
      learnedTemplateVendor: tpl.vendor_key,
    };
  }

  return null;
}

export async function learnPublicVendorTemplate(
  pdfText: string,
  result: {
    merchant?: string;
    totalAmount?: number;
    date?: string;
    invoiceNumber?: string;
    sstOrTaxAmount?: number;
    suggestedCategoryId?: string | null;
    suggestedSubCategoryId?: string | null;
  }
): Promise<void> {
  if (
    !pdfText ||
    pdfText.length < 40 ||
    !result.merchant ||
    !result.totalAmount ||
    result.totalAmount <= 0 ||
    !result.suggestedCategoryId
  ) {
    return;
  }

  const vendorKey = normalizeVendorKey(result.merchant);
  if (!vendorKey || vendorKey.length < 3) return;

  const flat = pdfText.replace(/\s+/g, " ");
  const upper = flat.toUpperCase();
  const amtFixed = result.totalAmount.toFixed(2);
  const amtComma = result.totalAmount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const amtAnchor =
    findAnchorBeforeValue(
      flat,
      new RegExp(`(?:RM|MYR)?\\s*${escapeRegex(amtComma)}`)
    ) ||
    findAnchorBeforeValue(
      flat,
      new RegExp(`(?:RM|MYR)?\\s*${escapeRegex(amtFixed)}`)
    );
  if (!amtAnchor || amtAnchor.length < 3) return;

  const dateAnchor = result.date
    ? findAnchorBeforeValue(
        flat,
        new RegExp(escapeRegex(result.date.slice(0, 4)))
      )
    : "";
  const invAnchor =
    result.invoiceNumber && result.invoiceNumber.length >= 4
      ? findAnchorBeforeValue(flat, new RegExp(escapeRegex(result.invoiceNumber)))
      : "";
  const sstAnchor =
    result.sstOrTaxAmount && result.sstOrTaxAmount > 0
      ? findAnchorBeforeValue(
          flat,
          new RegExp(escapeRegex(result.sstOrTaxAmount.toFixed(2)))
        )
      : "";

  const keywords = result.merchant
    .toUpperCase()
    .replace(/\b(SDN|BHD|BERHAD|ENTERPRISE|TRADING|PLT)\b/g, "")
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= 3 && upper.includes(w))
    .slice(0, 3);
  if (keywords.length === 0) return;

  const newTpl: VendorReceiptTemplate = {
    vendor_key: vendorKey,
    vendor_name: result.merchant.trim().slice(0, 64),
    vendor_keywords: keywords,
    amount_anchor: amtAnchor,
    date_anchor: dateAnchor,
    invoice_anchor: invAnchor,
    sst_anchor: sstAnchor,
    category_id: result.suggestedCategoryId,
    sub_category_id: result.suggestedSubCategoryId || null,
    exclude_sst: result.suggestedSubCategoryId === "lifestyle_internet",
    hit_count: 1,
  };

  // Ensure in-memory cache is populated and updated immediately
  const current = await loadPublicVendorTemplates();
  const idx = current.findIndex((t) => t.vendor_key === vendorKey);
  if (idx >= 0) current[idx] = newTpl;
  else current.unshift(newTpl);
  cachedTemplates = current;
  cachedAt = Date.now();

  try {
    const admin = getSupabaseAdminClient();
    if (admin) {
      await admin.from("vendor_receipt_templates").upsert(
        {
          ...newTpl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vendor_key" }
      );
    }
  } catch {
    // Non-fatal if migration hasn't been applied yet
  }
}
