"use client";

import { useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Files,
  HelpCircle,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { formatRM } from "@/lib/calculator";
import { getReliefCategories } from "@/lib/lhdn-rules";
import { runLocalReceiptOcr } from "@/lib/local-ocr";
import {
  buildArchiveBaseFilename,
  buildSearchableReceiptPdf,
  computeFileSha256,
  mapReliefToArchiveCategory,
  maskSensitiveText,
} from "@/lib/receipt-archiver";
import { getSupabaseClient } from "@/lib/supabase";
import {
  LhdnReceiptMetadata,
  ReceiptScanResult,
  TaxExpense,
  TaxYear,
} from "@/lib/types";

interface BatchItem {
  id: string;
  file: File;
  status: "queued" | "scanning" | "ready" | "saved" | "error";
  selected: boolean;
  result?: ReceiptScanResult;
  categoryId: string;
  subCategoryId: string;
  merchant: string;
  amount: number;
  expenseDate: string;
  invoiceNumber: string;
  errorMsg?: string;
}

interface BatchImportModalProps {
  isOpen: boolean;
  taxYear: TaxYear;
  onClose: () => void;
  onSaveItem: (
    expense: Omit<TaxExpense, "id" | "createdAt">,
    receiptFile: File | null
  ) => Promise<void>;
}

export function BatchImportModal({
  isOpen,
  taxYear,
  onClose,
  onSaveItem,
}: BatchImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  if (!isOpen) return null;

  const categories = getReliefCategories(taxYear);

  async function handleFilesChosen(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const newItems: BatchItem[] = Array.from(fileList)
      .slice(0, 15)
      .map((file, idx) => ({
        id: `${Date.now()}_${idx}`,
        file,
        status: "queued",
        selected: true,
        categoryId: "lifestyle",
        subCategoryId: "lifestyle_internet",
        merchant: file.name.replace(/\.[^.]+$/, ""),
        amount: 0,
        expenseDate: `${taxYear}-${new Date().toISOString().slice(5, 10)}`,
        invoiceNumber: "",
      }));

    setItems(newItems);
    setIsScanningAll(true);

    // Get Supabase auth token once for the batch
    let authToken: string | null = null;
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      authToken = data.session?.access_token || null;
    }

    for (const item of newItems) {
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, status: "scanning" } : x))
      );

      try {
        let scanResult: ReceiptScanResult | null = null;

        // Try Gemini AI endpoint first
        try {
          const fd = new FormData();
          fd.append("file", item.file);
          fd.append("taxYear", String(taxYear));
          const headers: Record<string, string> = {};
          if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

          const res = await fetch("/api/scan-receipt", {
            method: "POST",
            headers,
            body: fd,
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.fallbackToLocalOcr && data.eligibility) {
              scanResult = data as ReceiptScanResult;
            }
          }
        } catch {
          // fall through to local OCR
        }

        if (!scanResult) {
          scanResult = await runLocalReceiptOcr(item.file, taxYear);
        }

        const catId = scanResult.suggestedCategoryId || "lifestyle";
        const matchedCat = categories.find((c) => c.id === catId);
        const subId =
          scanResult.suggestedSubCategoryId ||
          matchedCat?.subCategories?.[0]?.id ||
          "";
        const bestAmount =
          scanResult.amount > 0 ? scanResult.amount : scanResult.totalAmount;

        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  status: "ready",
                  result: scanResult!,
                  selected: scanResult!.eligibility !== "rejected",
                  categoryId: catId,
                  subCategoryId: subId,
                  merchant: scanResult!.merchant || x.merchant,
                  amount: bestAmount || 0,
                  expenseDate: scanResult!.date || x.expenseDate,
                  invoiceNumber: scanResult!.invoiceNumber || "",
                }
              : x
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  status: "error",
                  selected: false,
                  errorMsg:
                    err instanceof Error ? err.message : "Failed to scan",
                }
              : x
          )
        );
      }
    }

    setIsScanningAll(false);
  }

  async function handleArchiveSelected() {
    const toSave = items.filter(
      (i) => i.selected && i.status === "ready" && i.amount > 0
    );
    if (toSave.length === 0) return;

    setIsArchiving(true);
    try {
      for (const item of toSave) {
        const archiveCat =
          item.result?.archiveCategory ||
          mapReliefToArchiveCategory(item.categoryId, item.subCategoryId);
        const baseName = buildArchiveBaseFilename({
          transactionDate: item.expenseDate,
          merchantName: item.merchant,
          amountPaid: item.amount,
          currency: item.result?.currency || "MYR",
          category: archiveCat,
        });
        const fileHash = await computeFileSha256(item.file);
        const metadata: LhdnReceiptMetadata = {
          file_pdf: `${baseName}.pdf`,
          capture_date: new Date().toISOString().slice(0, 10),
          transaction_date: item.expenseDate,
          merchant_name: maskSensitiveText(item.merchant),
          merchant_registration_or_tax_id:
            item.result?.merchantRegistrationOrTaxId || "",
          receipt_number: maskSensitiveText(item.invoiceNumber),
          payment_method: item.result?.paymentMethod || "",
          card_last4: item.result?.cardLast4 || "",
          currency: item.result?.currency || "MYR",
          amount_paid: item.amount,
          sst_or_tax_amount: item.result?.sstOrTaxAmount || 0,
          tax_inclusive: item.result?.taxInclusive ?? true,
          category: archiveCat,
          lhdn_relief_or_expense_type:
            categories.find((c) => c.id === item.categoryId)?.name ||
            item.categoryId,
          items: item.result?.items || [
            {
              description: item.result?.description || item.merchant,
              quantity: 1,
              unit_price: item.amount,
              amount: item.amount,
            },
          ],
          ocr_confidence: item.result?.confidence || "medium",
          needs_review: Boolean(item.result?.needsReview),
          review_reason: item.result?.reviewReason || "",
          original_file_hash: fileHash,
          notes: item.result?.description || "",
        };

        let pdfFile: File = item.file;
        try {
          pdfFile = await buildSearchableReceiptPdf(item.file, metadata);
        } catch {
          // keep original file
        }

        await onSaveItem(
          {
            taxYear,
            categoryId: item.categoryId,
            subCategoryId: item.subCategoryId || null,
            merchant: item.merchant,
            description: item.result?.description || "",
            amount: item.amount,
            expenseDate: item.expenseDate,
            invoiceNumber: item.invoiceNumber,
            receiptFileName: metadata.file_pdf,
            receiptMimeType: "application/pdf",
            metadata,
            aiExtracted: true,
          },
          pdfFile
        );

        setItems((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, status: "saved" } : x))
        );
      }
      onClose();
      setItems([]);
    } finally {
      setIsArchiving(false);
    }
  }

  const readySelectedCount = items.filter(
    (i) => i.selected && i.status === "ready" && i.amount > 0
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <Files className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Batch Multi-Receipt Import
              </h2>
              <p className="text-xs text-slate-500">
                Select up to 15 PDFs or photos at once (e.g., 12 Unifi bills)
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

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              handleFilesChosen(e.target.files);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            disabled={isScanningAll || isArchiving}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 p-6 text-emerald-800 transition active:scale-[0.99] disabled:opacity-50"
          >
            <Upload className="h-6 w-6 text-emerald-600" />
            <span className="text-xs font-bold">
              Choose Multiple Receipts (Photos / PDFs)
            </span>
            <span className="text-[11px] text-emerald-700">
              Auto-scans eligibility, merchant, date, amount &amp; LHDN category
            </span>
          </button>

          {items.length > 0 && (
            <div className="space-y-2.5">
              {items.map((item) => {
                const elig = item.result?.eligibility;
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          disabled={item.status !== "ready"}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === item.id
                                  ? { ...x, selected: e.target.checked }
                                  : x
                              )
                            )
                          }
                          className="mt-1 h-4 w-4 accent-emerald-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {item.merchant}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">
                            {item.file.name}
                          </p>
                        </div>
                      </label>

                      <div className="shrink-0">
                        {item.status === "scanning" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            <Loader2 className="h-3 w-3 animate-spin" /> Scanning
                          </span>
                        )}
                        {item.status === "queued" && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            Queued
                          </span>
                        )}
                        {item.status === "saved" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" /> Archived
                          </span>
                        )}
                        {item.status === "ready" && elig === "eligible" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <Sparkles className="h-2.5 w-2.5" /> Eligible
                          </span>
                        )}
                        {item.status === "ready" && elig === "uncertain" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                            <HelpCircle className="h-2.5 w-2.5" /> Review
                          </span>
                        )}
                        {item.status === "ready" && elig === "rejected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            <Ban className="h-2.5 w-2.5" /> Rejected
                          </span>
                        )}
                      </div>
                    </div>

                    {item.status === "ready" && (
                      <div className="grid grid-cols-3 gap-2 pl-6">
                        <select
                          value={item.categoryId}
                          onChange={(e) => {
                            const nextCat = e.target.value;
                            const catObj = categories.find(
                              (c) => c.id === nextCat
                            );
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === item.id
                                  ? {
                                      ...x,
                                      categoryId: nextCat,
                                      subCategoryId:
                                        catObj?.subCategories?.[0]?.id || "",
                                    }
                                  : x
                              )
                            );
                          }}
                          className="col-span-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px]"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              [{c.formBeRef}] {c.shortName}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === item.id
                                  ? {
                                      ...x,
                                      amount: parseFloat(e.target.value) || 0,
                                    }
                                  : x
                              )
                            )
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-right"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-slate-100 p-4">
            <button
              type="button"
              disabled={isScanningAll || isArchiving || readySelectedCount === 0}
              onClick={handleArchiveSelected}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md disabled:opacity-50"
            >
              {isArchiving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Archiving {readySelectedCount} Receipts...
                </>
              ) : (
                `Save ${readySelectedCount} Selected Receipt${readySelectedCount === 1 ? "" : "s"} (${formatRM(
                  items
                    .filter((i) => i.selected && i.status === "ready")
                    .reduce((s, i) => s + i.amount, 0),
                  true
                )})`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
