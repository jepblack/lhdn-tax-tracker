"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Briefcase,
  Camera,
  CheckCircle2,
  Cpu,
  Crown,
  ExternalLink,
  FileText,
  Loader2,
  QrCode,
  RotateCcw,
  Sparkles,
  Upload,
  UserCheck,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import {
  decodeQrFromCanvas,
  decodeQrFromFile,
  parseMyInvoisQrText as parseMyInvoisQrShared,
} from "@/lib/myinvois-qr";
import { formatRM } from "@/lib/calculator";
import { checkCategoryAgeEligibility } from "@/lib/children-profiles";
import {
  detectReceiptQuad,
  isOpenCvReady,
  loadOpenCv,
  processScannedReceiptCanvas,
  Quad,
} from "@/lib/document-scanner";
import { getPackageResourceLimits } from "@/lib/monetization";
import { useLanguage } from "@/lib/language-context";
import { getReliefCategories, SUPPORTED_TAX_YEARS } from "@/lib/lhdn-rules";
import { runLocalReceiptOcr } from "@/lib/local-ocr";
import { enqueueOfflineReceipt } from "@/lib/offline-queue";
import { renderPdfFirstPageToJpeg } from "@/lib/pdf-to-image";
import {
  buildArchiveBaseFilename,
  buildSearchableReceiptPdf,
  computeFileSha256,
  findDuplicateExpense,
  mapReliefToArchiveCategory,
  maskSensitiveText,
} from "@/lib/receipt-archiver";
import { getSupabaseClient } from "@/lib/supabase";
import {
  ArchiveCategory,
  CategorySummary,
  ExpenseClaimType,
  LhdnReceiptMetadata,
  ReceiptScanResult,
  TaxExpense,
  TaxpayerMode,
  TaxYear,
  UserSubscription,
} from "@/lib/types";

interface ReceiptScannerModalProps {
  isOpen: boolean;
  taxYear: TaxYear;
  taxpayerMode?: TaxpayerMode;
  subscription: UserSubscription;
  initialCategoryId?: string;
  initialSubCategoryId?: string;
  initialScannerMode?: "ocr" | "qr";
  initialFile?: File | null;
  prefillInvoiceNumber?: string;
  prefillDescription?: string;
  editingExpense?: TaxExpense | null;
  categorySummaries: CategorySummary[];
  existingExpenses: TaxExpense[];
  onClose: () => void;
  onAiScanCompleted: () => Promise<void>;
  onOpenUpgrade: (reason?: string) => void;
  onOfflineQueued?: () => void;
  onSave: (
    expense: Omit<TaxExpense, "id" | "createdAt">,
    receiptFile: File | null,
    editingId?: string
  ) => Promise<void>;
}

