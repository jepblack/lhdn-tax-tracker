import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { parseMalaysianPayslipText } from "@/lib/payslip-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "NO_FILE", message: "Please upload a PDF payslip or EA Form." },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({
        useClientOcr: true,
        message: "Image payslips are scanned on-device with built-in OCR.",
      });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const { text } = await extractText(buffer, { mergePages: true });
    const rawText = Array.isArray(text) ? text.join("\n") : String(text || "");

    if (rawText.trim().length < 15) {
      return NextResponse.json(
        {
          error: "SCANNED_PDF",
          message:
            "This PDF appears to be a scanned image without selectable text. Take a screenshot/photo of your payslip and upload the image instead!",
        },
        { status: 422 }
      );
    }

    const parsed = parseMalaysianPayslipText(rawText);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Payslip PDF parse error:", err);
    return NextResponse.json(
      {
        error: "PARSE_FAILED",
        message:
          "Could not read this PDF (it may be password-protected). If your payslip PDF has a password, take a screenshot of it and upload the image instead!",
      },
      { status: 422 }
    );
  }
}
