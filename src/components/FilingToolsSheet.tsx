"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Plus,
  Repeat,
  Scale,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { calculateProgressiveTax, formatRM } from "@/lib/calculator";
import { useLanguage } from "@/lib/language-context";
import { getReliefCategories, getStatusReliefAmounts } from "@/lib/lhdn-rules";
import {
  FormBeBaseline,
  TaxCalculationResult,
  TaxExpense,
  TaxProfile,
} from "@/lib/types";

export type FilingToolTab =
  | "form-be"
  | "year-end"
  | "what-if"
  | "joint-vs-separate";

interface FilingToolsSheetProps {
  isOpen: boolean;
  initialTab: FilingToolTab;
  profile: TaxProfile;
  summary: TaxCalculationResult;
  expenses: TaxExpense[];
  formBeBaseline?: FormBeBaseline | null;
  onClearFormBeBaseline?: () => void;
  onClose: () => void;
  onQuickAdd: (categoryId?: string, subCategoryId?: string) => void;
  onQuickLogTemplate: (template: {
    categoryId: string;
    subCategoryId?: string | null;
    merchant: string;
    description: string;
    amount: number;
  }) => Promise<void>;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTHS_BM = [
  "Jan",
  "Feb",
  "Mac",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Ogos",
  "Sep",
  "Okt",
  "Nov",
  "Dis",
];

const RECURRING_LABELS_BM: Record<string, string> = {
  unifi: "Fibre Rumah / Jalur Lebar",
  gym: "Keahlian Gim / Sukan",
  med_ins: "Insurans Kad Perubatan",
  childcare: "Taska / Tadika",
  prs: "Tokok Akhir Tahun PRS",
  sspn: "Deposit Bersih SSPN",
};

const RECURRING_TEMPLATES = [
  {
    id: "unifi",
    label: "Home Fibre / Broadband",
    merchant: "TM Unifi / TIME Fibre",
    description: "Monthly home internet subscription",
    categoryId: "lifestyle",
    subCategoryId: "lifestyle_internet",
    defaultAmount: 149,
  },
  {
    id: "gym",
    label: "Gym / Sports Membership",
    merchant: "Gym Membership",
    description: "Monthly gym / sports facility membership",
    categoryId: "sports",
    subCategoryId: "sports_gym",
    defaultAmount: 180,
  },
  {
    id: "med_ins",
    label: "Medical Card Insurance",
    merchant: "Medical Card / Takaful",
    description: "Monthly medical insurance premium",
    categoryId: "edu_med_insurance",
    subCategoryId: null,
    defaultAmount: 250,
  },
  {
    id: "childcare",
    label: "Childcare (TASKA / TADIKA)",
    merchant: "TASKA / TADIKA",
    description: "Monthly registered childcare / kindergarten fee",
    categoryId: "childcare",
    subCategoryId: null,
    defaultAmount: 550,
  },
  {
    id: "prs",
    label: "PRS Year-End Top-Up",
    merchant: "Private Retirement Scheme (PRS)",
    description: "Annual PRS retirement contribution",
    categoryId: "prs_annuity",
    subCategoryId: null,
    defaultAmount: 3000,
  },
  {
    id: "sspn",
    label: "SSPN Net Deposit",
    merchant: "Simpan SSPN (PTPTN)",
    description: "Education savings net deposit",
    categoryId: "sspn",
    subCategoryId: null,
    defaultAmount: 1000,
  },
];

export function FilingToolsSheet({
  isOpen,
  initialTab,
  profile,
  summary,
  expenses,
  formBeBaseline,
  onClearFormBeBaseline,
  onClose,
  onQuickAdd,
  onQuickLogTemplate,
}: FilingToolsSheetProps) {
  const { lang, tCategory } = useLanguage();
  const [activeTab, setActiveTab] = useState<FilingToolTab>(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [loggedId, setLoggedId] = useState<string | null>(null);

  // Joint vs Separate Simulator state
  const [spouseIncome, setSpouseIncome] = useState("60000");
  const [spouseReliefs, setSpouseReliefs] = useState("15000");

  // Interactive "What-If" Tax Bracket Simulator sliders
  const [extraPrs, setExtraPrs] = useState(0);
  const [extraLifestyleSports, setExtraLifestyleSports] = useState(0);
  const [extraSspn, setExtraSspn] = useState(0);
  const [extraDonations, setExtraDonations] = useState(0);
  const [extraZakat, setExtraZakat] = useState(0);

  // Sync initialTab when opened
  useMemo(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const yearExpenses = expenses.filter((e) => e.taxYear === profile.taxYear);
  const statusAmounts = getStatusReliefAmounts(profile.taxYear);

  // Broadband 12-month coverage tracker
  const broadbandMonths = new Set<number>();
  for (const exp of yearExpenses) {
    if (
      exp.categoryId === "lifestyle" &&
      exp.subCategoryId === "lifestyle_internet" &&
      /^\d{4}-\d{2}/.test(exp.expenseDate)
    ) {
      const m = Number(exp.expenseDate.slice(5, 7));
      if (m >= 1 && m <= 12) broadbandMonths.add(m);
    }
  }

  // Days left until 31 Dec of taxYear
  const now = new Date();
  const cutoff = new Date(profile.taxYear, 11, 31, 23, 59, 59);
  const daysLeft = Math.max(
    0,
    Math.ceil((cutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  function copyValue(key: string, val: number) {
    const text = val.toFixed(2);
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // Form BE ordered rows
  const formBeRows = [
    {
      ref: "F1",
      label:
        lang === "bm"
          ? "Individu dan saudara tanggungan"
          : "Individual and dependent relatives",
      amount: profile.statusReliefs.individual ? statusAmounts.individual : 0,
      max: statusAmounts.individual,
    },
    ...(profile.statusReliefs.disabledIndividual
      ? [
          {
            ref: "F1a",
            label:
              lang === "bm"
                ? "Individu kurang upaya (OKU)"
                : "Disabled individual (OKU)",
            amount: statusAmounts.disabledIndividual,
            max: statusAmounts.disabledIndividual,
          },
        ]
      : []),
    ...(profile.statusReliefs.spouse
      ? [
          {
            ref: "F7",
            label:
              lang === "bm"
                ? "Suami / Isteri / Nafkah"
                : "Husband / Wife / Alimony",
            amount: statusAmounts.spouse,
            max: statusAmounts.spouse,
          },
        ]
      : []),
    ...(profile.statusReliefs.disabledSpouse
      ? [
          {
            ref: "F7a",
            label:
              lang === "bm"
                ? "Pasangan kurang upaya (OKU)"
                : "Disabled spouse (OKU)",
            amount: statusAmounts.disabledSpouse,
            max: statusAmounts.disabledSpouse,
          },
        ]
      : []),
    ...(profile.statusReliefs.childrenUnder18 +
      profile.statusReliefs.childrenHigherEd +
      profile.statusReliefs.disabledChildren >
    0
      ? [
          {
            ref: "F8",
            label: lang === "bm" ? "Pelepasan anak (jumlah)" : "Child relief (total)",
            amount:
              profile.statusReliefs.childrenUnder18 * statusAmounts.childUnder18 +
              profile.statusReliefs.childrenHigherEd *
                statusAmounts.childHigherEd +
              profile.statusReliefs.disabledChildren *
                statusAmounts.disabledChild,
            max: 0,
          },
        ]
      : []),
    ...summary.categorySummaries
      .slice()
      .sort((a, b) => {
        const numA = parseInt(a.category.formBeRef.replace(/\D/g, ""), 10) || 99;
        const numB = parseInt(b.category.formBeRef.replace(/\D/g, ""), 10) || 99;
        return numA - numB;
      })
      .map((c) => ({
        ref: c.category.formBeRef,
        label: tCategory(c.category).name,
        amount: c.claimable,
        max: c.category.maxLimit,
      })),
  ];

  // Joint vs Separate Assessment Calculation
  const sIncome = Math.max(0, parseFloat(spouseIncome) || 0);
  const sReliefs = Math.max(9000, parseFloat(spouseReliefs) || 9000);

  // Separate: each taxed on own chargeable income
  const selfChargeable = summary.chargeableIncome;
  const spouseChargeable = Math.max(0, sIncome - sReliefs);
  const selfTaxSep = calculateProgressiveTax(selfChargeable);
  const spouseTaxSep = calculateProgressiveTax(spouseChargeable);
  const sepRebateSelf =
    selfChargeable > 0 && selfChargeable <= 35000 ? 400 : 0;
  const sepRebateSpouse =
    spouseChargeable > 0 && spouseChargeable <= 35000 ? 400 : 0;
  const totalSeparateTax =
    Math.max(0, selfTaxSep.tax - sepRebateSelf - summary.zakatRebate) +
    Math.max(0, spouseTaxSep.tax - sepRebateSpouse);

  // Joint: combined income, 1 individual relief + RM4,000 spouse relief + combined expense reliefs (capped roughly)
  const combinedIncome = summary.annualIncome + sIncome;
  const jointReliefs =
    summary.totalReliefs +
    (profile.statusReliefs.spouse ? 0 : statusAmounts.spouse);
  const jointChargeable = Math.max(0, combinedIncome - jointReliefs);
  const jointTaxRaw = calculateProgressiveTax(jointChargeable);
  const jointRebate =
    jointChargeable > 0 && jointChargeable <= 35000 ? 800 : 0;
  const totalJointTax = Math.max(
    0,
    jointTaxRaw.tax - jointRebate - summary.zakatRebate
  );

  const separateSaves = totalJointTax - totalSeparateTax;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {lang === "bm"
                ? "Alat e-Filing LHDN & Maksimum Cukai"
                : "LHDN Filing & Tax Maximizer Tools"}
            </h2>
            <p className="text-xs text-slate-500">
              {lang === "bm"
                ? `TT ${profile.taxYear} • e-Filing, bil berulang & simulator isi rumah`
                : `YA ${profile.taxYear} • e-Filing, recurring bills & household simulator`}
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

        {/* Tool Tabs */}
        <div className="grid grid-cols-4 gap-1 border-b border-slate-100 bg-slate-50 p-2">
          <button
            type="button"
            onClick={() => setActiveTab("form-be")}
            className={`flex items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold transition ${
              activeTab === "form-be"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-white"
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {lang === "bm" ? "Borang BE" : "Form BE"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("year-end")}
            className={`flex items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold transition ${
              activeTab === "year-end"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-white"
            }`}
          >
            <Repeat className="h-3.5 w-3.5" />
            {lang === "bm" ? "Hujung Tahun" : "Year-End"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("what-if")}
            className={`flex items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold transition ${
              activeTab === "what-if"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-white"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {lang === "bm" ? "Simulasi" : "What-If"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("joint-vs-separate")}
            className={`flex items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold transition ${
              activeTab === "joint-vs-separate"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-white"
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            {lang === "bm" ? "Bersama/Asing" : "Joint/Sep"}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: FORM BE e-FILING CHEAT SHEET + AUDIT RECONCILIATION */}
          {activeTab === "form-be" && (
            <div className="space-y-4">
              {/* Form BE Audit Reconciliation Card (when a Form BE PDF has been uploaded) */}
              {formBeBaseline && (() => {
                const cats = getReliefCategories(profile.taxYear);
                const catMap = new Map(cats.map((c) => [c.id, c]));
                // Sum ONLY verified receipts (expenses that actually have a receipt file attached)
                const verifiedByCat: Record<string, number> = {};
                for (const exp of yearExpenses) {
                  if (exp.receiptUrl || exp.receiptPath) {
                    verifiedByCat[exp.categoryId] =
                      (verifiedByCat[exp.categoryId] || 0) + exp.amount;
                  }
                }
                const allCatIds = Array.from(
                  new Set([
                    ...Object.keys(formBeBaseline.declaredByCategory),
                    ...Object.keys(verifiedByCat),
                  ])
                );
                const rows = allCatIds
                  .map((catId) => {
                    const declared = formBeBaseline.declaredByCategory[catId] || 0;
                    const verified = verifiedByCat[catId] || 0;
                    const diff = verified - declared;
                    const cat = catMap.get(catId);
                    return {
                      catId,
                      ref: cat?.formBeRef || "BE",
                      name: cat ? tCategory(cat).shortName : catId,
                      declared,
                      verified,
                      diff,
                    };
                  })
                  .filter((r) => r.declared > 0 || r.verified > 0);

                const declaredCount = rows.filter((r) => r.declared > 0).length;
                const coveredCount = rows.filter(
                  (r) => r.declared > 0 && r.verified >= r.declared - 0.01
                ).length;
                const totalShortfall = rows.reduce(
                  (s, r) => (r.declared > r.verified ? s + (r.declared - r.verified) : s),
                  0
                );

                return (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          {lang === "bm"
                            ? `Penyesuaian Audit Borang BE (${coveredCount}/${declaredCount} disahkan)`
                            : `Form BE Audit Reconciliation (${coveredCount}/${declaredCount} verified)`}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {lang === "bm" ? (
                            <>
                              Membandingkan jumlah diisytihar daripada{" "}
                              <strong>{formBeBaseline.uploadedFileName}</strong> berbanding resit sokongan dimuat naik.
                            </>
                          ) : (
                            <>
                              Comparing declared totals from{" "}
                              <strong>{formBeBaseline.uploadedFileName}</strong> vs. uploaded supporting receipts.
                            </>
                          )}
                        </p>
                      </div>
                      {onClearFormBeBaseline && (
                        <button
                          type="button"
                          onClick={onClearFormBeBaseline}
                          className="text-[10px] font-semibold text-slate-400 hover:text-rose-600"
                        >
                          {lang === "bm" ? "Padam" : "Clear"}
                        </button>
                      )}
                    </div>

                    {totalShortfall > 0 ? (
                      <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                        {lang === "bm"
                          ? `${formatRM(totalShortfall, true)} diisytihar pada Borang BE masih memerlukan resit sokongan.`
                          : `${formatRM(totalShortfall, true)} declared on Form BE still needs supporting receipts.`}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                        {lang === "bm"
                          ? "100% pelepasan Borang BE anda disokong oleh resit yang dimuat naik!"
                          : "100% of your declared Form BE reliefs are backed by uploaded receipts!"}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {rows.map((r) => {
                        const isShort = r.declared > 0 && r.verified < r.declared - 0.01;
                        const isExtra = r.declared === 0 && r.verified > 0;
                        return (
                          <div
                            key={r.catId}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[9px] font-bold text-slate-700">
                                  {r.ref}
                                </span>
                                <span className="truncate font-semibold text-slate-900">
                                  {r.name}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                {lang === "bm" ? "Borang BE" : "Form BE"}: {formatRM(r.declared, true)} •{" "}
                                {lang === "bm" ? "Resit" : "Receipts"}: {formatRM(r.verified, true)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {isShort ? (
                                <>
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                    {lang === "bm" ? "Kurang" : "Short"} {formatRM(r.declared - r.verified)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onQuickAdd(r.catId);
                                    }}
                                    className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white"
                                  >
                                    {lang === "bm" ? "+ Bukti" : "+ Proof"}
                                  </button>
                                </>
                              ) : isExtra ? (
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                                  {lang === "bm" ? "Belum Tuntut" : "Unclaimed"} +{formatRM(r.verified)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3" /> {lang === "bm" ? "Disahkan" : "Verified"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="rounded-2xl bg-emerald-50 p-3.5 text-xs text-emerald-950">
                <p className="font-bold">
                  {lang === "bm"
                    ? `Sedia untuk e-Filing MyTax (Borang BE — TT ${profile.taxYear})`
                    : `Ready for MyTax e-Filing (Form BE — YA ${profile.taxYear})`}
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-800">
                  {lang === "bm" ? (
                    <>
                      Ketik <strong>Salin</strong> pada mana-mana kotak di bawah untuk tampal terus ke MyTax e-BE LHDN. Jumlah pelepasan:{" "}
                      <strong>{formatRM(summary.totalReliefs, true)}</strong>.
                    </>
                  ) : (
                    <>
                      Tap <strong>Copy</strong> on any box below to paste straight into LHDN MyTax e-BE. Total reliefs:{" "}
                      <strong>{formatRM(summary.totalReliefs, true)}</strong>.
                    </>
                  )}
                </p>
              </div>

              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                {formBeRows.map((row) => {
                  const isCopied = copiedKey === row.ref;
                  return (
                    <div
                      key={row.ref}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                            {row.ref}
                          </span>
                          <p className="truncate text-xs font-medium text-slate-800">
                            {row.label}
                          </p>
                        </div>
                        {row.max > 0 && (
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {lang === "bm" ? "Had maks" : "Max cap"} {formatRM(row.max)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold ${
                            row.amount > 0 ? "text-slate-900" : "text-slate-300"
                          }`}
                        >
                          {formatRM(row.amount, true)}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyValue(row.ref, row.amount)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                            isCopied
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3" /> {lang === "bm" ? "Disalin" : "Copied"}
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" /> {lang === "bm" ? "Salin" : "Copy"}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Final Summary Totals */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {lang === "bm" ? "Pendapatan Bercukai" : "Chargeable Income"}
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatRM(summary.chargeableIncome, true)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {lang === "bm" ? "Cukai Bersih Perlu Dibayar" : "Net Tax Payable"}
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatRM(summary.netTaxPayable, true)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {lang === "bm" ? "PCB / MTD Telah Dibayar" : "PCB / MTD Paid"}
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatRM(summary.pcbPaid, true)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                  <span>
                    {summary.estimatedRefund >= 0
                      ? lang === "bm"
                        ? "Anggaran Lebihan LHDN (Refund)"
                        : "Estimated LHDN Refund"
                      : lang === "bm"
                        ? "Anggaran Baki Perlu Dibayar"
                        : "Estimated Balance Payable"}
                  </span>
                  <span
                    className={
                      summary.estimatedRefund >= 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }
                  >
                    {formatRM(Math.abs(summary.estimatedRefund), true)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RECURRING BILLS & YEAR-END CHECKLIST */}
          {activeTab === "year-end" && (
            <div className="space-y-4">
              {/* Countdown Banner + Calendar (.ics) Reminders */}
              <div className="space-y-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-emerald-100">
                      {lang === "bm"
                        ? `Kiraan Detik Tutup TT ${profile.taxYear}`
                        : `YA ${profile.taxYear} Cutoff Countdown`}
                    </p>
                    <p className="mt-0.5 text-xl font-bold">
                      {daysLeft > 0
                        ? lang === "bm"
                          ? `${daysLeft} hari lagi hingga 31 Dis ${profile.taxYear}`
                          : `${daysLeft} days left until 31 Dec ${profile.taxYear}`
                        : lang === "bm"
                          ? `Tempoh TT ${profile.taxYear} telah tamat`
                          : `YA ${profile.taxYear} period closed`}
                    </p>
                  </div>
                  <CalendarClock className="h-8 w-8 text-emerald-200" />
                </div>
                <button
                  type="button"
                  onClick={() => downloadLhdnCalendarReminders(profile.taxYear)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/25 active:scale-[0.99]"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {lang === "bm"
                    ? "Tambah Peringatan 15 Dis & 15 Apr ke Kalendar (.ics)"
                    : "Add 15 Dec & 15 Apr Reminders to Calendar (.ics)"}
                </button>
              </div>

              {/* 12-Month Broadband Tracker */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-900">
                    {lang === "bm"
                      ? `Penjejak Jalur Lebar Rumah (${broadbandMonths.size}/12 bulan)`
                      : `Home Broadband Tracker (${broadbandMonths.size}/12 months)`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onQuickAdd("lifestyle", "lifestyle_internet");
                    }}
                    className="text-[11px] font-semibold text-emerald-700"
                  >
                    {lang === "bm" ? "+ Muat Naik Bil" : "+ Upload Bill"}
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {(lang === "bm" ? MONTHS_BM : MONTHS).map((label, idx) => {
                    const logged = broadbandMonths.has(idx + 1);
                    return (
                      <div
                        key={label}
                        className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold ${
                          logged
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {logged && <CheckCircle2 className="h-3 w-3" />}
                        {label}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 1-Tap Recurring Bill Templates */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
                <p className="text-xs font-bold text-slate-900">
                  {lang === "bm"
                    ? "Templat Perbelanjaan Berulang 1-Tap"
                    : "1-Tap Recurring Expense Templates"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {lang === "bm"
                    ? "Rekod perbelanjaan berulang dengan pantas sekarang, kemudian lampirkan PDF/bil dalam Arkib bila-bila masa."
                    : "Quickly log a recurring expense now, then attach the PDF/bill in Vault anytime."}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {RECURRING_TEMPLATES.map((tpl) => {
                    const isJustLogged = loggedId === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {lang === "bm" ? RECURRING_LABELS_BM[tpl.id] ?? tpl.label : tpl.label}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {lang === "bm" ? "Lalai" : "Default"} {formatRM(tpl.defaultAmount)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={loggingId === tpl.id}
                          onClick={async () => {
                            setLoggingId(tpl.id);
                            try {
                              await onQuickLogTemplate({
                                categoryId: tpl.categoryId,
                                subCategoryId: tpl.subCategoryId,
                                merchant: tpl.merchant,
                                description: tpl.description,
                                amount: tpl.defaultAmount,
                              });
                              setLoggedId(tpl.id);
                              setTimeout(() => setLoggedId(null), 1800);
                            } finally {
                              setLoggingId(null);
                            }
                          }}
                          className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                            isJustLogged
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-900 text-white active:scale-95"
                          }`}
                        >
                          {isJustLogged ? (
                            <>
                              <Check className="h-3 w-3" /> {lang === "bm" ? "Direkod" : "Logged"}
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" /> {lang === "bm" ? "Rekod" : "Log"}
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* High-ROI Year-End Opportunities */}
              {summary.opportunities.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    {lang === "bm"
                      ? `Baki Had ROI Tertinggi (pada kadar ${Math.round(summary.marginalRate * 100)}%)`
                      : `Highest-ROI Remaining Caps (at ${Math.round(summary.marginalRate * 100)}% bracket)`}
                  </div>
                  {summary.opportunities.map((o) => {
                    const oppCat = getReliefCategories(profile.taxYear).find(
                      (c) => c.id === o.categoryId
                    );
                    return (
                    <div
                      key={o.categoryId}
                      className="flex items-center justify-between rounded-xl bg-white p-2.5 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {oppCat ? tCategory(oppCat).name : o.categoryName} — {formatRM(o.remainingCap)}{" "}
                          {lang === "bm" ? "baki" : "left"}
                        </p>
                        <p className="text-[11px] text-emerald-700 font-medium">
                          {lang === "bm"
                            ? `Jimat sehingga ${formatRM(o.estimatedTaxSavings)} cukai`
                            : `Saves up to ${formatRM(o.estimatedTaxSavings)} in tax`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onQuickAdd(o.categoryId);
                        }}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                      >
                        {lang === "bm" ? "+ Tambah" : "+ Add"}
                      </button>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INTERACTIVE WHAT-IF TAX BRACKET SIMULATOR */}
          {activeTab === "what-if" && (() => {
            const prsRem =
              summary.categorySummaries.find((c) => c.category.id === "prs_annuity")
                ?.remaining ?? 3000;
            const lsRem =
              (summary.categorySummaries.find((c) => c.category.id === "lifestyle")
                ?.remaining ?? 2500) +
              (summary.categorySummaries.find((c) => c.category.id === "sports")
                ?.remaining ?? 1000);
            const sspnRem =
              summary.categorySummaries.find((c) => c.category.id === "sspn")
                ?.remaining ?? 8000;
            const donRem =
              summary.categorySummaries.find(
                (c) => c.category.id === "approved_donations"
              )?.remaining ?? Math.round(summary.annualIncome * 0.1);

            const totalExtraReliefs =
              extraPrs + extraLifestyleSports + extraSspn + extraDonations;
            const simChargeable = Math.max(
              0,
              summary.chargeableIncome - totalExtraReliefs
            );
            const simTaxObj = calculateProgressiveTax(simChargeable);
            const simSmallRebate =
              simChargeable > 0 && simChargeable <= 35000
                ? profile.statusReliefs.spouse
                  ? 800
                  : 400
                : 0;
            const simNetTax = Math.max(
              0,
              simTaxObj.tax - simSmallRebate - (summary.zakatRebate + extraZakat)
            );
            const extraTaxSaved = Math.max(0, summary.netTaxPayable - simNetTax);
            const simRefund = summary.pcbPaid - simNetTax;
            const droppedBracket = simTaxObj.marginalRate < summary.marginalRate;

            return (
              <div className="space-y-4">
                <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-4 text-white space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-emerald-100">
                        {lang === "bm" ? "Tambahan Cukai Dijimatkan" : "Additional Tax Saved"}
                      </p>
                      <p className="text-2xl font-bold">
                        {formatRM(extraTaxSaved, true)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/15 px-3 py-1.5 text-right">
                      <p className="text-[10px] uppercase text-emerald-100">
                        {lang === "bm" ? "Kadar Cukai" : "Tax Bracket"}
                      </p>
                      <p className="text-sm font-bold">
                        {Math.round(summary.marginalRate * 100)}% →{" "}
                        <span
                          className={
                            droppedBracket ? "text-amber-200" : "text-white"
                          }
                        >
                          {Math.round(simTaxObj.marginalRate * 100)}%
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/15 pt-2 text-xs text-emerald-100">
                    <span>
                      {lang === "bm"
                        ? simRefund >= 0
                          ? "Anggaran Lebihan Baharu"
                          : "Anggaran Baki Baharu"
                        : `New Est. ${simRefund >= 0 ? "Refund" : "Balance Due"}`}
                      :{" "}
                      <strong className="text-white">
                        {formatRM(Math.abs(simRefund), true)}
                      </strong>
                    </span>
                    {droppedBracket && (
                      <span className="rounded-full bg-amber-400/25 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                        {lang === "bm" ? "Kadar Cukai Turun!" : "Bracket Dropped!"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <SliderRow
                    label={lang === "bm" ? "Tokok Tambahan PRS" : "Extra PRS Top-Up"}
                    value={extraPrs}
                    max={Math.max(0, Math.round(prsRem))}
                    step={100}
                    onChange={setExtraPrs}
                  />
                  <SliderRow
                    label={
                      lang === "bm"
                        ? "Tambahan Gaya Hidup / Sukan"
                        : "Extra Lifestyle / Sports"
                    }
                    value={extraLifestyleSports}
                    max={Math.max(0, Math.round(lsRem))}
                    step={100}
                    onChange={setExtraLifestyleSports}
                  />
                  <SliderRow
                    label={
                      lang === "bm"
                        ? "Tambahan Deposit Bersih SSPN"
                        : "Extra SSPN Net Deposit"
                    }
                    value={extraSspn}
                    max={Math.max(0, Math.round(sspnRem))}
                    step={250}
                    onChange={setExtraSspn}
                  />
                  <SliderRow
                    label={
                      lang === "bm"
                        ? "Tambahan Derma Sek. 44(6)"
                        : "Extra Sec. 44(6) Donations"
                    }
                    value={extraDonations}
                    max={Math.min(15000, Math.max(0, Math.round(donRem)))}
                    step={100}
                    onChange={setExtraDonations}
                  />
                  <SliderRow
                    label={
                      lang === "bm"
                        ? "Tambahan Zakat / Fitrah (Rebat Terus)"
                        : "Extra Zakat / Fitrah (Direct Rebate)"
                    }
                    value={extraZakat}
                    max={Math.max(500, Math.round(summary.netTaxPayable))}
                    step={50}
                    onChange={setExtraZakat}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setExtraPrs(0);
                      setExtraLifestyleSports(0);
                      setExtraSspn(0);
                      setExtraDonations(0);
                      setExtraZakat(0);
                    }}
                    className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600"
                  >
                    {lang === "bm" ? "Set Semula Gelangsar" : "Reset Sliders"}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* TAB 4: JOINT VS SEPARATE ASSESSMENT OPTIMIZER */}
          {activeTab === "joint-vs-separate" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                {lang === "bm" ? (
                  <>
                    Bandingkan jumlah cukai pendapatan isi rumah Malaysia di bawah{" "}
                    <strong>Taksiran Berasingan</strong> berbanding{" "}
                    <strong>Taksiran Bersama</strong> (menggunakan angka TT{" "}
                    {profile.taxYear} anda + anggaran pasangan).
                  </>
                ) : (
                  <>
                    Compare total Malaysian household income tax under{" "}
                    <strong>Separate Assessment</strong> vs{" "}
                    <strong>Joint Assessment</strong> (using your YA{" "}
                    {profile.taxYear} figures + your spouse&apos;s estimates).
                  </>
                )}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {lang === "bm"
                      ? "Pendapatan Tahunan Pasangan (RM)"
                      : "Spouse Annual Income (RM)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={spouseIncome}
                    onChange={(e) => setSpouseIncome(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {lang === "bm"
                      ? "Jumlah Pelepasan Pasangan (RM)"
                      : "Spouse Total Reliefs (RM)"}
                  </label>
                  <input
                    type="number"
                    min="9000"
                    step="500"
                    value={spouseReliefs}
                    onChange={(e) => setSpouseReliefs(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                  />
                </div>
              </div>

              {/* Verdict Card */}
              <div
                className={`rounded-2xl border p-4 ${
                  separateSaves >= 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-indigo-200 bg-indigo-50 text-indigo-950"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  {lang === "bm" ? "Kaedah e-Filing Disyorkan" : "Recommended Filing Method"}
                </p>
                <p className="mt-1 text-lg font-bold">
                  {separateSaves >= 0
                    ? lang === "bm"
                      ? `Taksiran Berasingan jimat ${formatRM(separateSaves, true)}`
                      : `Separate Assessment saves ${formatRM(separateSaves, true)}`
                    : lang === "bm"
                      ? `Taksiran Bersama jimat ${formatRM(Math.abs(separateSaves), true)}`
                      : `Joint Assessment saves ${formatRM(Math.abs(separateSaves), true)}`}
                </p>
                <p className="mt-1 text-xs opacity-85">
                  {separateSaves >= 0
                    ? lang === "bm"
                      ? "Di Malaysia, Taksiran Berasingan hampir selalu lebih jimat apabila kedua-dua pasangan berpendapatan, kerana masing-masing mendapat kadar cukai progresif lebih rendah + pelepasan individu RM9,000."
                      : "In Malaysia, Separate Assessment almost always wins when both spouses earn income, because each spouse gets lower progressive brackets + individual RM9,000 relief."
                    : lang === "bm"
                      ? "Taksiran Bersama lebih jimat di sini kerana penggabungan pendapatan dengan pelepasan pasangan RM4,000 mengurangkan jumlah cukai isi rumah."
                      : "Joint Assessment wins here because combining income with the RM4,000 spouse relief reduces your household's total tax."}
                </p>
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-1.5">
                  <p className="font-bold text-slate-900">
                    {lang === "bm" ? "Taksiran Berasingan" : "Separate Assessment"}
                  </p>
                  <div className="flex justify-between text-slate-600">
                    <span>
                      {lang === "bm" ? "Cukai Anda" : "Your Tax"} ({Math.round(selfTaxSep.marginalRate * 100)}%)
                    </span>
                    <span>
                      {formatRM(
                        Math.max(
                          0,
                          selfTaxSep.tax - sepRebateSelf - summary.zakatRebate
                        ),
                        true
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>
                      {lang === "bm" ? "Pasangan" : "Spouse"} ({Math.round(spouseTaxSep.marginalRate * 100)}%)
                    </span>
                    <span>
                      {formatRM(
                        Math.max(0, spouseTaxSep.tax - sepRebateSpouse),
                        true
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-900">
                    <span>{lang === "bm" ? "Jumlah Isi Rumah" : "Household Total"}</span>
                    <span>{formatRM(totalSeparateTax, true)}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-1.5">
                  <p className="font-bold text-slate-900">
                    {lang === "bm" ? "Taksiran Bersama" : "Joint Assessment"}
                  </p>
                  <div className="flex justify-between text-slate-600">
                    <span>{lang === "bm" ? "Pendapatan Gabungan" : "Combined Income"}</span>
                    <span>{formatRM(combinedIncome)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{lang === "bm" ? "Kadar Bersama" : "Joint Bracket"}</span>
                    <span>{Math.round(jointTaxRaw.marginalRate * 100)}%</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-900">
                    <span>{lang === "bm" ? "Jumlah Isi Rumah" : "Household Total"}</span>
                    <span>{formatRM(totalJointTax, true)}</span>
                  </div>
                </div>
              </div>

              {/* Pro Tip on Splitting Reliefs */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                {lang === "bm" ? (
                  <>
                    <strong>Tip Pro:</strong> Tuntut pelepasan berkongsi (seperti{" "}
                    <strong>Anak</strong>, <strong>Taska RM3,000</strong>,{" "}
                    <strong>SSPN</strong>, dan <strong>Perubatan</strong>) pada pasangan dalam kadar cukai lebih tinggi (
                    {selfTaxSep.marginalRate >= spouseTaxSep.marginalRate
                      ? `Anda pada ${Math.round(selfTaxSep.marginalRate * 100)}%`
                      : `Pasangan anda pada ${Math.round(spouseTaxSep.marginalRate * 100)}%`}
                    ) untuk memaksimumkan penjimatan Ringgit!
                  </>
                ) : (
                  <>
                    <strong>Pro Tip:</strong> Claim shared reliefs (like{" "}
                    <strong>Children</strong>, <strong>Childcare RM3,000</strong>,{" "}
                    <strong>SSPN</strong>, and <strong>Medical</strong>) on whoever
                    is in the higher tax bracket (
                    {selfTaxSep.marginalRate >= spouseTaxSep.marginalRate
                      ? `You at ${Math.round(selfTaxSep.marginalRate * 100)}%`
                      : `Your spouse at ${Math.round(spouseTaxSep.marginalRate * 100)}%`}
                    ) to maximize Ringgit saved!
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-bold text-emerald-700">
          +{formatRM(value)}{" "}
          <span className="font-normal text-slate-400">/ {formatRM(max)}</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={Math.min(value, max)}
        disabled={max <= 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-600"
      />
    </div>
  );
}

function downloadLhdnCalendarReminders(taxYear: number): void {
  const filingYear = taxYear + 1;
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CukaiKu//LHDN Tax Reminders//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:cukaiku-yearend-${taxYear}@lhdn-tax-tracker`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${taxYear}1215`,
    `DTEND;VALUE=DATE:${taxYear}1216`,
    `SUMMARY:LHDN YA ${taxYear} Year-End Tax Relief Top-Up Check`,
    `DESCRIPTION:Review remaining YA ${taxYear} caps in CukaiKu (PRS RM3000, Sports RM1000, Lifestyle RM2500, Medical/Dental, SSPN) before 31 Dec ${taxYear}!`,
    "END:VEVENT",
    "BEGIN:VEVENT",
    `UID:cukaiku-efiling-${taxYear}@lhdn-tax-tracker`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${filingYear}0415`,
    `DTEND;VALUE=DATE:${filingYear}0416`,
    `SUMMARY:LHDN Form BE e-Filing Deadline (YA ${taxYear})`,
    `DESCRIPTION:Open CukaiKu Form BE Cheat Sheet & download your Audit Pack ZIP before submitting e-BE on MyTax (deadline 30 Apr ${filingYear}).`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `CukaiKu_LHDN_YA${taxYear}_Reminders.ics`;
  link.click();
  URL.revokeObjectURL(url);
}
