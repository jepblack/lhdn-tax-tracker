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
  ExternalLink,
  FileUp,
  Gift,
  QrCode,
  Repeat,
  Scale,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  UserCheck,
  Wallet,
} from "lucide-react";
import { formatRM } from "@/lib/calculator";
import { matchPartnerOffersToOpportunities } from "@/lib/monetization";
import {
  TaxCalculationResult,
  TaxExpense,
  TaxpayerMode,
  UserSubscription,
} from "@/lib/types";
import { FilingToolTab } from "./FilingToolsSheet";
import { InfoHint } from "./InfoHint";
import { QuickStartChecklist } from "./QuickStartGuide";
import { ReliefIcon } from "./ReliefIcon";

interface DashboardTabProps {
  summary: TaxCalculationResult;
  subscription: UserSubscription;
  taxpayerMode: TaxpayerMode;
  yearExpenses: TaxExpense[];
  expenseCount: number;
  missingReceiptsTotal: number;
  profileCustomized: boolean;
  hasCloudSync: boolean;
  onChangeTaxpayerMode: (mode: TaxpayerMode) => void;
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
  summary,
  subscription,
  taxpayerMode,
  yearExpenses,
  expenseCount,
  missingReceiptsTotal,
  profileCustomized,
  hasCloudSync,
  onChangeTaxpayerMode,
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

