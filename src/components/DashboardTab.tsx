"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Camera,
  CheckCircle2,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { formatRM } from "@/lib/calculator";
import { TaxCalculationResult } from "@/lib/types";
import { ReliefIcon } from "./ReliefIcon";

interface DashboardTabProps {
  summary: TaxCalculationResult;
  expenseCount: number;
  missingReceiptsTotal: number;
  onQuickAdd: (categoryId?: string) => void;
  onNavigateTab: (tab: "reliefs" | "receipts" | "settings") => void;
  onLoadSampleData: () => void;
}

export function DashboardTab({
  summary,
  expenseCount,
  missingReceiptsTotal,
  onQuickAdd,
  onNavigateTab,
  onLoadSampleData,
}: DashboardTabProps) {
  const activeCategories = summary.categorySummaries
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.percentUsed - a.percentUsed);

  return (
    <div className="space-y-4 pb-6">
      {/* Hero Tax Savings Card */}
      <section className="rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white shadow-lg shadow-emerald-900/15">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-100/90">
              YA {summary.taxYear} Total Claimable Reliefs
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {formatRM(summary.totalReliefs)}
            </p>
            <p className="mt-0.5 text-xs text-emerald-100/85">
              {formatRM(summary.statusReliefTotal)} status +{" "}
              {formatRM(summary.expenseReliefClaimable)} receipts
            </p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-1.5 text-right backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-wider text-emerald-100">
              Tax Bracket
            </p>
            <p className="text-lg font-bold">
              {Math.round(summary.marginalRate * 100)}%
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-emerald-100">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Tax Saved (Receipts)</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">
              {formatRM(summary.taxSavedByExpenseReliefs)}
            </p>
          </div>

          <div className="rounded-xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-emerald-100">
              <Wallet className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">
                {summary.estimatedRefund >= 0 ? "Est. LHDN Refund" : "Est. Balance Due"}
              </span>
            </div>
            <p
              className={`mt-1 text-lg font-bold ${
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
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Maximize Your Reliefs
              </h2>
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
        <div className="mt-3 space-y-2 text-xs">
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
  );
}
