"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Crown,
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
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { parseAnnualDocFile } from "@/lib/annual-doc-parser";
import { exportAuditPackZip } from "@/lib/audit-pack";
import { formatRM } from "@/lib/calculator";
import { computeFormBeReconciliation } from "@/lib/form-be-reconciliation";
import { getReliefCategories, SUPPORTED_TAX_YEARS } from "@/lib/lhdn-rules";
import { useLanguage } from "@/lib/language-context";
import { isProOrFamily } from "@/lib/monetization";
import { openFileSafely, ReceiptPreviewModal } from "./ReceiptPreviewModal";
import { AnnualDocManualEntry } from "./AnnualDocManualEntry";
import { FormBeChecklist } from "./FormBeChecklist";
import { exportExpensesToCsv } from "@/lib/storage";
import {
  AnnualDocExtraction,
  AnnualDocType,
  AnnualTaxDoc,
  FormBeBaseline,
  TaxCalculationResult,
  TaxExpense,
  TaxProfile,
  TaxYear,
  UserSubscription,
} from "@/lib/types";
import { InfoHint } from "./InfoHint";

const ANNUAL_DOC_SLOTS: Array<{
  type: AnnualDocType;
  label: string;
  labelBm: string;
  hint: string;
  hintBm: string;
}> = [
  {
    type: "ea_form",
    label: "EA Form (C.P.8A)",
    labelBm: "Borang EA (C.P.8A)",
    hint: "Annual remuneration statement from employer",
    hintBm: "Penyata saraan tahunan daripada majikan",
  },
  {
    type: "kwsp_statement",
    label: "KWSP / EPF Annual Statement",
    labelBm: "Penyata Tahunan KWSP",
    hint: "Yearly employee EPF contribution statement",
    hintBm: "Penyata caruman tahunan pekerja KWSP",
  },
  {
    type: "insurance_statement",
    label: "Insurance / Takaful Tax Statement",
    labelBm: "Penyata Cukai Insurans / Takaful",
    hint: "Annual life & medical card tax relief certificate",
    hintBm: "Sijil pelepasan cukai nyawa & kad perubatan tahunan",
  },
  {
    type: "loan_interest_statement",
    label: "Housing Loan Interest Statement",
    labelBm: "Penyata Faedah Pinjaman Perumahan",
    hint: "Bank annual interest letter (First-Home 2025–2027)",
    hintBm: "Surat faedah tahunan bank (Rumah Pertama 2025–2027)",
  },
  {
    type: "form_be_proof",
    label: "LHDN Form BE Filing Proof",
    labelBm: "Bukti Penghantaran Borang BE LHDN",
    hint: "MyTax e-BE submission acknowledgement PDF",
    hintBm: "PDF pengesahan penghantaran e-BE MyTax",
  },
  {
    type: "other_doc",
    label: "Other Annual Tax Document",
    labelBm: "Dokumen Cukai Tahunan Lain",
    hint: "CP58, stamped SPA, OKU card, or JKM letter",
    hintBm: "CP58, SPA bercop hasil, kad OKU, atau surat JKM",
  },
];

interface ReceiptsTabProps {
  taxYear: TaxYear;
  profile: TaxProfile;
  summary: TaxCalculationResult;
  subscription: UserSubscription;
  expenses: TaxExpense[];
  annualDocs: AnnualTaxDoc[];
  formBeBaseline?: FormBeBaseline | null;
  onOpenAuditTally?: () => void;
  onUploadAnnualDoc: (
    docType: AnnualDocType,
    label: string,
    file: File,
    overrideYear?: TaxYear
  ) => Promise<AnnualTaxDoc>;
  onApplyAnnualDocExtraction: (
    extraction: AnnualDocExtraction,
    doc: AnnualTaxDoc,
    overrideYear?: TaxYear,
    options?: { skipYearSwitch?: boolean }
  ) => Promise<void>;
  onUpdateAnnualDocStatus?: (
    id: string,
    status: "extracted" | "failed" | "manual",
    note?: string | null
  ) => void;
  onDeleteAnnualDoc: (id: string) => void;
  onOpenBatchImport: () => void;
  onOpenMyInvoisQr: () => void;
  onOpenUpgrade: (reason?: string) => void;
  onEdit: (expense: TaxExpense) => void;
  onDelete: (expense: TaxExpense) => Promise<void>;
  onAddNew: () => void;
}

