"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Plus,
} from "lucide-react";
import { formatRM } from "@/lib/calculator";
import { CategorySummary } from "@/lib/types";
import { ReliefIcon } from "./ReliefIcon";

interface ReliefsTabProps {
  summaries: CategorySummary[];
  marginalRate: number;
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
  summaries,
  marginalRate,
  onAddExpenseForCategory,
}: ReliefsTabProps) {
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>("medical_self");

  const filtered =
    groupFilter === "all"
      ? summaries
      : summaries.filter((s) => s.category.group === groupFilter);

  return (
    <div className="space-y-4 pb-6">
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
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Category Cards */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.category.id;
          const isMaxed = item.percentUsed >= 100;
          const hasSubLimits = item.subSummaries.length > 0;
          const potentialTaxSavings = Math.round(item.remaining * marginalRate);

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
                          {item.category.name}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {item.category.description}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-slate-400">
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
                        of {formatRM(item.category.maxLimit)}
                      </span>
                      {isMaxed && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Maxed
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {item.remaining > 0
                        ? `${formatRM(item.remaining)} left`
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
                      Spent {formatRM(item.spent)} — {formatRM(item.overflow)}{" "}
                      exceeds LHDN cap / sub-limit
                    </p>
                  )}
                </div>
              </button>

              {/* Expanded Details: Nested Sub-limits + Tips + Quick Add */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-3.5">
                  {hasSubLimits && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Sub-Categories & Sub-Limits
                      </p>
                      {item.subSummaries.map((sub) => (
                        <div
                          key={sub.subCategory.id}
                          className="rounded-xl border border-slate-200/80 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900">
                                {sub.subCategory.name}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {sub.subCategory.description}
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
                              + Log
                            </button>
                          </div>

                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-semibold text-slate-800">
                                {formatRM(sub.claimable)}{" "}
                                <span className="font-normal text-slate-400">
                                  / {formatRM(sub.subCategory.maxLimit)} sub-cap
                                </span>
                              </span>
                              <span className="text-slate-500">
                                {sub.expenseCount}{" "}
                                {sub.expenseCount === 1 ? "receipt" : "receipts"}
                              </span>
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
                                Over sub-limit by {formatRM(sub.overflow)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tip Box */}
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-50/80 p-3 text-xs text-emerald-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-medium">{item.category.tips}</p>
                      {item.remaining > 0 && marginalRate > 0 && (
                        <p className="mt-1 text-[11px] text-emerald-700">
                          Maximizing the remaining {formatRM(item.remaining)} could
                          save up to{" "}
                          <strong>{formatRM(potentialTaxSavings)}</strong> in tax at
                          your {Math.round(marginalRate * 100)}% bracket.
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
                    Add Receipt to {item.category.shortName}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
