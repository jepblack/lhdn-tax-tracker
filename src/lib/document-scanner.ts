/**
 * Pure client-side Document Scanner:
 * 1. Detects bright receipt paper boundaries against background (Otsu + connected/edge corners)
 * 2. Perspective-warps the 4-point quad into a flat, upright rectangle (removing background)
 * 3. Applies integral-image adaptive thresholding to produce a crisp Black & White scan
 */

export interface Point2D {
  x: number;
  y: number;
}

export type Quad = [Point2D, Point2D, Point2D, Point2D]; // TL, TR, BR, BL

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Computes Otsu's optimal threshold on a grayscale array [0..255].
 */
function computeOtsuThreshold(gray: Uint8Array): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Detects a receipt quadrilateral in normalized coordinates [0..1] on a canvas.
 * Returns null if no clear paper-vs-background boundary is found.
 */
export function detectReceiptQuad(sourceCanvas: HTMLCanvasElement): Quad | null {
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

  const img = wctx.getImageData(0, 0, targetW, targetH);
  const data = img.data;
  const n = targetW * targetH;
  const gray = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
    );
  }

  // Separate bright receipt paper from darker background
  const otsu = computeOtsuThreshold(gray);
  const thresh = Math.max(105, Math.min(200, otsu));
  const mask = new Uint8Array(n);
  let brightCount = 0;
  for (let i = 0; i < n; i++) {
    if (gray[i] >= thresh) {
      mask[i] = 1;
      brightCount++;
    }
  }

  const areaRatio = brightCount / n;
  // If frame is almost all bright or almost all dark, no clear paper-vs-background quad
  if (areaRatio < 0.1 || areaRatio > 0.92) return null;

  // Find largest 4-connected bright component using BFS so stray highlights are ignored
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let bestPixels: number[] = [];

  for (let i = 0; i < n; i++) {
    if (mask[i] !== 1 || visited[i]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    const comp: number[] = [];

    while (head < tail) {
      const curr = queue[head++];
      comp.push(curr);
      const x = curr % targetW;
      const y = (curr - x) / targetW;

      if (x > 0 && mask[curr - 1] === 1 && !visited[curr - 1]) {
        visited[curr - 1] = 1;
        queue[tail++] = curr - 1;
      }
      if (x + 1 < targetW && mask[curr + 1] === 1 && !visited[curr + 1]) {
        visited[curr + 1] = 1;
        queue[tail++] = curr + 1;
      }
      if (y > 0 && mask[curr - targetW] === 1 && !visited[curr - targetW]) {
        visited[curr - targetW] = 1;
        queue[tail++] = curr - targetW;
      }
      if (
        y + 1 < targetH &&
        mask[curr + targetW] === 1 &&
        !visited[curr + targetW]
      ) {
        visited[curr + targetW] = 1;
        queue[tail++] = curr + targetW;
      }
    }

    if (comp.length > bestPixels.length) {
      bestPixels = comp;
    }
  }

  if (bestPixels.length < n * 0.1) return null;

  // Extract 4 extreme corners: TL (min x+y), TR (max x-y), BR (max x+y), BL (min x-y)
  let tl: Point2D = { x: targetW, y: targetH };
  let tr: Point2D = { x: 0, y: targetH };
  let br: Point2D = { x: 0, y: 0 };
  let bl: Point2D = { x: targetW, y: 0 };
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  for (let i = 0; i < bestPixels.length; i++) {
    const idx = bestPixels[i];
    const x = idx % targetW;
    const y = (idx - x) / targetW;
    const sum = x + y;
    const diff = x - y;
    if (sum < minSum) {
      minSum = sum;
      tl = { x, y };
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = { x, y };
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      tr = { x, y };
    }
    if (diff < minDiff) {
      minDiff = diff;
      bl = { x, y };
    }
  }

  const quad: Quad = [
    { x: tl.x / targetW, y: tl.y / targetH },
    { x: tr.x / targetW, y: tr.y / targetH },
    { x: br.x / targetW, y: br.y / targetH },
    { x: bl.x / targetW, y: bl.y / targetH },
  ];

  // Validate reasonable side lengths
  const topW = dist(quad[0], quad[1]);
  const botW = dist(quad[3], quad[2]);
  const leftH = dist(quad[0], quad[3]);
  const rightH = dist(quad[1], quad[2]);
  if (Math.min(topW, botW) < 0.18 || Math.min(leftH, rightH) < 0.18) {
    return null;
  }

  return quad;
}

