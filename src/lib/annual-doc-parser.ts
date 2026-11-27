import { parseMalaysianPayslipText } from "./payslip-parser";
import {
  extractPdfTextInBrowser,
  renderPdfFirstPageToJpeg,
} from "./pdf-to-image";
import { getSupabaseClient } from "./supabase";
import { AnnualDocExtraction, AnnualDocType, TaxYear } from "./types";

function hasExtractedFigures(ext: AnnualDocExtraction): boolean {
  return Boolean(
    ext.annualIncome > 0 ||
      ext.pcbPaid > 0 ||
      ext.zakatPaid > 0 ||
      ext.epfEmployee > 0 ||
      ext.socsoEisEmployee > 0 ||
      ext.lifeInsuranceAmount > 0 ||
      ext.medicalInsuranceAmount > 0 ||
      ext.housingLoanInterest > 0 ||
      (ext.extraReliefs && ext.extraReliefs.length > 0)
  );
}

/**
 * Parses an annual tax document (Form BE, EA Form, KWSP, Insurance, Housing Loan)
 * by sending the full PDF first so multi-page documents extract all pages,
 * falling back to Page 1 JPEG rendering / on-device OCR for scanned PDFs/images.
 */
export async function parseAnnualDocFile(
  file: File,
  docType: AnnualDocType,
  slotLabel: string,
  fallbackYear: TaxYear
): Promise<{ extraction: AnnualDocExtraction | null; skipReason: string | null }> {
  const headers: Record<string, string> = {};
  const sb = getSupabaseClient();
  if (sb) {
    const { data: sess } = await sb.auth.getSession();
    if (sess.session?.access_token) {
      headers["Authorization"] = `Bearer ${sess.session.access_token}`;
    }
  }

  const postToApi = async (uploadFile: File) => {
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("docType", docType);
    fd.append("taxYear", String(fallbackYear));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    try {
      return await fetch("/api/parse-annual-doc", {
        method: "POST",
        headers,
        body: fd,
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const isPdfFile =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let res = await postToApi(file);
  let serverSkipReason: string | null = null;
  let isScannedPdf = false;

  if (res && res.ok) {
    const data = await res.json();
    if (!data.skipped && data.docType) {
      const ext = data as AnnualDocExtraction;
      if (hasExtractedFigures(ext)) return { extraction: ext, skipReason: null };
    } else {
      serverSkipReason = data.skipReason || null;
      isScannedPdf = Boolean(data.scannedPdf);
    }
  }

  let imageForFallback: File | null = file.type.startsWith("image/") ? file : null;
  if (isPdfFile && isScannedPdf) {
    // First check if browser PDF.js can extract embedded text (e.g. if server unpdf missed it)
    if (docType === "ea_form" || docType === "kwsp_statement") {
      const browserText = await extractPdfTextInBrowser(file, 3);
      if (browserText.length >= 20) {
        const p = parseMalaysianPayslipText(browserText);
        const browserExt: AnnualDocExtraction = {
          docType,
          providerName: docType === "kwsp_statement" ? "KWSP / EPF" : slotLabel,
          annualIncome: p.estimatedAnnualIncome,
          pcbPaid: p.ytdPcb || p.monthlyPcb,
          zakatPaid: p.ytdZakat || p.monthlyZakat,
          epfEmployee: p.ytdEpf || p.employeeEpf,
          socsoEisEmployee:
            (p.ytdSocso || p.employeeSocso) + (p.ytdEis || p.employeeEis),
          lifeInsuranceAmount: 0,
          medicalInsuranceAmount: 0,
          housingLoanInterest: 0,
          summaryNote: p.notes.join(" ") || "Extracted from PDF text.",
          confidence: p.confidence,
        };
        if (hasExtractedFigures(browserExt)) {
          return { extraction: browserExt, skipReason: null };
        }
      }
    }
    imageForFallback = await renderPdfFirstPageToJpeg(file, 1600);
    if (imageForFallback) {
      res = await postToApi(imageForFallback);
      if (res && res.ok) {
        const data = await res.json();
        if (!data.skipped && data.docType) {
          const ext = data as AnnualDocExtraction;
          if (hasExtractedFigures(ext)) return { extraction: ext, skipReason: null };
        } else if (data.skipReason) {
          serverSkipReason = data.skipReason;
        }
      }
    }
  }

  if (imageForFallback && imageForFallback.type.startsWith("image/")) {
    try {
      const Tesseract = await import("tesseract.js");
      const { data: ocrData } = await Tesseract.recognize(imageForFallback, "eng");
      const p = parseMalaysianPayslipText(ocrData.text || "");
      const fallbackExt: AnnualDocExtraction = {
        docType,
        providerName: slotLabel,
        annualIncome: p.estimatedAnnualIncome,
        pcbPaid: p.ytdPcb || p.monthlyPcb,
        zakatPaid: p.ytdZakat || p.monthlyZakat,
        epfEmployee: p.ytdEpf || p.employeeEpf,
        socsoEisEmployee:
          (p.ytdSocso || p.employeeSocso) + (p.ytdEis || p.employeeEis),
        lifeInsuranceAmount: 0,
        medicalInsuranceAmount: 0,
        housingLoanInterest: 0,
        summaryNote: "Extracted automatically using built-in on-device OCR.",
        confidence: p.confidence,
      };
      if (hasExtractedFigures(fallbackExt)) {
        return { extraction: fallbackExt, skipReason: null };
      }
    } catch {
      // ignore OCR fallback error
    }
  }

  return { extraction: null, skipReason: serverSkipReason };
}
