"use client";

import { useRef, useState } from "react";
import jsQR from "jsqr";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ExternalLink,
  QrCode,
  X,
} from "lucide-react";

export interface MyInvoisScanPayload {
  rawUrl: string;
  invoiceUuid: string;
  isOfficialMyInvois: boolean;
}

interface MyInvoisQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (payload: MyInvoisScanPayload) => void;
}

export function MyInvoisQrModal({
  isOpen,
  onClose,
  onDetected,
}: MyInvoisQrModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<MyInvoisScanPayload | null>(null);

  if (!isOpen) return null;

  function parseQrText(text: string): MyInvoisScanPayload {
    const trimmed = text.trim();
    const isOfficial = /myinvois\.hasil\.gov\.my/i.test(trimmed);
    // Extract UUID from URL like https://myinvois.hasil.gov.my/<uuid>/share/<longId>
    const uuidMatch = trimmed.match(/myinvois\.hasil\.gov\.my\/([A-Z0-9\-]{8,40})/i);
    const fallbackId = trimmed.split("/").filter(Boolean).pop() || trimmed;
    return {
      rawUrl: trimmed,
      invoiceUuid: (uuidMatch ? uuidMatch[1] : fallbackId).slice(0, 32),
      isOfficialMyInvois: isOfficial,
    };
  }

  async function handleQrImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDetected(null);

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxDim = 1200;
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
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        setError("Could not read image.");
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      URL.revokeObjectURL(url);

      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        setDetected(parseQrText(code.data));
      } else {
        setError(
          "No QR code found in this photo. Zoom in clearly on the MyInvois QR code on the receipt and try again, or paste the MyInvois link below."
        );
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not load image.");
    };
    img.src = url;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <QrCode className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                LHDN MyInvois QR Scanner
              </h2>
              <p className="text-xs text-slate-500">
                Capture official e-Invoice UUID &amp; validation link
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleQrImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 p-5 text-emerald-800 transition active:scale-[0.99]"
          >
            <Camera className="h-6 w-6 text-emerald-600" />
            <span className="text-xs font-bold">
              Snap / Upload MyInvois QR Code
            </span>
          </button>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Or paste MyInvois Validation URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://myinvois.hasil.gov.my/..."
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <button
                type="button"
                disabled={!manualUrl.trim()}
                onClick={() => setDetected(parseQrText(manualUrl))}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Parse
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{error}</span>
            </div>
          )}

          {detected && (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>
                  {detected.isOfficialMyInvois
                    ? "Verified LHDN MyInvois QR Detected"
                    : "QR Code Decoded"}
                </span>
              </div>
              <p className="font-mono text-[11px] text-emerald-800 break-all">
                UUID: {detected.invoiceUuid}
              </p>
              {detected.rawUrl.startsWith("http") && (
                <a
                  href={detected.rawUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 underline"
                >
                  Open on MyInvois Portal <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  onDetected(detected);
                  onClose();
                }}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white"
              >
                Attach to Receipt Form
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
