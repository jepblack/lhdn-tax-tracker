import jsQR from "jsqr";
import { renderPdfFirstPageToJpeg } from "./pdf-to-image";

export interface MyInvoisScanPayload {
  rawUrl: string;
  invoiceUuid: string;
  isOfficialMyInvois: boolean;
}

export function parseMyInvoisQrText(text: string): MyInvoisScanPayload {
  const trimmed = text.trim();
  const isOfficial = /myinvois\.hasil\.gov\.my/i.test(trimmed);
  const uuidMatch =
    trimmed.match(/myinvois\.hasil\.gov\.my\/([A-Z0-9\-]{8,40})/i) ||
    trimmed.match(/[?&](?:uuid|id)=([A-Z0-9\-]{8,40})/i);
  const fallbackId = trimmed.split("/").filter(Boolean).pop() || trimmed;
  return {
    rawUrl: trimmed,
    invoiceUuid: (uuidMatch ? uuidMatch[1] : fallbackId).slice(0, 32),
    isOfficialMyInvois: isOfficial,
  };
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function getNativeQrDetector(): BarcodeDetectorLike | null {
  if (typeof window === "undefined") return null;
  const ctor = (
    window as unknown as {
      BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * Decodes a QR code from a canvas using native BarcodeDetector first (when available),
 * falling back to jsQR with both normal and inverted contrast attempts.
 */
export async function decodeQrFromCanvas(
  canvas: HTMLCanvasElement
): Promise<string | null> {
  const detector = getNativeQrDetector();
  if (detector) {
    try {
      const results = await detector.detect(canvas);
      const hit = results.find((r) => r.rawValue && r.rawValue.trim().length > 0);
      if (hit?.rawValue) return hit.rawValue.trim();
    } catch {
      // Fall through to jsQR
    }
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return code?.data?.trim() || null;
}

/**
 * Decodes a QR code from an uploaded/captured receipt image or PDF file.
 * Scans at up to 2400px and retries cropped receipt quadrants (bottom/center/corners)
 * so small MyInvois QR codes printed on full receipts are still detected.
 */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  let targetFile = file;
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const rendered = await renderPdfFirstPageToJpeg(file, 2000);
    if (!rendered) return null;
    targetFile = rendered;
  }

  return await new Promise<string | null>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(targetFile);
    img.onload = async () => {
      try {
        const maxDim = 2400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const fullHit = await decodeQrFromCanvas(canvas);
        if (fullHit) {
          resolve(fullHit);
          return;
        }

        // Retry cropped regions at full native image resolution for small QRs on receipts
        const nw = img.naturalWidth || width;
        const nh = img.naturalHeight || height;
        const regions: Array<[number, number, number, number]> = [
          [0, Math.floor(nh * 0.45), nw, Math.ceil(nh * 0.55)], // bottom half
          [Math.floor(nw * 0.15), Math.floor(nh * 0.2), Math.ceil(nw * 0.7), Math.ceil(nh * 0.6)], // center
          [Math.floor(nw * 0.45), Math.floor(nh * 0.5), Math.ceil(nw * 0.55), Math.ceil(nh * 0.5)], // bottom-right
          [0, Math.floor(nh * 0.5), Math.ceil(nw * 0.55), Math.ceil(nh * 0.5)], // bottom-left
          [Math.floor(nw * 0.45), 0, Math.ceil(nw * 0.55), Math.ceil(nh * 0.5)], // top-right
        ];

        const cropCanvas = document.createElement("canvas");
        const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
        if (cropCtx) {
          for (const [sx, sy, sw, sh] of regions) {
            if (sw < 60 || sh < 60) continue;
            const scale = Math.min(1, 1400 / Math.max(sw, sh));
            cropCanvas.width = Math.max(1, Math.round(sw * scale));
            cropCanvas.height = Math.max(1, Math.round(sh * scale));
            cropCtx.drawImage(
              img,
              sx,
              sy,
              sw,
              sh,
              0,
              0,
              cropCanvas.width,
              cropCanvas.height
            );
            const cropHit = await decodeQrFromCanvas(cropCanvas);
            if (cropHit) {
              resolve(cropHit);
              return;
            }
          }
        }

        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
