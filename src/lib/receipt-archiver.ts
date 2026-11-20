import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ArchiveCategory,
  LhdnReceiptMetadata,
  TaxExpense,
} from "./types";

/**
 * Generates LHDN-compliant ASCII filename base:
 * YYYY-MM-DD_MERCHANT_SHORTNAME_AMOUNT_MYR[_CATEGORY]
 * Example: 2026-11-20_guardian_45-90_myr_medical
 */
export function buildArchiveBaseFilename(params: {
  transactionDate: string;
  merchantName: string;
  amountPaid: number;
  currency?: string;
  category?: ArchiveCategory | string;
}): string {
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(params.transactionDate)
    ? params.transactionDate
    : new Date().toISOString().slice(0, 10);

  const merchantSlug = sanitizeAsciiSlug(params.merchantName || "unknown", 24);
  const amountSlug = (Number(params.amountPaid) || 0)
    .toFixed(2)
    .replace(".", "-");
  const currencySlug = sanitizeAsciiSlug(params.currency || "myr", 6) || "myr";
  const categorySlug = params.category
    ? sanitizeAsciiSlug(params.category, 20)
    : "";

  return categorySlug
    ? `${datePart}_${merchantSlug}_${amountSlug}_${currencySlug}_${categorySlug}`
    : `${datePart}_${merchantSlug}_${amountSlug}_${currencySlug}`;
}

function sanitizeAsciiSlug(input: string, maxLen: number): string {
  return input
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

/**
 * Maps our LHDN Relief Category/Sub-category IDs to the standardized ArchiveCategory list.
 */
export function mapReliefToArchiveCategory(
  categoryId: string,
  subCategoryId?: string | null
): ArchiveCategory {
  if (subCategoryId === "med_dental") return "dental";
  if (categoryId === "medical_self" || categoryId === "parents_medical" || categoryId === "supporting_equipment") {
    return "medical";
  }
  if (categoryId === "sports") return "sports";
  if (subCategoryId === "lifestyle_books") return "books";
  if (subCategoryId === "lifestyle_tech") return "computer_or_phone";
  if (categoryId === "education_self" || categoryId === "sspn") return "education";
  if (categoryId === "edu_med_insurance" || categoryId === "epf_life_insurance" || categoryId === "prs_annuity" || categoryId === "socso") {
    return "insurance";
  }
  if (categoryId === "childcare" || categoryId === "breastfeeding") return "childcare";
  if (categoryId === "approved_donations") return "donation";
  return "other";
}

/**
 * Computes SHA-256 hex hash of the original uploaded file for audit integrity & duplicate detection.
 */
export async function computeFileSha256(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

/**
 * Masks any accidentally visible full card numbers (13-19 digits) or Malaysian NRIC (YYMMDD-PB-####)
 * in metadata text fields to protect privacy.
 */
export function maskSensitiveText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b\d{6}-\d{2}-\d{4}\b/g, "******-**-****")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19) {
        return `****-****-****-${digits.slice(-4)}`;
      }
      return match;
    });
}

/**
 * Detects potential duplicate receipts using:
 * 1. Exact SHA-256 original_file_hash
 * 2. Matching receipt_number + merchant
 * 3. Same date + amount + similar merchant name
 */
export function findDuplicateExpense(
  candidate: {
    merchant: string;
    amount: number;
    expenseDate: string;
    invoiceNumber?: string;
    fileHash?: string;
  },
  existingExpenses: TaxExpense[]
): { match: TaxExpense; reason: string } | null {
  const normMerchant = candidate.merchant.trim().toLowerCase();
  const normInv = (candidate.invoiceNumber || "").trim().toLowerCase();

  for (const exp of existingExpenses) {
    if (
      candidate.fileHash &&
      exp.metadata?.original_file_hash &&
      exp.metadata.original_file_hash === candidate.fileHash
    ) {
      return {
        match: exp,
        reason: `Exact same receipt file (identical SHA-256 hash) already archived under YA ${exp.taxYear} (${exp.merchant}, ${exp.expenseDate}).`,
      };
    }

    const expInv = (exp.invoiceNumber || exp.metadata?.receipt_number || "")
      .trim()
      .toLowerCase();
    const expMerchant = exp.merchant.trim().toLowerCase();

    if (normInv && expInv && normInv === expInv && normMerchant === expMerchant) {
      return {
        match: exp,
        reason: `Same receipt/invoice number (#${candidate.invoiceNumber}) from ${exp.merchant} already saved under YA ${exp.taxYear}.`,
      };
    }

    const sameDate = exp.expenseDate === candidate.expenseDate;
    const sameAmount = Math.abs(exp.amount - candidate.amount) < 0.01;
    const similarMerchant =
      normMerchant &&
      expMerchant &&
      (normMerchant.includes(expMerchant.slice(0, 6)) ||
        expMerchant.includes(normMerchant.slice(0, 6)));

    if (sameDate && sameAmount && similarMerchant) {
      return {
        match: exp,
        reason: `Possible duplicate under YA ${exp.taxYear}: ${exp.merchant} on ${exp.expenseDate} for RM ${exp.amount.toFixed(2)}.`,
      };
    }
  }

  return null;
}

