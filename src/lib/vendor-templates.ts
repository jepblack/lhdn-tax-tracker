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

export async function matchPublicVendorTemplate(
  pdfText: string
): Promise<(ReceiptScanResult & { learnedTemplateVendor?: string }) | null> {
  if (!pdfText || pdfText.length < 40) return null;
  const flat = pdfText.replace(/\s+/g, " ");
  const upper = flat.toUpperCase();
  const templates = await loadPublicVendorTemplates();

  for (const tpl of templates) {
    if (!tpl.vendor_keywords.length) continue;
    const allMatch = tpl.vendor_keywords.every((kw) =>
      upper.includes(kw.toUpperCase())
    );
    if (!allMatch) continue;

    // If an internet bill is bundled with TV/entertainment/device packs (e.g. Unifi TV),
    // skip the total-charge template so AI can isolate only the eligible internet line item.
    if (
      tpl.sub_category_id === "lifestyle_internet" &&
      /(UNIFI\s*TV|HYPPTV|ASTRO|ENTERTAINMENT\s*PACK|ULTIMATE\s*PACK|DEVICE\s*INSTALLMENT)/i.test(
        upper
      )
    ) {
      continue;
    }

    const amtStr = extractValueAfterAnchor(
      flat,
      tpl.amount_anchor,
      /(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
    );
    const parsedAmt = amtStr ? Number(amtStr.replace(/,/g, "")) : 0;
    if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) continue;

    const sstStr = tpl.sst_anchor
      ? extractValueAfterAnchor(flat, tpl.sst_anchor, /(?:RM|MYR)?\s*([\d,]+\.\d{2})/i)
      : "";
    const sstAmt = sstStr ? Number(sstStr.replace(/,/g, "")) : 0;

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
  const amtFixed = result.totalAmount.toFixed(2);
  const amtAnchor = findAnchorBeforeValue(
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
    .filter((w) => w.length >= 3)
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

  // Update in-memory cache immediately
  if (cachedTemplates) {
    const idx = cachedTemplates.findIndex((t) => t.vendor_key === vendorKey);
    if (idx >= 0) cachedTemplates[idx] = newTpl;
    else cachedTemplates.unshift(newTpl);
  }

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
