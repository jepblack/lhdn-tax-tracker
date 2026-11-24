"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ExternalLink,
  QrCode,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  decodeQrFromCanvas,
  decodeQrFromFile,
  MyInvoisScanPayload,
  parseMyInvoisQrText,
} from "@/lib/myinvois-qr";

export type { MyInvoisScanPayload };

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [manualUrl, setManualUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<MyInvoisScanPayload | null>(null);
  const [liveCameraActive, setLiveCameraActive] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLiveCameraActive(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, stopCamera]);

  useEffect(() => {
    if (!liveCameraActive || !isOpen) return;

    let cancelled = false;
    let timerId: number | null = null;
    let scanningFrame = false;

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !scanningFrame
      ) {
        scanningFrame = true;
        try {
          if (!scanCanvasRef.current) {
            scanCanvasRef.current = document.createElement("canvas");
          }
          const canvas = scanCanvasRef.current;
          const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const hit = await decodeQrFromCanvas(canvas);
            if (hit && !cancelled) {
              setDetected(parseMyInvoisQrText(hit));
              setError(null);
              stopCamera();
              return;
            }
          }
        } finally {
          scanningFrame = false;
        }
      }
      if (!cancelled) {
        timerId = window.setTimeout(tick, 180);
      }
    };

    timerId = window.setTimeout(tick, 250);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [liveCameraActive, isOpen, stopCamera]);

  if (!isOpen) return null;

  async function startLiveCamera() {
    setError(null);
    setDetected(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        "Live camera is not supported in this browser. Use Snap / Upload Photo below instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setLiveCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError(
        "Camera permission was blocked or unavailable. Allow camera access or use Snap / Upload Photo below."
      );
      stopCamera();
    }
  }

  async function handleQrImage(file: File | undefined) {
    if (!file) return;
    stopCamera();
    setError(null);
    setDetected(null);

    const qrText = await decodeQrFromFile(file);
    if (qrText) {
      setDetected(parseMyInvoisQrText(qrText));
    } else {
      setError(
        "No QR code found in this photo/PDF. Hold the QR closer in Live Camera Scan, or paste the MyInvois link below."
      );
    }
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
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleQrImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {liveCameraActive ? (
            <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500 bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-56 w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-36 w-36 rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              <div className="flex items-center justify-between bg-slate-900/90 px-3 py-2 text-[11px] text-white">
                <span className="font-medium text-emerald-300">
                  Point camera at MyInvois QR code…
                </span>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25"
                >
                  Stop
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={startLiveCamera}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-emerald-500 bg-emerald-600 p-4 text-white transition hover:bg-emerald-700 active:scale-[0.99]"
              >
                <Video className="h-6 w-6" />
                <span className="text-xs font-bold">Live Camera Scan</span>
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 p-4 text-emerald-800 transition hover:bg-emerald-100/70 active:scale-[0.99]"
              >
                <div className="flex items-center gap-1">
                  <Camera className="h-5 w-5 text-emerald-600" />
                  <Upload className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="text-xs font-bold">Snap / Upload Photo</span>
              </button>
            </div>
          )}

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
                onClick={() => setDetected(parseMyInvoisQrText(manualUrl))}
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
              <p className="break-all font-mono text-[11px] text-emerald-800">
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
                  stopCamera();
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
