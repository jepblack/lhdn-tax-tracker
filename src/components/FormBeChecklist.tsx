"use client";

import { formatRM } from "@/lib/calculator";
import { AnnualDocExtraction } from "@/lib/types";

export function FormBeChecklist({
  extraction,
  lang,
}: {
  extraction: AnnualDocExtraction;
  lang: "en" | "bm";
}) {
  const ext = extraction;
  if (ext.isAcknowledgement) {
    const ackChecks = [
      {
        label: lang === "bm" ? "Tahun Taksiran" : "Year of Assessment",
        ok: Boolean(ext.detectedTaxYear),
        detail: ext.detectedTaxYear ? `YA ${ext.detectedTaxYear}` : "—",
      },
      {
        label: lang === "bm" ? "No. Siri e-BE" : "Serial Number",
        ok: Boolean(ext.filingReferenceNo),
        detail: ext.filingReferenceNo || (lang === "bm" ? "Tiada" : "Missing"),
      },
      {
        label: lang === "bm" ? "Tarikh & Masa" : "Filed Timestamp",
        ok: Boolean(ext.filingDate),
        detail: ext.filingDate || (lang === "bm" ? "Tiada" : "Missing"),
      },
      {
        label: lang === "bm" ? "Jumlah Pendapatan" : "Total Income",
        ok: ext.annualIncome > 0,
        detail: ext.annualIncome > 0 ? formatRM(ext.annualIncome, true) : "—",
      },
      {
        label: lang === "bm" ? "Pendapatan Bercukai" : "Chargeable Income",
        ok: Boolean(ext.declaredChargeableIncome && ext.declaredChargeableIncome > 0),
        detail:
          ext.declaredChargeableIncome !== undefined
            ? formatRM(ext.declaredChargeableIncome, true)
            : "—",
      },
      {
        label: lang === "bm" ? "Cukai Kena Dibayar" : "Tax Payable",
        ok: ext.declaredTaxPayable !== undefined && ext.declaredTaxPayable !== null,
        detail:
          ext.declaredTaxPayable !== undefined
            ? formatRM(ext.declaredTaxPayable, true)
            : "—",
      },
      {
        label: "PCB / MTD",
        ok: ext.pcbPaid >= 0,
        detail: formatRM(ext.pcbPaid, true),
      },
      {
        label: lang === "bm" ? "Lebihan Bayaran" : "Excess Paid / Refund",
        ok: ext.declaredRefund !== undefined && ext.declaredRefund !== null,
        detail:
          ext.declaredRefund !== undefined
            ? formatRM(ext.declaredRefund, true)
            : "—",
      },
    ];
    const okCount = ackChecks.filter((c) => c.ok).length;
    return (
      <div className="space-y-2 rounded-xl border border-indigo-200 bg-white/80 p-2.5 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-slate-800">
            {lang === "bm"
              ? "Pengesahan Penerimaan e-BE LHDN"
              : "LHDN e-BE Acknowledgement Receipt"}
          </span>
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
            {okCount}/{ackChecks.length} {lang === "bm" ? "Disahkan" : "Verified"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {ackChecks.map((c) => (
            <div
              key={c.label}
              className={`rounded-lg border px-2 py-1 ${
                c.ok
                  ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <p className="truncate text-[10px] font-medium">
                {c.ok ? "✓" : "⚠"} {c.label}
              </p>
              <p className="truncate font-bold">{c.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600">
          {lang === "bm"
            ? "Mengandungi Nombor Siri rasmi & tarikh penghantaran — digabung automatik dengan Borang e-BE terperinci tanpa memadam pecahan pelepasan."
            : "Captures your official Serial No. & filing timestamp — merges cleanly with your 5-page Borang e-BE without overwriting itemized reliefs."}
        </p>
      </div>
    );
  }

  const checks = [
    {
      label: lang === "bm" ? "Tahun Taksiran (TT)" : "Year of Assessment",
      ok: Boolean(ext.detectedTaxYear),
      detail: ext.detectedTaxYear
        ? `YA ${ext.detectedTaxYear}`
        : lang === "bm"
        ? "Tiada"
        : "Missing",
    },
    {
      label: lang === "bm" ? "Pendapatan Agregat" : "Aggregate Income",
      ok: ext.annualIncome > 0,
      detail:
        ext.annualIncome > 0
          ? formatRM(ext.annualIncome, true)
          : lang === "bm"
          ? "Tiada"
          : "Missing",
    },
    {
      label: lang === "bm" ? "Jumlah Pelepasan" : "Total Reliefs",
      ok: Boolean(ext.declaredTotalReliefs && ext.declaredTotalReliefs > 0),
      detail:
        ext.declaredTotalReliefs && ext.declaredTotalReliefs > 0
          ? formatRM(ext.declaredTotalReliefs, true)
          : lang === "bm"
          ? "Tiada"
          : "Missing",
    },
    {
      label: lang === "bm" ? "Pendapatan Bercukai" : "Chargeable Income",
      ok:
        ext.declaredChargeableIncome !== undefined &&
        ext.declaredChargeableIncome !== null &&
        !(
          ext.declaredChargeableIncome === 0 &&
          ext.annualIncome > 9000 &&
          !ext.declaredTotalReliefs
        ),
      detail:
        ext.declaredChargeableIncome !== undefined &&
        ext.declaredChargeableIncome !== null &&
        !(
          ext.declaredChargeableIncome === 0 &&
          ext.annualIncome > 9000 &&
          !ext.declaredTotalReliefs
        )
          ? formatRM(ext.declaredChargeableIncome, true)
          : lang === "bm"
          ? "Tiada"
          : "Missing",
    },
    {
      label: lang === "bm" ? "Cukai Kena Dibayar" : "Tax Charged / Payable",
      ok:
        ((ext.declaredTaxCharged !== undefined &&
          ext.declaredTaxCharged !== null) ||
          (ext.declaredTaxPayable !== undefined &&
            ext.declaredTaxPayable !== null)) &&
        !(
          (ext.declaredTaxCharged || 0) === 0 &&
          (ext.declaredTaxPayable || 0) === 0 &&
          ext.annualIncome > 9000 &&
          !ext.declaredTotalReliefs
        ),
      detail:
        ((ext.declaredTaxPayable !== undefined &&
          ext.declaredTaxPayable !== null) ||
          (ext.declaredTaxCharged !== undefined &&
            ext.declaredTaxCharged !== null)) &&
        !(
          (ext.declaredTaxCharged || 0) === 0 &&
          (ext.declaredTaxPayable || 0) === 0 &&
          ext.annualIncome > 9000 &&
          !ext.declaredTotalReliefs
        )
          ? formatRM(
              ext.declaredTaxPayable ?? ext.declaredTaxCharged ?? 0,
              true
            )
          : lang === "bm"
          ? "Tiada"
          : "Missing",
    },
    {
      label: lang === "bm" ? "Status Pelepasan" : "Status Reliefs",
      ok: Boolean(ext.statusReliefs),
      detail: ext.statusReliefs
        ? lang === "bm"
          ? "Dikesan"
          : "Detected"
        : lang === "bm"
        ? "Tiada"
        : "Missing",
    },
    {
      label: "PCB / MTD",
      ok: ext.pcbPaid >= 0,
      detail: formatRM(ext.pcbPaid, true),
    },
    {
      label: lang === "bm" ? "Jenis Taksiran" : "Assessment Type",
      ok: Boolean(ext.assessmentType),
      detail:
        ext.assessmentType === "separate"
          ? lang === "bm"
            ? "Berasingan"
            : "Separate"
          : ext.assessmentType === "joint_self" ||
            ext.assessmentType === "joint_spouse"
          ? lang === "bm"
            ? "Bersama"
            : "Joint"
          : lang === "bm"
          ? "Tiada"
          : "Missing",
    },
    {
      label: lang === "bm" ? "Pecahan Pendapatan" : "Income Sources",
      ok: Boolean(
        (ext.employmentIncome && ext.employmentIncome > 0) ||
          (ext.rentalIncome && ext.rentalIncome > 0) ||
          (ext.otherIncome && ext.otherIncome > 0)
      ),
      detail:
        (ext.rentalIncome || 0) > 0 || (ext.otherIncome || 0) > 0
          ? `${lang === "bm" ? "Gaji" : "Emp"} + ${
              (ext.rentalIncome || 0) > 0
                ? lang === "bm"
                  ? "Sewa"
                  : "Rental"
                : lang === "bm"
                ? "Lain"
                : "Other"
            }`
          : (ext.employmentIncome || 0) > 0
          ? lang === "bm"
            ? "Penggajian"
            : "Employment"
          : lang === "bm"
          ? "Tiada"
          : "Not split",
    },
    {
      label: lang === "bm" ? "Rebat & Zakat" : "Rebates & Zakat",
      ok: Boolean(
        (ext.declaredTaxRebate && ext.declaredTaxRebate > 0) ||
          ext.zakatPaid > 0
      ),
      detail: formatRM(
        Math.max(ext.declaredTaxRebate || 0, ext.zakatPaid || 0),
        true
      ),
    },
    {
      label: lang === "bm" ? "CP500 / Kredit Cukai" : "CP500 / Tax Credits",
      ok: Boolean(
        (ext.cp500Paid && ext.cp500Paid > 0) ||
          (ext.otherTaxCredits && ext.otherTaxCredits > 0)
      ),
      detail: formatRM(
        (ext.cp500Paid || 0) + (ext.otherTaxCredits || 0),
        true
      ),
    },
    {
      label: lang === "bm" ? "Rujukan e-BE" : "e-BE Filing Ref",
      ok: Boolean(ext.filingReferenceNo || ext.filingDate),
      detail: ext.filingReferenceNo
        ? ext.filingReferenceNo
        : ext.filingDate
        ? ext.filingDate
        : lang === "bm"
        ? "Tiada"
        : "Not printed",
    },
  ];

  const passedCount = checks.filter((c) => c.ok).length;
  const allCoreOk = passedCount === checks.length;

  return (
    <div
      className={`space-y-2 rounded-xl border p-2.5 text-[11px] ${
        allCoreOk
          ? "border-emerald-200 bg-white/80"
          : "border-amber-300 bg-amber-50/80"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-800">
          {lang === "bm"
            ? "Semakan Kelengkapan Borang BE"
            : "Form BE Completeness Check"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            allCoreOk
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          {passedCount}/{checks.length} {lang === "bm" ? "Disahkan" : "Verified"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {checks.map((c) => (
          <div
            key={c.label}
            className={`rounded-lg border px-2 py-1 ${
              c.ok
                ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                : "border-amber-300 bg-white text-amber-900"
            }`}
          >
            <p className="truncate text-[10px] font-medium">
              {c.ok ? "✓" : "⚠"} {c.label}
            </p>
            <p className="truncate font-bold">{c.detail}</p>
          </div>
        ))}
      </div>
      {!allCoreOk && (
        <p className="text-[10px] text-amber-900">
          {lang === "bm"
            ? "Sesetengah medan Borang BE tidak ditemui (cth. halaman kedua tidak terbaca). Anda masih boleh guna angka yang ada dan lengkapkan bakinya di Tetapan."
            : "Some Form BE fields were not detected (e.g. multi-page summary missing). You can still apply the detected figures and adjust any missing fields in Settings."}
        </p>
      )}
    </div>
  );
}
