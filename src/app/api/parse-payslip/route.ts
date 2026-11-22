import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { callGroqJson } from "@/lib/groq-vision";
import {
  EaFormExtraction,
  parseMalaysianPayslipText,
  PayslipExtraction,
} from "@/lib/payslip-parser";

export const runtime = "nodejs";
export const maxDuration = 60;
const GEMINI_MODEL = "gemini-3.8-flash";

let cachedGeminiModels: string[] | null = null;
let cachedGeminiAt = 0;

async function getActiveGeminiVisionModels(apiKey: string): Promise<string[]> {
  if (cachedGeminiModels && Date.now() - cachedGeminiAt < 10 * 60 * 1000) {
    return cachedGeminiModels;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (res.ok) {
      const data = await res.json();
      const all: Array<{ name?: string; supportedGenerationMethods?: string[] }> =
        Array.isArray(data.models) ? data.models : [];
      const usable = all
        .filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent")
        )
        .map((m) => String(m.name || "").replace(/^models\//, ""))
        .filter(
          (id) =>
            id &&
            !/(embedding|tts|imagen|veo|aqa|robotics|computer-use|lite)/i.test(id)
        );

      const picked: string[] = [];
      const matchers = [
        /gemini-3\.8-flash/i,
        /gemini-3\.\d+-flash/i,
        /gemini-2\.5-flash/i,
        /gemini-2\.0-flash/i,
        /flash/i,
        /gemini/i,
      ];
      for (const rx of matchers) {
        for (const id of usable) {
          if (rx.test(id) && !picked.includes(id)) picked.push(id);
        }
      }
      if (picked.length > 0) {
        cachedGeminiModels = picked.slice(0, 4);
        cachedGeminiAt = Date.now();
        return cachedGeminiModels;
      }
    }
  } catch {
    // ignore discovery errors
  }
  return [GEMINI_MODEL, "gemini-2.5-flash", "gemini-2.0-flash"];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toOptNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : round2(n);
}

function toOptStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function normalizeAiPayslip(
  raw: Record<string, unknown>,
  engine: string,
  rawText?: string
): PayslipExtraction {
  const formTypeRaw = toOptStr(raw.form_type);
  const isEa =
    Boolean(formTypeRaw) ||
    String(raw.sourceType || "").toLowerCase().includes("ea") ||
    raw.total_gross_income !== undefined ||
    raw.gross_salary_wages_ot !== undefined;

  if (isEa) {
    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings.map(String).filter(Boolean)
      : [];

    const ea: EaFormExtraction = {
      form_type:
        formTypeRaw?.includes("8C") || formTypeRaw?.includes("EC")
          ? "C.P.8C (EC)"
          : "C.P.8A (EA)",
      form_version: toOptStr(raw.form_version),
      tax_year: raw.tax_year !== null && raw.tax_year !== undefined ? Number(raw.tax_year) || null : null,
      form_date: toOptStr(raw.form_date),
      employer_statement_number: toOptStr(raw.employer_statement_number),
      employer_tax_number: toOptStr(raw.employer_tax_number),
      employee_name: toOptStr(raw.employee_name),
      employee_designation: toOptStr(raw.employee_designation),
      employee_staff_or_payroll_number: toOptStr(raw.employee_staff_or_payroll_number),
      employee_nric_or_passport: toOptStr(raw.employee_nric_or_passport),
      employee_tin: toOptStr(raw.employee_tin),
      employee_epf_number: toOptStr(raw.employee_epf_number),
      employee_socso_number: toOptStr(raw.employee_socso_number),
      employee_category: toOptStr(raw.employee_category),
      employment_status: toOptStr(raw.employment_status),
      employment_start_date: toOptStr(raw.employment_start_date),
      employment_end_date: toOptStr(raw.employment_end_date),
      retirement_or_contract_end_date: toOptStr(raw.retirement_or_contract_end_date),
      eligible_children_for_tax_relief: toOptNum(raw.eligible_children_for_tax_relief),
      lhdnm_branch: toOptStr(raw.lhdnm_branch),
      employer_name: toOptStr(raw.employer_name),
      employer_address: toOptStr(raw.employer_address),
      employer_phone_number: toOptStr(raw.employer_phone_number),
      employer_e_number: toOptStr(raw.employer_e_number),
      employer_income_tax_number: toOptStr(raw.employer_income_tax_number),
      gross_salary_wages_ot: toOptNum(raw.gross_salary_wages_ot),
      fees_commission_bonus: toOptNum(raw.fees_commission_bonus),
      tips_perquisites_gratuity_allowances: toOptNum(raw.tips_perquisites_gratuity_allowances),
      income_tax_paid_by_employer: toOptNum(raw.income_tax_paid_by_employer),
      esos_benefit: toOptNum(raw.esos_benefit),
      gratuity_or_reward: toOptNum(raw.gratuity_or_reward),
      arrears_prior_years: toOptNum(raw.arrears_prior_years),
      benefits_in_kind: toOptNum(raw.benefits_in_kind),
      residential_benefit: toOptNum(raw.residential_benefit),
      repayment_from_unapproved_fund: toOptNum(raw.repayment_from_unapproved_fund),
      compensation_for_loss_of_employment: toOptNum(raw.compensation_for_loss_of_employment),
      pension: toOptNum(raw.pension),
      other_periodic_payments: toOptNum(raw.other_periodic_payments),
      total_gross_income: toOptNum(raw.total_gross_income),
      pcb_paid_to_lhdnm: toOptNum(raw.pcb_paid_to_lhdnm),
      cp38: toOptNum(raw.cp38),
      zakat_via_salary_deduction: toOptNum(raw.zakat_via_salary_deduction),
      tp1_relief: toOptNum(raw.tp1_relief),
      zakat_other_than_salary_deduction: toOptNum(raw.zakat_other_than_salary_deduction),
      children_relief: toOptNum(raw.children_relief),
      epf_employee_contribution: toOptNum(raw.epf_employee_contribution),
      socso_employee_contribution: toOptNum(raw.socso_employee_contribution),
      other_approved_fund_contribution: toOptNum(raw.other_approved_fund_contribution),
      tax_exempt_benefits: toOptNum(raw.tax_exempt_benefits),
      certified_by_name: toOptStr(raw.certified_by_name),
      certified_by_designation: toOptStr(raw.certified_by_designation),
      certification_date: toOptStr(raw.certification_date),
      warnings,
    };

    const totalGross = ea.total_gross_income ?? 0;
    const pcb = ea.pcb_paid_to_lhdnm ?? 0;
    const zakat = ea.zakat_via_salary_deduction ?? 0;
    const epf = ea.epf_employee_contribution ?? 0;
    const socso = ea.socso_employee_contribution ?? 0;
    const eis = ea.other_approved_fund_contribution ?? 0;

    const notes = [`Extracted via ${engine}.`, ...warnings];
    const foundCount = [totalGross > 0, ea.pcb_paid_to_lhdnm !== null, ea.epf_employee_contribution !== null].filter(Boolean).length;

    return {
      sourceType: "ea-form",
      formVersion: ea.form_version || undefined,
      yearDetected: ea.tax_year || undefined,
      employerName: ea.employer_name || undefined,
      employerNo: ea.employer_e_number || undefined,
      employerAddress: ea.employer_address || undefined,
      employeeName: ea.employee_name || undefined,
      employeeIc: ea.employee_nric_or_passport || undefined,
      employeePosition: ea.employee_designation || undefined,
      employeeEpfNo: ea.employee_epf_number || undefined,
      monthlyGross: 0,
      ytdGross: round2(totalGross),
      estimatedAnnualIncome: round2(totalGross),
      grossSalaryB1a: ea.gross_salary_wages_ot ?? undefined,
      allowancesB1c: ea.tips_perquisites_gratuity_allowances ?? undefined,
      monthlyPcb: round2(pcb),
      ytdPcb: round2(pcb),
      monthlyZakat: round2(zakat),
      ytdZakat: round2(zakat),
      employeeEpf: round2(epf),
      ytdEpf: round2(epf),
      employeeSocso: round2(socso),
      ytdSocso: round2(socso),
      employeeEis: round2(eis),
      ytdEis: round2(eis),
      eaForm: ea,
      rawText,
      confidence: foundCount >= 2 && warnings.length === 0 ? "high" : foundCount >= 1 ? "medium" : "low",
      notes,
    };
  }

  // Monthly / YTD Payslip normalization
  const annualIncome = Number(raw.annualIncome) || 0;
  const monthlyGross = Number(raw.monthlyGross) || 0;
  const ytdGross = Number(raw.ytdGross) || 0;
  const estimatedAnnual =
    annualIncome > 0
      ? annualIncome
      : monthlyGross > 0
      ? monthlyGross * 12
      : ytdGross;

  const pcbPaid = Number(raw.pcbPaid) || 0;
  const monthlyPcb = Number(raw.monthlyPcb) || 0;
  const zakatPaid = Number(raw.zakatPaid) || 0;
  const monthlyZakat = Number(raw.monthlyZakat) || 0;
  const epf = Number(raw.epfEmployee) || 0;
  const socso = Number(raw.socsoEmployee) || 0;
  const eis = Number(raw.eisEmployee) || 0;

  return {
    sourceType: ytdGross > 0 ? "ytd" : "monthly",
    monthDetected: raw.monthDetected ? String(raw.monthDetected) : undefined,
    employerName: raw.employer_name ? String(raw.employer_name) : raw.employerName ? String(raw.employerName) : undefined,
    monthlyGross: round2(monthlyGross),
    ytdGross: round2(ytdGross),
    estimatedAnnualIncome: round2(estimatedAnnual),
    monthlyPcb: round2(monthlyPcb),
    ytdPcb: round2(pcbPaid || monthlyPcb),
    monthlyZakat: round2(monthlyZakat),
    ytdZakat: round2(zakatPaid || monthlyZakat),
    employeeEpf: round2(epf),
    ytdEpf: 0,
    employeeSocso: round2(socso),
    ytdSocso: 0,
    employeeEis: round2(eis),
    ytdEis: 0,
    rawText,
    confidence:
      raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
        ? raw.confidence
        : estimatedAnnual > 0
        ? "high"
        : "medium",
    notes: [`Extracted via ${engine}.`],
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const renderedImage = formData.get("renderedImage") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "NO_FILE", message: "Please upload a PDF or image payslip / EA Form." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: "EMPTY_FILE", message: "The uploaded file is empty." },
        { status: 400 }
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    let pdfText = "";
    if (isPdf) {
      try {
        const { text } = await extractText(new Uint8Array(arrayBuffer.slice(0)), {
          mergePages: true,
        });
        pdfText = (Array.isArray(text) ? text.join("\n") : String(text || ""))
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
          .trim();
      } catch (err) {
        console.warn("PDF text extraction warning:", err);
        pdfText = "";
      }
    }

    // 1. Fast Regex Parser for text PDFs (for EA Forms, prefer Visual AI if Gemini is available)
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const canUseGroq = Boolean(groqKey && groqKey !== "your-groq-api-key");
    const canUseGemini = Boolean(geminiKey && geminiKey !== "your-gemini-api-key");

    let fastResult: PayslipExtraction | null = null;
    if (pdfText.length >= 25) {
      fastResult = parseMalaysianPayslipText(pdfText);
      const isCleanPayslip =
        fastResult.sourceType !== "ea-form" && fastResult.confidence === "high";
      const isCleanEaWithoutAi =
        fastResult.sourceType === "ea-form" &&
        !canUseGemini &&
        fastResult.confidence === "high" &&
        (fastResult.eaForm?.warnings.length ?? 0) === 0;

      if (isCleanPayslip || isCleanEaWithoutAi) {
        return NextResponse.json(fastResult);
      }
    }

    const prompt = `Anda ialah pengekstrak data Borang EA Malaysia (C.P.8A / Penyata Saraan daripada Penggajian) dan Slip Gaji Malaysia.
Baca dokumen (PDF, imej atau teks OCR) dengan teliti.

PERATURAN UTAMA BORANG EA / EC (C.P.8A Pin. 2017–2024 atau C.P.8C):
1. Jangan mengandaikan susunan teks OCR sama dengan susunan visual borang. Padankan setiap angka dengan label item yang betul berdasarkan kedudukan visual lajur dan baris.
2. Kenal pasti jenis borang ("C.P.8A (EA)" atau "C.P.8C (EC)"), versi pin (cth. "Pin. 2017", "Pin. 2024", atau null), dan tahun saraan daripada "BAGI TAHUN BERAKHIR 31 DISEMBER".
3. Jika maklumat tidak wujud, pulangkan null. Jika wujud dan bernilai 0.00, pulangkan 0 (bukan null). Jika tidak jelas atau bercanggah, pulangkan null dan jelaskan dalam "warnings".
4. Baca Bahagian B dan Bahagian C sahaja untuk pendapatan. "total_gross_income" MESTI diambil daripada ruang "JUMLAH" selepas Bahagian B dan C. Jangan kira semula melainkan ruang itu tiada; jika jumlah wujud tetapi tidak konsisten dengan hasil tambah B+C, kekalkan nilai bercetak dan tambah amaran ke "warnings".
5. Jangan masukkan PCB, CP38, KWSP, PERKESO, zakat, pelepasan, atau "tax_exempt_benefits" (Bahagian F / Jumlah Elaun/Perkuisit/Pemberian/Manfaat yang Dikecualikan Cukai) ke dalam "total_gross_income".
6. Simpan semua nilai wang sebagai nombor (cth. 111807.69), tanpa "RM" atau koma ribuan.

Jika ini Borang EA/EC, pulangkan JSON tepat dengan kunci berikut (tiada markdown):
{
  "form_type": "C.P.8A (EA)" | "C.P.8C (EC)",
  "form_version": string | null,
  "tax_year": number | null,
  "form_date": string | null,
  "employer_statement_number": string | null,
  "employer_tax_number": string | null,
  "employee_name": string | null,
  "employee_designation": string | null,
  "employee_staff_or_payroll_number": string | null,
  "employee_nric_or_passport": string | null,
  "employee_tin": string | null,
  "employee_epf_number": string | null,
  "employee_socso_number": string | null,
  "employee_category": string | null,
  "employment_status": string | null,
  "employment_start_date": string | null,
  "employment_end_date": string | null,
  "retirement_or_contract_end_date": string | null,
  "eligible_children_for_tax_relief": number | null,
  "lhdnm_branch": string | null,
  "employer_name": string | null,
  "employer_address": string | null,
  "employer_phone_number": string | null,
  "employer_e_number": string | null,
  "employer_income_tax_number": string | null,
  "gross_salary_wages_ot": number | null,
  "fees_commission_bonus": number | null,
  "tips_perquisites_gratuity_allowances": number | null,
  "income_tax_paid_by_employer": number | null,
  "esos_benefit": number | null,
  "gratuity_or_reward": number | null,
  "arrears_prior_years": number | null,
  "benefits_in_kind": number | null,
  "residential_benefit": number | null,
  "repayment_from_unapproved_fund": number | null,
  "compensation_for_loss_of_employment": number | null,
  "pension": number | null,
  "other_periodic_payments": number | null,
  "total_gross_income": number | null,
  "pcb_paid_to_lhdnm": number | null,
  "cp38": number | null,
  "zakat_via_salary_deduction": number | null,
  "tp1_relief": number | null,
  "zakat_other_than_salary_deduction": number | null,
  "children_relief": number | null,
  "epf_employee_contribution": number | null,
  "socso_employee_contribution": number | null,
  "other_approved_fund_contribution": number | null,
  "tax_exempt_benefits": number | null,
  "certified_by_name": string | null,
  "certified_by_designation": string | null,
  "certification_date": string | null,
  "warnings": [string]
}

Jika ini Slip Gaji Bulanan/YTD (bukan Borang EA/EC), pulangkan JSON:
{
  "sourceType": "monthly" | "ytd",
  "employerName": string | null,
  "monthDetected": string | null,
  "annualIncome": number,
  "monthlyGross": number,
  "ytdGross": number,
  "pcbPaid": number,
  "monthlyPcb": number,
  "zakatPaid": number,
  "monthlyZakat": number,
  "epfEmployee": number,
  "socsoEmployee": number,
  "eisEmployee": number,
  "confidence": "high" | "medium" | "low"
}`;

    // Prepare visual image (either uploaded image OR client-rendered JPEG of PDF Page 1)
    let visualImageBase64: string | null = null;
    let visualImageMimeType = "image/jpeg";
    if (!isPdf && file.type.startsWith("image/")) {
      visualImageBase64 = Buffer.from(arrayBuffer).toString("base64");
      visualImageMimeType = file.type || "image/jpeg";
    } else if (renderedImage && renderedImage.size > 0) {
      const imgBuf = await renderedImage.arrayBuffer();
      if (imgBuf.byteLength > 0) {
        visualImageBase64 = Buffer.from(imgBuf).toString("base64");
        visualImageMimeType = renderedImage.type || "image/jpeg";
      }
    }

    let aiDebugReason = "";
    // For PDFs, Gemini can read the visual PDF layout directly via inlineData (avoids scrambled OCR text order!)
    if (canUseGemini) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey!, vertexai: false });
        const contents = [
          { text: prompt },
          {
            inlineData: visualImageBase64
              ? { mimeType: visualImageMimeType, data: visualImageBase64 }
              : {
                  mimeType: isPdf ? "application/pdf" : visualImageMimeType,
                  data: Buffer.from(arrayBuffer).toString("base64"),
                },
          },
        ];

        const callGeminiParsed = async (): Promise<Record<string, unknown>> => {
          const models = await getActiveGeminiVisionModels(geminiKey!);
          const errList: string[] = [];
          for (const modelName of models) {
            try {
              let res;
              try {
                res = await ai.models.generateContent({
                  model: modelName,
                  contents,
                  config: {
                    temperature: 0.1,
                    maxOutputTokens: 4096,
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                  },
                });
              } catch (cfgErr) {
                const m = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
                if (m.includes("400") || m.includes("INVALID_ARGUMENT")) {
                  res = await ai.models.generateContent({
                    model: modelName,
                    contents,
                    config: {
                      temperature: 0.1,
                      maxOutputTokens: 4096,
                      responseMimeType: "application/json",
                    },
                  });
                } else {
                  throw cfgErr;
                }
              }

              const raw = String(res.text || "")
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();
              const match = raw.match(/\{[\s\S]*\}/);
              return JSON.parse((match ? match[0] : raw).trim());
            } catch (modelErr) {
              const msg = modelErr instanceof Error ? modelErr.message.slice(0, 80) : String(modelErr);
              errList.push(`${modelName}: ${msg}`);
            }
          }
          throw new Error(errList.join(" | ") || "Gemini failed");
        };

        const parsed = await Promise.race([
          callGeminiParsed(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("AI_TIMEOUT")), 25000)
          ),
        ]);

        const aiExtraction = normalizeAiPayslip(parsed, "Gemini Vision", pdfText || undefined);
        return NextResponse.json(aiExtraction);
      } catch (geminiErr) {
        const msg = geminiErr instanceof Error ? geminiErr.message.slice(0, 100) : "Gemini error";
        aiDebugReason += `Gemini: ${msg}. `;
        console.warn("Gemini payslip/EA parse failed, falling back to Groq:", geminiErr);
      }
    }

    // Try Groq Vision if Gemini unavailable/failed.
    // CRITICAL: When visualImageBase64 is available (including rendered PDF page 1),
    // pass textContent=null so Groq uses its Vision model on the real layout
    // rather than scrambled unpdf text!
    if (canUseGroq && visualImageBase64) {
      try {
        const parsed = await callGroqJson({
          apiKey: groqKey!,
          prompt,
          textContent: null,
          imageBase64: visualImageBase64,
          imageMimeType: visualImageMimeType,
          maxTokens: 1500,
        });
        const aiExtraction = normalizeAiPayslip(parsed, "Groq Vision", pdfText || undefined);
        return NextResponse.json(aiExtraction);
      } catch (groqErr) {
        const msg = groqErr instanceof Error ? groqErr.message.slice(0, 120) : "Groq Vision error";
        aiDebugReason += `GroqVision: ${msg}. `;
        console.warn("Groq Vision payslip/EA parse failed:", groqErr);
      }
    }

    // Do NOT use Groq Text fallback on scrambled unpdf text — if Vision AI failed for an EA Form,
    // ask the user to retry after a moment or enter values manually.
    if (fastResult?.sourceType === "ea-form") {
      return NextResponse.json(
        {
          error: "AI_VISION_UNAVAILABLE",
          retryable: true,
          message:
            "AI Vision could not read this EA Form right now (temporary busy/rate limit). Please click Retry in a few seconds, or enter the figures manually below.",
        },
        { status: 503 }
      );
    }

    // Fall back to regex result for standard text-ordered monthly payslips
    if (fastResult) {
      return NextResponse.json(fastResult);
    }

    if (isPdf && pdfText.length < 25) {
      return NextResponse.json(
        {
          error: "SCANNED_PDF",
          message:
            "This PDF is a scanned image without selectable text. Please upload a clear photo/screenshot (JPG/PNG) instead, or enter the figures manually.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      useClientOcr: true,
      message: "No figures detected automatically. Falling back to on-device OCR.",
    });
  } catch (err) {
    console.error("Payslip parse API error:", err);
    return NextResponse.json(
      {
        error: "PARSE_FAILED",
        message:
          "Could not read this document. If your file is password-protected, upload a screenshot or photo instead.",
      },
      { status: 422 }
    );
  }
}
