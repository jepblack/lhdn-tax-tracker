/**
 * Production Document Scanner powered by OpenCV.js (Canny + Dilate + findContours + approxPolyDP + warpPerspective + adaptiveThreshold)
 * with pure-TypeScript fallback when offline or before WASM finishes initializing.
 */

export interface Point2D {
  x: number;
  y: number;
}

export type Quad = [Point2D, Point2D, Point2D, Point2D]; // TL, TR, BR, BL

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenCvAny = any;

declare global {
  interface Window {
    cv?: OpenCvAny;
  }
}

let cvLoadPromise: Promise<OpenCvAny | null> | null = null;

export function isOpenCvReady(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.cv && typeof window.cv.Mat === "function")
  );
}

/**
 * Lazily loads OpenCV.js 4.8.0 from CDN only when Doc Scan is opened.
 */
export function loadOpenCv(): Promise<OpenCvAny | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (isOpenCvReady()) return Promise.resolve(window.cv);
  if (cvLoadPromise) return cvLoadPromise;

  cvLoadPromise = new Promise((resolve) => {
    const finish = () => {
      if (isOpenCvReady()) {
        resolve(window.cv);
      } else {
        resolve(null);
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-opencv="true"]'
    );
    if (existing) {
      const waitTimer = window.setInterval(() => {
        if (isOpenCvReady()) {
          window.clearInterval(waitTimer);
          resolve(window.cv);
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(waitTimer);
        finish();
      }, 12000);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.8.0/opencv.js";
    script.async = true;
    script.dataset.opencv = "true";
    script.onload = () => {
      if (isOpenCvReady()) {
        resolve(window.cv);
      } else if (window.cv) {
        window.cv.onRuntimeInitialized = () => resolve(window.cv);
        window.setTimeout(finish, 8000);
      } else {
        resolve(null);
      }
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return cvLoadPromise;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sortCornersTLTRBRBL(pts: Point2D[]): Quad {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.x - a.y - (b.x - b.y));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const bl = byDiff[0];
  const tr = byDiff[byDiff.length - 1];
  return [tl, tr, br, bl];
}

/**
 * OpenCV Canny + Dilate + findContours + approxPolyDP 4-corner document detector.
 * Returns normalized [0..1] Quad [TL, TR, BR, BL] or null.
 */
function detectQuadWithOpenCv(sourceCanvas: HTMLCanvasElement): Quad | null {
  if (!isOpenCvReady()) return null;
  const cv = window.cv;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (sw < 40 || sh < 40) return null;

  const targetW = 480;
  const targetH = Math.max(40, Math.round((sh * targetW) / sw));
  const work = document.createElement("canvas");
  work.width = targetW;
  work.height = targetH;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) return null;
  wctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

  let src: OpenCvAny = null;
  let gray: OpenCvAny = null;
  let blurred: OpenCvAny = null;
  let edged: OpenCvAny = null;
  let dilated: OpenCvAny = null;
  let kernel: OpenCvAny = null;
  let contours: OpenCvAny = null;
  let hierarchy: OpenCvAny = null;

  try {
    src = cv.imread(work);
    gray = new cv.Mat();
    blurred = new cv.Mat();
    edged = new cv.Mat();
    dilated = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // Try standard Canny first; if too few edges, try lower thresholds
    cv.Canny(blurred, edged, 50, 150);
    kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.dilate(edged, dilated, kernel);

    cv.findContours(
      dilated,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const imageArea = targetW * targetH;
    let bestQuad: Quad | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imageArea * 0.1 || area > imageArea * 0.96) {
        cnt.delete();
        continue;
      }

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.025 * peri, true);

      if (approx.rows === 4 && area > bestArea) {
        const pts: Point2D[] = [];
        for (let p = 0; p < 4; p++) {
          pts.push({
            x: approx.data32S[p * 2] / targetW,
            y: approx.data32S[p * 2 + 1] / targetH,
          });
        }
        bestQuad = sortCornersTLTRBRBL(pts);
        bestArea = area;
      } else if (!bestQuad && area > bestArea && area > imageArea * 0.15) {
        // Fallback: use jscanify-style extreme corners of the largest contour
        const pts: Point2D[] = [];
        for (let p = 0; p < cnt.rows; p++) {
          pts.push({
            x: cnt.data32S[p * 2] / targetW,
            y: cnt.data32S[p * 2 + 1] / targetH,
          });
        }
        if (pts.length >= 4) {
          bestQuad = sortCornersTLTRBRBL(pts);
          bestArea = area;
        }
      }

      approx.delete();
      cnt.delete();
    }

    if (!bestQuad) return null;
    const topW = dist(bestQuad[0], bestQuad[1]);
    const botW = dist(bestQuad[3], bestQuad[2]);
    const leftH = dist(bestQuad[0], bestQuad[3]);
    const rightH = dist(bestQuad[1], bestQuad[2]);
    if (Math.min(topW, botW) < 0.18 || Math.min(leftH, rightH) < 0.18) {
      return null;
    }

    return bestQuad;
  } catch {
    return null;
  } finally {
    src?.delete();
    gray?.delete();
    blurred?.delete();
    edged?.delete();
    dilated?.delete();
    kernel?.delete();
    contours?.delete();
    hierarchy?.delete();
  }
}

/**
 * Pure-TS Sobel gradient + Otsu fallback when OpenCV.js is not yet loaded.
 */
function detectQuadFallback(sourceCanvas: HTMLCanvasElement): Quad | null {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (sw < 40 || sh < 40) return null;

  const targetW = 240;
  const targetH = Math.max(40, Math.round((sh * targetW) / sw));
  const work = document.createElement("canvas");
  work.width = targetW;
  work.height = targetH;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) return null;
  wctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

  const data = wctx.getImageData(0, 0, targetW, targetH).data;
  const n = targetW * targetH;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
    );
  }

  // Otsu threshold
  const hist = new Int32Array(256);
  for (let i = 0; i < n; i++) hist[gray[i]]++;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let thresh = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      thresh = t;
    }
  }

  const mask = new Uint8Array(n);
  let bright = 0;
  for (let i = 0; i < n; i++) {
    if (gray[i] >= Math.max(100, Math.min(205, thresh))) {
      mask[i] = 1;
      bright++;
    }
  }
  if (bright / n < 0.1 || bright / n > 0.92) return null;

  let tl: Point2D = { x: targetW, y: targetH };
  let tr: Point2D = { x: 0, y: targetH };
  let br: Point2D = { x: 0, y: 0 };
  let bl: Point2D = { x: targetW, y: 0 };
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      if (mask[y * targetW + x] !== 1) continue;
      const s = x + y;
      const d = x - y;
      if (s < minSum) {
        minSum = s;
        tl = { x, y };
      }
      if (s > maxSum) {
        maxSum = s;
        br = { x, y };
      }
      if (d > maxDiff) {
        maxDiff = d;
        tr = { x, y };
      }
      if (d < minDiff) {
        minDiff = d;
        bl = { x, y };
      }
    }
  }

  return [
    { x: tl.x / targetW, y: tl.y / targetH },
    { x: tr.x / targetW, y: tr.y / targetH },
    { x: br.x / targetW, y: br.y / targetH },
    { x: bl.x / targetW, y: bl.y / targetH },
  ];
}