/**
 * Solves an 8x8 linear system (Gaussian elimination) for homography matrix H
 * mapping destination (u,v) -> source (x,y).
 */
function computeHomography(src: Quad, dstW: number, dstH: number): number[] {
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
    const x = src[i].x;
    const y = src[i].y;
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
    b.push(y);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];
    [b[col], b[maxRow]] = [b[maxRow], b[col]];

    const pivot = A[col][col] || 1e-12;
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / pivot;
      for (let k = col; k < n; k++) A[row][k] -= factor * A[col][k];
      b[row] -= factor * b[col];
    }
  }

  const h = new Array<number>(9).fill(1);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= A[row][k] * h[k];
    h[row] = sum / (A[row][row] || 1e-12);
  }
  return h;
}

/**
 * Perspective-warps a normalized quad from sourceCanvas onto a flat upright canvas.
 */
export function warpReceiptQuad(
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

  const rawW = Math.max(
    dist(srcQuad[0], srcQuad[1]),
    dist(srcQuad[3], srcQuad[2])
  );
  const rawH = Math.max(
    dist(srcQuad[0], srcQuad[3]),
    dist(srcQuad[1], srcQuad[2])
  );

  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
  const dstW = Math.max(100, Math.round(rawW * scale));
  const dstH = Math.max(100, Math.round(rawH * scale));

  const out = document.createElement("canvas");
  out.width = dstW;
  out.height = dstH;

  const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!sctx || !octx) return sourceCanvas;

  const srcData = sctx.getImageData(0, 0, sw, sh).data;
  const outImg = octx.createImageData(dstW, dstH);
  const dstData = outImg.data;
  const H = computeHomography(srcQuad, dstW, dstH);

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
        const val =
          srcData[i00 + c] * (1 - fx) * (1 - fy) +
          srcData[i10 + c] * fx * (1 - fy) +
          srcData[i01 + c] * (1 - fx) * fy +
          srcData[i11 + c] * fx * fy;
        dstData[dstIdx + c] = Math.round(val);
      }
      dstData[dstIdx + 3] = 255;
    }
  }

  octx.putImageData(outImg, 0, 0);
  return out;
}

/**
 * Converts a receipt canvas into a crisp Black & White document scan
 * using an integral-image local adaptive threshold (removes uneven lighting/shadows).
 */
export function applyDocumentBwFilter(canvas: HTMLCanvasElement): HTMLCanvasElement {
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

  // Build integral image (Float64Array to avoid 32-bit overflow)
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

  // Adaptive threshold: window ~ 1/16 of width (clamped 15..45)
  const radius = Math.max(8, Math.min(22, Math.round(w / 32)));
  const tBias = 0.88; // pixel < 88% of local mean -> crisp black ink

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
      // Crisp B&W with subtle anti-aliased dark ink
      const v = g < localMean * tBias && g < 185 ? 12 : 255;
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
 * Full pipeline: takes a raw camera frame or photo canvas, detects receipt edges,
 * crops/perspective-warps out the background, and converts to crisp B&W scan File.
 */
export async function processScannedReceiptCanvas(
  sourceCanvas: HTMLCanvasElement,
  fileName = `receipt-scan-${Date.now()}.jpg`,
  overrideQuad?: Quad | null
): Promise<{ file: File; cropped: boolean }> {
  const quad = overrideQuad !== undefined ? overrideQuad : detectReceiptQuad(sourceCanvas);
  const flatCanvas = quad ? warpReceiptQuad(sourceCanvas, quad) : sourceCanvas;
  applyDocumentBwFilter(flatCanvas);

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
