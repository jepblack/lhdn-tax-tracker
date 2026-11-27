"use client";

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { formatRM } from "@/lib/calculator";
import { TaxExpense } from "@/lib/types";

interface ReceiptPreviewModalProps {
  expense: TaxExpense | null;
  onClose: () => void;
}

/**
 * Safely opens http(s) URLs or base64 data: URLs in a new tab.
 * Modern Chrome/Safari block top-level navigation to data: URLs (showing a blank tab),
 * so we convert data: URLs to a real Blob URL first.
 */
export function openFileSafely(fileUrl: string, fileName: string): void {
  if (!fileUrl) return;
  if (!fileUrl.startsWith("data:")) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    const [header, base64] = fileUrl.split(",");
    const mimeMatch = header.match(/data:([^;]+);/i);
    const mimeType = mimeMatch ? mimeMatch[1] : "application/pdf";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    link.click();
  }
}

export function ReceiptPreviewModal({
  expense,
  onClose,
}: ReceiptPreviewModalProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [expense?.id, expense?.receiptUrl]);

  if (!expense || !expense.receiptUrl) return null;

  const isPdfOrDrive =
    imgFailed ||
    expense.receiptMimeType === "application/pdf" ||
    expense.receiptFileName?.toLowerCase().endsWith(".pdf") ||
    expense.receiptUrl.toLowerCase().includes(".pdf") ||
    expense.receiptUrl.startsWith("data:application/pdf") ||
    expense.receiptUrl.includes("drive.google.com");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {expense.merchant}
            </p>
            <p className="text-xs text-slate-500">
              {expense.expenseDate} • {formatRM(expense.amount, true)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-4 text-center">
          {isPdfOrDrive ? (
            <div className="space-y-3 py-8">
              <FileText className="mx-auto h-12 w-12 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-800">
                {expense.receiptFileName || "Receipt File"}
              </p>
              <button
                type="button"
                onClick={() =>
                  openFileSafely(
                    expense.receiptUrl!,
                    expense.receiptFileName || "receipt.pdf"
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
              >
                {expense.receiptUrl.includes("drive.google.com")
                  ? "Open in Google Drive"
                  : "Open File in New Tab"}
              </button>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={expense.receiptUrl}
              alt={expense.merchant}
              onError={() => setImgFailed(true)}
              className="mx-auto max-h-[68vh] rounded-xl object-contain shadow-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