export function ReceiptScannerModal({
  isOpen,
  taxYear,
  taxpayerMode = "e-BE",
  subscription,
  initialCategoryId,
  initialSubCategoryId,
  initialScannerMode = "ocr",
  initialFile,
  prefillInvoiceNumber,
  prefillDescription,
  editingExpense,
  categorySummaries,
  existingExpenses,
  onClose,
  onAiScanCompleted,
  onOpenUpgrade,
  onOfflineQueued,
  onSave,
}: ReceiptScannerModalProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [targetTaxYear, setTargetTaxYear] = useState<TaxYear>(taxYear);
  const categories = getReliefCategories(targetTaxYear);

  const [categoryId, setCategoryId] = useState(
    initialCategoryId || "lifestyle"
  );
  const [subCategoryId, setSubCategoryId] = useState<string>(
    initialSubCategoryId || ""
  );
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    `${taxYear}-${new Date().toISOString().slice(5, 10)}`
  );
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [sstAmount, setSstAmount] = useState("0");
  const [merchantTaxId, setMerchantTaxId] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [keepColorPdf, setKeepColorPdf] = useState(false);
  const [originalFileHash, setOriginalFileHash] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [showArchiveDetails, setShowArchiveDetails] = useState(false);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanRetryable, setScanRetryable] = useState(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStatusText, setScanStatusText] = useState<string>(
    "Scanning receipt..."
  );
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [overrideRejection, setOverrideRejection] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Full-Screen Viewfinder Mode Toggle (Receipt OCR vs MyInvois QR), Claim Type (e-B), and Offline Queue state
  const { lang, copy, tCategory, tSubCategory } = useLanguage();
  const [scannerMode, setScannerMode] = useState<"ocr" | "qr">(initialScannerMode);
  const [claimType, setClaimType] = useState<ExpenseClaimType>("personal_relief");
  const [myInvoisUuid, setMyInvoisUuid] = useState<string>("");
  const [manualQrUrl, setManualQrUrl] = useState<string>("");
  const [qrDetectedUrl, setQrDetectedUrl] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [sheetExpanded, setSheetExpanded] = useState<boolean>(true);
  const dragStartYRef = useRef<number | null>(null);

  const isGeneralScanMode = !initialCategoryId;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOffline(!window.navigator.onLine);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setScannerMode(initialScannerMode || "ocr");
      setSheetExpanded(true);
      setManualQrUrl("");
      setQrDetectedUrl(null);
      if (editingExpense) {
        setTargetTaxYear(editingExpense.taxYear);
        setCategoryId(editingExpense.categoryId);
        setSubCategoryId(editingExpense.subCategoryId || "");
        setClaimType(
          editingExpense.claimType ||
            (editingExpense.categoryId === "business_expense"
              ? "business_deductible"
              : "personal_relief")
        );
        setMyInvoisUuid(editingExpense.myInvoisUuid || "");
        setMerchant(editingExpense.merchant);
        setAmount(String(editingExpense.amount));
        setExpenseDate(editingExpense.expenseDate);
        setInvoiceNumber(editingExpense.invoiceNumber || "");
        setDescription(editingExpense.description || "");
        setPaymentMethod(editingExpense.metadata?.payment_method || "");
        setCardLast4(editingExpense.metadata?.card_last4 || "");
        setSstAmount(String(editingExpense.metadata?.sst_or_tax_amount ?? 0));
        setMerchantTaxId(
          editingExpense.metadata?.merchant_registration_or_tax_id || ""
        );
        setCurrency(editingExpense.metadata?.currency || "MYR");
        setOriginalFileHash(editingExpense.metadata?.original_file_hash || "");
      } else {
        setTargetTaxYear(taxYear);
        const cats = getReliefCategories(taxYear);
        const catId = initialCategoryId || "lifestyle";
        setCategoryId(catId);
        const cat = cats.find((c) => c.id === catId);
        setSubCategoryId(
          initialSubCategoryId || cat?.subCategories?.[0]?.id || ""
        );
        setClaimType(
          catId === "business_expense" ? "business_deductible" : "personal_relief"
        );
        setMyInvoisUuid(prefillInvoiceNumber || "");
        setMerchant("");
        setAmount("");
        setExpenseDate(`${taxYear}-${new Date().toISOString().slice(5, 10)}`);
        setInvoiceNumber(prefillInvoiceNumber || "");
        setDescription(prefillDescription || "");
        setPaymentMethod("");
        setCardLast4("");
        setSstAmount("0");
        setMerchantTaxId("");
        setCurrency("MYR");
        setOriginalFileHash("");
      }
      setKeepColorPdf(false);
      setDuplicateWarning(null);
      setDuplicateConfirmed(false);
      setShowArchiveDetails(false);
      setReceiptFile(null);
      setPreviewUrl(null);
      setScanResult(null);
      setShowRawText(false);
      setOverrideRejection(false);
      setScanNotice(null);
      setScanProgress(0);
    }
  }, [
    isOpen,
    initialCategoryId,
    initialSubCategoryId,
    initialScannerMode,
    editingExpense,
    taxYear,
    prefillInvoiceNumber,
    prefillDescription,
  ]);

  // Auto-process initialFile when passed from Desktop Drag-and-Drop Dropzone
  useEffect(() => {
    if (isOpen && initialFile && !editingExpense) {
      handleFileSelected(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFile]);

  function parseMyInvoisQrText(text: string): {
    rawUrl: string;
    invoiceUuid: string;
    isOfficial: boolean;
  } {
    const parsed = parseMyInvoisQrShared(text);
    return {
      rawUrl: parsed.rawUrl,
      invoiceUuid: parsed.invoiceUuid,
      isOfficial: parsed.isOfficialMyInvois,
    };
  }

  async function tryDecodeMyInvoisQrFromFile(
    file: File
  ): Promise<string | null> {
    return await decodeQrFromFile(file);
  }

  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [liveQrActive, setLiveQrActive] = useState(false);

  const stopQrCamera = useCallback(() => {
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((t) => t.stop());
      qrStreamRef.current = null;
    }
    if (qrVideoRef.current) {
      qrVideoRef.current.srcObject = null;
    }
    setLiveQrActive(false);
  }, []);

  useEffect(() => {
    if (!isOpen || scannerMode !== "qr") {
      stopQrCamera();
    }
    return () => stopQrCamera();
  }, [isOpen, scannerMode, stopQrCamera]);

  useEffect(() => {
    if (!liveQrActive || !isOpen) return;
    let cancelled = false;
    let timerId: number | null = null;
    let scanningFrame = false;

    const tick = async () => {
      if (cancelled) return;
      const video = qrVideoRef.current;
      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !scanningFrame
      ) {
        scanningFrame = true;
        try {
          if (!qrCanvasRef.current) {
            qrCanvasRef.current = document.createElement("canvas");
          }
          const canvas = qrCanvasRef.current;
          const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const qrText = await decodeQrFromCanvas(canvas);
            if (qrText && !cancelled) {
              const parsedQr = parseMyInvoisQrText(qrText);
              setQrDetectedUrl(parsedQr.rawUrl);
              setMyInvoisUuid(parsedQr.invoiceUuid);
              setInvoiceNumber((prev) => prev || parsedQr.invoiceUuid);
              setDescription((prev) =>
                prev
                  ? prev
                  : `MyInvois e-Invoice (${
                      parsedQr.isOfficial ? "Verified LHDN" : "QR"
                    }): ${parsedQr.rawUrl}`
              );
              setScanNotice(null);
              stopQrCamera();
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
  }, [liveQrActive, isOpen, stopQrCamera]);

  const docVideoRef = useRef<HTMLVideoElement>(null);
  const docOverlayRef = useRef<HTMLCanvasElement>(null);
  const docStreamRef = useRef<MediaStream | null>(null);
  const docQuadRef = useRef<Quad | null>(null);
  const capturedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropBoxRef = useRef<HTMLDivElement>(null);
  const draggingCornerRef = useRef<number | null>(null);
  const [docCamActive, setDocCamActive] = useState(false);
  const [docEdgesFound, setDocEdgesFound] = useState(false);
  const [docProcessing, setDocProcessing] = useState(false);
  const [cvReady, setCvReady] = useState(() => isOpenCvReady());
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const [editQuad, setEditQuad] = useState<Quad>([
    { x: 0.08, y: 0.08 },
    { x: 0.92, y: 0.08 },
    { x: 0.92, y: 0.92 },
    { x: 0.08, y: 0.92 },
  ]);

  const stopDocCamera = useCallback(() => {
    if (docStreamRef.current) {
      docStreamRef.current.getTracks().forEach((t) => t.stop());
      docStreamRef.current = null;
    }
    if (docVideoRef.current) {
      docVideoRef.current.srcObject = null;
    }
    docQuadRef.current = null;
    setDocEdgesFound(false);
    setDocCamActive(false);
  }, []);

  useEffect(() => {
    if (!isOpen || scannerMode !== "ocr") {
      stopDocCamera();
      setCropPreviewUrl(null);
      capturedCanvasRef.current = null;
    }
    return () => stopDocCamera();
  }, [isOpen, scannerMode, stopDocCamera]);

  useEffect(() => {
    if (!docCamActive || !isOpen) return;
    let cancelled = false;
    let timerId: number | null = null;
    const workCanvas = document.createElement("canvas");

    const tick = () => {
      if (cancelled) return;
      const video = docVideoRef.current;
      const overlay = docOverlayRef.current;
      if (
        video &&
        overlay &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        const w = 320;
        const h = Math.max(180, Math.round((video.videoHeight * w) / video.videoWidth));
        workCanvas.width = w;
        workCanvas.height = h;
        const wctx = workCanvas.getContext("2d", { willReadFrequently: true });
        if (wctx) {
          wctx.drawImage(video, 0, 0, w, h);
          const quad = detectReceiptQuad(workCanvas);
          docQuadRef.current = quad;
          setDocEdgesFound(Boolean(quad));

          overlay.width = overlay.clientWidth || w;
          overlay.height = overlay.clientHeight || h;
          const octx = overlay.getContext("2d");
          if (octx) {
            octx.clearRect(0, 0, overlay.width, overlay.height);
            if (quad) {
              octx.strokeStyle = "#10B981";
              octx.fillStyle = "rgba(16, 185, 129, 0.16)";
              octx.lineWidth = 3;
              octx.beginPath();
              octx.moveTo(quad[0].x * overlay.width, quad[0].y * overlay.height);
              octx.lineTo(quad[1].x * overlay.width, quad[1].y * overlay.height);
              octx.lineTo(quad[2].x * overlay.width, quad[2].y * overlay.height);
              octx.lineTo(quad[3].x * overlay.width, quad[3].y * overlay.height);
              octx.closePath();
              octx.fill();
              octx.stroke();

              for (const pt of quad) {
                octx.beginPath();
                octx.arc(pt.x * overlay.width, pt.y * overlay.height, 5, 0, Math.PI * 2);
                octx.fillStyle = "#34D399";
                octx.fill();
              }
            }
          }
        }
      }
      if (!cancelled) {
        timerId = window.setTimeout(tick, 220);
      }
    };

    timerId = window.setTimeout(tick, 250);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [docCamActive, isOpen]);

  if (!isOpen) return null;

  async function startLiveDocCamera() {
    setScanNotice(null);
    setCropPreviewUrl(null);
    capturedCanvasRef.current = null;
    if (!isOpenCvReady()) {
      loadOpenCv().then((cv) => {
        if (cv) setCvReady(true);
      });
    } else {
      setCvReady(true);
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setScanNotice(
        lang === "bm"
          ? "Pengimbas kamera langsung tidak disokong pada pelayar ini. Sila guna Ambil Gambar Resit."
          : "Live camera scanner is not supported in this browser. Use Snap Photo instead."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      docStreamRef.current = stream;
      setDocCamActive(true);
      setSheetExpanded(true);
      requestAnimationFrame(() => {
        if (docVideoRef.current) {
          docVideoRef.current.srcObject = stream;
          docVideoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setScanNotice(
        lang === "bm"
          ? "Akses kamera disekat atau tiada kamera dikesan. Sila guna Muat Naik Foto."
          : "Camera access was blocked or unavailable. Use Upload Photo instead."
      );
      stopDocCamera();
    }
  }

  function captureDocFrameForCrop() {
    const video = docVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = video.videoWidth;
    fullCanvas.height = video.videoHeight;
    const ctx = fullCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);

    const detected = detectReceiptQuad(fullCanvas) || docQuadRef.current;
    capturedCanvasRef.current = fullCanvas;
    setEditQuad(
      detected || [
        { x: 0.08, y: 0.08 },
        { x: 0.92, y: 0.08 },
        { x: 0.92, y: 0.92 },
        { x: 0.08, y: 0.92 },
      ]
    );
    setCropPreviewUrl(fullCanvas.toDataURL("image/jpeg", 0.85));
    stopDocCamera();
  }

  async function confirmCropAndConvertBw() {
    const fullCanvas = capturedCanvasRef.current;
    if (!fullCanvas) return;
    setDocProcessing(true);
    try {
      const { file: bwFile } = await processScannedReceiptCanvas(
        fullCanvas,
        `receipt-bw-${Date.now()}.jpg`,
        editQuad
      );
      setCropPreviewUrl(null);
      capturedCanvasRef.current = null;
      await handleFileSelected(bwFile);
    } catch {
      setScanNotice(
        lang === "bm"
          ? "Gagal memproses imbasan resit. Sila cuba lagi."
          : "Could not process receipt scan. Please try again."
      );
    } finally {
      setDocProcessing(false);
    }
  }

  async function startLiveQrCamera() {
    setScanNotice(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setScanNotice(
        lang === "bm"
          ? "Kamera langsung tidak disokong pada pelayar ini. Sila guna Ambil Gambar / Muat Naik Foto."
          : "Live camera is not supported in this browser. Use Snap / Upload Photo instead."
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
      qrStreamRef.current = stream;
      setLiveQrActive(true);
      setSheetExpanded(true);
      requestAnimationFrame(() => {
        if (qrVideoRef.current) {
          qrVideoRef.current.srcObject = stream;
          qrVideoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setScanNotice(
        lang === "bm"
          ? "Akses kamera disekat atau tiada kamera dikesan. Sila guna Muat Naik Foto."
          : "Camera access was blocked or unavailable. Use Upload Photo or paste the MyInvois link below."
      );
      stopQrCamera();
    }
  }

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const selectedCatSummary = categorySummaries.find(
    (s) => s.category.id === categoryId
  );
  const numericAmount = parseFloat(amount) || 0;
  const isRejectedBlocked =
    scanResult?.eligibility === "rejected" && !overrideRejection;

  const receiptYearNum = Number(expenseDate.slice(0, 4));
  const hasYearMismatch =
    !Number.isNaN(receiptYearNum) && receiptYearNum !== targetTaxYear;
  const isReceiptYearSupported = SUPPORTED_TAX_YEARS.includes(
    receiptYearNum as TaxYear
  );

  function resetScan() {
    setReceiptFile(null);
    setPreviewUrl(null);
    setScanResult(null);
    setShowRawText(false);
    setOverrideRejection(false);
    setScanNotice(null);
    setScanProgress(0);
    setMerchant("");
    setAmount("");
    setInvoiceNumber("");
    setDescription("");
  }

  function applyScanResult(result: ReceiptScanResult) {
    setScanResult(result);

    if (result.merchant) setMerchant(result.merchant);
    if (result.date) {
      setExpenseDate(result.date);
      const detectedYr = Number(result.date.slice(0, 4));
      if (SUPPORTED_TAX_YEARS.includes(detectedYr as TaxYear)) {
        setTargetTaxYear(detectedYr as TaxYear);
      }
    }
    if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber);
    if (result.description) setDescription(result.description);
    if (result.paymentMethod) setPaymentMethod(result.paymentMethod);
    if (result.cardLast4) setCardLast4(result.cardLast4);
    if (typeof result.sstOrTaxAmount === "number") {
      setSstAmount(String(result.sstOrTaxAmount));
    }
    if (result.merchantRegistrationOrTaxId) {
      setMerchantTaxId(result.merchantRegistrationOrTaxId);
    }
    if (result.currency) setCurrency(result.currency);

    if (result.eligibility === "rejected") {
      setAmount(result.totalAmount > 0 ? String(result.totalAmount) : "");
    } else {
      const bestAmount = result.amount > 0 ? result.amount : result.totalAmount;
      if (bestAmount > 0) setAmount(String(bestAmount));
      if (result.suggestedCategoryId) {
        setCategoryId(result.suggestedCategoryId);
        const matchedCat = getReliefCategories(targetTaxYear).find(
          (c) => c.id === result.suggestedCategoryId
        );
        setSubCategoryId(
          result.suggestedSubCategoryId ||
            matchedCat?.subCategories?.[0]?.id ||
            ""
        );
      }
    }
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    const limits = getPackageResourceLimits(subscription.planTier);
    const maxBytes = limits.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setReceiptFile(null);
      setPreviewUrl(null);
      setScanRetryable(false);
      setScanNotice(
        lang === "bm"
          ? `Saiz fail (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi had pelan ${subscription.planTier.toUpperCase()} (${limits.maxFileSizeMb} MB). Sila kecilkan fail atau naik taraf pelan.`
          : `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds your ${subscription.planTier.toUpperCase()} plan limit (${limits.maxFileSizeMb} MB). Please compress the file or upgrade.`
      );
      return;
    }

    setReceiptFile(file);
    setScanNotice(null);
    setScanRetryable(false);
    setScanResult(null);
    setShowRawText(false);
    setOverrideRejection(false);
    setDuplicateWarning(null);
    setDuplicateConfirmed(false);
    setScanProgress(5);
    setScanStatusText("Checking receipt...");

    // Compute SHA-256 hash of original file for integrity & duplicate detection
    computeFileSha256(file).then((hash) => {
      setOriginalFileHash(hash);
      if (hash) {
        const dup = findDuplicateExpense(
          { merchant: "", amount: 0, expenseDate: "", fileHash: hash },
          existingExpenses
        );
        if (dup) setDuplicateWarning(dup.reason);
      }
    });

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Attempt MyInvois QR code extraction automatically (or primarily when in QR mode)
    tryDecodeMyInvoisQrFromFile(file).then((qrText) => {
      if (qrText) {
        const parsedQr = parseMyInvoisQrText(qrText);
        setQrDetectedUrl(parsedQr.rawUrl);
        setMyInvoisUuid(parsedQr.invoiceUuid);
        setInvoiceNumber((prev) => prev || parsedQr.invoiceUuid);
        setDescription((prev) =>
          prev
            ? prev
            : `MyInvois e-Invoice (${
                parsedQr.isOfficial ? "Verified LHDN" : "QR"
              }): ${parsedQr.rawUrl}`
        );
      } else if (scannerMode === "qr") {
        setScanNotice(
          "No MyInvois QR detected in frame — running OCR on the receipt text instead, or paste the MyInvois URL below."
        );
      }
    });

    setIsScanning(true);
    try {
      // Step 1: Try cloud AI vision if configured on server (render PDFs or resize images to crisp JPEG)
      let usedCloudAi = false;
      let fileForOcr: File = file;
      try {
        let uploadFile: File;
        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          setScanStatusText("Rendering PDF page...");
          const renderedJpeg = await renderPdfFirstPageToJpeg(file, 1200);
          uploadFile = renderedJpeg || file;
          if (renderedJpeg) fileForOcr = renderedJpeg;
        } else {
          setScanStatusText("Optimizing photo...");
          uploadFile = await normalizeImageForAiUpload(file);
        }
        setScanStatusText("Scanning with Gemini AI Vision...");
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("taxYear", String(targetTaxYear));
        formData.append("planTier", subscription.planTier);
        formData.append("aiScansUsed", String(subscription.aiScansUsed));

        const headers: Record<string, string> = {};
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session?.access_token) {
            headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
          }
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 22000);
        let res: Response;
        try {
          res = await fetch("/api/scan-receipt", {
            method: "POST",
            headers,
            body: formData,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (res.ok) {
          const data = await res.json();
          if (data.aiSkippedReason) {
            setScanNotice(data.aiSkippedReason);
          }
          if (!data.fallbackToLocalOcr && data.eligibility) {
            applyScanResult(data as ReceiptScanResult);
            usedCloudAi = true;
            await onAiScanCompleted();
          }
        }
      } catch {
        // Silently fall back to on-device OCR
      }

      // Step 2: Seamless On-Device Free OCR + Malaysian LHDN Rule Engine
      if (!usedCloudAi) {
        const hasAiQuota =
          subscription.planTier !== "free" ||
          subscription.aiScansUsed < subscription.aiScansLimit;
        const isOcrPdf =
          fileForOcr.type === "application/pdf" ||
          fileForOcr.name.toLowerCase().endsWith(".pdf");
        if (isOcrPdf) {
          setScanRetryable(hasAiQuota);
          setScanNotice((prev) =>
            prev ||
            (lang === "bm"
              ? "AI & pembaca PDF tidak dapat membaca fail ini. Klik Cuba Lagi AI atau masukkan butiran resit secara manual di bawah."
              : "AI & PDF reader could not read this file. Click Retry AI or enter the receipt details manually below.")
          );
        } else {
          const localResult = await runLocalReceiptOcr(
            fileForOcr,
            targetTaxYear,
            (pct, text) => {
              setScanProgress(pct);
              setScanStatusText(text);
            }
          );
          applyScanResult(localResult);
          if (hasAiQuota) {
            setScanRetryable(true);
            setScanNotice((prev) =>
              prev ||
              (lang === "bm"
                ? "AI awan tidak tersedia buat sementara — menggunakan OCR pada peranti. Klik Cuba Lagi AI atau semak butiran di bawah."
                : "Cloud AI was unavailable — used on-device OCR instead. Click Retry AI or review the details below.")
            );
          } else if (!localResult.merchant && localResult.totalAmount <= 0) {
            setScanNotice((prev) =>
              prev ||
              (lang === "bm"
                ? "OCR tidak dapat mengesan butiran resit. Sila masukkan maklumat secara manual di bawah."
                : "OCR could not detect receipt figures. Please enter the details manually below.")
            );
          }
        }
      }
    } catch {
      setScanRetryable(true);
      setScanNotice(
        lang === "bm"
          ? "Gagal membaca fail ini — resit telah dilampirkan! Klik Cuba Lagi atau isi butiran secara manual di bawah."
          : "Could not read text from this file — receipt is attached! Click Retry or fill in the details manually below."
      );
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRejectedBlocked) return;
    if (!merchant.trim() || numericAmount <= 0) return;

    // Duplicate check before saving (skip comparing against self when editing)
    const otherExpenses = editingExpense
      ? existingExpenses.filter((ex) => ex.id !== editingExpense.id)
      : existingExpenses;
    if (!duplicateConfirmed) {
      const dup = findDuplicateExpense(
        {
          merchant: merchant.trim(),
          amount: numericAmount,
          expenseDate,
          invoiceNumber: invoiceNumber.trim(),
          fileHash: originalFileHash,
        },
        otherExpenses
      );
      if (dup) {
        setDuplicateWarning(dup.reason);
        return;
      }
    }

    setIsSaving(true);
    try {
      const archiveCat: ArchiveCategory =
        scanResult?.archiveCategory ||
        mapReliefToArchiveCategory(categoryId, subCategoryId);
      const baseName = buildArchiveBaseFilename({
        transactionDate: expenseDate,
        merchantName: merchant.trim(),
        amountPaid: numericAmount,
        currency: currency || "MYR",
        category: archiveCat,
      });
      const filePdfName = `${baseName}.pdf`;
      const missingKeyFields: string[] = [];
      if (!expenseDate) missingKeyFields.push("transaction date");
      if (!invoiceNumber.trim()) missingKeyFields.push("receipt number");

      const needsReview =
        Boolean(scanResult?.needsReview) ||
        Boolean(scanResult?.imageQualityIssue) ||
        missingKeyFields.length > 0;
      const reviewReason =
        scanResult?.reviewReason ||
        scanResult?.imageQualityIssue ||
        (missingKeyFields.length > 0
          ? `Missing: ${missingKeyFields.join(", ")}`
          : "");

      const metadata: LhdnReceiptMetadata = {
        file_pdf: filePdfName,
        capture_date: new Date().toISOString().slice(0, 10),
        transaction_date: expenseDate,
        merchant_name: maskSensitiveText(merchant.trim()),
        merchant_registration_or_tax_id: maskSensitiveText(
          merchantTaxId.trim()
        ),
        receipt_number: maskSensitiveText(invoiceNumber.trim()),
        payment_method: paymentMethod.trim(),
        card_last4: cardLast4.replace(/\D/g, "").slice(-4),
        currency: (currency || "MYR").toUpperCase(),
        amount_paid: numericAmount,
        sst_or_tax_amount: parseFloat(sstAmount) || 0,
        tax_inclusive: scanResult?.taxInclusive ?? true,
        category: archiveCat,
        lhdn_relief_or_expense_type:
          selectedCategory?.name || categoryId,
        items:
          scanResult?.items && scanResult.items.length > 0
            ? scanResult.items
            : [
                {
                  description:
                    maskSensitiveText(description.trim()) ||
                    selectedCategory?.shortName ||
                    "Receipt item",
                  quantity: 1,
                  unit_price: numericAmount,
                  amount: numericAmount,
                },
              ],
        ocr_confidence: scanResult?.confidence || "high",
        needs_review: needsReview,
        review_reason: reviewReason,
        original_file_hash: originalFileHash,
        notes: maskSensitiveText(description.trim()),
      };

      // Convert photo to compact, searchable single-page PDF (<150KB target); keep original PDFs unaltered
      let archivedPdfFile: File | null = receiptFile;
      if (receiptFile) {
        try {
          archivedPdfFile = await buildSearchableReceiptPdf(
            receiptFile,
            metadata,
            { keepColor: keepColorPdf }
          );
        } catch {
          archivedPdfFile = receiptFile;
        }
      }

      const expensePayload: Omit<TaxExpense, "id" | "createdAt"> = {
        taxYear: targetTaxYear,
        categoryId:
          claimType === "business_deductible" ? "business_expense" : categoryId,
        subCategoryId:
          claimType === "business_deductible"
            ? "business_deductible"
            : subCategoryId || null,
        claimType,
        myInvoisUuid: myInvoisUuid.trim() || null,
        offlineQueued: isOffline,
        merchant: merchant.trim(),
        description: maskSensitiveText(description.trim()),
        amount: numericAmount,
        expenseDate,
        invoiceNumber: invoiceNumber.trim() || myInvoisUuid.trim(),
        receiptPath: archivedPdfFile
          ? undefined
          : editingExpense?.receiptPath || null,
        receiptUrl: archivedPdfFile
          ? undefined
          : editingExpense?.receiptUrl || null,
        receiptFileName: archivedPdfFile
          ? filePdfName
          : editingExpense?.receiptFileName || null,
        receiptMimeType: archivedPdfFile
          ? "application/pdf"
          : editingExpense?.receiptMimeType || null,
        metadata,
        aiExtracted:
          Boolean(scanResult) || Boolean(editingExpense?.aiExtracted),
      };

      // If offline, queue in IndexedDB for automatic background sync when online
      if (isOffline && !editingExpense) {
        await enqueueOfflineReceipt({
          id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          queuedAt: new Date().toISOString(),
          expense: expensePayload,
          fileBlob: archivedPdfFile || null,
          fileName: archivedPdfFile?.name || null,
          fileMimeType: archivedPdfFile?.type || null,
        });
        onOfflineQueued?.();
      }

      await onSave(expensePayload, archivedPdfFile, editingExpense?.id);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  const remainingAfter = selectedCatSummary
    ? selectedCatSummary.remaining - numericAmount
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col justify-end bg-slate-950/90 backdrop-blur-xs sm:items-center sm:justify-center sm:p-4">
      {/* Full-Screen Viewfinder Header & Framing Guide (Mobile 100dvh feel) */}
      <div
        className={`relative flex flex-col items-center justify-between px-4 pt-safe text-white transition-all duration-300 sm:hidden ${
          sheetExpanded ? "py-3" : "flex-1 py-6"
        }`}
      >
        <div className="flex w-full items-center justify-between gap-2 pt-2">
          {/* Segmented Mode Toggle: Receipt Photo (OCR) vs MyInvois QR */}
          <div className="inline-flex rounded-full bg-white/10 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setScannerMode("ocr")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                scannerMode === "ocr"
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              {copy.scannerPhotoTab}
            </button>
            <button
              type="button"
              onClick={() => setScannerMode("qr")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                scannerMode === "qr"
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <QrCode className="h-3.5 w-3.5" />
              {copy.scannerQrTab}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/15 p-2 text-white backdrop-blur-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Rectangular Receipt / QR Framing Guide */}
        <div
          onClick={() => {
            if (scannerMode === "qr") {
              startLiveQrCamera();
            } else {
              cameraInputRef.current?.click();
            }
          }}
          className={`my-2 flex w-full max-w-xs cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400/80 bg-slate-900/60 p-4 text-center transition ${
            sheetExpanded ? "h-28" : "h-64"
          }`}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Captured receipt frame"
              className="h-full w-full rounded-xl object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              {scannerMode === "qr" ? (
                <QrCode className="h-7 w-7 text-emerald-400" />
              ) : (
                <Camera className="h-7 w-7 text-emerald-400" />
              )}
              <p className="text-xs font-bold text-emerald-300">
                {scannerMode === "qr"
                  ? "Tap to Frame LHDN MyInvois QR Code"
                  : "Tap to Frame Receipt within Guide"}
              </p>
              <p className="text-[10px] text-slate-300">
                Auto-compresses (~300KB) for 7-year LHDN vault
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Draggable Post-Scan Bottom Sheet */}
      <div
        className={`flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl transition-all duration-300 sm:max-h-[90vh] sm:rounded-3xl ${
          sheetExpanded ? "max-h-[82dvh]" : "max-h-[46dvh]"
        }`}
      >
        {/* Drag Handle for Mobile Bottom Sheet */}
        <div
          onTouchStart={(e) => {
            dragStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            if (dragStartYRef.current === null) return;
            const endY = e.changedTouches[0]?.clientY ?? dragStartYRef.current;
            const delta = endY - dragStartYRef.current;
            if (delta > 35) setSheetExpanded(false);
            else if (delta < -35) setSheetExpanded(true);
            dragStartYRef.current = null;
          }}
          onClick={() => setSheetExpanded((v) => !v)}
          className="flex cursor-grab flex-col items-center pt-2.5 pb-1 sm:hidden"
        >
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {editingExpense
                  ? lang === "bm"
                    ? "Sunting Resit / Lampirkan Bukti"
                    : "Edit Receipt / Attach Proof"
                  : scannerMode === "qr"
                  ? lang === "bm"
                    ? "Pengimbas QR MyInvois & Resit"
                    : "MyInvois QR & Receipt Scanner"
                  : isGeneralScanMode
                  ? lang === "bm"
                    ? "Pengimbas Resit Pintar LHDN"
                    : "Smart LHDN Receipt Scanner"
                  : lang === "bm"
                  ? "Imbas atau Rekod Resit"
                  : "Scan or Log Receipt"}
              </h2>
              {isOffline && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  <WifiOff className="h-3 w-3 text-amber-700" />
                  {lang === "bm" ? "Baris Luar Talian" : "Offline Queue"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {isOffline
                ? lang === "bm"
                  ? "Disimpan luar talian dalam IndexedDB — akan disegerak automatik apabila dalam talian"
                  : "Saved offline in IndexedDB — will sync automatically when online"
                : lang === "bm"
                ? "Mampatan ~300KB pada peranti + enjin peraturan AI / LHDN"
                : "Client-side ~300KB compression + AI / LHDN rule engine"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Desktop Mode Switcher (OCR vs QR) */}
            <div className="hidden sm:inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setScannerMode("ocr")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  scannerMode === "ocr"
                    ? "bg-white text-emerald-700 shadow-2xs"
                    : "text-slate-600"
                }`}
              >
                {lang === "bm" ? "OCR Resit" : "Receipt OCR"}
              </button>
              <button
                type="button"
                onClick={() => setScannerMode("qr")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  scannerMode === "qr"
                    ? "bg-white text-emerald-700 shadow-2xs"
                    : "text-slate-600"
                }`}
              >
                {lang === "bm" ? "QR MyInvois" : "MyInvois QR"}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-safe"
        >
          {/* Hidden File Inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleFileSelected(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              handleFileSelected(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {/* Camera & Upload Buttons */}
          {scannerMode === "ocr" && docCamActive && (
            <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500 bg-black">
              <video
                ref={docVideoRef}
                playsInline
                muted
                autoPlay
                className="h-64 w-full object-cover"
              />
              <canvas
                ref={docOverlayRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
              <div className="flex items-center justify-between gap-2 bg-slate-900/90 px-3 py-2 text-[11px] text-white">
                <span className="font-medium text-emerald-300">
                  {!cvReady
                    ? lang === "bm"
                      ? "Memuatkan pengesan tepi OpenCV…"
                      : "Loading OpenCV edge detector…"
                    : docEdgesFound
                    ? lang === "bm"
                      ? "Tepi resit dikesan — ketik Tangkap"
                      : "Edges locked — tap Capture"
                    : lang === "bm"
                    ? "Halakan kamera ke atas resit…"
                    : "Point camera at receipt…"}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={captureDocFrameForCrop}
                    className="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-500"
                  >
                    {lang === "bm" ? "Tangkap" : "Capture"}
                  </button>
                  <button
                    type="button"
                    onClick={stopDocCamera}
                    className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25"
                  >
                    {lang === "bm" ? "Henti" : "Stop"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {scannerMode === "ocr" && cropPreviewUrl && (
            <div className="space-y-2 rounded-2xl border-2 border-emerald-500 bg-slate-950 p-2.5">
              <p className="text-center text-[11px] font-semibold text-emerald-300">
                {lang === "bm"
                  ? "Seret 4 sudut jika perlu, kemudian ketik Tukar B&W"
                  : "Drag any of the 4 corners to fine-tune, then tap Convert B&W"}
              </p>
              <div
                ref={cropBoxRef}
                className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-xl bg-black"
                onPointerMove={(e) => {
                  const idx = draggingCornerRef.current;
                  const box = cropBoxRef.current;
                  if (idx === null || !box) return;
                  const rect = box.getBoundingClientRect();
                  const nx = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
                  const ny = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / rect.height));
                  setEditQuad((prev) => {
                    const next = [...prev] as Quad;
                    next[idx] = { x: nx, y: ny };
                    return next;
                  });
                }}
                onPointerUp={() => {
                  draggingCornerRef.current = null;
                }}
                onPointerCancel={() => {
                  draggingCornerRef.current = null;
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cropPreviewUrl}
                  alt="Adjust receipt corners"
                  className="block max-h-72 w-full object-contain pointer-events-none"
                />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <polygon
                    points={editQuad
                      .map((p) => `${p.x * 100},${p.y * 100}`)
                      .join(" ")}
                    fill="rgba(16, 185, 129, 0.18)"
                    stroke="#10B981"
                    strokeWidth="0.9"
                  />
                </svg>
                {editQuad.map((pt, idx) => (
                  <div
                    key={idx}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      draggingCornerRef.current = idx;
                    }}
                    style={{
                      left: `${pt.x * 100}%`,
                      top: `${pt.y * 100}%`,
                    }}
                    className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-emerald-500 shadow-md active:cursor-grabbing"
                  />
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCropPreviewUrl(null);
                    capturedCanvasRef.current = null;
                    startLiveDocCamera();
                  }}
                  className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
                >
                  {lang === "bm" ? "Ambil Semula" : "Retake"}
                </button>
                <button
                  type="button"
                  disabled={docProcessing}
                  onClick={confirmCropAndConvertBw}
                  className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {docProcessing
                    ? lang === "bm"
                      ? "Memproses…"
                      : "Processing…"
                    : lang === "bm"
                    ? "Potong & Tukar B&W"
                    : "Crop & Convert B&W"}
                </button>
              </div>
            </div>
          )}

          <div
            className={`grid gap-2.5 ${
              scannerMode === "ocr" ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            {scannerMode === "ocr" && (
              <button
                type="button"
                onClick={() => {
                  if (docCamActive) {
                    stopDocCamera();
                  } else {
                    startLiveDocCamera();
                  }
                }}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-emerald-500 bg-emerald-600 p-3 text-white transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                {docCamActive ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Video className="h-5 w-5" />
                )}
                <span className="text-[11px] font-bold leading-tight text-center">
                  {docCamActive
                    ? lang === "bm"
                      ? "Tutup Pengimbas"
                      : "Close Scanner"
                    : lang === "bm"
                    ? "Imbas Dokumen B&W"
                    : "Doc Scan (B&W)"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (scannerMode === "qr") {
                  if (liveQrActive) {
                    stopQrCamera();
                  } else {
                    startLiveQrCamera();
                  }
                } else {
                  cameraInputRef.current?.click();
                }
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 p-3 text-emerald-800 transition active:scale-[0.98]"
            >
              {scannerMode === "qr" ? (
                liveQrActive ? (
                  <X className="h-6 w-6 text-rose-600" />
                ) : (
                  <Video className="h-6 w-6 text-emerald-600" />
                )
              ) : (
                <Camera className="h-5 w-5 text-emerald-600" />
              )}
              <span className="text-[11px] font-semibold leading-tight text-center">
                {scannerMode === "qr"
                  ? liveQrActive
                    ? lang === "bm"
                      ? "Henti Kamera QR"
                      : "Stop QR Camera"
                    : lang === "bm"
                    ? "Imbas Kamera QR Langsung"
                    : "Live QR Camera"
                  : lang === "bm"
                  ? "Ambil Gambar"
                  : "Snap Photo"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-slate-700 transition active:scale-[0.98]"
            >
              <Upload className="h-5 w-5 text-slate-500" />
              <span className="text-[11px] font-semibold leading-tight text-center">
                {lang === "bm" ? "Muat Naik Foto / PDF" : "Upload Photo / PDF"}
              </span>
            </button>
          </div>

          {/* Manual MyInvois QR Validation Link input when in QR Mode or QR detected */}
          {(scannerMode === "qr" || qrDetectedUrl || myInvoisUuid) && (
            <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-900">
                  <QrCode className="h-3.5 w-3.5 text-emerald-600" />
                  {qrDetectedUrl || myInvoisUuid
                    ? lang === "bm"
                      ? "e-Invois MyInvois LHDN Dipautkan"
                      : "LHDN MyInvois e-Invoice Linked"
                    : lang === "bm"
                    ? "Tampal Pautan Pengesahan MyInvois"
                    : "Paste MyInvois Validation Link"}
                </span>
                {qrDetectedUrl && qrDetectedUrl.startsWith("http") && (
                  <a
                    href={qrDetectedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 underline"
                  >
                    {lang === "bm" ? "Sahkan Portal" : "Verify Portal"}{" "}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {myInvoisUuid && (
                <p className="font-mono text-[11px] text-emerald-800">
                  UUID: {myInvoisUuid}
                </p>
              )}
              {scannerMode === "qr" && liveQrActive && (
                <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500 bg-black">
                  <video
                    ref={qrVideoRef}
                    playsInline
                    muted
                    autoPlay
                    className="h-52 w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-32 w-32 rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/90 px-3 py-1.5 text-[11px] text-white">
                    <span className="text-emerald-300">
                      {lang === "bm"
                        ? "Halakan kamera ke kod QR MyInvois…"
                        : "Point camera at MyInvois QR code…"}
                    </span>
                    <button
                      type="button"
                      onClick={stopQrCamera}
                      className="rounded-lg bg-white/15 px-2 py-0.5 font-semibold"
                    >
                      {lang === "bm" ? "Henti" : "Stop"}
                    </button>
                  </div>
                </div>
              )}
              {scannerMode === "qr" && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://myinvois.hasil.gov.my/..."
                    value={manualQrUrl}
                    onChange={(e) => setManualQrUrl(e.target.value)}
                    className="flex-1 rounded-xl border border-emerald-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!manualQrUrl.trim()}
                    onClick={() => {
                      const p = parseMyInvoisQrText(manualQrUrl);
                      setQrDetectedUrl(p.rawUrl);
                      setMyInvoisUuid(p.invoiceUuid);
                      setInvoiceNumber((prev) => prev || p.invoiceUuid);
                      setDescription(
                        (prev) =>
                          prev ||
                          `MyInvois e-Invoice (${
                            p.isOfficial ? "Verified LHDN" : "QR"
                          }): ${p.rawUrl}`
                      );
                    }}
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {lang === "bm" ? "Paut QR" : "Link QR"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Attached File Preview */}
          {receiptFile && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Receipt preview"
                  onError={() => setPreviewUrl(null)}
                  className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <FileText className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {receiptFile.name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {(receiptFile.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={resetScan}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Scanning Progress State */}
          {isScanning && (
            <div className="space-y-2 rounded-xl bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                <span className="font-medium">{scanStatusText}</span>
              </div>
              {scanProgress > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-200">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* VERDICT 1: REJECTED */}
          {scanResult && scanResult.eligibility === "rejected" && (
            <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-start gap-2.5">
                <div className="rounded-xl bg-rose-100 p-2 text-rose-700">
                  <Ban className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Not Claimable
                    </span>
                    <EngineBadge engine={scanResult.scanEngine} />
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-rose-950">
                    {scanResult.merchant || "Unrecognized receipt"}
                    {scanResult.totalAmount > 0 &&
                      ` • ${formatRM(scanResult.totalAmount, true)}`}
                  </p>
                  <p className="mt-1 text-xs text-rose-800">
                    {scanResult.rejectionReason || scanResult.reasoning}
                  </p>
                </div>
              </div>

              {!overrideRejection && (
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetScan}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-xs active:scale-[0.99]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Discard & Scan Another Receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideRejection(true)}
                    className="py-1 text-center text-[11px] font-semibold text-rose-700 underline underline-offset-2"
                  >
                    Override & log manually anyway
                  </button>
                </div>
              )}
            </div>
          )}

          {/* VERDICT 2: PARTIALLY ELIGIBLE */}
          {scanResult && scanResult.eligibility === "partial" && (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Partially Claimable
                    </span>
                    <EngineBadge engine={scanResult.scanEngine} />
                    <span className="text-[11px] text-amber-800">
                      {formatRM(scanResult.amount, true)} of{" "}
                      {formatRM(scanResult.totalAmount, true)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-amber-900">
                    {scanResult.reasoning}
                  </p>
                  {scanResult.excludedItems &&
                    scanResult.excludedItems.length > 0 && (
                      <div className="mt-2 rounded-lg bg-white/70 p-2 text-[11px] text-amber-900">
                        <p className="font-semibold">Excluded items:</p>
                        <ul className="mt-0.5 list-disc pl-4">
                          {scanResult.excludedItems.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* VERDICT 4: UNCERTAIN — SUGGEST CLOSEST CATEGORIES & ASK USER */}
          {scanResult && scanResult.eligibility === "uncertain" && (
            <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-950">
              <div className="flex items-start gap-2.5">
                <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Confirm Category
                    </span>
                    <EngineBadge engine={scanResult.scanEngine} />
                  </div>
                  <p className="mt-1.5 font-semibold text-indigo-950">
                    Unable to confirm the exact purpose of this receipt
                  </p>
                  <p className="mt-0.5 text-[11px] text-indigo-800">
                    {scanResult.reasoning}
                  </p>
                </div>
              </div>

              {scanResult.suggestedOptions &&
                scanResult.suggestedOptions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-indigo-900">
                      Tap the closest LHDN relief (or pick any below):
                    </p>
                    <div className="space-y-1.5">
                      {scanResult.suggestedOptions.map((opt, idx) => {
                        const isSelected =
                          categoryId === opt.categoryId &&
                          (!opt.subCategoryId ||
                            subCategoryId === opt.subCategoryId);
                        return (
                          <button
                            key={`${opt.categoryId}-${opt.subCategoryId || idx}`}
                            type="button"
                            onClick={() => {
                              setCategoryId(opt.categoryId);
                              setSubCategoryId(opt.subCategoryId || "");
                            }}
                            className={`flex w-full items-start justify-between gap-2 rounded-xl border p-2.5 text-left transition ${
                              isSelected
                                ? "border-indigo-600 bg-white ring-2 ring-indigo-500/20"
                                : "border-indigo-200/80 bg-white/75 hover:bg-white"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900">
                                {opt.label}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-600">
                                {opt.reason}
                              </p>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              <button
                type="button"
                onClick={resetScan}
                className="w-full rounded-xl border border-indigo-200 bg-white/80 py-2 text-[11px] font-semibold text-indigo-800 hover:bg-white"
              >
                Not claimable — Discard Receipt
              </button>
            </div>
          )}

          {/* VERDICT 3: ELIGIBLE */}
          {scanResult && scanResult.eligibility === "eligible" && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Eligible Relief
                  </span>
                  <EngineBadge engine={scanResult.scanEngine} />
                </div>
                <p className="mt-1 text-[11px] text-emerald-900">
                  {scanResult.reasoning}
                </p>
              </div>
            </div>
          )}

          {/* Optional Raw OCR Text Drawer */}
          {scanResult?.rawText && (
            <div>
              <button
                type="button"
                onClick={() => setShowRawText((v) => !v)}
                className="text-[11px] font-semibold text-slate-500 underline underline-offset-2"
              >
                {showRawText ? "Hide scanned receipt text" : "View scanned receipt text"}
              </button>
              {showRawText && (
                <pre className="mt-1.5 max-h-32 overflow-auto rounded-xl bg-slate-100 p-2.5 text-[10px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {scanResult.rawText}
                </pre>
              )}
            </div>
          )}

          {scanNotice && (
            <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{scanNotice}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {receiptFile && !isScanning && scanRetryable && (
                  <button
                    type="button"
                    onClick={() => handleFileSelected(receiptFile)}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-800 active:scale-95"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {lang === "bm" ? "Cuba Lagi AI" : "Retry AI"}
                  </button>
                )}
                {subscription.planTier === "free" &&
                  subscription.aiScansUsed >= subscription.aiScansLimit && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenUpgrade(
                          "You've used all 5 free AI Vision receipt scans. Upgrade to CukaiKu Pro for 300 AI Vision scans + 7-Year LHDN Audit Pack!"
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs active:scale-95"
                    >
                      <Crown className="h-3 w-3" />
                      Upgrade
                    </button>
                  )}
              </div>
            </div>
          )}

          {/* Blurry / Faded / Cropped Image Quality Gate */}
          {scanResult?.imageQualityIssue && (
            <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">Image quality issue detected</p>
                  <p className="mt-0.5 text-[11px]">
                    {scanResult.imageQualityIssue}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetScan}
                className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                Retake
              </button>
            </div>
          )}

          {/* Duplicate Receipt Confirmation Gate */}
          {duplicateWarning && !duplicateConfirmed && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold">Possible Duplicate Receipt</p>
                  <p className="mt-0.5 text-[11px]">{duplicateWarning}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetScan}
                  className="flex-1 rounded-lg border border-amber-300 bg-white py-1.5 text-[11px] font-semibold text-amber-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateConfirmed(true)}
                  className="flex-1 rounded-lg bg-amber-600 py-1.5 text-[11px] font-semibold text-white"
                >
                  Save Anyway
                </button>
              </div>
            </div>
          )}

          {/* Form Fields (hidden when rejected unless overridden) */}
          {!isRejectedBlocked && (
            <>
              {hasYearMismatch && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <span>
                    Receipt date is in <strong>{receiptYearNum}</strong>, but
                    you&apos;re logging under <strong>YA {targetTaxYear}</strong>.
                  </span>
                  {isReceiptYearSupported && (
                    <button
                      type="button"
                      onClick={() =>
                        setTargetTaxYear(receiptYearNum as TaxYear)
                      }
                      className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      Use YA {receiptYearNum}
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {/* Freelancer / Mixed Income (e-B) Classification Toggle */}
                {(taxpayerMode === "e-B" ||
                  claimType === "business_deductible") && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="mb-1.5 text-[11px] font-bold text-slate-700">
                      {lang === "bm"
                        ? "Pengelasan Borang e-B (Elak Tuntutan Berganda)"
                        : "Form e-B Classification (Prevent Double-Claiming)"}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setClaimType("personal_relief")}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
                          claimType === "personal_relief"
                            ? "bg-brand-primary text-white shadow-xs"
                            : "bg-white text-slate-600 border border-slate-200"
                        }`}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        {lang === "bm" ? "Pelepasan Cukai Peribadi" : "Personal Tax Relief"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setClaimType("business_deductible")}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
                          claimType === "business_deductible"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-white text-slate-600 border border-slate-200"
                        }`}
                      >
                        <Briefcase className="h-3.5 w-3.5" />
                        {lang === "bm" ? "Perbelanjaan Perniagaan (Sek 33)" : "Business Expense (Sec 33)"}
                      </button>
                    </div>
                  </div>
                )}

                {claimType === "personal_relief" ? (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        {lang === "bm"
                          ? `Kategori Pelepasan LHDN (TT ${targetTaxYear})`
                          : `LHDN Relief Category (YA ${targetTaxYear})`}
                      </label>
                      <select
                        value={categoryId}
                        onChange={(e) => {
                          const nextCatId = e.target.value;
                          setCategoryId(nextCatId);
                          const nextCat = categories.find(
                            (c) => c.id === nextCatId
                          );
                          setSubCategoryId(
                            nextCat?.subCategories?.[0]?.id || ""
                          );
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            [{cat.formBeRef}] {tCategory(cat).name} (
                            {lang === "bm" ? "Had" : "Cap"} {formatRM(cat.maxLimit)})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedCategory?.subCategories &&
                      selectedCategory.subCategories.length > 0 && (
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-700">
                            {lang === "bm"
                              ? "Sub-Kategori (Sub-Had)"
                              : "Sub-Category (Sub-Limit)"}
                          </label>
                          <select
                            value={subCategoryId}
                            onChange={(e) => setSubCategoryId(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                          >
                            {selectedCategory.subCategories.map((sub) => (
                              <option key={sub.id} value={sub.id}>
                                {tSubCategory(sub)} (
                                {lang === "bm" ? "Sub-had" : "Sub-cap"}{" "}
                                {formatRM(sub.maxLimit)})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                    {(() => {
                      const ageWarn = checkCategoryAgeEligibility(
                        categoryId,
                        subCategoryId,
                        targetTaxYear,
                        lang
                      );
                      if (!ageWarn) return null;
                      return (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          <span>{ageWarn}</span>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
                    <p className="font-bold">
                      {lang === "bm"
                        ? "Perbelanjaan Perniagaan Dibenarkan (LHDN Seksyen 33)"
                        : "Allowable Business Deductible Expense (LHDN Section 33)"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-emerald-800">
                      {lang === "bm"
                        ? "Direkod di bawah potongan P&L Perniagaan Borang B dan dikecualikan daripada had pelepasan peribadi supaya tidak dituntut dua kali."
                        : "Logged under Form B Business P&L deductions and excluded from personal relief caps so it is never double-claimed."}
                    </p>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {lang === "bm"
                      ? "Peniaga / Klinik / Pembekal *"
                      : "Merchant / Clinic / Provider *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      lang === "bm"
                        ? "cth., TM Unifi, Klinik Pergigian, Decathlon"
                        : "e.g., TM Unifi, Klinik Pergigian, Decathlon"
                    }
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {lang === "bm"
                        ? "Jumlah Boleh Dituntut (RM) *"
                        : "Claimable Amount (RM) *"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {lang === "bm" ? "Tarikh Resit *" : "Receipt Date *"}
                    </label>
                    <input
                      type="date"
                      required
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {selectedCatSummary && numericAmount > 0 && (
                  <div
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                      remainingAfter >= 0
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {remainingAfter >= 0 ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>
                          {lang === "bm"
                            ? `Layak dituntut sepenuhnya! Baki had ${formatRM(remainingAfter)} dalam ${tCategory(selectedCatSummary.category).shortName}.`
                            : `Fully claimable! ${formatRM(remainingAfter)} cap left in ${selectedCatSummary.category.shortName}.`}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>
                          {lang === "bm"
                            ? `Melebihi had ${tCategory(selectedCatSummary.category).shortName} sebanyak ${formatRM(Math.abs(remainingAfter))}. Masih disimpan untuk rekod anda.`
                            : `Exceeds ${selectedCatSummary.category.shortName} cap by ${formatRM(Math.abs(remainingAfter))}. Still saved for your records.`}
                        </span>
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {lang === "bm"
                        ? "No. Invois / e-Invois"
                        : "Invoice / e-Invoice No."}
                    </label>
                    <input
                      type="text"
                      placeholder={lang === "bm" ? "Pilihan" : "Optional"}
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {lang === "bm" ? "Catatan" : "Notes"}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        lang === "bm"
                          ? "Butiran item atau pesakit"
                          : "Item or patient details"
                      }
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Expandable LHDN Archiving Details (SST, Payment, Tax ID, PDF Options) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowArchiveDetails((v) => !v)}
                      className="text-xs font-semibold text-slate-700 underline underline-offset-2"
                    >
                      {showArchiveDetails
                        ? lang === "bm"
                          ? "Sembunyikan Butiran Arkib LHDN"
                          : "Hide LHDN Archive Details"
                        : lang === "bm"
                        ? "Butiran Arkib LHDN (SST, Bayaran, PDF)"
                        : "LHDN Archive Details (SST, Payment, PDF)"}
                    </button>
                    {receiptFile && receiptFile.type.startsWith("image/") && (
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={keepColorPdf}
                          onChange={(e) => setKeepColorPdf(e.target.checked)}
                          className="h-3.5 w-3.5 accent-emerald-600"
                        />
                        {lang === "bm" ? "Kekalkan PDF berwarna" : "Keep color PDF"}
                      </label>
                    )}
                  </div>

                  {merchant.trim() && numericAmount > 0 && (
                    <p className="truncate font-mono text-[10px] text-slate-500">
                      {lang === "bm" ? "Arkib:" : "Archive:"}{" "}
                      {buildArchiveBaseFilename({
                        transactionDate: expenseDate,
                        merchantName: merchant.trim(),
                        amountPaid: numericAmount,
                        currency: currency || "MYR",
                        category:
                          scanResult?.archiveCategory ||
                          mapReliefToArchiveCategory(categoryId, subCategoryId),
                      })}
                      .pdf + .json
                    </p>
                  )}

                  {showArchiveDetails && (
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                          {lang === "bm" ? "Kaedah Bayaran" : "Payment Method"}
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                        >
                          <option value="">
                            {lang === "bm" ? "Tidak dinyatakan" : "Not specified"}
                          </option>
                          <option value="card">{lang === "bm" ? "Kad" : "Card"}</option>
                          <option value="ewallet">{lang === "bm" ? "e-Dompet" : "e-Wallet"}</option>
                          <option value="duitnow">DuitNow QR</option>
                          <option value="fpx">
                            {lang === "bm"
                              ? "FPX / Perbankan Dalam Talian"
                              : "FPX / Online Banking"}
                          </option>
                          <option value="bank_transfer">
                            {lang === "bm" ? "Pindahan Bank" : "Bank Transfer"}
                          </option>
                          <option value="cash">{lang === "bm" ? "Tunai" : "Cash"}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                          {lang === "bm" ? "4 Digit Akhir Kad" : "Card Last 4 Digits"}
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder={lang === "bm" ? "cth. 4242" : "e.g. 4242"}
                          value={cardLast4}
                          onChange={(e) =>
                            setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                          {lang === "bm"
                            ? `Jumlah SST / Cukai (${currency})`
                            : `SST / Tax Amount (${currency})`}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={sstAmount}
                          onChange={(e) => setSstAmount(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                          {lang === "bm"
                            ? "No. Pendaftaran / Cukai Peniaga"
                            : "Merchant Reg / Tax ID"}
                        </label>
                        <input
                          type="text"
                          placeholder="SSM / SST / TIN"
                          value={merchantTaxId}
                          onChange={(e) => setMerchantTaxId(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving || isScanning}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition active:scale-[0.99] disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {lang === "bm" ? "Menyimpan..." : "Saving..."}
                  </>
                ) : editingExpense ? (
                  copy.scannerUpdateBtn
                ) : (
                  copy.scannerSaveBtn
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

function EngineBadge({ engine }: { engine?: "ai" | "local-ocr" }) {
  if (engine === "ai") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
        <Sparkles className="h-2.5 w-2.5" /> AI Vision
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
      <Cpu className="h-2.5 w-2.5" /> Built-In OCR
    </span>
  );
}

/**
 * Client-Side Image Compression (~300KB target JPEG) so captured receipt photos
 * optimize 7-year LHDN retention storage and upload fast over mobile connections.
 */
async function normalizeImageForAiUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const maxDim = 1280;
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
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const TARGET_BYTES = 300 * 1024; // ~300KB target
      const encodeWithQuality = (q: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              URL.revokeObjectURL(objectUrl);
              resolve(file);
              return;
            }
            if (blob.size > TARGET_BYTES && q > 0.52) {
              encodeWithQuality(Number((q - 0.14).toFixed(2)));
              return;
            }
            URL.revokeObjectURL(objectUrl);
            resolve(
              new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                type: "image/jpeg",
              })
            );
          },
          "image/jpeg",
          q
        );
      };
      encodeWithQuality(0.76);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}
