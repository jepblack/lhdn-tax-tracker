"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardList,
  Crown,
  Download,
  ExternalLink,
  FileUp,
  Gift,
  Loader2,
  QrCode,
  Repeat,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  Upload,
  UserCheck,
  Wallet,
} from "lucide-react";
import { parseAnnualDocFile } from "@/lib/annual-doc-parser";
import { exportAuditPackZip } from "@/lib/audit-pack";
import { calculateMaxTaxSavingGoal, formatRM } from "@/lib/calculator";
import { getReliefCategories, SUPPORTED_TAX_YEARS } from "@/lib/lhdn-rules";
import {
  PARTNER_OFFER_BM,
  RECURRING_BILL_BM,
  useLanguage,
} from "@/lib/language-context";
import { matchPartnerOffersToOpportunities } from "@/lib/monetization";
import {
  getCurrentYearMonth,
  getUiCopy,
  isNearPayday,
  LIFE_STAGE_PRESETS,
  LifeStagePresetId,
  RecurringBillTemplate,
  UserPersonalization,
} from "@/lib/personalization";
import {
  AnnualDocExtraction,
  AnnualDocType,
  AnnualTaxDoc,
  FormBeBaseline,
  TaxCalculationResult,
  TaxExpense,
  TaxpayerMode,
  TaxProfile,
  TaxYear,
  UserSubscription,
} from "@/lib/types";
import { computeFormBeReconciliation } from "@/lib/form-be-reconciliation";
import { FilingToolTab } from "./FilingToolsSheet";
import { InfoHint } from "./InfoHint";
import { QuickStartChecklist } from "./QuickStartGuide";
import { AnnualDocManualEntry } from "./AnnualDocManualEntry";
import { FormBeChecklist } from "./FormBeChecklist";
import { ReliefIcon } from "./ReliefIcon";

interface DashboardTabProps {
  profile: TaxProfile;
  summary: TaxCalculationResult;
  subscription: UserSubscription;
  taxpayerMode: TaxpayerMode;
  yearExpenses: TaxExpense[];
  expenseCount: number;
  missingReceiptsTotal: number;
  profileCustomized: boolean;
  hasCloudSync: boolean;
  personalization: UserPersonalization;
  recurringBills: RecurringBillTemplate[];
  formBeBaseline?: FormBeBaseline | null;
  onUploadAnnualDoc?: (
    docType: AnnualDocType,
    label: string,
    file: File,
    overrideYear?: TaxYear
  ) => Promise<AnnualTaxDoc>;
  onApplyAnnualDocExtraction?: (
    extraction: AnnualDocExtraction,
    doc: AnnualTaxDoc,
    overrideYear?: TaxYear,
    options?: { skipYearSwitch?: boolean }
  ) => Promise<void>;
  onChangeTaxpayerMode: (mode: TaxpayerMode) => void;
  onApplyLifeStage: (presetId: LifeStagePresetId) => void;
  onUpdatePersonalization: (next: UserPersonalization) => void;
  onLogRecurringBill: (bill: RecurringBillTemplate) => Promise<void>;
  onQuickAdd: (categoryId?: string, subCategoryId?: string) => void;
  onDropFileForScan: (file: File) => void;
  onOpenMyInvoisQr: () => void;
  onNavigateTab: (tab: "reliefs" | "receipts" | "settings") => void;
  onOpenTool: (tool: FilingToolTab) => void;
  onOpenUpgrade: (reason?: string) => void;
  onLoadSampleData: () => void;
  onOpenGuideModal: () => void;
}

