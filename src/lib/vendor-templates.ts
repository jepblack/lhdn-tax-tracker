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
    vendor_keywords: ["TELEKOM MALAYSIA", "UNIFI"],
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
    vendor_keywords: ["TIME DOTCOM", "TIME FIBRE"],
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
    vendor_keywords: ["MAXIS BROADBAND", "MAXIS FIBRE"],
    amount_anchor: "Current Charges",
    date_anchor: "Statement Date",
    invoice_anchor: "Bill No",
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
  const upper = flat.toUpperCase();
  const templates = await loadPublicVendorTemplates();

  for (const tpl of templates) {
    if (!tpl.vendor_keywords.length) continue;
    const matchedKwCount = tpl.vendor_keywords.filter((kw) =>
      upper.includes(kw.toUpperCase())
    ).length;
    if (matchedKwCount < Math.min(2, tpl.vendor_keywords.length)) continue;

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

    const amtStr = extractValueAfterAnchor(
      flat,
      tpl.amount_anchor,
      /(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
    );
    const parsedAmt = amtStr ? Number(amtStr.replace(/,/g, "")) : 0;
    if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) continue;

    const sstAmt = extractSstAmount(flat, tpl.sst_anchor, parsedAmt);

    const claimable =
      tpl.exclude_sst && sstAmt > 0 && parsedAmt > sstAmt
        ? Math.round((parsedAmt - sstAmt) * 100) / 100
        : parsedAmt;

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

    return {
      eligibility: "eligible",
      merchant: tpl.vendor_name,
      date: parsedDate,
      amount: claimable,
      totalAmount: parsedAmt,
      sstOrTaxAmount: sstAmt,
      taxInclusive: true,
      currency: "MYR",
      invoiceNumber: invStr,
      archiveCategory:
        tpl.sub_category_id === "lifestyle_internet" ? "personal" : "other",
      description: `${tpl.vendor_name} (auto-extracted via shared layout template)`,
      suggestedCategoryId: tpl.category_id,
      suggestedSubCategoryId: tpl.sub_category_id,
      confidence: "high",
      reasoning: `Matched shared CukaiKu layout template for ${tpl.vendor_name} (${tpl.amount_anchor}).`,
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