  // Key Bento Relief Categories (Lifestyle, Medical, SSPN, EV/Green Tech, EPF/Insurance)
  const keyBentoIds = [
    "lifestyle",
    "medical_self",
    "epf_life_insurance",
    "edu_med_insurance",
    "sspn",
    "ev_composting",
  ];
  const bentoCategories = keyBentoIds
    .map((id) =>
      summary.categorySummaries.find((c) => c.category.id === id)
    )
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  // LHDN e-Filing Deadline Countdown (YA N is filed in year N+1: 30 April for e-BE, 30 June for e-B)
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
      {/* First-time User Quick-Start Checklist */}
      <QuickStartChecklist
        taxYear={summary.taxYear}
        profileCustomized={profileCustomized}
        hasExpenses={expenseCount > 0}
        hasCloudSync={hasCloudSync}
        onOpenScanner={() => onQuickAdd()}
        onNavigateTab={onNavigateTab}
        onLoadSampleData={onLoadSampleData}
        onOpenGuideModal={onOpenGuideModal}
      />

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
                Upload / Drag &amp; Drop PDF Receipt or LHDN e-Invoice
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                ~300KB Auto-Archive
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Drop any clinic bill, Shopee/Lazada PDF, broadband invoice, or
              MyInvois QR receipt for instant AI extraction.
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
            Scan MyInvois QR
          </button>
          <button
            type="button"
            onClick={() => dropzoneInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
          >
            <FileUp className="h-4 w-4" />
            Select PDF / Image
          </button>
        </div>
      </section>

      {/* Salaried (e-BE) vs. Freelancer / Mixed Income (e-B) Mode Bar */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
            <span>LHDN Filing Profile:</span>
            <InfoHint
              align="left"
              title="Form e-BE vs Form e-B"
              text="Salaried (e-BE, due 30 Apr) is for full-time employment income. Freelancer / Mixed (e-B, due 30 Jun) adds Business Expenses (Sec 33) & CP500 reminders."
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
              Salaried (e-BE)
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
              Freelancer / Mixed (e-B)
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
              Personal Reliefs
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
              Business Expenses ({businessExpenses.length})
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
              <span className="font-bold">
                {taxpayerMode === "e-B"
                  ? `Form e-B Deadline: 30 June ${filingYear}`
                  : `Form e-BE Deadline: 30 April ${filingYear}`}
              </span>
              <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                {daysToDeadline} days left
              </span>
              {taxpayerMode === "e-B" && (
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  CP500 Bi-Monthly Instalments Active
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-amber-800">
              {taxpayerMode === "e-B"
                ? `Keep Section 33 business vouchers & personal receipts until ${summary.retentionUntilYear} (7-year LHDN audit rule).`
                : `7-year LHDN Section 82A audit retention until ${summary.retentionUntilYear}.`}{" "}
              {missingMyInvoisQrCount > 0 && (
                <strong>
                  • {missingMyInvoisQrCount} receipt(s) without MyInvois QR UUID
                </strong>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <InfoHint
            align="right"
            title="What is MyInvois QR?"
            text="LHDN's official e-Invoice QR code. Scanning it attaches the verified UUID & TIN to your receipt for faster 7-year LHDN audit checks."
          />
          <button
            type="button"
            onClick={onOpenMyInvoisQr}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-amber-700"
          >
            <QrCode className="h-3.5 w-3.5" />
            Verify MyInvois QR
          </button>
        </div>
      </section>

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
                  ? `YA ${summary.taxYear} Business Deductible Expenses (Sec 33)`
                  : `YA ${summary.taxYear} Total Claimable Reliefs`}
              </span>
              <InfoHint
                light
                align="left"
                title="How Tax Reliefs Work"
                text="Approved LHDN deductions (Lifestyle, Medical, EPF, SSPN, etc.) subtract from your taxable income before calculating your tax bracket."
              />
            </p>
            <p className="privacy-sensitive mt-1 text-3xl font-bold tracking-tight">
              {taxpayerMode === "e-B" && freelancerView === "business"
                ? formatRM(totalBusinessExpenses)
                : formatRM(summary.totalReliefs)}
            </p>
            <p className="privacy-sensitive mt-0.5 text-xs text-emerald-100/85">
              {taxpayerMode === "e-B" && freelancerView === "business"
                ? `${businessExpenses.length} allowable business voucher(s) • Est. tax saved ${formatRM(
                    Math.round(totalBusinessExpenses * summary.marginalRate)
                  )}`
                : `${formatRM(summary.statusReliefTotal)} status + ${formatRM(
                    summary.expenseReliefClaimable
                  )} / RM 28,000 expense reliefs`}
            </p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-1.5 text-right backdrop-blur-sm">
            <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-emerald-100">
              <span>Tax Bracket</span>
              <InfoHint
                light
                align="right"
                title="Marginal Tax Rate"
                text="Your top LHDN tax bracket (%). Every RM 100 of new relief saves you this percentage directly in tax!"
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
            <span>Expense Relief Utilization</span>
            <span className="privacy-sensitive font-bold text-white">
              {formatRM(summary.expenseReliefClaimable)} / RM 28,000 target (
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
              <span className="text-[11px] font-medium">Tax Saved (Receipts)</span>
              <InfoHint
                light
                align="left"
                title="Actual Tax Saved"
                text="Actual Ringgit cut off your tax bill thanks to the receipts you've logged so far (Claimable Reliefs × your top tax bracket)."
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
                {summary.estimatedRefund >= 0 ? "Est. LHDN Refund" : "Est. Balance Due"}
              </span>
              <InfoHint
                light
                align="right"
                title="Refund vs Balance Due"
                text="Compares your final LHDN tax bill against PCB already deducted from your salary + Zakat. Positive = money LHDN owes you back!"
              />
            </div>
            <p
              className={`privacy-sensitive mt-1 text-lg font-bold ${
                summary.estimatedRefund >= 0 ? "text-emerald-200" : "text-amber-200"
              }`}
            >
              {formatRM(Math.abs(summary.estimatedRefund))}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3 text-xs text-emerald-100/90">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            LHDN 7-year audit retention: Keep until{" "}
            <strong className="text-white">{summary.retentionUntilYear}</strong>
          </span>
          <button
            onClick={() => onNavigateTab("settings")}
            className="font-medium text-white underline underline-offset-2"
          >
            Edit Income
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
          <span className="text-[10px] font-bold text-slate-800">Form BE</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenTool("year-end")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-xs transition active:scale-[0.98]"
        >
          <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
            <Repeat className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-bold text-slate-800">Year-End</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenTool("what-if")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-xs transition active:scale-[0.98]"
        >
          <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-bold text-slate-800">What-If</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenTool("joint-vs-separate")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-xs transition active:scale-[0.98]"
        >
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700">
            <Scale className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-bold text-slate-800">Joint/Sep</span>
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
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Key LHDN Relief Caps (Bento Grid)
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab("reliefs")}
              className="flex items-center gap-1 text-xs font-bold text-emerald-700"
            >
              View All 15 <ArrowRight className="h-3.5 w-3.5" />
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
                    {item.category.shortName}
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
                      ? "Max cap reached"
                      : `${formatRM(item.remaining)} remaining`}
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
                Start tracking YA {summary.taxYear} receipts
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Snap your first receipt with AI auto-categorization, or load sample
                Malaysian reliefs to explore how sub-limits work.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onQuickAdd()}
                  className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.98]"
                >
                  + Scan First Receipt
                </button>
                <button
                  onClick={onLoadSampleData}
                  className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-700 active:scale-[0.98]"
                >
                  Load Sample YA {summary.taxYear} Data
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      </div>

      {/* Right / Action & Insights Column */}
      <div className="space-y-4 md:col-span-5">
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
                {missingReceiptsTotal}{" "}
                {missingReceiptsTotal === 1 ? "claim is" : "claims are"} missing
                receipt proof
              </p>
              <p className="text-[11px] text-amber-700">
                Attach receipts to stay LHDN audit-ready for 7 years
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-700" />
        </button>
      )}

