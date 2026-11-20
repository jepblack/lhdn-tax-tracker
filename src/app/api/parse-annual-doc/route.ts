import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { callGroqJson } from "@/lib/groq-vision";
import { parseMalaysianPayslipText } from "@/lib/payslip-parser";
import { AnnualDocExtraction, AnnualDocType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
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

    // Only generic other_doc is archive-only; EA Form, KWSP, Insurance, Loan & Form BE all extract!
    if (docType === "other_doc") {
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

    const groqKey = process.env.GROQ_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const authed = await isAuthed(request);
    const canUseGroq = Boolean(groqKey && groqKey !== "your-groq-api-key") && authed;
    const canUseGemini =
      Boolean(geminiKey && geminiKey !== "your-gemini-api-key") && authed;

    const formBeExtraPrompt =
      docType === "form_be_proof"
        ? `
Also, since this is a Malaysian LHDN Form BE (Borang BE / e-BE), extract any other claimed relief boxes into "extraReliefs" array using ONLY these valid categoryId values:
- "lifestyle" (F9 Lifestyle)
- "sports" (F10 Sports equipment/activities)
- "medical_self" (F4 Medical expenses self/spouse/child)
- "parents_medical" (F2 Parents medical/care)
- "education_self" (F5 Education fees self)
- "prs_annuity" (F16 PRS / Deferred Annuity)
- "sspn" (F13 SSPN net deposit)
- "childcare" (F12 Childcare TASKA/TADIKA)
- "breastfeeding" (F11 Breastfeeding equipment)
- "ev_charging" (F20 EV charging / composting)
- "supporting_equipment" (F3 Basic supporting equipment)
- "approved_donations" (D1 Approved donations Section 44(6))
Format: "extraReliefs": [{"categoryId": string, "label": string, "amount": number}] (only include items with amount > 0).`
        : "";

    const prompt = `You are a Malaysian LHDN personal tax document parser for YA ${taxYear}.
Document type uploaded: "${docType}".
Extract ONLY visibly printed annual MYR figures from this document. Never guess or fabricate numbers; return 0 for any field not present.
${formBeExtraPrompt}

Return ONLY raw valid JSON (no markdown) with exact keys:
{
  "providerName": string (employer, insurer, KWSP, bank, or "LHDN Form BE"),
  "annualIncome": number (total gross/statutory/aggregate income),
  "pcbPaid": number (total PCB / MTD tax deducted),
  "zakatPaid": number (total Zakat / Fitrah rebate),
  "epfEmployee": number (employee EPF / KWSP relief claimed),
  "socsoEisEmployee": number (SOCSO / PERKESO relief claimed),
  "lifeInsuranceAmount": number (life insurance / family takaful relief claimed),
  "medicalInsuranceAmount": number (education & medical insurance relief claimed),
  "housingLoanInterest": number (first-home housing loan interest relief claimed),
  "extraReliefs": [{"categoryId": string, "label": string, "amount": number}],
  "summaryNote": string (short 1-sentence summary of what was extracted),
  "confidence": "high" | "medium" | "low"
}`;

    // 1. Try Groq Vision (~1s) first if GROQ_API_KEY is configured
    let groqFailReason = "";
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
        return NextResponse.json(normalizeAnnualExtraction(parsed, docType, "Groq Vision"));
      } catch (groqErr) {
        groqFailReason =
          groqErr instanceof Error ? groqErr.message.slice(0, 120) : "Groq error";
        console.warn("Groq annual doc parse failed, falling back to Gemini:", groqErr);
      }
    } else if (!canUseGroq) {
      groqFailReason = !groqKey ? "GROQ_API_KEY not loaded on server" : "not signed in";
    } else {
      groqFailReason = `unsupported file for Groq (mime=${file.type}, pdfTextLen=${pdfText.length})`;
    }

    let geminiFailReason = "";
    if (canUseGemini) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey!, vertexai: false });

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

        const callGemini = async () => {
          try {
            return await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents,
              config: {
                temperature: 0.1,
                maxOutputTokens: 600,
                thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              },
            });
          } catch (cfgErr) {
            const m = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
            if (m.includes("400") || m.includes("INVALID_ARGUMENT")) {
              return await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents,
                config: { temperature: 0.1, maxOutputTokens: 600 },
              });
            }
            throw cfgErr;
          }
        };

        const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
          Promise.race([
            promise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("AI_TIMEOUT")), ms)
            ),
          ]);

        let response;
        try {
          response = await withTimeout(callGemini(), 14000);
        } catch (firstErr) {
          const m = firstErr instanceof Error ? firstErr.message : String(firstErr);
          if (m.includes("503") || m.includes("UNAVAILABLE")) {
            await new Promise((r) => setTimeout(r, 600));
            response = await withTimeout(callGemini(), 12000);
          } else {
            throw firstErr;
          }
        }

        if (response.text) {
          const match = response.text.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse((match ? match[0] : response.text).trim());
          return NextResponse.json(
            normalizeAnnualExtraction(parsed, docType, "Gemini AI")
          );
        }
      } catch (err) {
        geminiFailReason = err instanceof Error ? err.message.slice(0, 140) : "AI error";
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

    const skipReason = !authed
      ? "Document archived! Sign in with Google under Profile to enable AI extraction for annual documents."
      : isPdf && pdfText.length < 20
      ? `Document archived, but this PDF has no readable text (${groqFailReason || geminiFailReason || "scanned PDF"}). Take a screenshot and upload the image instead!`
      : groqFailReason || geminiFailReason
      ? `Document archived, but AI extraction failed (Groq: ${groqFailReason || "n/a"} | Gemini: ${geminiFailReason || "n/a"}).`
      : "Document archived! No numeric tax figures were detected automatically.";

    return NextResponse.json({ skipped: true, skipReason });
  } catch (err) {
    console.error("Annual doc parse error:", err);
    return NextResponse.json({ skipped: true });
  }
}

function normalizeAnnualExtraction(
  parsed: Record<string, unknown>,
  docType: AnnualDocType,
  engineName: string
): AnnualDocExtraction {
  const validExtraIds = new Set([
    "lifestyle",
    "sports",
    "medical_self",
    "parents_medical",
    "education_self",
    "prs_annuity",
    "sspn",
    "childcare",
    "breastfeeding",
    "ev_charging",
    "supporting_equipment",
    "approved_donations",
  ]);
  const rawExtras = Array.isArray(parsed.extraReliefs) ? parsed.extraReliefs : [];
  const extraReliefs = rawExtras
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
    .map((x) => ({
      categoryId: String(x.categoryId || ""),
      label: String(x.label || x.categoryId || ""),
      amount: Number(x.amount) || 0,
    }))
    .filter((x) => validExtraIds.has(x.categoryId) && x.amount > 0);

  return {
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
    extraReliefs,
    summaryNote:
      String(parsed.summaryNote || "") ||
      `Extracted annual figures via ${engineName}.`,
    confidence:
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "medium",
  };
}
