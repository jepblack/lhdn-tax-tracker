import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { callGroqJson } from "@/lib/groq-vision";
import { getReliefCategories } from "@/lib/lhdn-rules";
import { parseAndClassifyReceiptText } from "@/lib/local-ocr";
import { ReceiptEligibility, TaxYear } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-3.8-flash";

async function verifyAuthenticatedUser(request: Request): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // If Supabase auth isn't configured (pure local dev), allow scanning
  if (
    !supabaseUrl ||
    !supabaseKey ||
    supabaseUrl.includes("your-project-id")
  ) {
    return true;
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
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
    const rawYear = Number(formData.get("taxYear") || 2026);
    const taxYear: TaxYear =
      rawYear >= 2015 && rawYear <= 2035 ? rawYear : 2026;

    if (!file) {
      return NextResponse.json(
        { error: "NO_FILE", message: "Please attach a receipt image or PDF." },
        { status: 400 }
      );
    }

    const isAuthed = await verifyAuthenticatedUser(request);
    if (!isAuthed) {
      return NextResponse.json({
        fallbackToLocalOcr: true,
        aiSkippedReason:
          "Sign in under Profile to use Gemini AI Vision (using built-in free OCR for guests).",
      });
    }

    const groqKey = process.env.GROQ_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();

    const hasGroq = Boolean(groqKey && groqKey !== "your-groq-api-key");
    const hasGemini = Boolean(
      geminiKey && geminiKey !== "your-gemini-api-key"
    );
    const hasOpenAi = Boolean(
      openaiKey && openaiKey !== "your-openai-api-key"
    );

    const arrayBuffer = await file.arrayBuffer();
    const originalByteLength = arrayBuffer.byteLength;
    if (originalByteLength === 0) {
      return NextResponse.json({
        fallbackToLocalOcr: true,
        aiSkippedReason:
          "Uploaded file is 0 bytes (empty). If this receipt is in OneDrive/iCloud/Google Drive, please make sure it is downloaded locally first.",
      });
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!hasGroq && !hasGemini && !hasOpenAi) {
      if (isPdf) {
        const pdfResult = await tryExtractPdfReceipt(arrayBuffer.slice(0), taxYear);
        if (pdfResult) return NextResponse.json(pdfResult);
      }
      return NextResponse.json({
        fallbackToLocalOcr: true,
        aiSkippedReason: "No external AI key configured — using built-in free OCR.",
      });
    }

    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = isPdf
      ? "application/pdf"
      : file.type && file.type.startsWith("image/")
      ? file.type
      : "image/jpeg";
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

    const prompt = `ROLE: You are an LHDN (Malaysia) receipt-scanning and archiving assistant for Year of Assessment (YA) ${taxYear}.
GOAL: Extract ONLY information visibly present on the receipt to substantiate an LHDN tax record. Never guess or fabricate missing values. If a field is absent, leave it empty "" or 0/null.

Available LHDN Relief Categories (for suggestedCategoryId / suggestedSubCategoryId):
${taxonomyText}

Primary archiveCategory list (assign ONE only when clearly supported):
medical, dental, education, donation, insurance, sports, books, computer_or_phone, childcare, travel, business_expense, personal, other.

Strict Eligibility Rules:
- Use eligibility="rejected" (claimableAmount=0, suggestedCategoryId="") ONLY when clearly non-claimable: non-receipt, food/dining/cafes, groceries, petrol/tolls/parking/travel, general retail/clothing/utilities, mobile phone plans (only home broadband qualifies), smartwatches/wearables, general electronics (TV/earbuds/consoles), OTC supplements/minor flu GP visits, cosmetic dental, or entertainment/streaming.
- Use eligibility="uncertain" when the receipt is a valid payment/invoice/transfer (e.g., DuitNow/FPX transfer, generic Sdn Bhd merchant, clinic without itemized treatment, or vague online order) and its exact LHDN purpose cannot be confirmed from the receipt alone:
  - Set claimableAmount to totalAmount, needsReview=true, and provide 2 to 3 closest plausible LHDN relief choices in suggestedOptions (using valid categoryId and subCategoryId from the list above) so the user can choose or discard.
- Sports gear/gym/courts -> "sports" (NOT "lifestyle").
- Home broadband/PC/smartphone/tablet/books -> "lifestyle".
- Dental -> "medical_self" / "med_dental"; Vaccination -> "med_vaccination"; Checkup/mental health/BP monitor -> "med_checkup".
- For mixed receipts (eligibility="partial"), set claimableAmount to ONLY qualifying items and list non-claimable items in excludedItems.

Privacy & Quality Control Rules:
- NEVER return full card numbers, bank account numbers, MyKad/NRIC numbers, or passwords. Only retain card_last4 (last 4 digits) if shown.
- If the image is blurry, cropped, faded, or unreadable, set imageQualityIssue to a short warning asking the user to retake/upload a clearer image, and set needsReview=true.
- Set needsReview=true with a clear reviewReason if any of these are unclear or missing: transaction date, merchant name, total amount, currency, receipt/reference number, payment method, item description, or tax amount, OR if item amounts do not sum cleanly to total.
- Record SST, service tax, service charge, or VAT/GST separately in sstOrTaxAmount where shown. Do NOT convert foreign currencies—record the printed currency and amount.

Return ONLY a raw valid JSON object (no markdown fences) with these exact keys:
{
  "eligibility": "eligible" | "partial" | "uncertain" | "rejected",
  "merchant": string,
  "merchantRegistrationOrTaxId": string,
  "date": "YYYY-MM-DD" or "",
  "totalAmount": number,
  "claimableAmount": number,
  "currency": "MYR" or printed currency code,
  "sstOrTaxAmount": number,
  "taxInclusive": boolean,
  "invoiceNumber": string,
  "paymentMethod": "cash" | "card" | "ewallet" | "bank_transfer" | "duitnow" | "fpx" | "",
  "cardLast4": string (max 4 digits or ""),
  "archiveCategory": "medical"|"dental"|"education"|"donation"|"insurance"|"sports"|"books"|"computer_or_phone"|"childcare"|"travel"|"business_expense"|"personal"|"other",
  "description": string,
  "items": [{"description": string, "quantity": number, "unit_price": number, "amount": number}],
  "suggestedCategoryId": string,
  "suggestedSubCategoryId": string,
  "suggestedOptions": [{"categoryId": string, "subCategoryId": string, "label": string, "reason": string}],
  "confidence": "high" | "medium" | "low",
  "needsReview": boolean,
  "reviewReason": string,
  "imageQualityIssue": string,
  "reasoning": string,
  "rejectionReason": string,
  "excludedItems": string[]
}`;

    // 0. Try Groq Vision (Llama 4 Scout, ~1s) first when GROQ_API_KEY is configured
    if (hasGroq) {
      try {
        let pdfTextForGroq: string | null = null;
        if (isPdf) {
          try {
            const { text } = await extractText(
              new Uint8Array(arrayBuffer.slice(0)),
              { mergePages: true }
            );
            const joined = (Array.isArray(text) ? text.join("\n") : String(text || ""))
              .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
              .trim();
            if (joined.length >= 20) pdfTextForGroq = joined;
          } catch {
            pdfTextForGroq = null;
          }
        }

        if (pdfTextForGroq || mimeType.startsWith("image/")) {
          const parsed = await callGroqJson({
            apiKey: groqKey!,
            prompt,
            textContent: pdfTextForGroq,
            imageBase64: pdfTextForGroq ? null : base64Data,
            imageMimeType: mimeType,
            maxTokens: 1200,
          });
          return NextResponse.json(normalizeAiPayload(parsed, categories));
        }
      } catch (groqErr) {
        console.warn("Groq vision failed, falling back to Gemini:", groqErr);
      }
    }

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
    let geminiErrorMsg: string | null = null;
    if (hasGemini) {
      let pdfExtractDebug = "n/a";
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey!, vertexai: false });

        // For text-based PDFs, extract text via unpdf using a cloned buffer so arrayBuffer is never detached
        let pdfExtractedText: string | null = null;
        if (isPdf) {
          try {
            const { text } = await extractText(
              new Uint8Array(arrayBuffer.slice(0)),
              { mergePages: true }
            );
            const joined = (Array.isArray(text) ? text.join("\n") : String(text || ""))
              .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
              .trim();
            pdfExtractDebug = `len=${joined.length}`;
            if (joined.length >= 20) {
              pdfExtractedText = joined.slice(0, 15000);
            }
          } catch (pdfErr) {
            pdfExtractDebug = `err=${pdfErr instanceof Error ? pdfErr.message.slice(0, 80) : "unknown"}`;
          }
        }

        const supportedMime =
          mimeType === "image/jpeg" ||
          mimeType === "image/png" ||
          mimeType === "image/webp" ||
          mimeType === "application/pdf"
            ? mimeType
            : "image/jpeg";

        const contents = pdfExtractedText
          ? `${prompt}\n\nIMPORTANT: Return ONLY a raw valid JSON object (no markdown, no explanation).\n\nRECEIPT / INVOICE TEXT:\n${pdfExtractedText}`
          : [
              {
                text: `${prompt}\n\nIMPORTANT: Return ONLY a raw valid JSON object (no markdown, no explanation).`,
              },
              { inlineData: { mimeType: supportedMime, data: base64Data } },
            ];

        // Automatic 1-retry on transient 503 UNAVAILABLE spikes + fast low-thinking config
        let response;
        try {
          response = await generateFastWithGemini(ai, contents, 1200);
        } catch (firstErr) {
          const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
          if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
            await new Promise((r) => setTimeout(r, 1200));
            response = await generateFastWithGemini(ai, contents, 1200);
          } else {
            throw firstErr;
          }
        }

        if (response.text) {
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          const cleanedJson = (jsonMatch ? jsonMatch[0] : response.text)
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();
          return NextResponse.json(
            normalizeAiPayload(JSON.parse(cleanedJson), categories)
          );
        }
      } catch (err) {
        const rawErr = err instanceof Error ? err.message : String(err);
        geminiErrorMsg = `[mime=${mimeType}, bytes=${originalByteLength}, pdfText=${pdfExtractDebug}] ${rawErr}`;
        console.warn("Gemini vision unavailable, falling back to local OCR:", err);
      }
    }

    // 3. If PDF, extract text directly on server with unpdf before falling back
    if (isPdf) {
      const pdfResult = await tryExtractPdfReceipt(arrayBuffer.slice(0), taxYear);
      if (pdfResult) {
        return NextResponse.json({
          ...pdfResult,
          aiSkippedReason: geminiErrorMsg
            ? `Gemini AI failed (${geminiErrorMsg.slice(0, 220)}) — fell back to PDF text parser.`
            : undefined,
        });
      }
    }

    // 4. Seamless fallback to client-side free OCR (include diagnostic reason!)
    return NextResponse.json({
      fallbackToLocalOcr: true,
      aiSkippedReason: geminiErrorMsg
        ? isPdf && geminiErrorMsg.includes("400")
          ? `This PDF was rejected by Gemini (${geminiErrorMsg.slice(0, 160)}). It may be password-protected or use an unsupported PDF format—try taking a screenshot/photo of it instead!`
          : `Gemini AI unavailable: ${geminiErrorMsg.slice(0, 240)}`
        : "External AI unavailable — switched automatically to built-in free OCR.",
    });
  } catch (err) {
    console.error("Scan route error:", err);
    return NextResponse.json({
      fallbackToLocalOcr: true,
      aiSkippedReason: "Switched automatically to built-in free OCR.",
    });
  }
}

