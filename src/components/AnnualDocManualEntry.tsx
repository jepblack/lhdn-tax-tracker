"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Edit3, ExternalLink } from "lucide-react";
import { SUPPORTED_TAX_YEARS } from "@/lib/lhdn-rules";
import { AnnualDocExtraction, AnnualTaxDoc, TaxYear } from "@/lib/types";
import { openFileSafely } from "./ReceiptPreviewModal";

interface AnnualDocManualEntryProps {
  doc: AnnualTaxDoc;
  defaultYear: TaxYear;
  lang: "en" | "bm";
  hasOtherEaInYear?: boolean;
  initialExtraction?: AnnualDocExtraction | null;
  onApply: (
    extraction: AnnualDocExtraction,
    doc: AnnualTaxDoc,
    targetYear: TaxYear
  ) => Promise<void>;
  onCancel?: () => void;
}

const numOrZero = (v: string) => {
  const n = Number(v.replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function AnnualDocManualEntry({
  doc,
  defaultYear,
  lang,
  hasOtherEaInYear = false,
  initialExtraction,
  onApply,
  onCancel,
}: AnnualDocManualEntryProps) {
  const init = initialExtraction ?? doc.extraction ?? null;
  const initExtra = (catId: string) => {
    const found = init?.extraReliefs?.find((r) => r.categoryId === catId);
    return found && found.amount > 0 ? String(found.amount) : "";
  };
  const fmtInit = (n: number | undefined | null) =>
    n && n > 0 ? String(n) : "";

  const isBe = doc.docType === "form_be_proof";
  const isEa = doc.docType === "ea_form";
  const isKwsp = doc.docType === "kwsp_statement";
  const isInsurance = doc.docType === "insurance_statement";
  const isLoan = doc.docType === "loan_interest_statement";
  const [targetYear, setTargetYear] = useState<TaxYear>(
    init?.detectedTaxYear || defaultYear
  );
  const [providerName, setProviderName] = useState(
    init?.providerName || (isBe ? "LHDN Form BE" : isKwsp ? "KWSP / EPF" : doc.label)
  );
  const [annualIncome, setAnnualIncome] = useState(fmtInit(init?.annualIncome));
  const [pcbPaid, setPcbPaid] = useState(fmtInit(init?.pcbPaid));
  const [zakatPaid, setZakatPaid] = useState(fmtInit(init?.zakatPaid));
  const [epfEmployee, setEpfEmployee] = useState(fmtInit(init?.epfEmployee));
  const [socsoEisEmployee, setSocsoEisEmployee] = useState(
    fmtInit(init?.socsoEisEmployee)
  );
  const [lifeInsurance, setLifeInsurance] = useState(
    fmtInit(init?.lifeInsuranceAmount)
  );
  const [medicalInsurance, setMedicalInsurance] = useState(
    fmtInit(init?.medicalInsuranceAmount)
  );
  const [housingLoanInterest, setHousingLoanInterest] = useState(
    fmtInit(init?.housingLoanInterest)
  );

  // Form e-BE specific fields
  const [filingRef, setFilingRef] = useState(init?.filingReferenceNo || "");
  const [filingDate, setFilingDate] = useState(init?.filingDate || "");
  const [declaredTotalReliefs, setDeclaredTotalReliefs] = useState(
    fmtInit(init?.declaredTotalReliefs)
  );
  const [declaredChargeable, setDeclaredChargeable] = useState(
    fmtInit(init?.declaredChargeableIncome)
  );
  const [declaredTaxCharged, setDeclaredTaxCharged] = useState(
    fmtInit(init?.declaredTaxCharged)
  );
  const [declaredTaxPayable, setDeclaredTaxPayable] = useState(
    fmtInit(init?.declaredTaxPayable)
  );
  const [declaredRefund, setDeclaredRefund] = useState(
    init?.declaredRefund !== undefined && init?.declaredRefund !== null
      ? String(init.declaredRefund)
      : ""
  );
  const [childrenUnder18, setChildrenUnder18] = useState(
    String(init?.statusReliefs?.childrenUnder18 ?? 0)
  );
  const [childrenHigherEd, setChildrenHigherEd] = useState(
    String(init?.statusReliefs?.childrenHigherEd ?? 0)
  );
  const [spouseRelief, setSpouseRelief] = useState(
    Boolean(init?.statusReliefs?.spouse)
  );

  // Extra e-BE relief categories
  const [showMoreReliefs, setShowMoreReliefs] = useState(isBe);
  const [lifestyle, setLifestyle] = useState(initExtra("lifestyle"));
  const [medicalSelf, setMedicalSelf] = useState(initExtra("medical_self"));
  const [parentsCare, setParentsCare] = useState(initExtra("parents_medical"));
  const [childcare, setChildcare] = useState(initExtra("childcare"));
  const [educationSelf, setEducationSelf] = useState(initExtra("education_self"));
  const [sspn, setSspn] = useState(initExtra("sspn"));
  const [prs, setPrs] = useState(initExtra("prs_annuity"));
  const [donations, setDonations] = useState(initExtra("approved_donations"));

  const [saving, setSaving] = useState(false);
  const isOtherDoc = doc.docType === "other_doc";
  const [addToExisting, setAddToExisting] = useState(
    doc.docType === "ea_form"
      ? init?.addToExistingProfile ?? hasOtherEaInYear
      : isOtherDoc
      ? Boolean(init?.addToExistingProfile)
      : false
  );

  async function handleSave() {
    setSaving(true);
    try {
      const extraReliefs: NonNullable<AnnualDocExtraction["extraReliefs"]> = [];
      const pushExtra = (categoryId: string, label: string, val: string) => {
        const amt = numOrZero(val);
        if (amt > 0) extraReliefs.push({ categoryId, label, amount: amt });
      };
      pushExtra("lifestyle", "Lifestyle", lifestyle);
      pushExtra("medical_self", "Medical", medicalSelf);
      pushExtra("parents_medical", "Parents Care", parentsCare);
      pushExtra("childcare", "Childcare", childcare);
      pushExtra("education_self", "Education", educationSelf);
      pushExtra("sspn", "SSPN", sspn);
      pushExtra("prs_annuity", "PRS / Annuity", prs);
      pushExtra("approved_donations", "Approved Donations", donations);

      const extraction: AnnualDocExtraction = {
        docType: doc.docType,
        providerName: providerName.trim() || doc.label,
        detectedTaxYear: targetYear,
        annualIncome: numOrZero(annualIncome),
        pcbPaid: numOrZero(pcbPaid),
        zakatPaid: numOrZero(zakatPaid),
        epfEmployee: numOrZero(epfEmployee),
        socsoEisEmployee: numOrZero(socsoEisEmployee),
        lifeInsuranceAmount: numOrZero(lifeInsurance),
        medicalInsuranceAmount: numOrZero(medicalInsurance),
        housingLoanInterest: numOrZero(housingLoanInterest),
        ...(isBe
          ? {
              declaredTotalReliefs: numOrZero(declaredTotalReliefs),
              declaredChargeableIncome: numOrZero(declaredChargeable),
              declaredTaxCharged: numOrZero(declaredTaxCharged),
              declaredTaxRebate: numOrZero(zakatPaid),
              declaredTaxPayable: numOrZero(declaredTaxPayable),
              declaredRefund: declaredRefund.trim()
                ? Number(declaredRefund.replace(/,/g, "").trim()) || 0
                : undefined,
              filingReferenceNo: filingRef.trim() || null,
              filingDate: filingDate.trim() || null,
              statusReliefs: {
                individual: true,
                spouse: spouseRelief,
                childrenUnder18: Math.max(0, Number(childrenUnder18) || 0),
                childrenHigherEd: Math.max(0, Number(childrenHigherEd) || 0),
              },
            }
          : {}),
        extraReliefs,
        ...(isEa || (isOtherDoc && numOrZero(zakatPaid) > 0)
          ? { addToExistingProfile: addToExisting }
          : {}),
        summaryNote: "Entered manually by taxpayer.",
        confidence: "high",
      };

      await onApply(extraction, doc, targetYear);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500";
  const labelCls = "block text-[10px] font-semibold text-slate-700 mb-0.5";

  return (
    <div className="space-y-2.5 rounded-2xl border border-indigo-200 bg-white p-3.5 text-xs shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-bold text-slate-900">
          <Edit3 className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
          <span className="truncate">
            {lang === "bm"
              ? `Masukkan Angka Manual — ${doc.fileName}`
              : `Manual Entry — ${doc.fileName}`}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {doc.fileUrl && (
            <button
              type="button"
              onClick={() => openFileSafely(doc.fileUrl, doc.fileName)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
            >
              {lang === "bm" ? "Buka Fail" : "Open Doc"}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
          <select
            value={targetYear}
            onChange={(e) => setTargetYear(Number(e.target.value) as TaxYear)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-800"
          >
            {SUPPORTED_TAX_YEARS.map((yr) => (
              <option key={yr} value={yr}>
                YA {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>
            {isInsurance
              ? lang === "bm"
                ? "Syarikat Insurans / Takaful"
                : "Insurer / Takaful Provider"
              : isLoan
              ? lang === "bm"
                ? "Nama Bank"
                : "Bank / Lender"
              : isKwsp
              ? lang === "bm"
                ? "Institusi"
                : "Institution"
              : lang === "bm"
              ? "Majikan / Pembekal"
              : "Employer / Provider"}
          </label>
          <input
            type="text"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            className={inputCls}
          />
        </div>

        {(isEa || isBe) && (
          <>
            <div>
              <label className={labelCls}>
                {lang === "bm"
                  ? "Pendapatan Tahunan (RM)"
                  : "Annual Income (RM)"}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={annualIncome}
                onChange={(e) => setAnnualIncome(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>PCB / MTD (RM)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={pcbPaid}
                onChange={(e) => setPcbPaid(e.target.value)}
                className={inputCls}
              />
            </div>
          </>
        )}

        {(isEa || isKwsp || isBe) && (
          <div>
            <label className={labelCls}>
              {lang === "bm" ? "KWSP Pekerja (RM)" : "EPF / KWSP (RM)"}
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={epfEmployee}
              onChange={(e) => setEpfEmployee(e.target.value)}
              className={inputCls}
            />
          </div>
        )}

        {(isEa || isBe) && (
          <>
            <div>
              <label className={labelCls}>SOCSO &amp; EIS (RM)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={socsoEisEmployee}
                onChange={(e) => setSocsoEisEmployee(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Zakat / Fitrah (RM)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={zakatPaid}
                onChange={(e) => setZakatPaid(e.target.value)}
                className={inputCls}
              />
            </div>
          </>
        )}

        {(isInsurance || isBe) && (
          <>
            <div>
              <label className={labelCls}>
                {lang === "bm"
                  ? "Insurans Nyawa / Takaful (RM)"
                  : "Life Insurance / Takaful (RM)"}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={lifeInsurance}
                onChange={(e) => setLifeInsurance(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm"
                  ? "Insurans Perubatan & Pendidikan (RM)"
                  : "Medical & Edu Insurance (RM)"}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={medicalInsurance}
                onChange={(e) => setMedicalInsurance(e.target.value)}
                className={inputCls}
              />
            </div>
          </>
        )}

        {(isLoan || isBe) && (
          <div>
            <label className={labelCls}>
              {lang === "bm"
                ? "Faedah Pinjaman Rumah (RM)"
                : "Housing Loan Interest (RM)"}
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={housingLoanInterest}
              onChange={(e) => setHousingLoanInterest(e.target.value)}
              className={inputCls}
            />
          </div>
        )}
      </div>

      {isBe && (
        <div className="space-y-2 border-t border-indigo-200/70 pt-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label className={labelCls}>
                {lang === "bm" ? "No. Siri e-BE" : "e-BE Serial No."}
              </label>
              <input
                type="text"
                placeholder="BE 148347"
                value={filingRef}
                onChange={(e) => setFilingRef(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm" ? "Tarikh Hantar" : "Filed Date"}
              </label>
              <input
                type="text"
                placeholder="3-Mar-2020"
                value={filingDate}
                onChange={(e) => setFilingDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm" ? "Jumlah Pelepasan (RM)" : "Total Reliefs (RM)"}
              </label>
              <input
                type="number"
                step="1"
                placeholder="0"
                value={declaredTotalReliefs}
                onChange={(e) => setDeclaredTotalReliefs(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm"
                  ? "Pendapatan Bercukai (RM)"
                  : "Chargeable Income (RM)"}
              </label>
              <input
                type="number"
                step="1"
                placeholder="0"
                value={declaredChargeable}
                onChange={(e) => setDeclaredChargeable(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm"
                  ? "Cukai Pendapatan (RM)"
                  : "Gross Tax Charged (RM)"}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={declaredTaxCharged}
                onChange={(e) => setDeclaredTaxCharged(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm"
                  ? "Cukai Kena Dibayar (RM)"
                  : "Net Tax Payable (RM)"}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={declaredTaxPayable}
                onChange={(e) => setDeclaredTaxPayable(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm"
                  ? "Lebihan Bayaran (RM)"
                  : "Excess Paid / Refund (RM)"}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={declaredRefund}
                onChange={(e) => setDeclaredRefund(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm" ? "Anak < 18 Tahun" : "Children < 18"}
              </label>
              <input
                type="number"
                min="0"
                value={childrenUnder18}
                onChange={(e) => setChildrenUnder18(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {lang === "bm" ? "Anak 18+ IPT" : "Children 18+ IPT"}
              </label>
              <input
                type="number"
                min="0"
                value={childrenHigherEd}
                onChange={(e) => setChildrenHigherEd(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={spouseRelief}
              onChange={(e) => setSpouseRelief(e.target.checked)}
              className="rounded border-slate-300"
            />
            {lang === "bm"
              ? "Tuntut Pelepasan Suami/Isteri (RM 4,000)"
              : "Claimed Spouse Relief (RM 4,000)"}
          </label>

          <button
            type="button"
            onClick={() => setShowMoreReliefs((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700"
          >
            {showMoreReliefs ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {lang === "bm"
              ? "Pelepasan Lain Borang e-BE (Gaya Hidup, Perubatan, Taska, dll.)"
              : "Other e-BE Relief Boxes (Lifestyle, Medical, Childcare, etc.)"}
          </button>

          {showMoreReliefs && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className={labelCls}>Lifestyle (F9)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={lifestyle}
                  onChange={(e) => setLifestyle(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Medical (F4)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={medicalSelf}
                  onChange={(e) => setMedicalSelf(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Parents Care (F2)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={parentsCare}
                  onChange={(e) => setParentsCare(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Childcare (F12)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={childcare}
                  onChange={(e) => setChildcare(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Education (F5)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={educationSelf}
                  onChange={(e) => setEducationSelf(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>SSPN (F13)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={sspn}
                  onChange={(e) => setSspn(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>PRS (F16)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={prs}
                  onChange={(e) => setPrs(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Donations (D1)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={donations}
                  onChange={(e) => setDonations(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {(isEa || (isOtherDoc && numOrZero(zakatPaid) > 0)) && (
        <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
          <input
            type="checkbox"
            checked={addToExisting}
            onChange={(e) => setAddToExisting(e.target.checked)}
            className="rounded border-slate-300"
          />
          {isEa
            ? lang === "bm"
              ? `Tambah kepada Pendapatan & PCB TT ${targetYear} sedia ada (jika majikan ke-2)`
              : `Add to existing YA ${targetYear} Income, PCB & Zakat (for 2nd employer)`
            : lang === "bm"
            ? `Tambah kepada Zakat TT ${targetYear} sedia ada (nyahtanda jika penyata penuh pusat zakat sudah termasuk Zakat EA)`
            : `Add to existing YA ${targetYear} Zakat (uncheck if full-year Zakat statement already includes EA Zakat)`}
        </label>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {saving
            ? lang === "bm"
              ? "Menyimpan..."
              : "Applying..."
            : lang === "bm"
            ? `Simpan & Guna ke TT ${targetYear}`
            : `Save & Apply to YA ${targetYear}`}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            {lang === "bm" ? "Tutup" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}
