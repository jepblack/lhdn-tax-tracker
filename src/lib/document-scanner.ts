/**
 * Fast, rock-steady pure-TypeScript Document Scanner:
 * 1. Learns background (outer border) vs receipt paper (center bright pixels)
 * 2. Morphologically closes & fills internal text/barcodes so the whole receipt is one solid sheet
 * 3. Extracts the 4 outer corners (TL, TR, BR, BL) of the largest paper component
 * 4. Applies temporal EMA + deadzone smoothing so the live overlay never jitters or jumps
 * 5. Homography perspective warp + integral-image adaptive B&W document filter
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
 * Smooths live quad detections across frames using a deadzone + Exponential Moving Average
 * so the green document boundary locks smoothly instead of jumping around.
 */
export function smoothReceiptQuad(
  prev: Quad | null,
  next: Quad | null
): Quad | null {
  if (!next) return null;
  if (!prev) return next;

  let maxDelta = 0;
  for (let i = 0; i < 4; i++) {
    const d = dist(prev[i], next[i]);
    if (d > maxDelta) maxDelta = d;
  }

  // Deadzone: if all corners moved less than 1.6% of frame, stay locked
  if (maxDelta < 0.016) {
    return prev;
  }

  // Smooth EMA blend
  const alpha = maxDelta > 0.18 ? 0.45 : 0.26;
  return [
    {
      x: prev[0].x * (1 - alpha) + next[0].x * alpha,
      y: prev[0].y * (1 - alpha) + next[0].y * alpha,
    },
    {
      x: prev[1].x * (1 - alpha) + next[1].x * alpha,
      y: prev[1].y * (1 - alpha) + next[1].y * alpha,
    },
    {
      x: prev[2].x * (1 - alpha) + next[2].x * alpha,
      y: prev[2].y * (1 - alpha) + next[2].y * alpha,
    },
    {
      x: prev[3].x * (1 - alpha) + next[3].x * alpha,
      y: prev[3].y * (1 - alpha) + next[3].y * alpha,
    },
  ];
}

/**
 * 5x5 morphological dilation + erosion (closing) on a binary mask
 * so dark printed text and logos inside a white receipt are filled into one solid sheet.
 */
function closePaperMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const dilated = new Uint8Array(n);
  const closed = new Uint8Array(n);
  const r = 3; // 7x7 window bridges text lines inside the paper

  // Horizontal pass dilation
  const temp = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let hit = 0;
      const x1 = Math.max(0, x - r);
      const x2 = Math.min(w - 1, x + r);
      for (let xx = x1; xx <= x2; xx++) {
        if (mask[row + xx]) {
          hit = 1;
          break;
        }
      }
      temp[row + x] = hit;
    }
  }
  // Vertical pass dilation
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - r);
    const y2 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let yy = y1; yy <= y2; yy++) {
        if (temp[yy * w + x]) {
          hit = 1;
          break;
        }
      }
      dilated[y * w + x] = hit;
    }
  }

  // Horizontal pass erosion
  const temp2 = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let all = 1;
      const x1 = Math.max(0, x - r);
      const x2 = Math.min(w - 1, x + r);
      for (let xx = x1; xx <= x2; xx++) {
        if (!dilated[row + xx]) {
          all = 0;
          break;
        }
      }
      temp2[row + x] = all;
    }
  }
  // Vertical pass erosion
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - r);
    const y2 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let yy = y1; yy <= y2; yy++) {
        if (!temp2[yy * w + x]) {
          all = 0;
          break;
        }
      }
      closed[y * w + x] = all;
    }
  }

  return closed;
}

/**
 * Detects the full receipt paper quadrilateral in normalized [0..1] coordinates.
 */
