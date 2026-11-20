import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { parseMalaysianPayslipText } from "@/lib/payslip-parser";
import { AnnualDocExtraction, AnnualDocType } from "@/lib/types";

export const runtime = "nodejs";
const GEMINI_MODEL = "gemini-3.8-flash";

async function isAuthed(request: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("your-project-id")) return true;
  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return false;
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.auth.getUser(token);
    return Boolean(!error && data.user);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = String(formData.get("docType") || "other_doc") as AnnualDocType;
    const taxYear = Number(formData.get("taxYear") || 2026);

    if (!file) {
      return NextResponse.json(
        { error: "NO_FILE", message: "No file uploaded." },
        { status: 400 }
      );
    }

    // Form BE proof & generic docs don't need figure extraction
    if (docType === "form_be_proof" || docType === "other_doc") {
      return NextResponse.json({ skipped: true });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ skipped: true });
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    // Extract PDF text first if PDF
    let pdfText = "";
    if (isPdf) {
      try {
        const { text } = await extractText(new Uint8Array(arrayBuffer.slice(0)), {
          mergePages: true,
        });
        pdfText = (Array.isArray(text) ? text.join("\n") : String(text || ""))
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
          .trim();
      } catch {
        pdfText = "";
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const canUseGemini =
      Boolean(geminiKey && geminiKey !== "your-gemini-api-key") &&
      (await isAuthed(request));

    if (canUseGemini) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey!, vertexai: false });
        const prompt = `You are a Malaysian LHDN personal tax document parser for YA ${taxYear}.
Document type uploaded: "${docType}".
Extract ONLY visibly printed annual MYR figures from this document. Never guess or fabricate numbers; return 0 for any field not present.

Return ONLY raw valid JSON (no markdown) with exact keys:
{
  "providerName": string (employer, insurer, KWSP, or bank name),
  "annualIncome": number (total gross remuneration / income if EA Form),
  "pcbPaid": number (total PCB / MTD tax deducted if EA Form),
  "zakatPaid": number (total Zakat deducted via salary if EA Form),
  "epfEmployee": number (employee EPF / KWSP contribution only, NOT employer share),
  "socsoEisEmployee": number (employee SOCSO + EIS / PERKESO + SIP total),
  "lifeInsuranceAmount": number (qualifying life insurance / family takaful annual premium),
  "medicalInsuranceAmount": number (qualifying medical / health / education insurance annual premium),
  "housingLoanInterest": number (total housing loan interest paid for the year),
  "summaryNote": string (short 1-sentence summary of what was extracted),
  "confidence": "high" | "medium" | "low"
}`;

        const contents = pdfText.length >= 20
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

        let response;
        try {
          response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: {
              temperature: 0.1,
              maxOutputTokens: 600,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
        } catch {
          response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: { temperature: 0.1, maxOutputTokens: 600 },
          });
        }

        if (response.text) {
          const match = response.text.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse((match ? match[0] : response.text).trim());
          const extraction: AnnualDocExtraction = {
            docType,
            providerName: String(parsed.providerName || ""),
            annualIncome: Number(parsed.annualIncome) || 0,
            pcbPaid: Number(parsed.pcbPaid) || 0,
            zakatPaid: Number(parsed.zakatPaid) || 0,
            epfEmployee: Number(parsed.epfEmployee) || 0,
            socsoEisEmployee: Number(parsed.socsoEisEmployee) || 0,
            lifeInsuranceAmount: Number(parsed.lifeInsuranceAmount) || 0,
            medicalInsuranceAmount: Number(parsed.medicalInsuranceAmount) || 0,
            housingLoanInterest: Number(parsed.housingLoanInterest) || 0,
            summaryNote:
              String(parsed.summaryNote || "") ||
              "Extracted annual figures via Gemini AI.",
            confidence:
              parsed.confidence === "high" ||
              parsed.confidence === "medium" ||
              parsed.confidence === "low"
                ? parsed.confidence
                : "medium",
          };
          return NextResponse.json(extraction);
        }
      } catch (err) {
        console.warn("Annual doc Gemini parse failed, trying fallback:", err);
      }
    }

    // Fallback: local text parser for EA Form / KWSP PDFs
    if (pdfText.length >= 20 && (docType === "ea_form" || docType === "kwsp_statement")) {
      const p = parseMalaysianPayslipText(pdfText);
      const extraction: AnnualDocExtraction = {
        docType,
        providerName: docType === "kwsp_statement" ? "KWSP / EPF" : "EA Form",
        annualIncome: p.estimatedAnnualIncome,
        pcbPaid: p.ytdPcb,
        zakatPaid: p.ytdZakat,
        epfEmployee: p.ytdEpf || p.employeeEpf,
        socsoEisEmployee:
          (p.ytdSocso || p.employeeSocso) + (p.ytdEis || p.employeeEis),
        lifeInsuranceAmount: 0,
        medicalInsuranceAmount: 0,
        housingLoanInterest: 0,
        summaryNote: p.notes.join(" ") || "Extracted from PDF text.",
        confidence: p.confidence,
      };
      return NextResponse.json(extraction);
    }

    return NextResponse.json({ skipped: true });
  } catch (err) {
    console.error("Annual doc parse error:", err);
    return NextResponse.json({ skipped: true });
  }
}
