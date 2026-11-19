import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { getReliefCategories } from "@/lib/lhdn-rules";
import { parseAndClassifyReceiptText } from "@/lib/local-ocr";
import { ReceiptEligibility, TaxYear } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawYear = Number(formData.get("taxYear") || 2026);
    const taxYear: TaxYear = rawYear === 2025 ? 2025 : 2026;

    if (!file) {
      return NextResponse.json(
        { error: "NO_FILE", message: "Please attach a receipt image or PDF." },
        { status: 400 }
      );
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();

    const hasGemini = Boolean(
      geminiKey && geminiKey !== "your-gemini-api-key"
    );
    const hasOpenAi = Boolean(
      openaiKey && openaiKey !== "your-openai-api-key"
    );

    const arrayBuffer = await file.arrayBuffer();
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!hasGemini && !hasOpenAi) {
      if (isPdf) {
        const pdfResult = await tryExtractPdfReceipt(arrayBuffer, taxYear);
        if (pdfResult) return NextResponse.json(pdfResult);
      }
      return NextResponse.json({
        fallbackToLocalOcr: true,
        aiSkippedReason: "No external AI key configured — using built-in free OCR.",
      });
    }

    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    const categories = getReliefCategories(taxYear);

    const taxonomyText = categories
      .map((cat) => {
        const subs = cat.subCategories
          ? cat.subCategories
              .map(
                (s) =>
                  `    - subCategoryId: "${s.id}" (${s.name}, limit RM${s.maxLimit}): ${s.description}`
              )
              .join("\n")
          : "    - (no sub-categories)";
        return `- categoryId: "${cat.id}" (${cat.name}, cap RM${cat.maxLimit}): ${cat.description}\n${subs}`;
      })
      .join("\n");

    const prompt = `You are a strict Malaysian LHDN personal income tax auditor for YA ${taxYear}.
Determine if this receipt is "eligible", "partial", or "rejected" under Malaysian LHDN personal tax reliefs.

Categories:
${taxonomyText}

Reject ("rejected", claimableAmount=0, suggestedCategoryId=""):
- Non-receipts, food/dining/cafes, groceries, petrol/tolls/parking/travel, general retail/clothing/utilities, mobile phone plans (only home broadband qualifies), smartwatches/wearables, general electronics (TV/earbuds/consoles), OTC supplements/minor flu GP visits, cosmetic dental, entertainment/streaming.

If eligible or partial:
- Sports gear/gym/courts -> "sports" (NOT "lifestyle").
- Home broadband/PC/smartphone/tablet/books -> "lifestyle".
- Dental -> "medical_self" / "med_dental"; Vaccination -> "med_vaccination"; Checkup/mental health/BP monitor -> "med_checkup".
- For mixed receipts ("partial"), set claimableAmount to ONLY qualifying items and list non-claimable items in excludedItems.

Return strict JSON with keys: eligibility, merchant, date (YYYY-MM-DD), totalAmount, claimableAmount, invoiceNumber, description, suggestedCategoryId, suggestedSubCategoryId, confidence ("high"|"medium"|"low"), reasoning, rejectionReason, excludedItems (string[]).`;

    // 1. Try OpenAI Vision if OPENAI_API_KEY is configured (image receipts)
    if (hasOpenAi && mimeType.startsWith("image/")) {
      try {
        const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mimeType};base64,${base64Data}`,
                    },
                  },
                ],
              },
            ],
          }),
        });

        if (oaiRes.ok) {
          const oaiJson = await oaiRes.json();
          const content = oaiJson.choices?.[0]?.message?.content;
          if (content) {
            return NextResponse.json(
              normalizeAiPayload(JSON.parse(content), categories)
            );
          }
        }
      } catch {
        // Fall through to Gemini or local OCR
      }
    }

    // 2. Try Gemini API if GEMINI_API_KEY is configured
    if (hasGemini) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey!, vertexai: false });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                eligibility: {
                  type: Type.STRING,
                  enum: ["eligible", "partial", "rejected"],
                },
                merchant: { type: Type.STRING },
                date: { type: Type.STRING },
                totalAmount: { type: Type.NUMBER },
                claimableAmount: { type: Type.NUMBER },
                invoiceNumber: { type: Type.STRING },
                description: { type: Type.STRING },
                suggestedCategoryId: { type: Type.STRING },
                suggestedSubCategoryId: { type: Type.STRING },
                confidence: {
                  type: Type.STRING,
                  enum: ["high", "medium", "low"],
                },
                reasoning: { type: Type.STRING },
                rejectionReason: { type: Type.STRING },
                excludedItems: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                "eligibility",
                "merchant",
                "date",
                "totalAmount",
                "claimableAmount",
                "confidence",
                "reasoning",
              ],
            },
          },
        });

        if (response.text) {
          return NextResponse.json(
            normalizeAiPayload(JSON.parse(response.text), categories)
          );
        }
      } catch (err) {
        console.warn("Gemini vision unavailable, falling back to local OCR:", err);
      }
    }

    // 3. If PDF, extract text directly on server with unpdf before falling back
    if (isPdf) {
      const pdfResult = await tryExtractPdfReceipt(arrayBuffer, taxYear);
      if (pdfResult) return NextResponse.json(pdfResult);
    }

    // 4. Seamless fallback to client-side free OCR (never fail with a scary 401/500)
    return NextResponse.json({
      fallbackToLocalOcr: true,
      aiSkippedReason: "External AI unavailable — switched automatically to built-in free OCR.",
    });
  } catch (err) {
    console.error("Scan route error:", err);
    return NextResponse.json({
      fallbackToLocalOcr: true,
      aiSkippedReason: "Switched automatically to built-in free OCR.",
    });
  }
}

async function tryExtractPdfReceipt(arrayBuffer: ArrayBuffer, taxYear: TaxYear) {
  try {
    const { text } = await extractText(new Uint8Array(arrayBuffer), {
      mergePages: true,
    });
    const rawText = Array.isArray(text) ? text.join("\n") : String(text || "");
    if (rawText.trim().length >= 15) {
      return parseAndClassifyReceiptText(rawText, taxYear);
    }
  } catch (err) {
    console.warn("PDF text extraction failed:", err);
  }
  return null;
}

function normalizeAiPayload(
  parsed: Record<string, unknown>,
  categories: ReturnType<typeof getReliefCategories>
) {
  const rawElig = String(parsed.eligibility || "rejected");
  const eligibility: ReceiptEligibility =
    rawElig === "eligible" || rawElig === "partial" || rawElig === "rejected"
      ? rawElig
      : "rejected";

  const validCat =
    eligibility === "rejected"
      ? undefined
      : categories.find((c) => c.id === parsed.suggestedCategoryId);
  const validSub = validCat?.subCategories?.find(
    (s) => s.id === parsed.suggestedSubCategoryId
  );

  const finalEligibility: ReceiptEligibility =
    eligibility !== "rejected" && !validCat ? "rejected" : eligibility;

  const totalAmount = Number(parsed.totalAmount) || 0;
  const claimableAmount =
    finalEligibility === "rejected"
      ? 0
      : Number(parsed.claimableAmount) || totalAmount;

  return {
    eligibility: finalEligibility,
    merchant: String(parsed.merchant || ""),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || ""))
      ? String(parsed.date)
      : new Date().toISOString().slice(0, 10),
    amount: claimableAmount,
    totalAmount,
    invoiceNumber: String(parsed.invoiceNumber || ""),
    description: String(parsed.description || ""),
    suggestedCategoryId: validCat ? validCat.id : null,
    suggestedSubCategoryId: validSub ? validSub.id : null,
    confidence:
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "medium",
    reasoning:
      String(parsed.reasoning || "") ||
      (finalEligibility === "rejected"
        ? "This receipt does not qualify for LHDN personal tax relief."
        : "Matched based on receipt contents."),
    rejectionReason:
      finalEligibility === "rejected"
        ? String(parsed.rejectionReason || parsed.reasoning || "") ||
          "This expense is not eligible under LHDN personal income tax reliefs."
        : undefined,
    excludedItems: Array.isArray(parsed.excludedItems)
      ? parsed.excludedItems.filter(Boolean).map(String)
      : [],
    scanEngine: "ai" as const,
  };
}
