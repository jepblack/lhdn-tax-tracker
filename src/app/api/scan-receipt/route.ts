import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { getReliefCategories } from "@/lib/lhdn-rules";
import { ReceiptEligibility, TaxYear } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your-gemini-api-key") {
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY_MISSING",
          message:
            "Gemini API key is not configured yet. Add GEMINI_API_KEY to .env.local to enable AI receipt scanning & eligibility detection, or fill in the receipt details manually below.",
        },
        { status: 503 }
      );
    }

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

    const arrayBuffer = await file.arrayBuffer();
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

    const prompt = `You are a strict Malaysian LHDN (Lembaga Hasil Dalam Negeri) personal income tax auditor for Year of Assessment (YA) ${taxYear}.
A user has uploaded a general receipt/invoice/photo. Your job is to FIRST determine whether this receipt is claimable under Malaysian LHDN personal income tax reliefs, partially claimable, or NOT claimable (rejected), and ONLY assign a relief category if it genuinely qualifies.

Available LHDN Relief Categories and Sub-Categories:
${taxonomyText}

Strict LHDN Eligibility & Rejection Rules (REJECT if the receipt is for any of these):
1. NOT a receipt/invoice/statement at all (e.g., random photo, meme, blank image) -> eligibility: "rejected".
2. Food, dining, restaurants, cafes, groceries, supermarkets (unless specific qualifying items like books or approved medical self-monitoring devices are clearly itemized -> "partial").
3. Petrol, diesel, tolls, parking, e-hailing, flights, hotels, car servicing, or vehicle accessories -> "rejected".
4. General retail, clothing, fashion, casual shoes, cosmetics, skincare, household items, furniture, utilities (electricity/water/sewerage) -> "rejected".
5. Mobile phone postpaid/prepaid bills -> "rejected" (LHDN Lifestyle ONLY covers home broadband internet subscriptions, NOT mobile voice/data plans).
6. General electronics such as TVs, headphones, earbuds, speakers, gaming consoles, cameras, or computer accessories alone -> "rejected" (Lifestyle tech ONLY covers personal computer, smartphone, or tablet).
7. Smartwatches, fitness trackers (e.g., Apple Watch, Garmin, Mi Band), and motorized bicycles -> "rejected" (explicitly excluded by LHDN from Sports & Lifestyle relief).
8. Over-the-counter vitamins, health supplements, or routine minor outpatient GP visits (e.g., common cold, fever, sore throat medication) -> "rejected" (LHDN Medical relief ONLY covers serious diseases, fertility treatment, vaccinations, dental examination/treatment, complete medical check-up, mental health consultation, self-test kits / BP monitor / glucometer / oximeter, or child learning disability intervention).
9. Cosmetic procedures or aesthetic dental (e.g., teeth whitening, veneers, purely cosmetic braces) -> "rejected".
10. Entertainment (cinema, theme park, concerts, streaming subscriptions like Netflix/Spotify) -> "rejected".

Categorization Rules (when eligible or partial):
- Sports equipment (Sports Development Act 1997), gym memberships, sports court rentals, competition fees, and sports training -> "sports" (NOT "lifestyle").
- Home internet broadband (Unifi, TIME, Maxis Fibre), PC/laptop/smartphone/tablet, books/magazines/newspapers, self-enhancement courses -> "lifestyle".
- Dental examination/scaling/filling/extraction -> "medical_self" -> "med_dental".
- Vaccinations -> "medical_self" -> "med_vaccination".
- Complete medical check-up / blood screening / mental health / self-test kits / BP monitor -> "medical_self" -> "med_checkup".
- If a receipt contains BOTH claimable and non-claimable items (e.g., a pharmacy receipt with a BP monitor + shampoo, or a bookstore receipt with books + stationery/toys):
  - Set eligibility to "partial".
  - Set totalAmount to the full receipt total.
  - Set claimableAmount to ONLY the sum of the qualifying items.
  - List the non-claimable items in excludedItems.
- If eligibility is "rejected":
  - Set claimableAmount to 0.
  - Set suggestedCategoryId and suggestedSubCategoryId to empty string "".
  - Provide a clear, helpful 1-2 sentence rejectionReason citing the specific LHDN rule.

Return strict JSON matching the schema.`;

    const trimmedKey = apiKey.trim();
    const generateParams = {
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
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
            date: { type: Type.STRING, description: "YYYY-MM-DD format" },
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
    };

    // Try Gemini Developer API first; if an AQ.* key is rejected there, fallback to Vertex AI Express Mode
    let response;
    try {
      const devAi = new GoogleGenAI({ apiKey: trimmedKey, vertexai: false });
      response = await devAi.models.generateContent(generateParams);
    } catch (devErr) {
      if (trimmedKey.startsWith("AQ.")) {
        try {
          const vertexAi = new GoogleGenAI({ apiKey: trimmedKey, vertexai: true });
          response = await vertexAi.models.generateContent(generateParams);
        } catch {
          throw new Error(
            "API key rejected by both Gemini API and Vertex AI. Please create a Gemini API key (starts with AIza...) at https://aistudio.google.com/apikey using a personal Google account."
          );
        }
      } else {
        throw devErr;
      }
    }

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    const parsed = JSON.parse(text);
    const eligibility: ReceiptEligibility =
      parsed.eligibility === "eligible" ||
      parsed.eligibility === "partial" ||
      parsed.eligibility === "rejected"
        ? parsed.eligibility
        : "rejected";

    const validCat =
      eligibility === "rejected"
        ? undefined
        : categories.find((c) => c.id === parsed.suggestedCategoryId);
    const validSub = validCat?.subCategories?.find(
      (s) => s.id === parsed.suggestedSubCategoryId
    );

    // If model claimed eligible/partial but gave an invalid category, treat as rejected safely
    const finalEligibility: ReceiptEligibility =
      eligibility !== "rejected" && !validCat ? "rejected" : eligibility;

    const totalAmount = Number(parsed.totalAmount) || 0;
    const claimableAmount =
      finalEligibility === "rejected"
        ? 0
        : Number(parsed.claimableAmount) || totalAmount;

    return NextResponse.json({
      eligibility: finalEligibility,
      merchant: parsed.merchant || "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : new Date().toISOString().slice(0, 10),
      amount: claimableAmount,
      totalAmount,
      invoiceNumber: parsed.invoiceNumber || "",
      description: parsed.description || "",
      suggestedCategoryId: validCat ? validCat.id : null,
      suggestedSubCategoryId: validSub ? validSub.id : null,
      confidence: parsed.confidence || "medium",
      reasoning:
        parsed.reasoning ||
        (finalEligibility === "rejected"
          ? "This receipt does not qualify for LHDN personal tax relief."
          : "Matched based on receipt contents."),
      rejectionReason:
        finalEligibility === "rejected"
          ? parsed.rejectionReason ||
            parsed.reasoning ||
            "This expense is not eligible under LHDN personal income tax reliefs."
          : undefined,
      excludedItems: Array.isArray(parsed.excludedItems)
        ? parsed.excludedItems.filter(Boolean)
        : [],
    });
  } catch (err) {
    console.error("Receipt scan error:", err);
    return NextResponse.json(
      {
        error: "SCAN_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Could not read receipt. Please enter details manually.",
      },
      { status: 500 }
    );
  }
}
