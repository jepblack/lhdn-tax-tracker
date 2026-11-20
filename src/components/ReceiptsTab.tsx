"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  Files,
  FileText,
  FolderArchive,
  Loader2,
  Pencil,
  QrCode,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { exportAuditPackZip } from "@/lib/audit-pack";
import { formatRM } from "@/lib/calculator";
import { getReliefCategories } from "@/lib/lhdn-rules";
import { downloadJsonMetadata } from "@/lib/receipt-archiver";
import { exportExpensesToCsv } from "@/lib/storage";
import {
  AnnualDocType,
  AnnualTaxDoc,
  TaxCalculationResult,
  TaxExpense,
  TaxProfile,
  TaxYear,
} from "@/lib/types";

const ANNUAL_DOC_SLOTS: Array<{ type: AnnualDocType; label: string; hint: string }> = [
  { type: "ea_form", label: "EA Form (C.P.8A)", hint: "Annual remuneration statement from employer" },
  { type: "kwsp_statement", label: "KWSP / EPF Annual Statement", hint: "Yearly employee EPF contribution statement" },
  { type: "insurance_statement", label: "Insurance / Takaful Tax Statement", hint: "Annual life & medical card tax relief certificate" },
  { type: "loan_interest_statement", label: "Housing Loan Interest Statement", hint: "Bank annual interest letter (First-Home 2025–2027)" },
  { type: "form_be_proof", label: "LHDN Form BE Filing Proof", hint: "MyTax e-BE submission acknowledgement PDF" },
  { type: "other_doc", label: "Other Annual Tax Document", hint: "CP58, stamped SPA, OKU card, or JKM letter" },
];

interface ReceiptsTabProps {
  taxYear: TaxYear;
  profile: TaxProfile;
  summary: TaxCalculationResult;
  expenses: TaxExpense[];
  annualDocs: AnnualTaxDoc[];
  onUploadAnnualDoc: (docType: AnnualDocType, label: string, file: File) => Promise<void>;
  onDeleteAnnualDoc: (id: string) => void;
  onOpenBatchImport: () => void;
  onOpenMyInvoisQr: () => void;
  onEdit: (expense: TaxExpense) => void;
  onDelete: (expense: TaxExpense) => Promise<void>;
  onAddNew: () => void;
}