async function generateFastWithGemini(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  maxOutputTokens: number
) {
  // Gemini 3.x uses thinkingLevel: MINIMAL for fastest (~1-3s) structured extraction
  try {
    return await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature: 0.1,
        maxOutputTokens,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("400") || msg.includes("INVALID_ARGUMENT")) {
      return await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          temperature: 0.1,
          maxOutputTokens,
        },
      });
    }
    throw err;
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
    rawElig === "eligible" ||
    rawElig === "partial" ||
    rawElig === "uncertain" ||
    rawElig === "rejected"
      ? rawElig
      : "rejected";

  const rawOptions = Array.isArray(parsed.suggestedOptions)
    ? parsed.suggestedOptions
    : [];
  const suggestedOptions = rawOptions
    .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === "object"))
    .map((o) => {
      const cat = categories.find((c) => c.id === o.categoryId);
      if (!cat) return null;
      const sub = cat.subCategories?.find((s) => s.id === o.subCategoryId);
      return {
        categoryId: cat.id,
        subCategoryId: sub ? sub.id : cat.subCategories?.[0]?.id || null,
        label:
          String(o.label || "").trim() ||
          (sub ? `${cat.shortName} — ${sub.name}` : cat.shortName),
        reason: String(o.reason || "").trim() || cat.description,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .slice(0, 3);

  const validCat =
    eligibility === "rejected"
      ? undefined
      : categories.find((c) => c.id === parsed.suggestedCategoryId) ||
        (suggestedOptions[0]
          ? categories.find((c) => c.id === suggestedOptions[0].categoryId)
          : undefined);
  const validSub = validCat?.subCategories?.find(
    (s) =>
      s.id === parsed.suggestedSubCategoryId ||
      s.id === suggestedOptions[0]?.subCategoryId
  );

  const finalEligibility: ReceiptEligibility =
    eligibility !== "rejected" && eligibility !== "uncertain" && !validCat
      ? "uncertain"
      : eligibility;

  const totalAmount = Number(parsed.totalAmount) || 0;
  const claimableAmount =
    finalEligibility === "rejected"
      ? 0
      : Number(parsed.claimableAmount) || totalAmount;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = rawItems
    .filter((it): it is Record<string, unknown> => Boolean(it && typeof it === "object"))
    .map((it) => ({
      description: String(it.description || ""),
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || Number(it.amount) || 0,
      amount: Number(it.amount) || 0,
    }));

  const validArchiveCategories = new Set([
    "medical",
    "dental",
    "education",
    "donation",
    "insurance",
    "sports",
    "books",
    "computer_or_phone",
    "childcare",
    "travel",
    "business_expense",
    "personal",
    "other",
  ]);
  const rawArchiveCat = String(parsed.archiveCategory || "other");
  const archiveCategory = validArchiveCategories.has(rawArchiveCat)
    ? rawArchiveCat
    : "other";

  const rawLast4 = String(parsed.cardLast4 || "").replace(/\D/g, "").slice(-4);

  return {
    eligibility: finalEligibility,
    merchant: String(parsed.merchant || ""),
    merchantRegistrationOrTaxId: String(parsed.merchantRegistrationOrTaxId || ""),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || ""))
      ? String(parsed.date)
      : "",
    amount: claimableAmount,
    totalAmount,
    currency: String(parsed.currency || "MYR").toUpperCase().slice(0, 6),
    sstOrTaxAmount: Number(parsed.sstOrTaxAmount) || 0,
    taxInclusive:
      typeof parsed.taxInclusive === "boolean" ? parsed.taxInclusive : true,
    invoiceNumber: String(parsed.invoiceNumber || ""),
    paymentMethod: String(parsed.paymentMethod || ""),
    cardLast4: rawLast4,
    archiveCategory,
    description: String(parsed.description || ""),
    items,
    suggestedCategoryId: validCat ? validCat.id : null,
    suggestedSubCategoryId: validSub ? validSub.id : null,
    suggestedOptions,
    confidence:
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "medium",
    needsReview: Boolean(parsed.needsReview),
    reviewReason: String(parsed.reviewReason || ""),
    imageQualityIssue: String(parsed.imageQualityIssue || ""),
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
