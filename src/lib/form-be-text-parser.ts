import { AnnualDocExtraction } from "./types";

function parseNum(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function matchLastNumberOnLine(text: string, regex: RegExp): number {
  const m = text.match(regex);
  if (!m) return 0;
  return parseNum(m[m.length - 1]);
}

/**
 * Deterministic, PDPA-safe parser for Malaysian LHDN Form e-BE PDF text.
 * Extracts only non-PII tax figures and status flags from standard MyTax Form e-BE text
 * to supplement or backstop AI extraction.
 */
export function parseFormBeText(
  rawText: string
): Partial<AnnualDocExtraction> {
  if (!rawText || rawText.length < 40) return {};
  const text = rawText.replace(/\r\n/g, "\n");
  const flat = text.replace(/\s+/g, " ");

  const yearMatch =
    flat.match(/TAHUN\s+TAKSIRAN\s+(20\d{2})/i) ||
    flat.match(/YEAR\s+OF\s+ASSESSMENT\s+(20\d{2})/i) ||
    flat.match(/\bTT\s+(20\d{2})\b/i);
  const detectedTaxYear = yearMatch ? Number(yearMatch[1]) : null;

  let assessmentType: AnnualDocExtraction["assessmentType"] = null;
  if (/Jenis\s+taksiran\s+BERASINGAN/i.test(flat) || /SEPARATE\s+ASSESSMENT/i.test(flat)) {
    assessmentType = "separate";
  } else if (/Jenis\s+taksiran\s+BERSAMA/i.test(flat) || /JOINT\s+ASSESSMENT/i.test(flat)) {
    assessmentType = "joint_self";
  }

  const employmentIncome = matchLastNumberOnLine(
    text,
    /Pendapatan\s+berkanun\s+penggajian[^\n]*?([\d,]+(?:\.\d{1,2})?)\s*$/im
  );
  const rentalIncome = matchLastNumberOnLine(
    text,
    /Pendapatan\s+berkanun\s+sewa[^\n]*?([\d,]+(?:\.\d{1,2})?)\s*$/im
  );
  const annualIncome =
    matchLastNumberOnLine(flat, /PENDAPATAN\s+AGREGAT\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    matchLastNumberOnLine(flat, /AGGREGATE\s+INCOME\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    matchLastNumberOnLine(flat, /JUMLAH\s+PENDAPATAN\s+([\d,]+(?:\.\d{1,2})?)/i);

  const declaredTotalReliefs =
    matchLastNumberOnLine(flat, /Jumlah\s+pelepasan\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    matchLastNumberOnLine(flat, /Total\s+relief\s+([\d,]+(?:\.\d{1,2})?)/i);

  const declaredChargeableIncome =
    matchLastNumberOnLine(flat, /PENDAPATAN\s+BERCUKAI\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    matchLastNumberOnLine(flat, /CHARGEABLE\s+INCOME\s+([\d,]+(?:\.\d{1,2})?)/i);

  const declaredTaxCharged =
    matchLastNumberOnLine(flat, /JUMLAH\s+CUKAI\s+PENDAPATAN\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    matchLastNumberOnLine(flat, /TOTAL\s+INCOME\s+TAX\s+([\d,]+(?:\.\d{1,2})?)/i);

  const declaredTaxRebate =
    matchLastNumberOnLine(flat, /TOLAK\s*:\s*JUMLAH\s+REBAT\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    matchLastNumberOnLine(flat, /TOTAL\s+REBATE\s+([\d,]+(?:\.\d{1,2})?)/i);

  const zakatPaid =
    matchLastNumberOnLine(flat, /Zakat\s+dan\s+fitrah\s+([\d,]+(?:\.\d{1,2})?)/i) ||
    matchLastNumberOnLine(flat, /Zakat\s+and\s+fitrah\s+([\d,]+(?:\.\d{1,2})?)/i);

  const declaredTaxPayable =
    matchLastNumberOnLine(
      flat,
      /CUKAI\s+KENA\s+DIBAYAR\s+(?:TAHUN\s+TAKSIRAN\s+20\d{2}\s+)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(flat, /TAX\s+PAYABLE\s+([\d,]+(?:\.\d{1,2})?)/i);

  const pcbPaid =
    matchLastNumberOnLine(
      flat,
      /Potongan\s+Cukai\s+Bulanan\s*\(PCB\)[\s\S]{0,120}?([\d,]+\.\d{2})/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /Monthly\s+Tax\s+Deduction\s*\(MTD\)[\s\S]{0,120}?([\d,]+\.\d{2})/i
    );

  const cp500Paid = matchLastNumberOnLine(
    flat,
    /Ansuran\s+CP500[^\d]{0,40}([\d,]+(?:\.\d{1,2})?)/i
  );

  // Status reliefs
  const selfRelief = matchLastNumberOnLine(
    text,
    /Individu\s+dan\s+saudara\s+tanggungan\s+([\d,]+)/i
  );
  const disabledSelf = matchLastNumberOnLine(
    text,
    /Individu\s+yang\s+kurang\s+upaya\s+([\d,]+)\s*$/im
  );
  const spouseRelief = matchLastNumberOnLine(
    text,
    /Suami\s*\/\s*Isteri\s*\/\s*Bayaran\s+alimoni[^\n]*?([\d,]+)\s*$/im
  );
  const disabledSpouse = matchLastNumberOnLine(
    text,
    /Suami\s*\/\s*isteri\s+yang\s+kurang\s+upaya[^\n]*?([\d,]+)\s*$/im
  );
  const childUnder18Amt = matchLastNumberOnLine(
    text,
    /Anak\s*-\s*Di\s+bawah\s+umur\s+18\s+tahun\s+([\d,]+)/i
  );
  const childHigherEdAmt = matchLastNumberOnLine(
    text,
    /Anak\s*-\s*18\s+tahun\s+dan\s+ke\s+atas\s+yang\s+masih\s+belajar\s+([\d,]+)/i
  );
  const childDisabledAmt = matchLastNumberOnLine(
    text,
    /Anak\s*-\s*Kurang\s+upaya\s+([\d,]+)/i
  );

  const hasAnyStatus =
    selfRelief > 0 ||
    disabledSelf > 0 ||
    spouseRelief > 0 ||
    childUnder18Amt > 0 ||
    childHigherEdAmt > 0 ||
    childDisabledAmt > 0;

  const statusReliefs = hasAnyStatus
    ? {
        individual: selfRelief > 0,
        disabledIndividual: disabledSelf > 0,
        spouse: spouseRelief > 0,
        disabledSpouse: disabledSpouse > 0,
        childrenUnder18: childUnder18Amt > 0 ? Math.round(childUnder18Amt / 2000) : 0,
        childrenHigherEd:
          childHigherEdAmt >= 8000
            ? Math.round(childHigherEdAmt / 8000)
            : childHigherEdAmt > 0
            ? Math.round(childHigherEdAmt / 2000)
            : 0,
        disabledChildren: childDisabledAmt > 0 ? Math.round(childDisabledAmt / 6000) : 0,
        disabledChildrenHigherEd: 0,
      }
    : undefined;

  // Core insurance / EPF / SOCSO reliefs
  const lifeInsuranceAmount = matchLastNumberOnLine(
    flat,
    /Premium\s+insurans\s+nyawa\s+Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
  );
  const epfEmployee = matchLastNumberOnLine(
    flat,
    /Caruman\s+KWSP\/skim\s+yang\s+diluluskan\s+Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
  );
  const medicalInsuranceAmount = matchLastNumberOnLine(
    flat,
    /Insurans\s+pendidikan\s+dan\s+perubatan\s+Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
  );
  const socsoEisEmployee = matchLastNumberOnLine(
    flat,
    /Pertubuhan\s+Keselamatan\s+Sosial\s*\(PERKESO\)\s+Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
  );

  // Extra reliefs
  const extraReliefs: Array<{ categoryId: string; label: string; amount: number }> = [];
  const pushExtra = (categoryId: string, label: string, amount: number) => {
    if (amount > 0) extraReliefs.push({ categoryId, label, amount });
  };

  pushExtra(
    "parents_medical",
    "Parents medical / care",
    matchLastNumberOnLine(flat, /Amaun\s+boleh\s+dituntut\s+([\d,]+(?:\.\d{1,2})?)/i)
  );
  pushExtra(
    "lifestyle",
    "Lifestyle",
    matchLastNumberOnLine(
      flat,
      /Gaya\s+hidup[\s\S]{0,120}?Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
    )
  );
  pushExtra(
    "childcare",
    "Childcare (TASKA / TADIKA)",
    matchLastNumberOnLine(
      flat,
      /taman\s+asuhan\s+kanak-kanak\s*\/\s*tadika[\s\S]{0,60}?Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
    )
  );
  pushExtra(
    "breastfeeding",
    "Breastfeeding equipment",
    matchLastNumberOnLine(
      flat,
      /peralatan\s+penyusuan\s+ibu[\s\S]{0,100}?Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
    )
  );
  pushExtra(
    "sspn",
    "SSPN net savings",
    matchLastNumberOnLine(
      flat,
      /Skim\s+Simpanan\s+Pendidikan\s+Nasional[\s\S]{0,100}?Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
    )
  );
  pushExtra(
    "prs_annuity",
    "PRS / Deferred Annuity",
    matchLastNumberOnLine(
      flat,
      /Skim\s+persaraan\s+swasta[\s\S]{0,80}?Terhad\s+[\d,]+\s+([\d,]+(?:\.\d{1,2})?)/i
    )
  );

  // Filing reference (if present on e-BE acknowledgement)
  const refMatch = flat.match(/No\.?\s*(?:Rujukan|Pengesahan)\s*[:#]?\s*([A-Z0-9-]{6,32})/i);

  return {
    detectedTaxYear,
    assessmentType,
    employmentIncome,
    rentalIncome,
    annualIncome,
    declaredTotalReliefs,
    declaredChargeableIncome,
    declaredTaxCharged,
    declaredTaxRebate,
    zakatPaid,
    declaredTaxPayable,
    pcbPaid,
    cp500Paid,
    statusReliefs,
    lifeInsuranceAmount,
    epfEmployee,
    medicalInsuranceAmount,
    socsoEisEmployee,
    extraReliefs,
    filingReferenceNo: refMatch ? refMatch[1] : null,
  };
}