export function ReceiptsTab({
  taxYear,
  profile,
  summary,
  expenses,
  annualDocs,
  onUploadAnnualDoc,
  onDeleteAnnualDoc,
  onOpenBatchImport,
  onOpenMyInvoisQr,
  onEdit,
  onDelete,
  onAddNew,
}: ReceiptsTabProps) {
  const [vaultView, setVaultView] = useState<"receipts" | "docs">("receipts");
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "review">(
    "all"
  );
  const [previewExpense, setPreviewExpense] = useState<TaxExpense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaxExpense | null>(null);
  const [exportingZip, setExportingZip] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<AnnualDocType | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const activeDocSlotRef = useRef<{ type: AnnualDocType; label: string } | null>(null);

  const categories = getReliefCategories(taxYear);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const yearExpenses = expenses.filter((e) => e.taxYear === taxYear);
  const filtered = yearExpenses.filter((e) => {
    if (filterMode === "missing" && (e.receiptPath || e.receiptUrl)) return false;
    if (filterMode === "review" && !e.metadata?.needs_review) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const catName = catMap.get(e.categoryId)?.name.toLowerCase() || "";
    return (
      e.merchant.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.invoiceNumber || "").toLowerCase().includes(q) ||
      (e.receiptFileName || "").toLowerCase().includes(q) ||
      catName.includes(q)
    );
  });

  const missingCount = yearExpenses.filter(
    (e) => !e.receiptPath && !e.receiptUrl
  ).length;
  const reviewCount = yearExpenses.filter(
    (e) => e.metadata?.needs_review
  ).length;

  return (
    <div className="space-y-4 pb-6">
      {/* 7-Year Retention & Export Header */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-900">
              YA {taxYear} Vault ({yearExpenses.length} records)
            </p>
            <p className="text-[11px] text-slate-500">
              LHDN 7-year retention until{" "}
              <strong className="text-slate-700">{taxYear + 8}</strong>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => exportExpensesToCsv(expenses, taxYear)}
            disabled={yearExpenses.length === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={async () => {
              setExportingZip(true);
              try {
                await exportAuditPackZip(profile, summary, expenses);
              } finally {
                setExportingZip(false);
              }
            }}
            disabled={yearExpenses.length === 0 || exportingZip}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs disabled:opacity-40"
          >
            {exportingZip ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            Audit ZIP
          </button>
        </div>
      </div>

      {/* Vault Mode Switch + Quick Import Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setVaultView("receipts")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              vaultView === "receipts"
                ? "bg-white text-emerald-700 shadow-xs"
                : "text-slate-500"
            }`}
          >
            Receipts ({yearExpenses.length})
          </button>
          <button
            type="button"
            onClick={() => setVaultView("docs")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              vaultView === "docs"
                ? "bg-white text-emerald-700 shadow-xs"
                : "text-slate-500"
            }`}
          >
            Annual Docs ({annualDocs.filter((d) => d.taxYear === taxYear).length})
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenMyInvoisQr}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-xs active:scale-95"
          >
            <QrCode className="h-3.5 w-3.5 text-emerald-600" />
            MyInvois
          </button>
          <button
            type="button"
            onClick={onOpenBatchImport}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-xs active:scale-95"
          >
            <Files className="h-3.5 w-3.5 text-emerald-600" />
            Batch
          </button>
        </div>
      </div>

      {/* ANNUAL TAX DOCUMENTS VAULT VIEW */}
      {vaultView === "docs" && (
        <div className="space-y-2.5">
          <input
            ref={docInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              const slot = activeDocSlotRef.current;
              e.target.value = "";
              if (!file || !slot) return;
              setUploadingDocType(slot.type);
              try {
                await onUploadAnnualDoc(slot.type, slot.label, file);
              } finally {
                setUploadingDocType(null);
              }
            }}
          />
          {ANNUAL_DOC_SLOTS.map((slot) => {
            const matchedDocs = annualDocs.filter(
              (d) => d.taxYear === taxYear && d.docType === slot.type
            );
            const isUploading = uploadingDocType === slot.type;
            return (
              <div
                key={slot.type}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`mt-0.5 rounded-xl p-2 ${
                        matchedDocs.length > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <FolderArchive className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">
                        {slot.label}
                      </p>
                      <p className="text-[11px] text-slate-500">{slot.hint}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => {
                      activeDocSlotRef.current = {
                        type: slot.type,
                        label: slot.label,
                      };
                      docInputRef.current?.click();
                    }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    Upload
                  </button>
                </div>

                {matchedDocs.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-100 pt-2">
                    {matchedDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50/70 px-2.5 py-1.5 text-xs"
                      >
                        <span className="truncate font-medium text-emerald-950">
                          {doc.fileName}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-emerald-700 shadow-xs"
                          >
                            Open <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => onDeleteAnnualDoc(doc.id)}
                            className="rounded-lg p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Search & Filters (Receipts View) */}
      {vaultView === "receipts" && (
      <>
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant, filename, invoice, relief..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              filterMode === "all"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            All ({yearExpenses.length})
          </button>
          <button
            type="button"
            onClick={() =>
              setFilterMode(filterMode === "review" ? "all" : "review")
            }
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              filterMode === "review"
                ? "border-amber-400 bg-amber-100 text-amber-950"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            Needs Review ({reviewCount})
          </button>
          <button
            type="button"
            onClick={() =>
              setFilterMode(filterMode === "missing" ? "all" : "missing")
            }
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              filterMode === "missing"
                ? "border-rose-300 bg-rose-100 text-rose-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            No File ({missingCount})
          </button>
        </div>
      </div>

      {/* Receipt List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-800">
            No receipts found
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {yearExpenses.length === 0
              ? `Snap or upload your first YA ${taxYear} receipt to build your audit vault.`
              : "Try clearing your search or filter."}
          </p>
          {yearExpenses.length === 0 && (
            <button
              type="button"
              onClick={onAddNew}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
            >
              + Scan Receipt
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((exp) => {
            const cat = catMap.get(exp.categoryId);
            const sub = cat?.subCategories?.find(
              (s) => s.id === exp.subCategoryId
            );
            const hasReceipt = Boolean(exp.receiptPath || exp.receiptUrl);
            const isRealPreviewable =
              Boolean(exp.receiptUrl) && exp.receiptUrl !== "sample://attached";

            return (
              <div
                key={exp.id}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {cat?.formBeRef || "BE"}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {cat?.shortName || exp.categoryId}
                      </span>
                      {sub && (
                        <span className="text-[11px] text-slate-400">
                          • {sub.name}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {exp.merchant}
                    </p>
                    {exp.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                        {exp.description}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span>{exp.expenseDate}</span>
                      {exp.invoiceNumber && (
                        <span className="rounded bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                          #{exp.invoiceNumber}
                        </span>
                      )}
                      {exp.metadata?.payment_method && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
                          {exp.metadata.payment_method}
                          {exp.metadata.card_last4
                            ? ` ••••${exp.metadata.card_last4}`
                            : ""}
                        </span>
                      )}
                      {exp.aiExtracted && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          <Sparkles className="h-2.5 w-2.5" /> AI Read
                        </span>
                      )}
                      {exp.metadata?.needs_review && (
                        <span
                          title={exp.metadata.review_reason}
                          className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" /> Review
                        </span>
                      )}
                    </div>
                    {(exp.metadata?.file_pdf || exp.receiptFileName) && (
                      <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                        /Receipts/{exp.taxYear}/
                        {exp.metadata?.file_pdf || exp.receiptFileName}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {formatRM(exp.amount, true)}
                    </p>
                    <div className="flex items-center gap-1">
                      {exp.metadata && (
                        <button
                          type="button"
                          onClick={() => downloadJsonMetadata(exp.metadata!)}
                          title="Download LHDN JSON metadata"
                          className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                        >
                          JSON
                        </button>
                      )}
                      {hasReceipt ? (
                        isRealPreviewable ? (
                          <button
                            type="button"
                            onClick={() => setPreviewExpense(exp)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                          >
                            <Eye className="h-3 w-3" /> PDF
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                            <FileCheck2 className="h-3 w-3" /> Proof OK
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onEdit(exp)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
                        >
                          <AlertTriangle className="h-3 w-3" /> Attach
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onEdit(exp)}
                        aria-label="Edit expense"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(exp)}
                        aria-label="Delete expense"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Explicit Delete Confirmation Dialog (7-Year Retention Guard) */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="rounded-xl bg-rose-100 p-2 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Delete Archived Receipt?
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  <strong>{pendingDelete.merchant}</strong> (
                  {formatRM(pendingDelete.amount, true)} on{" "}
                  {pendingDelete.expenseDate}) is within LHDN&apos;s 7-year
                  retention period (keep until {pendingDelete.taxYear + 8}).
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700"
              >
                Keep Receipt
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  await onDelete(target);
                }}
                className="flex-1 rounded-xl bg-rose-600 py-2 text-xs font-semibold text-white"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Preview Lightbox */}
      {previewExpense && previewExpense.receiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {previewExpense.merchant}
                </p>
                <p className="text-xs text-slate-500">
                  {previewExpense.expenseDate} •{" "}
                  {formatRM(previewExpense.amount, true)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewExpense(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 text-center">
              {previewExpense.receiptMimeType === "application/pdf" ||
              previewExpense.receiptUrl.includes("drive.google.com") ? (
                <div className="space-y-3 py-8">
                  <FileText className="mx-auto h-12 w-12 text-emerald-600" />
                  <p className="text-sm font-semibold text-slate-800">
                    {previewExpense.receiptFileName || "Receipt PDF"}
                  </p>
                  <a
                    href={previewExpense.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
                  >
                    {previewExpense.receiptUrl.includes("drive.google.com")
                      ? "Open in Google Drive"
                      : "Open PDF in New Tab"}
                  </a>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewExpense.receiptUrl}
                  alt={previewExpense.merchant}
                  className="mx-auto max-h-[68vh] rounded-xl object-contain shadow-sm"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
