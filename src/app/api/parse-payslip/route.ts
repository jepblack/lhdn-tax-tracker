import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { callGroqJson } from "@/lib/groq-vision";
import { parseMalaysianPayslipText, PayslipExtraction } from "@/lib/payslip-parser";

export const runtime = "nodejs";
export const maxDuration = 60;
const GEMINI_MODEL = "gemini-3.8-flash";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeAiPayslip(
  raw: Record<string, unknown>,
  engine: string,
  rawText?: string
): PayslipExtraction {
  const isEa =
    String(raw.sourceType || "").toLowerCase().includes("ea") ||
    Number(raw.annualIncome || 0) > 0 ||
    Boolean(raw.taxYear);

  const annualIncome = Number(raw.annualIncome) || 0;
  const monthlyGross = Number(raw.monthlyGross) || 0;
  const ytdGross = Number(raw.ytdGross) || (isEa ? annualIncome : 0);
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

  const notes = Array.isArray(raw.notes)
    ? raw.notes.map(String).filter(Boolean)
    : [];
  notes.push(`Extracted via ${engine}.`);

  const confidence =
    raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
      ? raw.confidence
      : estimatedAnnual > 0 && (pcbPaid > 0 || epf > 0)
      ? "high"
      : "medium";

  return {
    sourceType: isEa ? "ea-form" : ytdGross > 0 ? "ytd" : "monthly",
    formVersion: raw.formVersion ? String(raw.formVersion) : undefined,
    monthDetected: raw.monthDetected ? String(raw.monthDetected) : undefined,
    yearDetected: raw.taxYear ? Number(raw.taxYear) : undefined,
    employerName: raw.employerName ? String(raw.employerName) : undefined,
    employerNo: raw.employerNo ? String(raw.employerNo) : undefined,
    employerAddress: raw.employerAddress ? String(raw.employerAddress) : undefined,
    employeeName: raw.employeeName ? String(raw.employeeName) : undefined,
    employeeIc: raw.employeeIc ? String(raw.employeeIc) : undefined,
    employeePosition: raw.employeePosition ? String(raw.employeePosition) : undefined,
    employeeEpfNo: raw.employeeEpfNo ? String(raw.employeeEpfNo) : undefined,
    monthlyGross: round2(monthlyGross),
    ytdGross: round2(ytdGross),
    estimatedAnnualIncome: round2(estimatedAnnual),
    grossSalaryB1a: raw.grossSalaryB1a !== undefined && raw.grossSalaryB1a !== null ? round2(Number(raw.grossSalaryB1a) || 0) : undefined,
    allowancesB1c: raw.allowancesB1c !== undefined && raw.allowancesB1c !== null ? round2(Number(raw.allowancesB1c) || 0) : undefined,
    monthlyPcb: round2(monthlyPcb),
    ytdPcb: round2(pcbPaid || monthlyPcb),
    monthlyZakat: round2(monthlyZakat),
    ytdZakat: round2(zakatPaid || monthlyZakat),
    employeeEpf: round2(epf),
    ytdEpf: round2(isEa ? epf : 0),
    employeeSocso: round2(socso),
    ytdSocso: round2(isEa ? socso : 0),
    employeeEis: round2(eis),
    ytdEis: round2(isEa ? eis : 0),
    rawText,
    confidence,
    notes,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

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

    // 1. Fast Regex Parser for text PDFs
    let fastResult: PayslipExtraction | null = null;
    if (pdfText.length >= 25) {
      fastResult = parseMalaysianPayslipText(pdfText);
      if (fastResult.confidence === "high") {
        return NextResponse.json(fastResult);
      }
    }

    // 2. AI Vision / LLM Fallback (Groq Vision / Gemini Flash)
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const canUseGroq = Boolean(groqKey && groqKey !== "your-groq-api-key");
    const canUseGemini = Boolean(geminiKey && geminiKey !== "your-gemini-api-key");

    const prompt = `You are an expert Malaysian LHDN personal income tax and payroll document analyzer.
You are given a Malaysian EA Form (Borang EA / C.P.8A Pin. 2017 / Pin. 2023+ / C.P.8B - Penyata Saraan Daripada Penggajian) or a Malaysian Monthly/YTD Payslip.

CRITICAL EXTRACTION RULES FOR BORANG EA / C.P.8A (especially Pin. 2017):
1. Do NOT assume the first number in the document text is the first field value; ALWAYS verify each number directly against its item label.
2. If a field in the form has RM0.00 (or 0.00), return 0 (never null).
3. Identify Employer from "Nama dan Alamat Majikan" and "No. Majikan E" -> "employerName", "employerAddress", "employerNo".
4. Identify Employee from "BUTIRAN PEKERJA" -> "employeeName", "employeeIc" (No. K.P.), "employeePosition" (Jawatan), "employeeEpfNo" (No. KWSP).
5. For income, read ONLY Bahagian B and Bahagian C:
   - B1(a) "Gaji kasar, upah atau gaji cuti (termasuk gaji lebih masa)" -> "grossSalaryB1a"
   - B1(c) "Tip kasar, perkuisit, penerimaan sagu hati atau elaun-elaun lain" -> "allowancesB1c"
   - "JUMLAH" after Bahagian B and Bahagian C -> "annualIncome"
6. For deductions in Bahagian D:
   - "Potongan Cukai Bulanan (PCB) yang dibayar kepada LHDNM" -> "pcbPaid"
   - "Zakat yang dibayar melalui potongan gaji" -> "zakatPaid"
7. For employee contributions in Bahagian E:
   - "KUMPULAN WANG SIMPANAN PEKERJA" (employee share) -> "epfEmployee"
   - "PERKESO" (employee share) -> "socsoEmployee"
   - "Sistem Insurans Pekerjaan (SIP)" -> "eisEmployee"
8. Header: "Bagi Tahun Berakhir 31 Disember [YEAR]" -> "taxYear", and form version (e.g. "C.P.8A - Pin. 2017") -> "formVersion".

If this is a Monthly Payslip instead of an EA Form:
- Basic Salary / Gross Earnings -> "monthlyGross" (and "ytdGross" if YTD column exists)
- PCB / MTD -> "monthlyPcb" (and "ytdPcb" / "pcbPaid" if YTD column exists)
- Zakat -> "monthlyZakat" (and "ytdZakat" / "zakatPaid" if YTD column exists)
- EPF / KWSP (employee share) -> "epfEmployee"
- SOCSO / PERKESO (employee share) -> "socsoEmployee"
- EIS / SIP (employee share) -> "eisEmployee"
- Month detected -> "monthDetected" (e.g., "October 2026")

Return ONLY raw JSON (no markdown formatting, no \`\`\`json) with this exact schema:
{
  "sourceType": "ea-form" | "monthly" | "ytd",
  "formVersion": string or null,
  "employerName": string,
  "employerNo": string or null,
  "employerAddress": string or null,
  "employeeName": string or null,
  "employeeIc": string or null,
  "employeePosition": string or null,
  "employeeEpfNo": string or null,
  "taxYear": number or null,
  "monthDetected": string or null,
  "annualIncome": number,
  "grossSalaryB1a": number,
  "allowancesB1c": number,
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

    // Try Groq Vision first if available
    if (canUseGroq && (pdfText.length >= 20 || file.type.startsWith("image/"))) {
      try {
        const parsed = await callGroqJson({
          apiKey: groqKey!,
          prompt,
          textContent: pdfText.length >= 20 ? pdfText : null,
          imageBase64:
            pdfText.length >= 20
              ? null
              : Buffer.from(arrayBuffer).toString("base64"),
          imageMimeType: file.type || "image/jpeg",
          maxTokens: 600,
        });
        const aiExtraction = normalizeAiPayslip(parsed, "Groq Vision", pdfText || undefined);
        return NextResponse.json(aiExtraction);
      } catch (groqErr) {
        console.warn("Groq payslip parse failed, falling back to Gemini:", groqErr);
      }
    }

    // Try Gemini Flash
    if (canUseGemini) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey!, vertexai: false });
        const contents =
          pdfText.length >= 20
            ? `${prompt}\n\nDOCUMENT TEXT:\n${pdfText.slice(0, 15000)}`
            : [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: isPdf
                      ? "application/pdf"
                      : file.type || "image/jpeg",
                    data: Buffer.from(arrayBuffer).toString("base64"),
                  },
                },
              ];

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            temperature: 0.1,
            maxOutputTokens: 600,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });

        const raw = response.text || "";
        const cleanJson = raw
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const parsed = JSON.parse(cleanJson);
        const aiExtraction = normalizeAiPayslip(parsed, "Gemini AI", pdfText || undefined);
        return NextResponse.json(aiExtraction);
      } catch (geminiErr) {
        console.warn("Gemini payslip parse failed:", geminiErr);
      }
    }

    // If fast regex had medium/low result, return it
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