export function ReceiptsTab({
  taxYear,
  profile,
  summary,
  subscription,
  expenses,
  annualDocs,
  formBeBaseline,
  onOpenAuditTally,
  onUploadAnnualDoc,
  onApplyAnnualDocExtraction,
  onUpdateAnnualDocStatus,
  onDeleteAnnualDoc,
  onOpenBatchImport,
  onOpenMyInvoisQr,
  onOpenUpgrade,
  onEdit,
  onDelete,
  onAddNew,
}: ReceiptsTabProps) {
  const [vaultView, setVaultView] = useState<"receipts" | "docs">("receipts");
  const { lang, copy, tCategory, tSubCategory } = useLanguage();
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "review">(
    "all"
  );
  const [sortBy, setSortBy] = useState<
    "date_desc" | "date_asc" | "category" | "amount_desc" | "amount_asc" | "merchant"
  >("date_desc");
  const [previewExpense, setPreviewExpense] = useState<TaxExpense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaxExpense | null>(null);
  const [exportingZip, setExportingZip] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<AnnualDocType | null>(null);
  const [pendingExtraction, setPendingExtraction] = useState<{
    extraction: AnnualDocExtraction;
    doc: AnnualTaxDoc;
    targetYear: TaxYear;
  } | null>(null);
  const [applyingExtraction, setApplyingExtraction] = useState(false);
  const [extractionAppliedMsg, setExtractionAppliedMsg] = useState<string | null>(null);
  const [docNotice, setDocNotice] = useState<string | null>(null);
  const [manualDoc, setManualDoc] = useState<AnnualTaxDoc | null>(null);
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);

  async function handleRetryAnnualDoc(doc: AnnualTaxDoc) {
    if (!doc.fileUrl || doc.docType === "other_doc") return;
    setRetryingDocId(doc.id);
    setDocNotice(null);
    setExtractionAppliedMsg(null);
    try {
      const resp = await fetch(doc.fileUrl);
      if (!resp.ok) throw new Error("Failed to load archived file");
      const blob = await resp.blob();
      const file = new File([blob], doc.fileName, {
        type: doc.mimeType || blob.type || "application/pdf",
      });
      const { extraction, skipReason } = await parseAnnualDocFile(
        file,
        doc.docType,
        doc.label,
        doc.taxYear
      );
      if (extraction) {
        const detected =
          extraction.detectedTaxYear &&
          SUPPORTED_TAX_YEARS.includes(extraction.detectedTaxYear)
            ? extraction.detectedTaxYear
            : doc.taxYear;
        setPendingExtraction({
          extraction,
          doc,
          targetYear: detected,
        });
        setManualDoc(null);
        onUpdateAnnualDocStatus?.(doc.id, "extracted", null);
      } else {
        const msg =
          skipReason ||
          `${doc.label} still could not be read automatically — enter the figures below.`;
        setDocNotice(msg);
        setManualDoc(doc);
        onUpdateAnnualDocStatus?.(doc.id, "failed", msg);
      }
    } catch {
      const msg = `${doc.fileName}: could not re-read archived file (e.g. external Google Drive link). Enter the figures manually below.`;
      setDocNotice(msg);
      setManualDoc(doc);
      onUpdateAnnualDocStatus?.(doc.id, "failed", msg);
    } finally {
      setRetryingDocId(null);
    }
  }
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillQueue, setBackfillQueue] = useState<
    Array<{
      id: string;
      fileName: string;
      doc: AnnualTaxDoc;
      extraction: AnnualDocExtraction | null;
      targetYear: TaxYear;
      note?: string;
    }>
  >([]);
  const [applyingBackfill, setApplyingBackfill] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const backfillInputRef = useRef<HTMLInputElement>(null);
  const activeDocSlotRef = useRef<{ type: AnnualDocType; label: string } | null>(null);

  const categories = getReliefCategories(taxYear);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const isReviewRequired = (e: TaxExpense) =>
    Boolean(e.metadata?.needs_review) &&
    e.metadata?.review_reason !== "Missing: payment method";

  const yearExpenses = expenses.filter((e) => e.taxYear === taxYear);
  const filtered = yearExpenses
    .filter((e) => {
      if (
        filterMode === "missing" &&
        (e.receiptPath || e.receiptUrl || e.subCategoryId === "parents_allowance")
      ) {
        return false;
      }
      if (filterMode === "review" && !isReviewRequired(e)) return false;
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
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return a.expenseDate.localeCompare(b.expenseDate);
        case "category": {
          const catA = catMap.get(a.categoryId)?.shortName || a.categoryId;
          const catB = catMap.get(b.categoryId)?.shortName || b.categoryId;
          return (
            catA.localeCompare(catB) ||
            b.expenseDate.localeCompare(a.expenseDate)
          );
        }
        case "amount_desc":
          return b.amount - a.amount;
        case "amount_asc":
          return a.amount - b.amount;
        case "merchant":
          return a.merchant.localeCompare(b.merchant);
        case "date_desc":
        default:
          return b.expenseDate.localeCompare(a.expenseDate);
      }
    });

  const missingCount = yearExpenses.filter(
    (e) =>
      !e.receiptPath &&
      !e.receiptUrl &&
      e.subCategoryId !== "parents_allowance"
  ).length;
  const reviewCount = yearExpenses.filter((e) => isReviewRequired(e)).length;

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
              {lang === "bm"
                ? `Arkib TT ${taxYear} (${yearExpenses.length} rekod)`
                : `YA ${taxYear} Vault (${yearExpenses.length} records)`}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              <span>
                {copy.retentionUntil}{" "}
                <strong className="text-slate-700">{taxYear + 8}</strong>
              </span>
              <InfoHint
                align="left"
                title={lang === "bm" ? "Mengapa 7 Tahun?" : "Why 7 Years?"}
                text={
                  lang === "bm"
                    ? "Di bawah Seksyen 82A Akta Cukai Pendapatan LHDN, pembayar cukai wajib menyimpan resit sokongan selama 7 tahun dari akhir tahun taksiran."
                    : "Under LHDN Income Tax Act Section 82A, taxpayers must keep supporting receipts for 7 years from the end of the filing year."
                }
              />
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
              if (!isProOrFamily(subscription)) {
                onOpenUpgrade(
                  "1-Click LHDN 7-Year Audit Pack ZIP (categorized PDFs + JSON metadata + Form BE worksheet) is included in CukaiKu Pro Pass."
                );
                return;
              }
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
            ) : !isProOrFamily(subscription) ? (
              <Crown className="h-3.5 w-3.5 text-amber-300" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {copy.auditZipBtn}
          </button>
        </div>
      </div>

      {/* Form e-BE vs Vault Proof Summary */}
      {(() => {
        const beAudit = computeFormBeReconciliation(
          taxYear,
          profile.annualIncome,
          expenses,
          formBeBaseline
        );
        if (!beAudit || !formBeBaseline) return null;
        return (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-slate-900">
                  {lang === "bm"
                    ? `Semakan Bukti Audit Borang e-BE TT ${taxYear}`
                    : `YA ${taxYear} Form e-BE vs. Vault Proof`}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                    beAudit.isAuditReady ? "bg-emerald-600" : "bg-amber-600"
                  }`}
                >
                  {beAudit.isAuditReady
                    ? lang === "bm"
                      ? "Sedia Audit ✓"
                      : "Audit Ready ✓"
                    : `${beAudit.verifiedCategoryCount}/${beAudit.declaredCategoryCount} ${
                        lang === "bm" ? "kategori sah" : "categories backed"
                      }`}
                </span>
                {beAudit.totalUnclaimedExtra > 0 && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    +{formatRM(beAudit.totalUnclaimedExtra, true)}{" "}
                    {lang === "bm" ? "belum tuntut" : "unclaimed"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600">
                {lang === "bm" ? "Diisytihar e-BE" : "e-BE Declared"}:{" "}
                <strong>{formatRM(beAudit.totalDeclaredExpenseReliefs, true)}</strong> •{" "}
                {lang === "bm" ? "Bukti Sah (Had LHDN)" : "Valid Capped Proof"}:{" "}
                <strong>{formatRM(beAudit.totalVerifiedClaimable, true)}</strong>
                {beAudit.totalVerifiedRaw > beAudit.totalVerifiedClaimable + 0.01 && (
                  <span className="text-slate-400">
                    {" "}
                    ({formatRM(beAudit.totalVerifiedRaw, true)}{" "}
                    {lang === "bm" ? "jumlah resit" : "raw uploaded"})
                  </span>
                )}
                {beAudit.totalShortfall > 0 && (
                  <>
                    {" "}
                    •{" "}
                    <span className="font-semibold text-amber-700">
                      {lang === "bm" ? "Kurang" : "Short"}{" "}
                      {formatRM(beAudit.totalShortfall, true)}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {beAudit.totalShortfall > 0 && vaultView === "receipts" && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterMode((prev) => (prev === "missing" ? "all" : "missing"))
                  }
                  className="rounded-xl border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-50"
                >
                  {filterMode === "missing"
                    ? lang === "bm"
                      ? "Tunjuk Semua"
                      : "Show All"
                    : lang === "bm"
                    ? "Tapis Tiada Resit"
                    : "Filter Missing"}
                </button>
              )}
              {onOpenAuditTally && (
                <button
                  type="button"
                  onClick={onOpenAuditTally}
                  className="rounded-xl bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95"
                >
                  {lang === "bm" ? "Semak Audit" : "Audit & Tally"}
                </button>
              )}
            </div>
          </div>
        );
      })()}

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
            {copy.receiptsTabBtn} ({yearExpenses.length})
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
            {copy.annualDocsTabBtn} ({annualDocs.filter((d) => d.taxYear === taxYear).length})
          </button>
        </div>
        <InfoHint
          align="left"
          title={lang === "bm" ? "Resit lwn. Dokumen Tahunan" : "Receipts vs Annual Docs"}
          text={
            lang === "bm"
              ? "Resit menyimpan bil individu (klinik, buku, sukan). Dokumen Tahunan menyimpan penyata tahunan: Borang EA, KWSP, Insurans, SSPN & Faedah Pinjaman Rumah."
              : "Receipts stores individual bills (clinic, books, sports). Annual Docs stores yearly statements: EA Form, KWSP, Insurance, SSPN & Housing Loan Interest."
          }
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onAddNew}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-95"
          >
            <Upload className="h-3.5 w-3.5" />
            {lang === "bm" ? "Muat Naik" : "Upload"}
          </button>
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
            onClick={() => {
              if (!isProOrFamily(subscription)) {
                onOpenUpgrade(
                  "Batch Multi-Receipt Import & AI Auto-Classification is a CukaiKu Pro feature."
                );
                return;
              }
              onOpenBatchImport();
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-xs active:scale-95"
          >
            {!isProOrFamily(subscription) ? (
              <Crown className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Files className="h-3.5 w-3.5 text-emerald-600" />
            )}
            {lang === "bm" ? "Pukal" : "Batch"}
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
              setPendingExtraction(null);
              setExtractionAppliedMsg(null);
              setDocNotice(null);
              try {
                const savedDoc = await onUploadAnnualDoc(
                  slot.type,
                  slot.label,
                  file
                );

                // Auto-extract tax figures from EA Form, KWSP, Insurance, Housing Loan, or Form BE
                if (slot.type !== "other_doc") {
                  try {
                    const { extraction, skipReason } = await parseAnnualDocFile(
                      file,
                      slot.type,
                      slot.label,
                      taxYear
                    );
                    if (extraction) {
                      const detected =
                        extraction.detectedTaxYear &&
                        SUPPORTED_TAX_YEARS.includes(extraction.detectedTaxYear)
                          ? extraction.detectedTaxYear
                          : taxYear;
                      setPendingExtraction({
                        extraction,
                        doc: savedDoc,
                        targetYear: detected,
                      });
                      setManualDoc(null);
                      onUpdateAnnualDocStatus?.(savedDoc.id, "extracted", null);
                    } else {
                      const msg =
                        skipReason ||
                        `${slot.label} archived! No numeric tax figures were detected automatically—enter them below.`;
                      setDocNotice(msg);
                      setManualDoc(savedDoc);
                      onUpdateAnnualDocStatus?.(savedDoc.id, "failed", msg);
                    }
                  } catch {
                    const msg = `${slot.label} archived! Could not reach extractor right now — enter the figures below.`;
                    setDocNotice(msg);
                    setManualDoc(savedDoc);
                    onUpdateAnnualDocStatus?.(savedDoc.id, "failed", msg);
                  }
                } else {
                  setExtractionAppliedMsg(`${slot.label} archived to Vault!`);
                }
              } finally {
                setUploadingDocType(null);
              }
            }}
          />

          <input
            ref={backfillInputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length === 0) return;
              setBackfillBusy(true);
              setExtractionAppliedMsg(null);
              setDocNotice(null);
              try {
                const items: typeof backfillQueue = [];
                for (const file of files) {
                  const { extraction, skipReason } = await parseAnnualDocFile(
                    file,
                    "form_be_proof",
                    lang === "bm" ? "Bukti Penghantaran Borang BE LHDN" : "LHDN Form BE Filing Proof",
                    taxYear
                  );
                  const detectedYr =
                    extraction?.detectedTaxYear &&
                    SUPPORTED_TAX_YEARS.includes(extraction.detectedTaxYear)
                      ? extraction.detectedTaxYear
                      : taxYear;
                  const savedDoc = await onUploadAnnualDoc(
                    "form_be_proof",
                    lang === "bm" ? "Bukti Penghantaran Borang BE LHDN" : "LHDN Form BE Filing Proof",
                    file,
                    detectedYr
                  );
                  items.push({
                    id: savedDoc.id,
                    fileName: file.name,
                    doc: savedDoc,
                    extraction,
                    targetYear: detectedYr,
                    note: skipReason || undefined,
                  });
                }
                setBackfillQueue(items);
              } finally {
                setBackfillBusy(false);
              }
            }}
          />

          {/* Multi-Year Form BE Backfill Card */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-indigo-950">
                  {lang === "bm"
                    ? "Isi Semula Tahun Lepas (Borang e-BE)"
                    : "Backfill Past Years (Form e-BE)"}
                </p>
                <p className="mt-0.5 text-[11px] text-indigo-800/80">
                  {lang === "bm"
                    ? "Muat naik beberapa PDF Borang BE sekaligus. Tahun taksiran dikesan automatik dan diselaraskan dengan pengiraan cukai."
                    : "Drop multiple past Form BE PDFs at once. Each YA is auto-detected, merged without double-counting, and tallied."}
                </p>
              </div>
              <button
                type="button"
                disabled={backfillBusy}
                onClick={() => backfillInputRef.current?.click()}
                className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95 disabled:opacity-50"
              >
                {backfillBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {lang === "bm" ? "Pilih PDF" : "Select PDFs"}
              </button>
            </div>

            {backfillQueue.length > 0 && (
              <div className="space-y-2 border-t border-indigo-200/70 pt-2.5">
                {backfillQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {item.fileName}
                      </p>
                      {item.extraction ? (
                        <p className="text-[10px] text-slate-500">
                          Income {formatRM(item.extraction.annualIncome)} • Reliefs{" "}
                          {formatRM(item.extraction.declaredTotalReliefs || 0)} • PCB{" "}
                          {formatRM(item.extraction.pcbPaid)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-700">
                          {item.note || "Archived only — no numeric figures detected"}
                        </p>
                      )}
                    </div>
                    <select
                      value={item.targetYear}
                      onChange={(e) => {
                        const yr = Number(e.target.value) as TaxYear;
                        setBackfillQueue((prev) =>
                          prev.map((q) => (q.id === item.id ? { ...q, targetYear: yr } : q))
                        );
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-800"
                    >
                      {SUPPORTED_TAX_YEARS.map((yr) => (
                        <option key={yr} value={yr}>
                          YA {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      applyingBackfill || !backfillQueue.some((q) => q.extraction)
                    }
                    onClick={async () => {
                      setApplyingBackfill(true);
                      try {
                        const ready = backfillQueue.filter((q) => q.extraction);
                        for (let i = 0; i < ready.length; i++) {
                          const q = ready[i];
                          await onApplyAnnualDocExtraction(
                            q.extraction!,
                            q.doc,
                            q.targetYear,
                            { skipYearSwitch: i < ready.length - 1 }
                          );
                        }
                        setExtractionAppliedMsg(
                          `Backfilled ${ready.length} Form BE submission${
                            ready.length === 1 ? "" : "s"
                          } (${ready.map((r) => `YA ${r.targetYear}`).join(", ")})!`
                        );
                        setBackfillQueue([]);
                      } finally {
                        setApplyingBackfill(false);
                      }
                    }}
                    className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {applyingBackfill
                      ? "Applying..."
                      : `Apply All (${backfillQueue.filter((q) => q.extraction).length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackfillQueue([])}
                    className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-900"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {uploadingDocType && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              <span>Archiving document &amp; extracting LHDN figures...</span>
            </div>
          )}

          {docNotice && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{docNotice}</span>
            </div>
          )}

          {manualDoc && (
            <AnnualDocManualEntry
              key={manualDoc.id}
              doc={manualDoc}
              defaultYear={taxYear}
              lang={lang}
              hasOtherEaInYear={annualDocs.some(
                (d) =>
                  d.id !== manualDoc.id &&
                  d.taxYear === taxYear &&
                  d.docType === "ea_form" &&
                  (d.extractionStatus === "extracted" ||
                    d.extractionStatus === "manual")
              )}
              onApply={async (ext, doc, yr) => {
                await onApplyAnnualDocExtraction(ext, doc, yr);
                setExtractionAppliedMsg(
                  lang === "bm"
                    ? `Angka daripada ${doc.label} disimpan ke TT ${yr}!`
                    : `Saved manual figures from ${doc.label} to YA ${yr}!`
                );
                setManualDoc(null);
                setDocNotice(null);
              }}
              onCancel={() => setManualDoc(null)}
            />
          )}

          {extractionAppliedMsg && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
              <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{extractionAppliedMsg}</span>
            </div>
          )}

          {/* Extracted Annual Doc Figures Confirmation Card */}
          {pendingExtraction && (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  <span>
                    Extracted from {pendingExtraction.doc.label}
                    {pendingExtraction.extraction.providerName
                      ? ` (${pendingExtraction.extraction.providerName})`
                      : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingExtraction(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {pendingExtraction.extraction.annualIncome > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">Annual Income</p>
                    <p className="font-bold text-slate-900">
                      {formatRM(pendingExtraction.extraction.annualIncome, true)}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.pcbPaid > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">PCB / MTD Paid</p>
                    <p className="font-bold text-slate-900">
                      {formatRM(pendingExtraction.extraction.pcbPaid, true)}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.zakatPaid > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">Zakat Rebate</p>
                    <p className="font-bold text-emerald-700">
                      {formatRM(pendingExtraction.extraction.zakatPaid, true)}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.epfEmployee > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">EPF Relief</p>
                    <p className="font-bold text-emerald-700">
                      {formatRM(pendingExtraction.extraction.epfEmployee, true)}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.socsoEisEmployee > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">SOCSO + EIS</p>
                    <p className="font-bold text-emerald-700">
                      {formatRM(
                        pendingExtraction.extraction.socsoEisEmployee,
                        true
                      )}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.lifeInsuranceAmount > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">Life Insurance</p>
                    <p className="font-bold text-emerald-700">
                      {formatRM(
                        pendingExtraction.extraction.lifeInsuranceAmount,
                        true
                      )}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.medicalInsuranceAmount > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">
                      Medical Insurance
                    </p>
                    <p className="font-bold text-emerald-700">
                      {formatRM(
                        pendingExtraction.extraction.medicalInsuranceAmount,
                        true
                      )}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.housingLoanInterest > 0 && (
                  <div className="rounded-xl bg-white p-2">
                    <p className="text-[10px] text-slate-500">
                      Housing Loan Interest
                    </p>
                    <p className="font-bold text-emerald-700">
                      {formatRM(
                        pendingExtraction.extraction.housingLoanInterest,
                        true
                      )}
                    </p>
                  </div>
                )}
                {pendingExtraction.extraction.extraReliefs?.map((item, i) => (
                  <div key={`${item.categoryId}-${i}`} className="rounded-xl bg-white p-2">
                    <p className="truncate text-[10px] text-slate-500">
                      {item.label}
                    </p>
                    <p className="font-bold text-emerald-700">
                      {formatRM(item.amount, true)}
                    </p>
                  </div>
                ))}
              </div>

              {pendingExtraction.doc.docType === "form_be_proof" && (
                <FormBeChecklist
                  extraction={pendingExtraction.extraction}
                  lang={lang}
                />
              )}

              <p className="text-[11px] text-emerald-900">
                {pendingExtraction.extraction.summaryNote}
              </p>

              {(pendingExtraction.doc.docType === "form_be_proof" ||
                pendingExtraction.extraction.detectedTaxYear) && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Target Year of Assessment (YA)
                  </span>
                  <select
                    value={pendingExtraction.targetYear}
                    onChange={(e) => {
                      const yr = Number(e.target.value) as TaxYear;
                      setPendingExtraction((prev) =>
                        prev ? { ...prev, targetYear: yr } : null
                      );
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-900"
                  >
                    {SUPPORTED_TAX_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        YA {yr}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={applyingExtraction}
                  onClick={async () => {
                    setApplyingExtraction(true);
                    try {
                      const applyYr = pendingExtraction.targetYear;
                      await onApplyAnnualDocExtraction(
                        pendingExtraction.extraction,
                        pendingExtraction.doc,
                        applyYr
                      );
                      setExtractionAppliedMsg(
                        `Applied figures from ${pendingExtraction.doc.label} to your YA ${applyYr} tax profile & reliefs!`
                      );
                      setPendingExtraction(null);
                    } finally {
                      setApplyingExtraction(false);
                    }
                  }}
                  className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white active:scale-[0.99] disabled:opacity-60"
                >
                  {applyingExtraction
                    ? "Applying..."
                    : `Apply to YA ${pendingExtraction.targetYear} Tax & Reliefs`}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingExtraction(null)}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900"
                >
                  Archive Only
                </button>
              </div>
            </div>
          )}
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
                        {lang === "bm" ? slot.labelBm : slot.label}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {lang === "bm" ? slot.hintBm : slot.hint}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => {
                      activeDocSlotRef.current = {
                        type: slot.type,
                        label: lang === "bm" ? slot.labelBm : slot.label,
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
                    {lang === "bm" ? "Muat Naik" : "Upload"}
                  </button>
                </div>

                {matchedDocs.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-100 pt-2">
                    {matchedDocs.map((doc) => {
                      const isFailed = doc.extractionStatus === "failed";
                      const isManual = doc.extractionStatus === "manual";
                      const isExtracted = doc.extractionStatus === "extracted";
                      const isRetrying = retryingDocId === doc.id;
                      return (
                        <div
                          key={doc.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs ${
                            isFailed
                              ? "border border-amber-300 bg-amber-50/80"
                              : "bg-emerald-50/70"
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`truncate font-medium ${
                                  isFailed
                                    ? "text-amber-950"
                                    : "text-emerald-950"
                                }`}
                              >
                                {doc.fileName}
                              </span>
                              {isFailed && (
                                <span className="shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  {lang === "bm" ? "Perlu Imbas" : "Needs Read"}
                                </span>
                              )}
                              {isManual && (
                                <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  Manual
                                </span>
                              )}
                              {isExtracted && (
                                <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  {lang === "bm" ? "Diekstrak ✓" : "Extracted ✓"}
                                </span>
                              )}
                            </div>
                            {isFailed && doc.extractionNote && (
                              <p className="line-clamp-1 text-[10px] text-amber-800">
                                {doc.extractionNote}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {doc.docType !== "other_doc" && (
                              <>
                                {isFailed && (
                                  <button
                                    type="button"
                                    disabled={isRetrying}
                                    onClick={() => handleRetryAnnualDoc(doc)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
                                  >
                                    {isRetrying ? (
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                    ) : (
                                      <RotateCcw className="h-2.5 w-2.5" />
                                    )}
                                    {lang === "bm" ? "Cuba Lagi" : "Retry"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualDoc(doc);
                                    setPendingExtraction(null);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-indigo-700"
                                >
                                  {lang === "bm" ? "Isi" : "Enter"}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                openFileSafely(doc.fileUrl, doc.fileName)
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-emerald-700 shadow-xs hover:bg-emerald-50"
                            >
                              Open <ExternalLink className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteAnnualDoc(doc.id)}
                              className="rounded-lg p-1 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
            placeholder={copy.searchReceiptsPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              filterMode === "all"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {copy.filterAll} ({yearExpenses.length})
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
            {lang === "bm" ? "Perlu Semakan" : "Needs Review"} ({reviewCount})
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
            {copy.missingBadge} ({missingCount})
          </button>
          <select
            aria-label={lang === "bm" ? "Susun rekod" : "Sort entries"}
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as
                  | "date_desc"
                  | "date_asc"
                  | "category"
                  | "amount_desc"
                  | "amount_asc"
                  | "merchant"
              )
            }
            className="ml-auto rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="date_desc">
              {lang === "bm" ? "Tarikh: Terbaru" : "Sort: Newest"}
            </option>
            <option value="date_asc">
              {lang === "bm" ? "Tarikh: Terlama" : "Sort: Oldest"}
            </option>
            <option value="category">
              {lang === "bm" ? "Kategori (A–Z)" : "Sort: Category"}
            </option>
            <option value="amount_desc">
              {lang === "bm" ? "Amaun: Tinggi → Rendah" : "Amount: High → Low"}
            </option>
            <option value="amount_asc">
              {lang === "bm" ? "Amaun: Rendah → Tinggi" : "Amount: Low → High"}
            </option>
            <option value="merchant">
              {lang === "bm" ? "Peniaga (A–Z)" : "Sort: Merchant"}
            </option>
          </select>
        </div>
      </div>

      {/* Receipt List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {copy.emptyReceiptsTitle.replace("{year}", String(taxYear))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {yearExpenses.length === 0
              ? copy.emptyReceiptsDesc.replace("{year}", String(taxYear))
              : copy.searchReceiptsPlaceholder}
          </p>
          {yearExpenses.length === 0 && (
            <button
              type="button"
              onClick={onAddNew}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
            >
              {copy.addFirstReceiptBtn}
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
            const isNoReceiptAllowance = exp.subCategoryId === "parents_allowance";
            const hasReceipt =
              Boolean(exp.receiptPath || exp.receiptUrl) || isNoReceiptAllowance;
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
                        {cat ? tCategory(cat).shortName : exp.categoryId}
                      </span>
                      {sub && (
                        <span className="text-[11px] text-slate-400">
                          • {tSubCategory(sub)}
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
                      {isReviewRequired(exp) && (
                        <span
                          title={exp.metadata?.review_reason}
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
                      {hasReceipt ? (
                        isRealPreviewable ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewExpense(exp);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                          >
                            <Eye className="h-3 w-3" /> PDF
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                            <FileCheck2 className="h-3 w-3" />{" "}
                            {isNoReceiptAllowance
                              ? lang === "bm"
                                ? "Diisytihar e-BE"
                                : "e-BE Declared"
                              : "Proof OK"}
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
      <ReceiptPreviewModal
        expense={previewExpense}
        onClose={() => setPreviewExpense(null)}
      />
    </div>
  );
}