      {/* Maximize Your Reliefs Opportunities */}
      {summary.opportunities.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Maximize Your Reliefs
              </h2>
              <InfoHint
                title="Unused LHDN Sub-Limits"
                text="Categories where you haven't reached the annual LHDN cap yet. Spending here before 31 Dec directly lowers your tax bill."
              />
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
              Before 31 Dec {summary.taxYear}
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {summary.opportunities.map((opp) => (
              <div
                key={opp.categoryId}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {opp.categoryName}
                    </p>
                    <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Save ~{formatRM(opp.estimatedTaxSavings)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {formatRM(opp.remainingCap)} unused cap remaining
                  </p>
                </div>
                <button
                  onClick={() => onQuickAdd(opp.categoryId)}
                  className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contextual Tax-Saving Partner Offers (Affiliate / Lead-Gen Recommendations Engine) */}
      {partnerMatches.length > 0 && (
        <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-600 p-1.5 text-white">
                <Gift className="h-3.5 w-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Tax-Saving Partner Perks
                </h2>
                <p className="text-[11px] text-slate-500">
                  Matched to your {Math.round(summary.marginalRate * 100)}% tax
                  bracket &amp; unused YA {summary.taxYear} caps
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              Verified Reliefs
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {partnerMatches.slice(0, 3).map(({ offer, remainingCap, estimatedTaxSaved }) => {
              const isInternalQuickAction = offer.affiliateUrl.startsWith("#");
              return (
                <div
                  key={offer.id}
                  className="rounded-xl border border-emerald-200/70 bg-white p-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200/60">
                          {offer.partnerName}
                        </span>
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900">
                          Get back ~{formatRM(estimatedTaxSaved)} tax
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-900">
                        {offer.headline}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                        {offer.description} ({formatRM(remainingCap)} unused cap)
                      </p>
                      {offer.promoCode && (
                        <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                          Promo code:{" "}
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
                        {offer.ctaLabel}
                      </button>
                    ) : (
                      <a
                        href={offer.affiliateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-95"
                      >
                        <span>{offer.ctaLabel}</span>
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
                    Free Starter Plan ({subscription.aiScansUsed}/
                    {subscription.aiScansLimit} AI Vision Scans)
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Unlock 300 AI Vision scans, 1-click LHDN 7-Year Audit ZIP, and
                  Batch Import for RM 29/yr.
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
              Go Pro
            </button>
          </div>
        </section>
      )}

      {/* Active Relief Progress Snapshot */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Active Relief Progress
          </h2>
          <button
            onClick={() => onNavigateTab("reliefs")}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700"
          >
            All 15 Reliefs
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {activeCategories.length === 0 ? (
          <p className="mt-3 text-center text-xs text-slate-500 py-4">
            No expenses logged for YA {summary.taxYear} yet.
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
                        {item.category.shortName}
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
          YA {summary.taxYear} Quick Tax Estimate
        </h2>
        <div className="privacy-sensitive mt-3 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Estimated Annual Income</span>
            <span className="font-medium text-slate-900">
              {formatRM(summary.annualIncome)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Less: Total Tax Reliefs</span>
            <span className="font-medium text-emerald-700">
              - {formatRM(summary.totalReliefs)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900">
            <span>Chargeable Income</span>
            <span>{formatRM(summary.chargeableIncome)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Gross Income Tax</span>
            <span className="font-medium text-slate-900">
              {formatRM(summary.grossTax, true)}
            </span>
          </div>
          {summary.zakatRebate > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Less: Zakat / Fitrah Rebate</span>
              <span className="font-medium text-emerald-700">
                - {formatRM(summary.zakatRebate, true)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900">
            <span>Net Tax Payable</span>
            <span>{formatRM(summary.netTaxPayable, true)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>PCB / MTD Paid YTD</span>
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