export function detectReceiptQuad(sourceCanvas: HTMLCanvasElement): Quad | null {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (sw < 40 || sh < 40) return null;

  const w = 200;
  const h = Math.max(40, Math.round((sh * w) / sw));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) return null;
  wctx.drawImage(sourceCanvas, 0, 0, w, h);

  const data = wctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const lum = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    lum[i] = Math.round(
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
    );
  }

  // 1. Sample outer border ring (6% margin) to learn background color & luminance
  const marginX = Math.max(2, Math.round(w * 0.06));
  const marginY = Math.max(2, Math.round(h * 0.06));
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgLumSum = 0;
  let bgCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        x < marginX ||
        x >= w - marginX ||
        y < marginY ||
        y >= h - marginY
      ) {
        const i = y * w + x;
        const idx = i * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgLumSum += lum[i];
        bgCount++;
      }
    }
  }
  bgR /= Math.max(1, bgCount);
  bgG /= Math.max(1, bgCount);
  bgB /= Math.max(1, bgCount);
  const bgLum = bgLumSum / Math.max(1, bgCount);

  // 2. Sample center region (25%..75%) bright pixels (70th percentile) to learn receipt paper tone
  const centerLums: number[] = [];
  const cx1 = Math.floor(w * 0.25);
  const cx2 = Math.ceil(w * 0.75);
  const cy1 = Math.floor(h * 0.2);
  const cy2 = Math.ceil(h * 0.8);
  for (let y = cy1; y < cy2; y++) {
    for (let x = cx1; x < cx2; x++) {
      centerLums.push(lum[y * w + x]);
    }
  }
  centerLums.sort((a, b) => a - b);
  const paperLum =
    centerLums[Math.floor(centerLums.length * 0.72)] ?? 200;

  // Require minimum contrast between paper and background
  const lumGap = paperLum - bgLum;
  const lumThresh =
    lumGap >= 18
      ? bgLum + lumGap * 0.45
      : Math.max(115, Math.min(200, paperLum * 0.82));

  // 3. Classify paper pixels (bright paper + low saturation vs background color distance)
  const rawMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const l = lum[i];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;
    const distFromBg = Math.hypot(r - bgR, g - bgG, b - bgB);

    if (
      (l >= lumThresh && sat < 75) ||
      (distFromBg >= 38 && l > bgLum + 12 && sat < 65)
    ) {
      rawMask[i] = 1;
    }
  }

  // 4. Close internal text/lines so the whole receipt is a single connected component
  const closedMask = closePaperMask(rawMask, w, h);

  // 5. Find the largest 4-connected paper component that overlaps the center region
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let bestComp: number[] = [];

  for (let i = 0; i < n; i++) {
    if (closedMask[i] !== 1 || visited[i]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    const comp: number[] = [];
    let touchesCenter = false;

    while (head < tail) {
      const curr = queue[head++];
      comp.push(curr);
      const x = curr % w;
      const y = (curr - x) / w;
      if (x >= cx1 && x <= cx2 && y >= cy1 && y <= cy2) {
        touchesCenter = true;
      }

      if (x > 0 && closedMask[curr - 1] === 1 && !visited[curr - 1]) {
        visited[curr - 1] = 1;
        queue[tail++] = curr - 1;
      }
      if (x + 1 < w && closedMask[curr + 1] === 1 && !visited[curr + 1]) {
        visited[curr + 1] = 1;
        queue[tail++] = curr + 1;
      }
      if (y > 0 && closedMask[curr - w] === 1 && !visited[curr - w]) {
        visited[curr - w] = 1;
        queue[tail++] = curr - w;
      }
      if (y + 1 < h && closedMask[curr + w] === 1 && !visited[curr + w]) {
        visited[curr + w] = 1;
        queue[tail++] = curr + w;
      }
    }

    if (touchesCenter && comp.length > bestComp.length) {
      bestComp = comp;
    }
  }

  const areaRatio = bestComp.length / n;
  if (areaRatio < 0.08 || areaRatio > 0.94) return null;

  // 6. Extract the 4 outer corners of the solid paper sheet using aspect-normalized projections
  let tl: Point2D = { x: w, y: h };
  let tr: Point2D = { x: 0, y: h };
  let br: Point2D = { x: 0, y: 0 };
  let bl: Point2D = { x: w, y: 0 };
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  for (let i = 0; i < bestComp.length; i++) {
    const idx = bestComp[i];
    const x = idx % w;
    const y = (idx - x) / w;
    const nx = x / w;
    const ny = y / h;
    const s = nx + ny;
    const d = nx - ny;
    if (s < minSum) {
      minSum = s;
      tl = { x: nx, y: ny };
    }
    if (s > maxSum) {
      maxSum = s;
      br = { x: nx, y: ny };
    }
    if (d > maxDiff) {
      maxDiff = d;
      tr = { x: nx, y: ny };
    }
    if (d < minDiff) {
      minDiff = d;
      bl = { x: nx, y: ny };
    }
  }

  const quad: Quad = [tl, tr, br, bl];
  const topW = dist(quad[0], quad[1]);
  const botW = dist(quad[3], quad[2]);
  const leftH = dist(quad[0], quad[3]);
  const rightH = dist(quad[1], quad[2]);
  if (Math.min(topW, botW) < 0.18 || Math.min(leftH, rightH) < 0.18) {
    return null;
  }

  return quad;
}

function warpQuad(
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

function applyDocumentBwFilter(canvas: HTMLCanvasElement): HTMLCanvasElement {
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

export async function processScannedReceiptCanvas(
  sourceCanvas: HTMLCanvasElement,
  fileName = `receipt-scan-${Date.now()}.jpg`,
  overrideQuad?: Quad | null
): Promise<{ file: File; cropped: boolean }> {
  const quad =
    overrideQuad !== undefined ? overrideQuad : detectReceiptQuad(sourceCanvas);
  const flatCanvas = quad ? warpQuad(sourceCanvas, quad) : sourceCanvas;
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
