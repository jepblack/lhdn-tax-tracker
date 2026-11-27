"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCheck2,
  Info,
  Plus,
  Star,
} from "lucide-react";
import { formatRM } from "@/lib/calculator";
import {
  computeFormBeReconciliation,
  isFormBePlaceholderExpense,
} from "@/lib/form-be-reconciliation";
import { useLanguage } from "@/lib/language-context";
import { AppLanguage } from "@/lib/personalization";
import {
  CategorySummary,
  FormBeBaseline,
  TaxExpense,
  TaxYear,
} from "@/lib/types";
import { InfoHint } from "./InfoHint";
import { ReceiptPreviewModal } from "./ReceiptPreviewModal";
import { ReliefIcon } from "./ReliefIcon";

interface ReliefsTabProps {
  taxYear: TaxYear;
  annualIncome?: number;
  expenses: TaxExpense[];
  summaries: CategorySummary[];
  marginalRate: number;
  language?: AppLanguage;
  pinnedCategoryIds: string[];
  formBeBaseline?: FormBeBaseline | null;
  onOpenAuditTally?: () => void;
  onTogglePinCategory: (categoryId: string) => void;
  onAddExpenseForCategory: (categoryId: string, subCategoryId?: string) => void;
}

const GROUP_FILTERS = [
  { id: "all", label: "All" },
  { id: "lifestyle", label: "Lifestyle & Sports" },
  { id: "medical", label: "Medical" },
  { id: "savings", label: "EPF & Insurance" },
  { id: "family", label: "Family" },
  { id: "housing", label: "Housing & EV" },
] as const;

