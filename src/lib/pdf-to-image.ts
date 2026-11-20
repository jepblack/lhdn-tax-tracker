/**
 * Renders Page 1 of a PDF file to a crisp JPEG image File in the browser.
 * Used for scanned-image PDFs (like EA Forms, clinic bills, or telco statements)
 * so Gemini Vision and on-device OCR can read them reliably while we still archive
 * the original unaltered PDF.
 */
export async function renderPdfFirstPageToJpeg(
  pdfFile: File,
  maxWidth = 1400
): Promise<File | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, Math.max(1.2, maxWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // White background so transparent PDFs render cleanly as JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84)
    );
    if (!blob) return null;

    return new File([blob], pdfFile.name.replace(/\.pdf$/i, ".jpg"), {
      type: "image/jpeg",
    });
  } catch (err) {
    console.warn("Client PDF-to-JPEG rendering failed:", err);
    return null;
  }
}