export function detectReceiptQuad(sourceCanvas: HTMLCanvasElement): Quad | null {
  return detectQuadWithOpenCv(sourceCanvas) || detectQuadFallback(sourceCanvas);
}

/**
 * Pure-TS integral-image adaptive B&W fallback.
 */
function applyBwFallback(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || w === 0 || h === 0) return canvas;

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const gray = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
    );
  }

  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    const rowOff = y * (w + 1);
    const prevOff = (y - 1) * (w + 1);
    const gOff = (y - 1) * w;
    for (let x = 1; x <= w; x++) {
      rowSum += gray[gOff + (x - 1)];
      integral[rowOff + x] = integral[prevOff + x] + rowSum;
    }
  }

  const radius = Math.max(8, Math.min(22, Math.round(w / 32)));
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(w - 1, x + radius);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (w + 1) + (x2 + 1)] -
        integral[y1 * (w + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (w + 1) + x1] +
        integral[y1 * (w + 1) + x1];
      const localMean = sum / count;
      const g = gray[y * w + x];
      const v = g < localMean * 0.88 && g < 185 ? 12 : 255;
      const idx = (y * w + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Pure-TS homography warp fallback.
 */
function warpQuadFallback(
  sourceCanvas: HTMLCanvasElement,
  normQuad: Quad
): HTMLCanvasElement {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const srcQuad: Quad = [
    { x: normQuad[0].x * sw, y: normQuad[0].y * sh },
    { x: normQuad[1].x * sw, y: normQuad[1].y * sh },
    { x: normQuad[2].x * sw, y: normQuad[2].y * sh },
    { x: normQuad[3].x * sw, y: normQuad[3].y * sh },
  ];

  const rawW = Math.max(dist(srcQuad[0], srcQuad[1]), dist(srcQuad[3], srcQuad[2]));
  const rawH = Math.max(dist(srcQuad[0], srcQuad[3]), dist(srcQuad[1], srcQuad[2]));
  const scale = Math.min(1, 1600 / Math.max(rawW, rawH));
  const dstW = Math.max(100, Math.round(rawW * scale));
  const dstH = Math.max(100, Math.round(rawH * scale));

  const dst: Quad = [
    { x: 0, y: 0 },
    { x: dstW, y: 0 },
    { x: dstW, y: dstH },
    { x: 0, y: dstH },
  ];

  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const u = dst[i].x;
    const v = dst[i].y;
    const x = srcQuad[i].x;
    const y = srcQuad[i].y;
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
    b.push(y);
  }
  for (let col = 0; col < 8; col++) {
    let maxRow = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];
    [b[col], b[maxRow]] = [b[maxRow], b[col]];
    const pivot = A[col][col] || 1e-12;
    for (let row = col + 1; row < 8; row++) {
      const f = A[row][col] / pivot;
      for (let k = col; k < 8; k++) A[row][k] -= f * A[col][k];
      b[row] -= f * b[col];
    }
  }
  const H = new Array<number>(9).fill(1);
  for (let row = 7; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < 8; k++) sum -= A[row][k] * H[k];
    H[row] = sum / (A[row][row] || 1e-12);
  }

  const out = document.createElement("canvas");
  out.width = dstW;
  out.height = dstH;
  const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!sctx || !octx) return sourceCanvas;
  const srcData = sctx.getImageData(0, 0, sw, sh).data;
  const outImg = octx.createImageData(dstW, dstH);
  const dstData = outImg.data;

  for (let v = 0; v < dstH; v++) {
    for (let u = 0; u < dstW; u++) {
      const denom = H[6] * u + H[7] * v + H[8];
      const sx = (H[0] * u + H[1] * v + H[2]) / denom;
      const sy = (H[3] * u + H[4] * v + H[5]) / denom;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const dstIdx = (v * dstW + u) * 4;
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) {
        dstData[dstIdx] = 255;
        dstData[dstIdx + 1] = 255;
        dstData[dstIdx + 2] = 255;
        dstData[dstIdx + 3] = 255;
        continue;
      }
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        dstData[dstIdx + c] = Math.round(
          srcData[i00 + c] * (1 - fx) * (1 - fy) +
            srcData[i10 + c] * fx * (1 - fy) +
            srcData[i01 + c] * (1 - fx) * fy +
            srcData[i11 + c] * fx * fy
        );
      }
      dstData[dstIdx + 3] = 255;
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