export function ReliefsTab({
  taxYear,
  annualIncome = 0,
  expenses,
  summaries,
  marginalRate,
  language = "en",
  pinnedCategoryIds,
  formBeBaseline,
  onOpenAuditTally,
  onTogglePinCategory,
  onAddExpenseForCategory,
}: ReliefsTabProps) {
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>("medical_self");
  const [expandedReceiptLists, setExpandedReceiptLists] = useState<
    Record<string, boolean>
  >({});
  const [previewExpense, setPreviewExpense] = useState<TaxExpense | null>(null);
  const { lang, copy, tCategory, tCategoryTips, tSubCategory, tSubCategoryDesc } =
    useLanguage();

  const toggleReceiptList = (key: string) =>
    setExpandedReceiptLists((prev) => ({ ...prev, [key]: !prev[key] }));

  const yearExpenses = expenses.filter((e) => e.taxYear === taxYear);
  const beAudit = computeFormBeReconciliation(
    taxYear,
    annualIncome,
    expenses,
    formBeBaseline
  );

  const renderReceiptRows = (items: TaxExpense[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2">
        {items.map((exp) => {
          const isPreviewable =
            Boolean(exp.receiptUrl) && exp.receiptUrl !== "sample://attached";
          const isPlaceholder = isFormBePlaceholderExpense(exp);
          return (
            <div
              key={exp.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">
                  {exp.merchant}
                </p>
                <p className="text-[10px] text-slate-500">
                  {exp.expenseDate} • {formatRM(exp.amount, true)}
                </p>
              </div>
              {isPreviewable ? (
                <button
                  type="button"
                  onClick={() => setPreviewExpense(exp)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 active:scale-95"
                >
                  <Eye className="h-3 w-3" />
                  {lang === "bm" ? "Lihat" : "View"}
                </button>
              ) : exp.receiptPath || exp.receiptFileName ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  <FileCheck2 className="h-3 w-3" />
                  {lang === "bm" ? "Dilampirkan" : "Attached"}
                </span>
              ) : isPlaceholder ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {lang === "bm" ? "Perlu Bukti" : "Needs Receipt"}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const groupLabels: Record<string, string> = {
    all: copy.filterAll,
    lifestyle: copy.filterLifestyle,
    medical: copy.filterMedical,
    savings: copy.filterSavings,
    family: copy.filterFamily,
    housing: copy.filterHousing,
  };

  const filtered =
    groupFilter === "all"
      ? summaries
      : summaries.filter((s) => s.category.group === groupFilter);

  return (
    <div className="space-y-4 pb-6">
      {/* Pinning Guidance Strip */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600 shadow-2xs">
        <span className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
          <span>
            {copy.pinGuideText} (
            <strong>{pinnedCategoryIds.length}</strong> {copy.pinnedCountLabel})
          </span>
        </span>
        <InfoHint
          align="right"
          title={lang === "bm" ? "Semat Pelepasan Kegemaran" : "Pin Your Favorite Reliefs"}
          text={
            lang === "bm"
              ? "Sembunyikan had yang anda tidak guna dan semat had yang penting untuk profil anda (cth: Gaya Hidup, Perubatan, SSPN, Taska, atau Faedah Rumah Pertama)."
              : "Hide caps you don't use and pin the ones that matter to your life stage (e.g. Lifestyle, Medical, SSPN, Childcare, or First-Home Interest)."
          }
        />
      </div>

      {/* Group Filter Pills */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {GROUP_FILTERS.map((f) => {
          const active = groupFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setGroupFilter(f.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {groupLabels[f.id] || f.label}
            </button>
          );
        })}
      </div>

      {/* Form e-BE Audit Tally Summary Banner */}
      {beAudit && formBeBaseline && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-900">
                {lang === "bm"
                  ? `Penyesuaian Borang e-BE TT ${taxYear}`
                  : `YA ${taxYear} Form e-BE Audit Tally`}
              </span>
              {formBeBaseline.filingReferenceNo && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {formBeBaseline.filingReferenceNo}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                  beAudit.isAuditReady ? "bg-emerald-600" : "bg-amber-600"
                }`}
              >
                {beAudit.verifiedCategoryCount}/{beAudit.declaredCategoryCount}{" "}
                {lang === "bm" ? "disahkan" : "verified"}
              </span>
              {beAudit.totalUnclaimedExtra > 0 && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  +{formatRM(beAudit.totalUnclaimedExtra, true)}{" "}
                  {lang === "bm" ? "belum tuntut" : "unclaimed"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600">
              {lang === "bm" ? "Diisytihar e-BE" : "Declared on e-BE"}:{" "}
              <strong>{formatRM(beAudit.totalDeclaredExpenseReliefs, true)}</strong> •{" "}
              {lang === "bm" ? "Bukti Sah" : "Backed Proof"}:{" "}
              <strong>{formatRM(beAudit.totalVerifiedClaimable, true)}</strong>
              {beAudit.totalShortfall > 0 && (
                <>
                  {" "}
                  •{" "}
                  <span className="font-semibold text-amber-700">
                    {lang === "bm" ? "Kurang bukti" : "Short"}{" "}
                    {formatRM(beAudit.totalShortfall, true)}
                  </span>
                </>
              )}
            </p>
          </div>
          {onOpenAuditTally && (
            <button
              type="button"
              onClick={onOpenAuditTally}
              className="shrink-0 rounded-xl bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95"
            >
              {lang === "bm" ? "Jadual Penuh" : "Full Audit Tally"}
            </button>
          )}
        </div>
      )}

      {/* Category Cards */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.category.id;
          const isMaxed = item.percentUsed >= 100;
          const hasSubLimits = item.subSummaries.length > 0;
          const potentialTaxSavings = Math.round(item.remaining * marginalRate);
          const catAudit = beAudit?.byCategory[item.category.id];

          return (
            <div
              key={item.category.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedId(isExpanded ? null : item.category.id)
                }
                className="w-full p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`mt-0.5 rounded-xl p-2 ${
                        isMaxed
                          ? "bg-emerald-100 text-emerald-700"
                          : item.claimable > 0
                          ? "bg-teal-50 text-teal-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <ReliefIcon name={item.category.icon} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          {item.category.formBeRef}
                        </span>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {tCategory(item.category).name}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {tCategory(item.category).description}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-slate-400">
                    <span
                      role="button"
                      tabIndex={0}
                      title={
                        pinnedCategoryIds.includes(item.category.id)
                          ? lang === "bm"
                            ? "Disemat di Utama (ketik untuk buang)"
                            : "Pinned to Dashboard (tap to unpin)"
                          : lang === "bm"
                            ? "Semat ke Utama"
                            : "Pin to Dashboard"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePinCategory(item.category.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onTogglePinCategory(item.category.id);
                        }
                      }}
                      className={`rounded-lg p-1.5 transition ${
                        pinnedCategoryIds.includes(item.category.id)
                          ? "bg-amber-50 text-amber-500 hover:bg-amber-100"
                          : "text-slate-300 hover:bg-slate-100 hover:text-amber-500"
                      }`}
                    >
                      <Star
                        className={`h-4 w-4 ${
                          pinnedCategoryIds.includes(item.category.id)
                            ? "fill-amber-400 text-amber-500"
                            : ""
                        }`}
                      />
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>

                {/* Progress Bar & Stats */}
                <div className="mt-3.5 space-y-1.5">
                  <div className="flex items-baseline justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">
                        {formatRM(item.claimable)}
                      </span>
                      <span className="text-slate-400">
                        {lang === "bm" ? "drp" : "of"}{" "}
                        {formatRM(item.category.maxLimit)}
                      </span>
                      {isMaxed && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> {copy.maxedBadge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {item.remaining > 0
                        ? lang === "bm"
                          ? `Baki ${formatRM(item.remaining)}`
                          : `${formatRM(item.remaining)} left`
                        : lang === "bm"
                        ? "Had penuh"
                        : "Cap reached"}
                    </span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isMaxed ? "bg-emerald-500" : "bg-emerald-600"
                      }`}
                      style={{ width: `${item.percentUsed}%` }}
                    />
                  </div>

                  {item.overflow > 0 && (
                    <p className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {lang === "bm"
                        ? `Dibelanjakan ${formatRM(item.spent)} — ${formatRM(item.overflow)} melebihi had LHDN`
                        : `Spent ${formatRM(item.spent)} — ${formatRM(item.overflow)} exceeds LHDN cap / sub-limit`}
                    </p>
                  )}

                  {catAudit && (catAudit.declared > 0 || catAudit.verifiedRaw > 0) && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-[11px]">
                      <span className="text-slate-600">
                        <strong className="text-slate-800">e-BE:</strong>{" "}
                        {formatRM(catAudit.declared, true)} •{" "}
                        <strong className="text-slate-800">
                          {lang === "bm" ? "Bukti:" : "Proof:"}
                        </strong>{" "}
                        {formatRM(catAudit.verifiedClaimable, true)}
                        {catAudit.excessAboveCap > 0 && (
                          <span className="text-[10px] text-slate-400">
                            {" "}
                            ({formatRM(catAudit.verifiedRaw, true)}{" "}
                            {lang === "bm" ? "jumlah resit" : "uploaded"})
                          </span>
                        )}
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {catAudit.status === "verified" && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            <CheckCircle2 className="h-2.5 w-2.5" />{" "}
                            {lang === "bm" ? "Sepadan e-BE" : "Tallies with e-BE"}
                          </span>
                        )}
                        {catAudit.status === "shortfall" && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            {lang === "bm" ? "Kurang" : "Short"}{" "}
                            {formatRM(catAudit.shortfall, true)}
                          </span>
                        )}
                        {catAudit.unclaimedExtra > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            +{formatRM(catAudit.unclaimedExtra, true)}{" "}
                            {lang === "bm" ? "belum tuntut" : "unclaimed"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </button>

              {/* Expanded Details: Nested Sub-limits + Tips + Quick Add */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-3.5">
                  {hasSubLimits && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {lang === "bm"
                          ? "Sub-Kategori & Had Khusus"
                          : "Sub-Categories & Sub-Limits"}
                      </p>
                      {item.subSummaries.map((sub) => {
                        const subKey = `${item.category.id}:${sub.subCategory.id}`;
                        const subExpenses = yearExpenses.filter(
                          (e) =>
                            e.categoryId === item.category.id &&
                            e.subCategoryId === sub.subCategory.id
                        );
                        const isSubReceiptsOpen = Boolean(
                          expandedReceiptLists[subKey]
                        );
                        return (
                        <div
                          key={sub.subCategory.id}
                          className="rounded-xl border border-slate-200/80 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900">
                                {tSubCategory(sub.subCategory)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {tSubCategoryDesc(sub.subCategory)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onAddExpenseForCategory(
                                  item.category.id,
                                  sub.subCategory.id
                                )
                              }
                              className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 active:scale-95"
                            >
                              {lang === "bm" ? "+ Rekod" : "+ Log"}
                            </button>
                          </div>

                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-800">
                                {formatRM(sub.claimable)}{" "}
                                <span className="font-normal text-slate-400">
                                  / {formatRM(sub.subCategory.maxLimit)}{" "}
                                  {lang === "bm" ? "sub-had" : "sub-cap"}
                                </span>
                              </span>
                              {subExpenses.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleReceiptList(subKey)}
                                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-50 active:scale-95"
                                >
                                  <span>
                                    {sub.expenseCount}{" "}
                                    {lang === "bm"
                                      ? "resit"
                                      : sub.expenseCount === 1
                                      ? "receipt"
                                      : "receipts"}
                                  </span>
                                  {isSubReceiptsOpen ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}
                                </button>
                              ) : (
                                <span className="text-slate-500">
                                  {sub.expenseCount}{" "}
                                  {lang === "bm"
                                    ? "resit"
                                    : sub.expenseCount === 1
                                    ? "receipt"
                                    : "receipts"}
                                </span>
                              )}
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${
                                  sub.overflow > 0
                                    ? "bg-amber-500"
                                    : "bg-teal-500"
                                }`}
                                style={{ width: `${sub.percentUsed}%` }}
                              />
                            </div>
                            {sub.overflow > 0 && (
                              <p className="text-[10px] font-medium text-amber-700">
                                {lang === "bm"
                                  ? `Melebihi sub-had sebanyak ${formatRM(sub.overflow)}`
                                  : `Over sub-limit by ${formatRM(sub.overflow)}`}
                              </p>
                            )}
                          </div>
                          {isSubReceiptsOpen && renderReceiptRows(subExpenses)}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {(() => {
                    const subIds = new Set(
                      item.subSummaries.map((s) => s.subCategory.id)
                    );
                    const categoryLevelExpenses = yearExpenses.filter(
                      (e) =>
                        e.categoryId === item.category.id &&
                        (!hasSubLimits ||
                          !e.subCategoryId ||
                          !subIds.has(e.subCategoryId))
                    );
                    if (categoryLevelExpenses.length === 0) return null;
                    const catKey = `${item.category.id}:__category`;
                    const isCatReceiptsOpen = Boolean(
                      expandedReceiptLists[catKey]
                    );
                    return (
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                        <button
                          type="button"
                          onClick={() => toggleReceiptList(catKey)}
                          className="flex w-full items-center justify-between text-left"
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            {lang === "bm"
                              ? `Resit Dilampirkan (${categoryLevelExpenses.length})`
                              : `Uploaded Receipts (${categoryLevelExpenses.length})`}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            {isCatReceiptsOpen
                              ? lang === "bm"
                                ? "Sembunyi"
                                : "Hide"
                              : lang === "bm"
                              ? "Lihat"
                              : "Show"}
                            {isCatReceiptsOpen ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </span>
                        </button>
                        {isCatReceiptsOpen &&
                          renderReceiptRows(categoryLevelExpenses)}
                      </div>
                    );
                  })()}

                  {/* Tip Box */}
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-50/80 p-3 text-xs text-emerald-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-medium">{tCategoryTips(item.category)}</p>
                      {item.remaining > 0 && marginalRate > 0 && (
                        <p className="mt-1 text-[11px] text-emerald-700">
                          {lang === "bm" ? (
                            <>
                              Memaksimumkan baki{" "}
                              {formatRM(item.remaining)} boleh menjimatkan
                              sehingga{" "}
                              <strong>{formatRM(potentialTaxSavings)}</strong>{" "}
                              cukai pada kadar{" "}
                              {Math.round(marginalRate * 100)}% anda.
                            </>
                          ) : (
                            <>
                              Maximizing the remaining{" "}
                              {formatRM(item.remaining)} could save up to{" "}
                              <strong>{formatRM(potentialTaxSavings)}</strong>{" "}
                              in tax at your {Math.round(marginalRate * 100)}%
                              bracket.
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Add Button */}
                  <button
                    type="button"
                    onClick={() => onAddExpenseForCategory(item.category.id)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white active:scale-[0.99]"
                  >
                    <Plus className="h-4 w-4" />
                    {lang === "bm"
                      ? `Tambah Resit ke ${tCategory(item.category).shortName}`
                      : `Add Receipt to ${tCategory(item.category).shortName}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ReceiptPreviewModal
        expense={previewExpense}
        onClose={() => setPreviewExpense(null)}
      />
    </div>
  );
}