/**
 * Converts a receipt photo/scan into a compact, single-page, searchable PDF (< 150 KB target, <= 300 KB ceiling).
 * - Grayscale by default (optionally keep color for stamps/highlights)
 * - Mild contrast enhancement, never upscales
 * - JPEG quality 0.62–0.74 dynamically tuned to stay under 150 KB target
 * - Embeds invisible searchable text layer (merchant, date, receipt #, items, total)
 * If the input is already a PDF / e-Invoice, returns it UNALTERED with the standardized filename.
 */
export async function buildSearchableReceiptPdf(
  file: File,
  metadata: LhdnReceiptMetadata,
  options?: { keepColor?: boolean }
): Promise<File> {
  const pdfFilename = metadata.file_pdf;

  // Do not alter original PDF / e-Invoice
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    const bytes = await file.arrayBuffer();
    return new File([bytes], pdfFilename, { type: "application/pdf" });
  }

  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Preprocess image to grayscale + mild contrast, never upscaling, targeting < 150 KB
  const { jpegBytes, width, height } = await compressReceiptImageForPdf(
    file,
    Boolean(options?.keepColor)
  );

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${metadata.merchant_name} - ${metadata.transaction_date}`);
  pdfDoc.setSubject(`LHDN Receipt Archive (${metadata.category})`);
  pdfDoc.setKeywords([
    metadata.merchant_name,
    metadata.transaction_date,
    metadata.receipt_number,
    metadata.category,
    metadata.lhdn_relief_or_expense_type,
    `${metadata.currency} ${metadata.amount_paid.toFixed(2)}`,
  ].filter(Boolean));
  pdfDoc.setCreator("CukaiKu LHDN Archiver");

  // Fit on A4-width portrait page (595pt width) preserving aspect ratio
  const pageWidth = 595;
  const scale = pageWidth / width;
  const pageHeight = Math.max(300, Math.round(height * scale));
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  // 1. Draw invisible searchable text layer UNDER the receipt image so Ctrl+F works
  try {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const searchableLines = [
      `Merchant: ${metadata.merchant_name}`,
      `Date: ${metadata.transaction_date}`,
      `Receipt No: ${metadata.receipt_number}`,
      `Tax/Reg ID: ${metadata.merchant_registration_or_tax_id}`,
      `Amount: ${metadata.currency} ${metadata.amount_paid.toFixed(2)}`,
      `SST/Tax: ${metadata.sst_or_tax_amount.toFixed(2)}`,
      `Payment: ${metadata.payment_method} ${metadata.card_last4 ? "****" + metadata.card_last4 : ""}`,
      `Category: ${metadata.category} ${metadata.lhdn_relief_or_expense_type}`,
      ...metadata.items.map(
        (it) => `${it.description} x${it.quantity} ${it.amount.toFixed(2)}`
      ),
    ]
      .map((s) => s.replace(/[^\x20-\x7E]/g, " ").trim())
      .filter(Boolean);

    let y = pageHeight - 16;
    for (const line of searchableLines.slice(0, 25)) {
      page.drawText(line.slice(0, 95), {
        x: 10,
        y,
        size: 8,
        font,
        color: rgb(1, 1, 1),
        opacity: 0.01,
      });
      y -= 11;
      if (y < 12) break;
    }
  } catch {
    // Non-fatal if font embedding fails
  }

  // 2. Embed compressed JPEG receipt image filling the page cleanly
  const embeddedImg = await pdfDoc.embedJpg(jpegBytes);
  page.drawImage(embeddedImg, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return new File([new Uint8Array(pdfBytes)], pdfFilename, {
    type: "application/pdf",
  });
}

async function compressReceiptImageForPdf(
  file: File,
  keepColor: boolean
): Promise<{ jpegBytes: Uint8Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        // Never upscale; cap at 1200px width (approx 200 DPI for standard 80mm-150mm receipt)
        const maxDim = 1350;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");

        ctx.drawImage(img, 0, 0, width, height);

        if (!keepColor) {
          // Grayscale + mild contrast enhancement for ordinary paper receipts
          const imageData = ctx.getImageData(0, 0, width, height);
          const d = imageData.data;
          const contrast = 1.18;
          const intercept = 128 * (1 - contrast);
          for (let i = 0; i < d.length; i += 4) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const v = Math.max(0, Math.min(255, g * contrast + intercept));
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
          }
          ctx.putImageData(imageData, 0, 0);
        }

        // Aim for < 150 KB (ceiling 300 KB) using JPEG quality 0.72 -> 0.65 -> 0.58
        const qualities = [0.72, 0.65, 0.58];
        let bestBytes: Uint8Array = new Uint8Array();
        for (const q of qualities) {
          const blob = await new Promise<Blob | null>((res) =>
            canvas.toBlob(res, "image/jpeg", q)
          );
          if (!blob) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          bestBytes = bytes;
          if (bytes.byteLength <= 145 * 1024) break;
        }

        URL.revokeObjectURL(objectUrl);
        resolve({ jpegBytes: bestBytes, width, height });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image"));
    };
    img.src = objectUrl;
  });
}

export function buildJsonMetadataFile(metadata: LhdnReceiptMetadata): File {
  const jsonFilename = metadata.file_pdf.replace(/\.pdf$/i, ".json");
  const jsonString = JSON.stringify(metadata, null, 2);
  return new File([jsonString], jsonFilename, { type: "application/json" });
}

export function downloadJsonMetadata(metadata: LhdnReceiptMetadata): void {
  const jsonFilename = metadata.file_pdf.replace(/\.pdf$/i, ".json");
  const blob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = jsonFilename;
  link.click();
  URL.revokeObjectURL(url);
}
