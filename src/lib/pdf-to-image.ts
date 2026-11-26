/**
 * Safari/iOS-compatible PDF.js loader using the legacy build + matching worker.
 */
async function loadPdfDocument(pdfFile: File) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  });
  return loadingTask.promise;
}

/**
 * Extracts embedded selectable text from the first few pages of a PDF in the browser.
 * Used as a fast local fallback on mobile/Safari when server extraction or Cloud AI is unavailable.
 */
export async function extractPdfTextInBrowser(
  pdfFile: File,
  maxPages = 3
): Promise<string> {
  const extractPromise = (async (): Promise<string> => {
    try {
      const pdf = await loadPdfDocument(pdfFile);
      const pageCount = Math.min(pdf.numPages || 1, maxPages);
      const chunks: string[] = [];
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim();
        if (pageText) chunks.push(pageText);
      }
      return chunks.join("\n").trim();
    } catch (err) {
      console.warn("Client PDF text extraction failed:", err);
      return "";
    }
  })();

  const timeoutPromise = new Promise<string>((resolve) =>
    setTimeout(() => resolve(""), 8000)
  );

  return Promise.race([extractPromise, timeoutPromise]);
}

/**
 * Renders Page 1 of a PDF file to a crisp JPEG image File in the browser.
 * Includes a strict 15-second timeout so slow worker loads never hang the UI.
 */
export async function renderPdfFirstPageToJpeg(
  pdfFile: File,
  maxWidth = 1280
): Promise<File | null> {
  const renderPromise = (async (): Promise<File | null> => {
    try {
      const pdf = await loadPdfDocument(pdfFile);
      const page = await pdf.getPage(1);

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.5, Math.max(1.0, maxWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.76)
      );
      if (!blob) return null;

      return new File([blob], pdfFile.name.replace(/\.pdf$/i, ".jpg"), {
        type: "image/jpeg",
      });
    } catch (err) {
      console.warn("Client PDF-to-JPEG rendering failed:", err);
      return null;
    }
  })();

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 15000)
  );

  return Promise.race([renderPromise, timeoutPromise]);
}
