"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Camera,
  CheckCircle2,
  Cpu,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { formatRM } from "@/lib/calculator";
import { getReliefCategories, SUPPORTED_TAX_YEARS } from "@/lib/lhdn-rules";
import { runLocalReceiptOcr } from "@/lib/local-ocr";
import {
  CategorySummary,
  ReceiptScanResult,
  TaxExpense,
  TaxYear,
} from "@/lib/types";

interface ReceiptScannerModalProps {
  isOpen: boolean;
  taxYear: TaxYear;
  initialCategoryId?: string;
  initialSubCategoryId?: string;
  categorySummaries: CategorySummary[];
  onClose: () => void;
  onSave: (
    expense: Omit<TaxExpense, "id" | "createdAt">,
    receiptFile: File | null
  ) => Promise<void>;
}

export function ReceiptScannerModal({
  isOpen,
  taxYear,
  initialCategoryId,
  initialSubCategoryId,
  categorySummaries,
  onClose,
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

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStatusText, setScanStatusText] = useState<string>(
    "Scanning receipt..."
  );
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [overrideRejection, setOverrideRejection] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isGeneralScanMode = !initialCategoryId;

  useEffect(() => {
    if (isOpen) {
      setTargetTaxYear(taxYear);
      const cats = getReliefCategories(taxYear);
      const catId = initialCategoryId || "lifestyle";
      setCategoryId(catId);
      const cat = cats.find((c) => c.id === catId);
      setSubCategoryId(
        initialSubCategoryId || cat?.subCategories?.[0]?.id || ""
      );
      setMerchant("");
      setAmount("");
      setExpenseDate(`${taxYear}-${new Date().toISOString().slice(5, 10)}`);
      setInvoiceNumber("");
      setDescription("");
      setReceiptFile(null);
      setPreviewUrl(null);
      setScanResult(null);
      setShowRawText(false);
      setOverrideRejection(false);
      setScanNotice(null);
      setScanProgress(0);
    }
  }, [isOpen, initialCategoryId, initialSubCategoryId, taxYear]);

  if (!isOpen) return null;

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
    setReceiptFile(file);
    setScanNotice(null);
    setScanResult(null);
    setShowRawText(false);
    setOverrideRejection(false);
    setScanProgress(5);
    setScanStatusText("Checking receipt...");

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    setIsScanning(true);
    try {
      // Step 1: Try cloud AI vision if configured on server
      let usedCloudAi = false;
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("taxYear", String(targetTaxYear));

        const res = await fetch("/api/scan-receipt", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.aiSkippedReason) {
            setScanNotice(data.aiSkippedReason);
          }
          if (!data.fallbackToLocalOcr && data.eligibility) {
            applyScanResult(data as ReceiptScanResult);
            usedCloudAi = true;
          }
        }
      } catch {
        // Silently fall back to on-device OCR
      }

      // Step 2: Seamless On-Device Free OCR + Malaysian LHDN Rule Engine
      if (!usedCloudAi) {
        const localResult = await runLocalReceiptOcr(
          file,
          targetTaxYear,
          (pct, text) => {
            setScanProgress(pct);
            setScanStatusText(text);
          }
        );
        applyScanResult(localResult);
      }
    } catch {
      setScanNotice(
        "Could not read text from this file — receipt is attached! Please fill in the details below."
      );
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRejectedBlocked) return;
    if (!merchant.trim() || numericAmount <= 0) return;

    setIsSaving(true);
    try {
      await onSave(
        {
          taxYear: targetTaxYear,
          categoryId,
          subCategoryId: subCategoryId || null,
          merchant: merchant.trim(),
          description: description.trim(),
          amount: numericAmount,
          expenseDate,
          invoiceNumber: invoiceNumber.trim(),
          aiExtracted: Boolean(scanResult),
        },
        receiptFile
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  const remainingAfter = selectedCatSummary
    ? selectedCatSummary.remaining - numericAmount
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isGeneralScanMode
                ? "Smart LHDN Receipt Scanner"
                : "Scan or Log Receipt"}
            </h2>
            <p className="text-xs text-slate-500">
              Built-in free OCR + LHDN rule engine (auto-routes or rejects)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
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
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 p-4 text-emerald-800 transition active:scale-[0.98]"
            >
              <Camera className="h-6 w-6 text-emerald-600" />
              <span className="text-xs font-semibold">Snap Any Receipt</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-slate-700 transition active:scale-[0.98]"
            >
              <Upload className="h-6 w-6 text-slate-500" />
              <span className="text-xs font-semibold">Upload Photo / PDF</span>
            </button>
          </div>

          {/* Attached File Preview */}
          {receiptFile && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Receipt preview"
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
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{scanNotice}</span>
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
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    LHDN Relief Category (YA {targetTaxYear})
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      const nextCatId = e.target.value;
                      setCategoryId(nextCatId);
                      const nextCat = categories.find(
                        (c) => c.id === nextCatId
                      );
                      setSubCategoryId(nextCat?.subCategories?.[0]?.id || "");
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        [{cat.formBeRef}] {cat.name} (Cap{" "}
                        {formatRM(cat.maxLimit)})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCategory?.subCategories &&
                  selectedCategory.subCategories.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Sub-Category (Sub-Limit)
                      </label>
                      <select
                        value={subCategoryId}
                        onChange={(e) => setSubCategoryId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                      >
                        {selectedCategory.subCategories.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name} (Sub-cap {formatRM(sub.maxLimit)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Merchant / Clinic / Provider *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., TM Unifi, Klinik Pergigian, Decathlon"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Claimable Amount (RM) *
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
                      Receipt Date *
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
                          Fully claimable! {formatRM(remainingAfter)} cap left in{" "}
                          {selectedCatSummary.category.shortName}.
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>
                          Exceeds {selectedCatSummary.category.shortName} cap by{" "}
                          {formatRM(Math.abs(remainingAfter))}. Still saved for
                          your records.
                        </span>
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Invoice / e-Invoice No.
                    </label>
                    <input
                      type="text"
                      placeholder="Optional"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Notes
                    </label>
                    <input
                      type="text"
                      placeholder="Item or patient details"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
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
                    Saving to Vault...
                  </>
                ) : (
                  `Save to YA ${targetTaxYear} Vault`
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