/**
 * Full pipeline: uses OpenCV.js warpPerspective + adaptiveThreshold when ready,
 * falling back seamlessly to pure-TS warp + integral adaptive B&W.
 */
export async function processScannedReceiptCanvas(
  sourceCanvas: HTMLCanvasElement,
  fileName = `receipt-scan-${Date.now()}.jpg`,
  overrideQuad?: Quad | null
): Promise<{ file: File; cropped: boolean }> {
  const quad =
    overrideQuad !== undefined ? overrideQuad : detectReceiptQuad(sourceCanvas);

  let flatCanvas: HTMLCanvasElement;

  if (isOpenCvReady()) {
    const cv = window.cv;
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;
    let srcMat: OpenCvAny = null;
    let warpedMat: OpenCvAny = null;
    let grayMat: OpenCvAny = null;
    let bwMat: OpenCvAny = null;
    let srcCoords: OpenCvAny = null;
    let dstCoords: OpenCvAny = null;
    let M: OpenCvAny = null;

    try {
      srcMat = cv.imread(sourceCanvas);
      if (quad) {
        const pts = quad.map((p) => ({ x: p.x * sw, y: p.y * sh }));
        const rawW = Math.max(dist(pts[0], pts[1]), dist(pts[3], pts[2]));
        const rawH = Math.max(dist(pts[0], pts[3]), dist(pts[1], pts[2]));
        const scale = Math.min(1, 1600 / Math.max(rawW, rawH));
        const dstW = Math.max(100, Math.round(rawW * scale));
        const dstH = Math.max(100, Math.round(rawH * scale));

        srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
          pts[0].x,
          pts[0].y,
          pts[1].x,
          pts[1].y,
          pts[2].x,
          pts[2].y,
          pts[3].x,
          pts[3].y,
        ]);
        dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0,
          0,
          dstW,
          0,
          dstW,
          dstH,
          0,
          dstH,
        ]);
        M = cv.getPerspectiveTransform(srcCoords, dstCoords);
        warpedMat = new cv.Mat();
        cv.warpPerspective(
          srcMat,
          warpedMat,
          M,
          new cv.Size(dstW, dstH),
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(255, 255, 255, 255)
        );
      } else {
        warpedMat = srcMat.clone();
      }

      grayMat = new cv.Mat();
      bwMat = new cv.Mat();
      cv.cvtColor(warpedMat, grayMat, cv.COLOR_RGBA2GRAY);
      cv.adaptiveThreshold(
        grayMat,
        bwMat,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        25,
        11
      );

      flatCanvas = document.createElement("canvas");
      cv.imshow(flatCanvas, bwMat);
    } catch {
      flatCanvas = quad ? warpQuadFallback(sourceCanvas, quad) : sourceCanvas;
      applyBwFallback(flatCanvas);
    } finally {
      srcMat?.delete();
      warpedMat?.delete();
      grayMat?.delete();
      bwMat?.delete();
      srcCoords?.delete();
      dstCoords?.delete();
      M?.delete();
    }
  } else {
    flatCanvas = quad ? warpQuadFallback(sourceCanvas, quad) : sourceCanvas;
    applyBwFallback(flatCanvas);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    flatCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
  );
  if (!blob) {
    throw new Error("Could not encode scanned receipt image.");
  }
  return {
    file: new File([blob], fileName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    }),
    cropped: Boolean(quad),
  };
}