export function DashboardTab({
  profile,
  summary,
  subscription,
  taxpayerMode,
  yearExpenses,
  expenseCount,
  missingReceiptsTotal,
  profileCustomized,
  hasCloudSync,
  personalization,
  recurringBills,
  formBeBaseline,
  onUploadAnnualDoc,
  onApplyAnnualDocExtraction,
  onChangeTaxpayerMode,
  onApplyLifeStage,
  onUpdatePersonalization,
  onLogRecurringBill,
  onQuickAdd,
  onDropFileForScan,
  onOpenMyInvoisQr,
  onNavigateTab,
  onOpenTool,
  onOpenUpgrade,
  onLoadSampleData,
  onOpenGuideModal,
}: DashboardTabProps) {
  const dropzoneInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [freelancerView, setFreelancerView] = useState<"personal" | "business">(
    "personal"
  );
  const [loggingBillId, setLoggingBillId] = useState<string | null>(null);
  const [manualBeDocId, setManualBeDocId] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(personalization.taxSavingGoal));
  const [beParsing, setBeParsing] = useState(false);
  const [beApplying, setBeApplying] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [beNotice, setBeNotice] = useState<string | null>(null);
  const [beQueue, setBeQueue] = useState<
    Array<{
      id: string;
      fileName: string;
      doc: AnnualTaxDoc;
      extraction: AnnualDocExtraction | null;
      targetYear: TaxYear;
      note?: string;
    }>
  >([]);
  const beInputRef = useRef<HTMLInputElement>(null);
  const { copy, tCategory } = useLanguage();
  const currentMonth = getCurrentYearMonth();
  const nearPayday = isNearPayday(personalization.paydayDay);
  const nowDate = new Date();
  const hasCurrentMonthPayslipOrEa = (() => {
    const hasPayslipExpenseThisMonth = yearExpenses.some(
      (e) =>
        e.invoiceNumber?.startsWith("PAYSLIP-") &&
        e.expenseDate.startsWith(currentMonth)
    );
    if (hasPayslipExpenseThisMonth) return true;
    if (typeof window !== "undefined") {
      try {
        const eaRaw = window.localStorage.getItem(
          `cukaiku_ea_employers_${summary.taxYear}`
        );
        const eaList = eaRaw ? JSON.parse(eaRaw) : [];
        if (Array.isArray(eaList) && eaList.length > 0) return true;
        const srcRaw = window.localStorage.getItem(
          `cukaiku_payslip_source_${summary.taxYear}`
        );
        const src = srcRaw ? JSON.parse(srcRaw) : null;
        if (src?.appliedMonth === currentMonth) return true;
      } catch {
        // ignore
      }
    }
    return false;
  })();
  const paydayPassedNoPayslip = Boolean(
    personalization.paydayDay &&
      summary.taxYear === nowDate.getFullYear() &&
      nowDate.getDate() >= personalization.paydayDay &&
      !hasCurrentMonthPayslipOrEa
  );

  const activeCategories = summary.categorySummaries
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.percentUsed - a.percentUsed);

  const partnerMatches = matchPartnerOffersToOpportunities(
    summary.opportunities,
    summary.marginalRate
  );

  // Max total expense relief cap across all categories + status reliefs
  const totalMaxExpenseCap = summary.categorySummaries.reduce(
    (sum, c) => sum + c.category.maxLimit,
    0
  );
  const heroProgressPct =
    totalMaxExpenseCap > 0
      ? Math.min(
          100,
          Math.round((summary.expenseReliefClaimable / 28000) * 100)
        )
      : 0;

  // Business Expenses summary for Freelancer (e-B) mode
  const businessExpenses = yearExpenses.filter(
    (e) =>
      e.claimType === "business_deductible" ||
      e.categoryId === "business_expense"
  );
  const totalBusinessExpenses = businessExpenses.reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );

  // Receipts missing LHDN MyInvois QR validation
  const missingMyInvoisQrCount = yearExpenses.filter(
    (e) =>
      !e.myInvoisUuid &&
      !String(e.description || "").toLowerCase().includes("myinvois")
  ).length;

  // User-Pinned Bento Relief Categories (customized via Life-Stage Preset or ★ in Reliefs tab)
  const bentoCategories = personalization.pinnedCategoryIds
    .map((id) =>
      summary.categorySummaries.find((c) => c.category.id === id)
    )
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  // LHDN e-Filing Deadline Countdown (YA N is filed in year N+1: 30 April for e-BE, 30 June for e-B)
  const isPastYear = summary.taxYear < new Date().getFullYear();
  const filingYear = summary.taxYear + 1;
  const deadlineDate =
    taxpayerMode === "e-B"
      ? new Date(`${filingYear}-06-30T23:59:59+08:00`)
      : new Date(`${filingYear}-04-30T23:59:59+08:00`);
  const daysToDeadline = Math.max(
    0,
    Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <div className="space-y-4 pb-6">
      {/* First-time User Quick-Start Checklist (current/future years only) */}
      {!isPastYear && (
        <QuickStartChecklist
          taxYear={summary.taxYear}
          language={personalization.language}
          profileCustomized={profileCustomized}
          hasExpenses={expenseCount > 0}
          hasCloudSync={hasCloudSync}
          onOpenScanner={() => onQuickAdd()}
          onNavigateTab={onNavigateTab}
          onLoadSampleData={onLoadSampleData}
          onOpenGuideModal={onOpenGuideModal}
        />
      )}

      {/* Payday Reminder Banner (if within ±2 days or payday has passed without current-month payslip) */}
      {!isPastYear && (nearPayday || paydayPassedNoPayslip) && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-xs text-emerald-950 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold">
                {paydayPassedNoPayslip && !nearPayday
                  ? personalization.language === "bm"
                    ? `Hari gaji (${personalization.paydayDay}hb) telah lepas — slip gaji bulan ini belum dimuat naik`
                    : `Payday (day ${personalization.paydayDay}) has passed — this month's payslip isn't uploaded yet`
                  : copy.paydayBanner}
              </p>
              <p className="text-[11px] text-emerald-800">
                {copy.paydaySub.replace(
                  "{day}",
                  String(personalization.paydayDay)
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("settings")}
            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
          >
            {copy.uploadPayslipBtn}
          </button>
        </section>
      )}

      {/* 1-Tap Life-Stage Preset Selector (current/future years only) */}
      {!isPastYear && !personalization.lifeStage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-slate-900">
                {copy.lifeStageTitle}
              </h2>
              <InfoHint
                align="left"
                title={
                  personalization.language === "bm"
                    ? "Peribadikan dalam 1 Ketik"
                    : "Personalize in 1 Tap"
                }
                text={
                  personalization.language === "bm"
                    ? "Pilih peringkat kehidupan yang sepadan dengan anda. CukaiKu menetapkan Borang e-BE/e-B, pelepasan status, dan menyematkan kategori LHDN paling relevan ke Utama secara automatik."
                    : "Pick the life stage that matches you. CukaiKu automatically sets Form e-BE/e-B, status reliefs, and pins the most relevant LHDN categories to your Dashboard."
                }
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-400">
              {copy.changeAnytimeSettings}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {LIFE_STAGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyLifeStage(preset.id)}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <span className="text-xs font-bold text-slate-900">
                    {personalization.language === "bm"
                      ? preset.titleBm
                      : preset.titleEn}
                  </span>
                  <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    {personalization.language === "bm" && preset.badge === "Family"
                      ? "Keluarga"
                      : preset.badge}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-600">
                  {personalization.language === "bm"
                    ? preset.subtitleBm
                    : preset.subtitleEn}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Desktop (>= 1024px) Prominent Drag & Drop PDF / e-Invoice Dropzone Card */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          const droppedFile = e.dataTransfer.files?.[0];
          if (droppedFile) onDropFileForScan(droppedFile);
        }}
        className={`hidden lg:flex items-center justify-between gap-4 rounded-2xl border-2 border-dashed p-5 transition ${
          isDraggingOver
            ? "border-emerald-500 bg-emerald-50/80"
            : "border-emerald-300/90 bg-white shadow-2xs hover:border-emerald-500"
        }`}
      >
        <input
          ref={dropzoneInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onDropFileForScan(f);
          }}
        />
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
            <FileUp className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                {copy.dropzoneTitle}
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                {copy.dropzoneBadge}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {copy.dropzoneSub}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenMyInvoisQr}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <QrCode className="h-4 w-4 text-emerald-600" />
            {copy.scanMyInvoisQr}
          </button>
          <button
            type="button"
            onClick={() => dropzoneInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
          >
            <FileUp className="h-4 w-4" />
            {copy.selectPdfImage}
          </button>
        </div>
      </section>

      {/* Salaried (e-BE) vs. Freelancer / Mixed Income (e-B) Mode Bar */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
            <span>{copy.filingProfile}</span>
            <InfoHint
              align="left"
              title={
                personalization.language === "bm"
                  ? "Borang e-BE lwn. Borang e-B"
                  : "Form e-BE vs Form e-B"
              }
              text={
                personalization.language === "bm"
                  ? "Makan Gaji (e-BE, akhir 30 Apr) adalah untuk pendapatan penggajian sepenuh masa. Pekerja Bebas / Campuran (e-B, akhir 30 Jun) menambah Perbelanjaan Perniagaan (Sek 33) & peringatan CP500."
                  : "Salaried (e-BE, due 30 Apr) is for full-time employment income. Freelancer / Mixed (e-B, due 30 Jun) adds Business Expenses (Sec 33) & CP500 reminders."
              }
            />
          </span>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                onChangeTaxpayerMode("e-BE");
                setFreelancerView("personal");
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                taxpayerMode === "e-BE"
                  ? "bg-brand-primary text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {copy.salariedMode}
            </button>
            <button
              type="button"
              onClick={() => onChangeTaxpayerMode("e-B")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                taxpayerMode === "e-B"
                  ? "bg-brand-primary text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              {copy.freelancerMode}
            </button>
          </div>
        </div>

        {/* Top Switcher (Freelancer e-B Mode Only): [ Personal Reliefs ] vs [ Business Expenses ] */}
        {taxpayerMode === "e-B" && (
          <div className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50/70 p-1">
            <button
              type="button"
              onClick={() => setFreelancerView("personal")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                freelancerView === "personal"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-emerald-800 hover:text-emerald-950"
              }`}
            >
              {copy.personalReliefsTab}
            </button>
            <button
              type="button"
              onClick={() => setFreelancerView("business")}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                freelancerView === "business"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-emerald-800 hover:text-emerald-950"
              }`}
            >
              {copy.businessExpensesTab} ({businessExpenses.length})
            </button>
          </div>
        )}
      </section>

      {/* LHDN Deadline & MyInvois / 7-Year Audit Banner */}
      <section className="flex flex-col justify-between gap-2.5 rounded-2xl border border-amber-300/80 bg-amber-50/90 p-3.5 text-xs text-amber-950 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl bg-amber-500/20 p-2 text-amber-800">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {isPastYear ? (
                <>
                  <span className="font-bold">
                    {personalization.language === "bm"
                      ? `Arkib Audit Sejarah • TT ${summary.taxYear}`
                      : `Historical Audit Archive • YA ${summary.taxYear}`}
                  </span>
                  <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                    {personalization.language === "bm"
                      ? `Simpan hingga ${summary.retentionUntilYear}`
                      : `Retain until ${summary.retentionUntilYear}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-bold">
                    {taxpayerMode === "e-B"
                      ? `${copy.deadlineB} ${filingYear}`
                      : `${copy.deadlineBe} ${filingYear}`}
                  </span>
                  <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                    {daysToDeadline} {copy.daysLeft}
                  </span>
                </>
              )}
              {taxpayerMode === "e-B" && !isPastYear && (
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {copy.cp500Active}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-amber-800">
              {taxpayerMode === "e-B"
                ? `${copy.keepUntilLabel} ${summary.retentionUntilYear}`
                : `${copy.retentionUntil} ${summary.retentionUntilYear}.`}{" "}
              {missingMyInvoisQrCount > 0 && (
                <strong>
                  • {missingMyInvoisQrCount} {copy.missingQrSuffix}
                </strong>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <InfoHint
            align="right"
            title={
              personalization.language === "bm"
                ? "Apakah QR MyInvois?"
                : "What is MyInvois QR?"
            }
            text={
              personalization.language === "bm"
                ? "Kod QR e-Invois rasmi LHDN. Mengimbasnya melampirkan UUID & TIN yang disahkan pada resit anda untuk semakan audit 7-tahun LHDN yang lebih pantas."
                : "LHDN's official e-Invoice QR code. Scanning it attaches the verified UUID & TIN to your receipt for faster 7-year LHDN audit checks."
            }
          />
          <button
            type="button"
            onClick={onOpenMyInvoisQr}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-amber-700"
          >
            <QrCode className="h-3.5 w-3.5" />
            {copy.verifyMyInvois}
          </button>
        </div>
      </section>

      {/* Past-Year Form e-BE Backfill Card (directly on Dashboard for previous YAs) */}
      {isPastYear && onUploadAnnualDoc && onApplyAnnualDocExtraction && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-3 shadow-xs">
          <input
            ref={beInputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length === 0) return;
              setBeParsing(true);
              setBeNotice(null);
              try {
                const label =
                  personalization.language === "bm"
                    ? "Bukti Penghantaran Borang BE LHDN"
                    : "LHDN Form BE Filing Proof";
                const items: typeof beQueue = [];
                for (const file of files) {
                  const { extraction, skipReason } = await parseAnnualDocFile(
                    file,
                    "form_be_proof",
                    label,
                    summary.taxYear
                  );
                  const detectedYr =
                    extraction?.detectedTaxYear &&
                    SUPPORTED_TAX_YEARS.includes(extraction.detectedTaxYear)
                      ? extraction.detectedTaxYear
                      : summary.taxYear;
                  const savedDoc = await onUploadAnnualDoc(
                    "form_be_proof",
                    label,
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
                setBeQueue(items);
              } finally {
                setBeParsing(false);
              }
            }}
          />

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-sm font-bold text-indigo-950">
                  {personalization.language === "bm"
                    ? formBeBaseline
                      ? `Borang e-BE TT ${summary.taxYear} Dimuat Naik`
                      : `Isi Semula TT ${summary.taxYear} daripada Borang e-BE`
                    : formBeBaseline
                    ? `YA ${summary.taxYear} Form e-BE Loaded`
                    : `Backfill YA ${summary.taxYear} from Form e-BE`}
                </h2>
                {formBeBaseline && (() => {
                  const beAudit = computeFormBeReconciliation(
                    summary.taxYear,
                    profile.annualIncome,
                    yearExpenses,
                    formBeBaseline
                  );
                  if (!beAudit) return null;
                  return (
                    <>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                          beAudit.isAuditReady ? "bg-emerald-600" : "bg-amber-600"
                        }`}
                      >
                        {beAudit.verifiedCategoryCount}/{beAudit.declaredCategoryCount}{" "}
                        {personalization.language === "bm" ? "disahkan" : "verified"}
                      </span>
                      {formBeBaseline.filingReferenceNo && (
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                          {formBeBaseline.filingReferenceNo}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <p className="mt-0.5 text-xs text-indigo-800/80">
                {formBeBaseline
                  ? personalization.language === "bm"
                    ? `Sumber: ${formBeBaseline.uploadedFileName}${
                        formBeBaseline.acknowledgementFileName &&
                        formBeBaseline.acknowledgementFileName !==
                          formBeBaseline.uploadedFileName
                          ? ` + ${formBeBaseline.acknowledgementFileName}`
                          : ""
                      }${
                        formBeBaseline.filingDate
                          ? ` (Dihantar ${formBeBaseline.filingDate})`
                          : ""
                      } • Semak penyesuaian audit & muat naik resit sokongan.`
                    : `Source: ${formBeBaseline.uploadedFileName}${
                        formBeBaseline.acknowledgementFileName &&
                        formBeBaseline.acknowledgementFileName !==
                          formBeBaseline.uploadedFileName
                          ? ` + ${formBeBaseline.acknowledgementFileName}`
                          : ""
                      }${
                        formBeBaseline.filingDate
                          ? ` (Filed ${formBeBaseline.filingDate})`
                          : ""
                      } • Check audit reconciliation & attach supporting receipts.`
                  : personalization.language === "bm"
                  ? "Muat naik PDF Borang e-BE MyTax anda (satu atau beberapa tahun sekaligus) untuk mengisi pendapatan, pelepasan & PCB secara automatik."
                  : "Upload your MyTax Form e-BE PDF (single or multiple years at once) to auto-fill income, reliefs & PCB."}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {formBeBaseline && (
                <button
                  type="button"
                  onClick={() => onOpenTool("form-be")}
                  className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-900 shadow-2xs hover:bg-slate-50"
                >
                  {personalization.language === "bm"
                    ? "Semak Audit"
                    : "Audit & Tally"}
                </button>
              )}
              <button
                type="button"
                disabled={beParsing}
                onClick={() => beInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
              >
                {beParsing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {beParsing
                  ? personalization.language === "bm"
                    ? "Membaca e-BE..."
                    : "Reading e-BE..."
                  : formBeBaseline
                  ? personalization.language === "bm"
                    ? "Muat Naik e-BE Lain"
                    : "Upload Another e-BE"
                  : personalization.language === "bm"
                  ? "Muat Naik Borang e-BE"
                  : "Load Form e-BE PDF"}
              </button>
            </div>
          </div>

          {beNotice && (
            <p className="rounded-xl bg-white/90 px-3 py-2 text-xs font-medium text-emerald-800">
              {beNotice}
            </p>
          )}

          {/* Inline Missing Proof Quick-Upload List or Audit Ready Banner */}
          {formBeBaseline && beQueue.length === 0 && (() => {
            const beAudit = computeFormBeReconciliation(
              summary.taxYear,
              profile.annualIncome,
              yearExpenses,
              formBeBaseline
            );
            if (!beAudit) return null;
            const cats = getReliefCategories(summary.taxYear);
            const catMap = new Map(cats.map((c) => [c.id, c]));
            const shortfalls = beAudit.rows
              .filter((r) => r.status === "shortfall")
              .map((r) => {
                const cat = catMap.get(r.catId);
                return {
                  catId: r.catId,
                  name: cat ? tCategory(cat).shortName : r.shortName,
                  declared: r.declared,
                  verified: r.verifiedClaimable,
                  short: r.shortfall,
                };
              });

            if (shortfalls.length === 0) {
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      {personalization.language === "bm"
                        ? `TT ${summary.taxYear} Sedia Audit ✓ — 100% pelepasan disokong resit`
                        : `YA ${summary.taxYear} Audit Ready ✓ — 100% of Form e-BE reliefs backed by receipts`}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={exportingZip}
                    onClick={async () => {
                      setExportingZip(true);
                      try {
                        await exportAuditPackZip(profile, summary, yearExpenses);
                      } finally {
                        setExportingZip(false);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {exportingZip ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    {personalization.language === "bm"
                      ? "Muat Turun Pek Audit ZIP"
                      : "Download Audit Pack ZIP"}
                  </button>
                </div>
              );
            }

            return (
              <div className="space-y-1.5 border-t border-indigo-200/70 pt-2.5">
                <p className="text-[11px] font-bold text-indigo-950">
                  {personalization.language === "bm"
                    ? `Bukti masih diperlukan (${shortfalls.length} kategori):`
                    : `Receipts still needed (${shortfalls.length} ${shortfalls.length === 1 ? "category" : "categories"}):`}
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {shortfalls.map((item) => (
                    <div
                      key={item.catId}
                      className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {item.name}
                        </p>
                        <p className="text-[10px] font-medium text-amber-700">
                          {personalization.language === "bm" ? "Kurang" : "Short"}{" "}
                          {formatRM(item.short, true)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onQuickAdd(item.catId)}
                        className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-bold text-white hover:bg-slate-800"
                      >
                        {personalization.language === "bm" ? "+ Bukti" : "+ Proof"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {beQueue.length > 0 && (
            <div className="space-y-2 border-t border-indigo-200/70 pt-2.5">
              {beQueue.map((item) => (
                <div
                  key={item.id}
                  className="space-y-2.5 rounded-xl bg-white p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {item.fileName}
                      </p>
                      {item.extraction ? (
                        <p className="text-[11px] text-slate-500">
                          Income {formatRM(item.extraction.annualIncome)} • Reliefs{" "}
                          {formatRM(item.extraction.declaredTotalReliefs || 0)} • PCB{" "}
                          {formatRM(item.extraction.pcbPaid)}
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] text-amber-700">
                            {item.note || "Archived only — no numeric figures detected"}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setManualBeDocId((cur) =>
                                cur === item.id ? null : item.id
                              )
                            }
                            className="rounded-lg bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-indigo-700"
                          >
                            {personalization.language === "bm"
                              ? "Isi Manual"
                              : "Enter Manually"}
                          </button>
                        </div>
                      )}
                    </div>
                    <select
                      value={item.targetYear}
                      onChange={(e) => {
                        const yr = Number(e.target.value) as TaxYear;
                        setBeQueue((prev) =>
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
                  {item.extraction && (
                    <FormBeChecklist
                      extraction={item.extraction}
                      lang={personalization.language}
                    />
                  )}
                  {!item.extraction && manualBeDocId === item.id && (
                    <AnnualDocManualEntry
                      doc={item.doc}
                      defaultYear={item.targetYear}
                      lang={personalization.language}
                      onApply={async (ext, doc, yr) => {
                        await onApplyAnnualDocExtraction(ext, doc, yr);
                        setManualBeDocId(null);
                        setBeQueue((prev) => prev.filter((q) => q.id !== item.id));
                        setBeNotice(
                          personalization.language === "bm"
                            ? `Angka Borang e-BE disimpan ke TT ${yr}!`
                            : `Saved manual Form e-BE figures to YA ${yr}!`
                        );
                      }}
                      onCancel={() => setManualBeDocId(null)}
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={beApplying || !beQueue.some((q) => q.extraction)}
                  onClick={async () => {
                    setBeApplying(true);
                    try {
                      const ready = beQueue.filter((q) => q.extraction);
                      for (let i = 0; i < ready.length; i++) {
                        const q = ready[i];
                        await onApplyAnnualDocExtraction(
                          q.extraction!,
                          q.doc,
                          q.targetYear,
                          { skipYearSwitch: i < ready.length - 1 }
                        );
                      }
                      setBeNotice(
                        personalization.language === "bm"
                          ? `Berjaya isi semula ${ready.length} Borang e-BE (${ready.map((r) => `TT ${r.targetYear}`).join(", ")})!`
                          : `Applied ${ready.length} Form e-BE submission${ready.length === 1 ? "" : "s"} (${ready.map((r) => `YA ${r.targetYear}`).join(", ")})!`
                      );
                      setBeQueue([]);
                    } finally {
                      setBeApplying(false);
                    }
                  }}
                  className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {beApplying
                    ? personalization.language === "bm"
                      ? "Menggunakan..."
                      : "Applying..."
                    : personalization.language === "bm"
                    ? `Guna Semua (${beQueue.filter((q) => q.extraction).length})`
                    : `Apply All (${beQueue.filter((q) => q.extraction).length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setBeQueue([])}
                  className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-900"
                >
                  {personalization.language === "bm" ? "Batal" : "Dismiss"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="space-y-4 md:grid md:grid-cols-12 md:items-start md:gap-5 md:space-y-0">
        {/* Left / Primary Column */}
        <div className="space-y-4 md:col-span-7">
      {/* Hero Tax Savings Card with Emerald Progress Bar */}
      <section className="rounded-2xl bg-gradient-to-br from-[#0F294A] via-emerald-800 to-teal-900 p-5 text-white shadow-lg shadow-emerald-950/20">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-emerald-100/90">
              <span>
                {taxpayerMode === "e-B" && freelancerView === "business"
                  ? `${personalization.language === "bm" ? "TT" : "YA"} ${summary.taxYear} ${copy.businessExpensesTitle}`
                  : `${personalization.language === "bm" ? "TT" : "YA"} ${summary.taxYear} ${copy.totalReliefsTitle}`}
              </span>
              <InfoHint
                light
                align="left"
                title={
                  personalization.language === "bm"
                    ? "Bagaimana Pelepasan Cukai Berfungsi"
                    : "How Tax Reliefs Work"
                }
                text={
                  personalization.language === "bm"
                    ? "Potongan LHDN yang diluluskan (Gaya Hidup, Perubatan, KWSP, SSPN, dll.) ditolak daripada pendapatan bercukai anda sebelum mengira kadar cukai."
                    : "Approved LHDN deductions (Lifestyle, Medical, EPF, SSPN, etc.) subtract from your taxable income before calculating your tax bracket."
                }
              />
            </p>
            <p className="privacy-sensitive mt-1 text-3xl font-bold tracking-tight">
              {taxpayerMode === "e-B" && freelancerView === "business"
                ? formatRM(totalBusinessExpenses)
                : formatRM(summary.totalReliefs)}
            </p>
            <p className="privacy-sensitive mt-0.5 text-xs text-emerald-100/85">
              {taxpayerMode === "e-B" && freelancerView === "business"
                ? `${businessExpenses.length} ${
                    personalization.language === "bm"
                      ? "baucar perniagaan layak • Anggaran cukai dijimat"
                      : "allowable business voucher(s) • Est. tax saved"
                  } ${formatRM(Math.round(totalBusinessExpenses * summary.marginalRate))}`
                : `${formatRM(summary.statusReliefTotal)} status + ${formatRM(
                    summary.expenseReliefClaimable
                  )} / RM 28,000 ${
                    personalization.language === "bm"
                      ? "pelepasan resit"
                      : "expense reliefs"
                  }`}
            </p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-1.5 text-right backdrop-blur-sm">
            <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-emerald-100">
              <span>{copy.taxBracket}</span>
              <InfoHint
                light
                align="right"
                title={
                  personalization.language === "bm"
                    ? "Kadar Cukai Marginal"
                    : "Marginal Tax Rate"
                }
                text={
                  personalization.language === "bm"
                    ? "Kadar cukai tertinggi LHDN anda (%). Setiap RM 100 pelepasan baharu menjimatkan peratusan ini secara langsung daripada cukai anda!"
                    : "Your top LHDN tax bracket (%). Every RM 100 of new relief saves you this percentage directly in tax!"
                }
              />
            </p>
            <p className="privacy-sensitive text-lg font-bold">
              {Math.round(summary.marginalRate * 100)}%
            </p>
          </div>
        </div>

        {/* Emerald Relief Progress Bar */}
        <div className="mt-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-emerald-100/90">
            <span>{copy.reliefUtilization}</span>
            <span className="privacy-sensitive font-bold text-white">
              {formatRM(summary.expenseReliefClaimable)} / RM 28,000 {copy.targetLabel} (
              {heroProgressPct}%)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${heroProgressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-emerald-100">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">{copy.taxSavedReceipts}</span>
              <InfoHint
                light
                align="left"
                title={
                  personalization.language === "bm"
                    ? "Cukai Sebenar Dijimat"
                    : "Actual Tax Saved"
                }
                text={
                  personalization.language === "bm"
                    ? "Ringgit sebenar yang dikurangkan daripada bil cukai anda hasil resit yang direkod setakat ini (Pelepasan Layak × kadar cukai tertinggi anda)."
                    : "Actual Ringgit cut off your tax bill thanks to the receipts you've logged so far (Claimable Reliefs × your top tax bracket)."
                }
              />
            </div>
            <p className="privacy-sensitive mt-1 text-lg font-bold text-white">
              {formatRM(summary.taxSavedByExpenseReliefs)}
            </p>
          </div>

          <div className="rounded-xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-emerald-100">
              <Wallet className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">
                {summary.estimatedRefund >= 0 ? copy.estRefund : copy.estBalanceDue}
              </span>
              <InfoHint
                light
                align="right"
                title={
                  personalization.language === "bm"
                    ? "Lebihan lwn. Baki Perlu Dibayar"
                    : "Refund vs Balance Due"
                }
                text={
                  personalization.language === "bm"
                    ? "Membandingkan bil cukai akhir LHDN anda dengan PCB yang telah dipotong daripada gaji + Zakat. Positif = wang yang LHDN perlu pulangkan!"
                    : "Compares your final LHDN tax bill against PCB already deducted from your salary + Zakat. Positive = money LHDN owes you back!"
                }
              />
            </div>
            <p
              className={`privacy-sensitive mt-1 text-lg font-bold ${
                summary.estimatedRefund >= 0 ? "text-emerald-200" : "text-amber-200"
              }`}
            >
              {formatRM(Math.abs(summary.estimatedRefund), true)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3 text-xs text-emerald-100/90">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {copy.keepUntilLabel}{" "}
            <strong className="text-white">{summary.retentionUntilYear}</strong>
          </span>
          <button
            onClick={() => onNavigateTab("settings")}
            className="font-medium text-white underline underline-offset-2"
          >
            {copy.editIncomeBtn}
          </button>
        </div>
      </section>

      {/* Quick-Launch Filing & Tax Tools */}
      <section className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => onOpenTool("form-be")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-xs transition active:scale-[0.98]"
        >
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            <ClipboardList className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-bold text-slate-800">{copy.toolFormBe}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenTool("year-end")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-xs transition active:scale-[0.98]"
        >
          <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
            <Repeat className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-bold text-slate-800">
            {personalization.language === "bm" ? "Hujung Tahun" : "Year-End"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenTool("what-if")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-xs transition active:scale-[0.98]"
        >
          <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-bold text-slate-800">{copy.toolWhatIf}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenTool("joint-vs-separate")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-xs transition active:scale-[0.98]"
        >
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700">
            <Scale className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-bold text-slate-800">{copy.toolJointSep}</span>
        </button>
      </section>

      {/* Bento-Box Category Progress Grid OR Freelancer Business Expenses View */}
      {taxpayerMode === "e-B" && freelancerView === "business" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Form e-B Business Deductible Vouchers (Section 33)
              </h2>
              <p className="text-[11px] text-slate-500">
                Separated from personal reliefs to prevent double-claiming
              </p>
            </div>
            <button
              type="button"
              onClick={() => onQuickAdd("business_expense")}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs"
            >
              + Log Business Expense
            </button>
          </div>
          {businessExpenses.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No business deductible expenses logged for YA {summary.taxYear}{" "}
              yet. Tap &ldquo;+ Log Business Expense&rdquo; or toggle any scanned
              receipt to Business Expense.
            </p>
          ) : (
            <div className="space-y-2">
              {businessExpenses.slice(0, 6).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">
                      {b.merchant}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {b.expenseDate}
                      {b.description ? ` • ${b.description}` : ""}
                    </p>
                  </div>
                  <span className="privacy-sensitive font-bold text-emerald-700">
                    {formatRM(b.amount, true)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <span>{copy.pinnedCapsTitle}</span>
              <InfoHint
                align="left"
                title={
                  personalization.language === "bm"
                    ? "Had Pelepasan Disemat Anda"
                    : "Your Pinned Relief Caps"
                }
                text={
                  personalization.language === "bm"
                    ? "Ketik mana-mana kad untuk mengimbas resit dengan pantas, atau ketik 'Ubah Pin' untuk membintangkan kategori dalam tab Pelepasan."
                    : "Tap any card to quickly scan a receipt for it, or tap 'Customize Pins' to star/unstar categories in the Reliefs tab."
                }
              />
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab("reliefs")}
              className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
              {copy.customizePins} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {bentoCategories.map((item) => {
              const isMaxed = item.percentUsed >= 100;
              return (
                <div
                  key={item.category.id}
                  onClick={() => onQuickAdd(item.category.id)}
                  className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-emerald-400 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div
                      className={`rounded-xl p-1.5 ${
                        isMaxed
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <ReliefIcon
                        name={item.category.icon}
                        className="h-3.5 w-3.5"
                      />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {item.percentUsed}%
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs font-bold text-slate-900">
                    {tCategory(item.category).shortName}
                  </p>
                  <p className="privacy-sensitive mt-0.5 text-xs font-extrabold text-emerald-700">
                    {formatRM(item.claimable)}{" "}
                    <span className="font-normal text-slate-400">
                      / {formatRM(item.category.maxLimit)}
                    </span>
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${item.percentUsed}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-500">
                    {isMaxed
                      ? copy.maxCapReached
                      : `${formatRM(item.remaining)} ${copy.remainingLabel}`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state quick-start banner */}
      {expenseCount === 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-600 p-2 text-white">
              <Camera className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900">
                {copy.emptyStartTitle.replace("{year}", String(summary.taxYear))}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                {copy.emptyStartDesc}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onQuickAdd()}
                  className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.98]"
                >
                  {copy.scanFirstReceipt}
                </button>
                <button
                  onClick={onLoadSampleData}
                  className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-700 active:scale-[0.98]"
                >
                  {copy.loadSampleData.replace("{year}", String(summary.taxYear))}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      </div>

      {/* Right / Action & Insights Column */}
      <div className="space-y-4 md:col-span-5">
      {/* Personal Tax-Saving Goal Card */}
      {!isPastYear && (() => {
        const maxTaxGoal = calculateMaxTaxSavingGoal(profile);
        const effectiveGoal =
          maxTaxGoal > 0 ? Math.min(personalization.taxSavingGoal, maxTaxGoal) : 0;
        if (personalization.taxSavingGoal <= 0 && maxTaxGoal <= 0) return null;
        return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Target className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                {copy.goalTitle}
              </h2>
              <InfoHint
                title={
                  personalization.language === "bm"
                    ? "Sasaran Penjimatan Cukai Peribadi"
                    : "Custom Tax-Saving Target"
                }
                text={
                  personalization.language === "bm"
                    ? "Tetapkan sasaran penjimatan cukai tahunan anda (dihadkan mengikut jumlah cukai maksimum yang boleh dijimat berdasarkan pendapatan anda)."
                    : "Set your yearly tax-saving target (capped at the maximum tax saving achievable based on your income)."
                }
              />
            </div>
            {maxTaxGoal > 0 && (
              <button
                type="button"
                onClick={() => {
                  setGoalDraft(String(effectiveGoal));
                  setEditingGoal((v) => !v);
                }}
                className="text-[11px] font-semibold text-emerald-700 hover:underline"
              >
                {editingGoal ? copy.cancelBtn : copy.editBtn}
              </button>
            )}
          </div>

          {editingGoal ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={maxTaxGoal >= 100 ? 100 : 0}
                  max={maxTaxGoal}
                  step="100"
                  value={goalDraft}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    if (!Number.isNaN(num) && num > maxTaxGoal) {
                      setGoalDraft(String(maxTaxGoal));
                    } else {
                      setGoalDraft(e.target.value);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    const raw = Math.max(0, Number(goalDraft) || 0);
                    const val = Math.min(maxTaxGoal, Math.max(maxTaxGoal >= 100 ? 100 : 0, raw));
                    onUpdatePersonalization({
                      ...personalization,
                      taxSavingGoal: val,
                    });
                    setEditingGoal(false);
                  }}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                >
                  {copy.saveBtn}
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>
                  {personalization.language === "bm"
                    ? `Maks berdasarkan pendapatan: ${formatRM(maxTaxGoal)}`
                    : `Max based on income: ${formatRM(maxTaxGoal)}`}
                </span>
                <button
                  type="button"
                  onClick={() => setGoalDraft(String(maxTaxGoal))}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {personalization.language === "bm" ? "Guna Maks" : "Use Max"}
                </button>
              </div>
            </div>
          ) : (
            (() => {
              const goalPct =
                effectiveGoal > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (summary.taxSavedByExpenseReliefs / effectiveGoal) * 100
                      )
                    )
                  : 0;
              return (
                <>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="privacy-sensitive font-extrabold text-emerald-700">
                      {formatRM(summary.taxSavedByExpenseReliefs)} {copy.savedLabel}
                    </span>
                    <span className="text-slate-500">
                      {copy.goalLabel}: {formatRM(effectiveGoal)} ({goalPct}
                      %)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${goalPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {personalization.language === "bm"
                      ? `Had maks berdasarkan pendapatan: ${formatRM(maxTaxGoal)}`
                      : `Max cap based on income: ${formatRM(maxTaxGoal)}`}
                  </p>
                </>
              );
            })()
          )}
        </section>
        );
      })()}

      {/* 1-Tap Monthly Recurring Bills */}
      {!isPastYear && recurringBills.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                {copy.recurringTitle}
              </h2>
              <InfoHint
                title={
                  personalization.language === "bm"
                    ? "Bil Bulanan 1-Ketik"
                    : "1-Tap Monthly Bills"
                }
                text={
                  personalization.language === "bm"
                    ? "Rekod bil boleh ditolak cukai yang berulang (internet, gim, insurans perubatan) dalam 1 ketik. Setiap bil dikunci untuk bulan tersebut supaya tidak dikira dua kali."
                    : "Log repeating tax-deductible bills (internet, gym, medical insurance) in 1 tap. Each bill locks for the month once logged so it never double-counts."
                }
              />
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {currentMonth}
            </span>
          </div>

          <div className="space-y-2">
            {recurringBills.map((bill) => {
              const expectedInvoice = `RECUR-${bill.id}-${currentMonth}`;
              const isLoggedThisMonth = yearExpenses.some(
                (e) => e.invoiceNumber === expectedInvoice
              );
              const isBusy = loggingBillId === bill.id;
              const billBm = RECURRING_BILL_BM[bill.id];
              return (
                <div
                  key={bill.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">
                      {personalization.language === "bm" && billBm
                        ? billBm.merchant
                        : bill.merchant}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatRM(bill.amount)} •{" "}
                      {personalization.language === "bm" && billBm
                        ? billBm.description
                        : bill.description}
                    </p>
                  </div>
                  {isLoggedThisMonth ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      {copy.loggedThisMonth}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setLoggingBillId(bill.id);
                        try {
                          await onLogRecurringBill(bill);
                        } finally {
                          setLoggingBillId(null);
                        }
                      }}
                      className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                    >
                      {isBusy
                        ? personalization.language === "bm"
                          ? "Merekod..."
                          : "Logging..."
                        : `+ ${copy.logBillNow}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Missing Receipts Warning */}
      {missingReceiptsTotal > 0 && (
        <button
          onClick={() => onNavigateTab("receipts")}
          className="flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-left transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-900">
                {personalization.language === "bm"
                  ? `${missingReceiptsTotal} tuntutan tiada bukti resit`
                  : `${missingReceiptsTotal} ${missingReceiptsTotal === 1 ? "claim is" : "claims are"} missing receipt proof`}
              </p>
              <p className="text-[11px] text-amber-700">
                {personalization.language === "bm"
                  ? "Lampirkan resit untuk kekal sedia audit LHDN selama 7 tahun"
                  : "Attach receipts to stay LHDN audit-ready for 7 years"}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-700" />
        </button>
      )}

      {/* Maximize Your Reliefs Opportunities */}
      {!isPastYear && summary.opportunities.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                {copy.maximizeReliefsTitle}
              </h2>
              <InfoHint
                title={
                  personalization.language === "bm"
                    ? "Baki Had LHDN Belum Guna"
                    : "Unused LHDN Sub-Limits"
                }
                text={
                  personalization.language === "bm"
                    ? "Kategori di mana had tahunan LHDN anda belum penuh. Perbelanjaan di sini sebelum 31 Dis mengurangkan cukai anda."
                    : "Categories where you haven't reached the annual LHDN cap yet. Spending here before 31 Dec directly lowers your tax bill."
                }
              />
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
              {copy.before31Dec} {summary.taxYear}
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {summary.opportunities.map((opp) => {
              const matchedCat = summary.categorySummaries.find(
                (c) => c.category.id === opp.categoryId
              )?.category;
              const oppDisplayName = matchedCat
                ? tCategory(matchedCat).shortName
                : opp.categoryName;
              return (
                <div
                  key={opp.categoryId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {oppDisplayName}
                      </p>
                      <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        {personalization.language === "bm" ? "Jimat" : "Save"} ~
                        {formatRM(opp.estimatedTaxSavings)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {formatRM(opp.remainingCap)} {copy.unusedCapRemaining}
                    </p>
                  </div>
                  <button
                    onClick={() => onQuickAdd(opp.categoryId)}
                    className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95"
                  >
                    {copy.addBtn}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Contextual Tax-Saving Partner Offers (Affiliate / Lead-Gen Recommendations Engine) */}
      {!isPastYear && partnerMatches.length > 0 && (
        <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-600 p-1.5 text-white">
                <Gift className="h-3.5 w-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {personalization.language === "bm"
                    ? "Tawaran Rakan Penjimatan Cukai"
                    : "Tax-Saving Partner Perks"}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {personalization.language === "bm"
                    ? `Dipadankan dengan kadar cukai ${Math.round(summary.marginalRate * 100)}% & baki had TT ${summary.taxYear}`
                    : `Matched to your ${Math.round(summary.marginalRate * 100)}% tax bracket & unused YA ${summary.taxYear} caps`}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              {personalization.language === "bm"
                ? "Pelepasan Sah"
                : "Verified Reliefs"}
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {partnerMatches.slice(0, 3).map(({ offer, remainingCap, estimatedTaxSaved }) => {
              const isInternalQuickAction = offer.affiliateUrl.startsWith("#");
              const offerBm = PARTNER_OFFER_BM[offer.id];
              const isBm = personalization.language === "bm";
              return (
                <div
                  key={offer.id}
                  className="rounded-xl border border-emerald-200/70 bg-white p-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200/60">
                          {isBm && offerBm?.partnerName ? offerBm.partnerName : offer.partnerName}
                        </span>
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900">
                          {isBm
                            ? `Dapatkan ~${formatRM(estimatedTaxSaved)} cukai`
                            : `Get back ~${formatRM(estimatedTaxSaved)} tax`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-900">
                        {isBm && offerBm ? offerBm.headline : offer.headline}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                        {isBm && offerBm ? offerBm.description : offer.description} ({formatRM(remainingCap)}{" "}
                        {isBm ? "baki had" : "unused cap"}
                        )
                      </p>
                      {offer.promoCode && (
                        <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                          {isBm ? "Kod promo:" : "Promo code:"}{" "}
                          <code className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono font-bold">
                            {offer.promoCode}
                          </code>
                        </p>
                      )}
                    </div>

                    {isInternalQuickAction ? (
                      <button
                        type="button"
                        onClick={() =>
                          onQuickAdd(offer.categoryId, offer.subCategoryId)
                        }
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs active:scale-95"
                      >
                        {isBm && offerBm ? offerBm.ctaLabel : offer.ctaLabel}
                      </button>
                    ) : (
                      <a
                        href={offer.affiliateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-95"
                      >
                        <span>{isBm && offerBm ? offerBm.ctaLabel : offer.ctaLabel}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Freemium AI Quota & Pro Pass Upgrade Card */}
      {subscription.planTier === "free" && (
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-4 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="rounded-xl bg-amber-400/25 p-2 text-amber-800">
                <Crown className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-slate-900">
                    {copy.freeStarterLabel} ({subscription.aiScansUsed}/
                    {subscription.aiScansLimit}{" "}
                    {personalization.language === "bm"
                      ? "Imbasan AI"
                      : "AI Vision Scans"}
                    )
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  {personalization.language === "bm"
                    ? "Buka 300 imbasan AI, ZIP Audit 7-Tahun 1-klik, dan Import Pukal hanya RM 29/tahun."
                    : "Unlock 300 AI Vision scans, 1-click LHDN 7-Year Audit ZIP, and Batch Import for RM 29/yr."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenUpgrade(
                  "Upgrade to CukaiKu Pro Pass for 300 AI Vision receipt scans and 1-click 7-Year LHDN Audit Pack ZIP."
                )
              }
              className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 active:scale-95"
            >
              {personalization.language === "bm" ? "Naik Taraf" : "Go Pro"}
            </button>
          </div>
        </section>
      )}

      {/* Active Relief Progress Snapshot */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {personalization.language === "bm"
              ? "Kemajuan Pelepasan Aktif"
              : "Active Relief Progress"}
          </h2>
          <button
            onClick={() => onNavigateTab("reliefs")}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700"
          >
            {personalization.language === "bm"
              ? "Semua 15 Pelepasan"
              : "All 15 Reliefs"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {activeCategories.length === 0 ? (
          <p className="mt-3 text-center text-xs text-slate-500 py-4">
            {personalization.language === "bm"
              ? `Tiada perbelanjaan direkodkan untuk TT ${summary.taxYear}.`
              : `No expenses logged for YA ${summary.taxYear} yet.`}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {activeCategories.slice(0, 6).map((item) => {
              const isMaxed = item.percentUsed >= 100;
              return (
                <div key={item.category.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`rounded-lg p-1.5 ${
                          isMaxed
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <ReliefIcon name={item.category.icon} className="h-3.5 w-3.5" />
                      </div>
                      <span className="truncate text-xs font-medium text-slate-800">
                        {tCategory(item.category).shortName}
                      </span>
                      {isMaxed && (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      )}
                    </div>
                    <div className="text-right text-xs">
                      <span className="font-semibold text-slate-900">
                        {formatRM(item.claimable)}
                      </span>
                      <span className="text-slate-400">
                        {" "}
                        / {formatRM(item.category.maxLimit)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isMaxed ? "bg-emerald-500" : "bg-emerald-600"
                      }`}
                      style={{ width: `${item.percentUsed}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Tax Computation Breakdown */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <h2 className="text-sm font-semibold text-slate-900">
          {personalization.language === "bm"
            ? `Anggaran Cukai Pantas TT ${summary.taxYear}`
            : `YA ${summary.taxYear} Quick Tax Estimate`}
        </h2>
        <div className="privacy-sensitive mt-3 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>
              {personalization.language === "bm"
                ? "Anggaran Pendapatan Tahunan"
                : "Estimated Annual Income"}
            </span>
            <span className="font-medium text-slate-900">
              {formatRM(summary.annualIncome)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>
              {personalization.language === "bm"
                ? "Tolak: Jumlah Pelepasan Cukai"
                : "Less: Total Tax Reliefs"}
            </span>
            <span className="font-medium text-emerald-700">
              - {formatRM(summary.totalReliefs)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900">
            <span>
              {personalization.language === "bm"
                ? "Pendapatan Bercukai"
                : "Chargeable Income"}
            </span>
            <span>{formatRM(summary.chargeableIncome)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>
              {personalization.language === "bm"
                ? "Cukai Pendapatan Kasar"
                : "Gross Income Tax"}
            </span>
            <span className="font-medium text-slate-900">
              {formatRM(summary.grossTax, true)}
            </span>
          </div>
          {summary.zakatRebate > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>
                {personalization.language === "bm"
                  ? "Tolak: Rebat Zakat / Fitrah"
                  : "Less: Zakat / Fitrah Rebate"}
              </span>
              <span className="font-medium text-emerald-700">
                - {formatRM(summary.zakatRebate, true)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900">
            <span>
              {personalization.language === "bm"
                ? "Cukai Bersih Perlu Dibayar"
                : "Net Tax Payable"}
            </span>
            <span>{formatRM(summary.netTaxPayable, true)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>
              {personalization.language === "bm"
                ? "PCB / MTD Dibayar YTD"
                : "PCB / MTD Paid YTD"}
            </span>
            <span className="font-medium text-slate-900">
              {formatRM(summary.pcbPaid, true)}
            </span>
          </div>
        </div>
      </section>
      </div>
      </div>
    </div>
  );
}
