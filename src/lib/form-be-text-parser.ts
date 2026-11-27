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
 * Matches `<labelPattern> ... Terhad <cap> <claimedAmount>` without EVER crossing
 * into a subsequent row's `Terhad <cap>` column if the current box is blank.
 */
function matchTerhadBox(
  flatText: string,
  labelSource: string,
  capPattern = "[\\d,]+",
  maxWindow = 280
): number {
  const rx = new RegExp(
    `(?:${labelSource})(?:(?!(?<!\\()Terhad\\s+[\\d,])[\\s\\S]){0,${maxWindow}}?(?<!\\()Terhad\\s+${capPattern}\\s+([\\d,]+(?:\\.\\d{1,2})?)(?=\\s+[A-Za-z(\\/]|$)`,
    "i"
  );
  return matchLastNumberOnLine(flatText, rx);
}

/**
 * Normalizes printed MyTax date-time strings (e.g. "3-Mar-2020 15:21:52")
 * while keeping the exact timestamp readable.
 */
function parseFilingDateTime(flat: string): string | null {
  const dm = flat.match(
    /Tarikh\s+dan\s+Masa(?:\s+Date\s+and\s+Time)?\s+(\d{1,2}[-\/][A-Za-z0-9]{2,9}[-\/]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i
  );
  if (dm) return dm[1].trim();
  return null;
}

/**
 * Deterministic, PDPA-safe parser for BOTH Malaysian LHDN Form e-BE PDF layouts:
 * 1) 5-page Borang Nyata e-BE (Page 1 income/donations, Page 2 itemized reliefs, Page 4 RUMUSAN CUKAI)
 * 2) 1-page Pengesahan Penerimaan e-BE (Serial No., Submission Timestamp, Summary Totals)
 */
export function parseFormBeText(
  rawText: string
): Partial<AnnualDocExtraction> {
  if (!rawText || rawText.length < 40) return {};
  const text = rawText.replace(/\r\n/g, "\n");
  const flat = text.replace(/\s+/g, " ");

  const isAcknowledgement =
    /PENGESAHAN\s+PENERIMAAN\s+e-BE|ACKNOWLEDGEMENT\s+RECEIPT\s+e-BE/i.test(flat);

  const yearMatch =
    flat.match(/TAHUN\s+TAKSIRAN\s+(20\d{2})/i) ||
    flat.match(/YEAR\s+(?:OF\s+)?ASSESSMENT\s+(20\d{2})/i) ||
    flat.match(/\bTT\s+(20\d{2})\b/i);
  const detectedTaxYear = yearMatch ? Number(yearMatch[1]) : null;

  let assessmentType: AnnualDocExtraction["assessmentType"] = null;
  if (
    /Jenis\s+taksiran\s+BERASINGAN/i.test(flat) ||
    /SEPARATE\s+ASSESSMENT/i.test(flat)
  ) {
    assessmentType = "separate";
  } else if (
    /Jenis\s+taksiran\s+BERSAMA/i.test(flat) ||
    /JOINT\s+ASSESSMENT/i.test(flat)
  ) {
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

  // Page 1 Aggregate Income vs Pengesahan Penerimaan "Total Income RM118,377"
  const aggregateIncome =
    matchLastNumberOnLine(
      flat,
      /PENDAPATAN\s+AGREGAT\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /AGGREGATE\s+INCOME\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );

  const approvedDonations = matchLastNumberOnLine(
    flat,
    /TOLAK\s*:\s*Derma\s*\/\s*hadiah\s*\/\s*sumbangan\s*yang\s*diluluskan\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
  );

  const totalIncomeSummary =
    matchLastNumberOnLine(
      flat,
      /Jumlah\s+Pendapatan(?:\s+Total\s+Income)?\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /JUMLAH\s+PENDAPATAN\s*\(SENDIRI\)\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );

  // Store Aggregate Income as annualIncome when available (so calculator subtracts approvedDonations
  // once to reach Total Income); on Acknowledgement receipts, use Total Income printed.
  const annualIncome =
    aggregateIncome > 0 ? aggregateIncome : totalIncomeSummary;

  const declaredTotalReliefs =
    matchLastNumberOnLine(
      flat,
      /Jumlah\s+pelepasan\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /Total\s+reliefs?\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );

  const declaredChargeableIncome =
    matchLastNumberOnLine(
      flat,
      /Pendapatan\s+Bercukai(?:\s+Chargeable\s+Income)?\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /CHARGEABLE\s+INCOME\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );

  // On 5-page e-BE Page 4: JUMLAH CUKAI PENDAPATAN is pre-rebate gross tax (8,727.97),
  // whereas JUMLAH CUKAI YANG DIKENAKAN / Total Tax Charged is post-rebate net tax (6,627.97).
  // Pengesahan Penerimaan prints ONLY "Jumlah Cukai Yang Dikenakan / Total Tax Charged RM6,627.97".
  const declaredTaxCharged = isAcknowledgement
    ? 0
    : matchLastNumberOnLine(
        flat,
        /JUMLAH\s+CUKAI\s+PENDAPATAN\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
      ) ||
      matchLastNumberOnLine(
        flat,
        /TOTAL\s+INCOME\s+TAX\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
      );

  const declaredTaxRebate =
    matchLastNumberOnLine(
      flat,
      /TOLAK\s*:\s*JUMLAH\s+REBAT\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /TOTAL\s+REBATE\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );

  const zakatPaid =
    matchLastNumberOnLine(
      flat,
      /Zakat\s+dan\s+fitrah\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /Zakat\s+and\s+fitrah\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );

  const declaredTaxPayable =
    matchLastNumberOnLine(
      flat,
      /CUKAI\s+KENA\s+DIBAYAR\s+(?:TAHUN\s+TAKSIRAN\s+20\d{2}\s+)?(?:YEAR\s+OF\s+ASSESSMENT\s+20\d{2}\s+TAX\s+PAYABLE\s+)?(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /TAX\s+PAYABLE\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /Jumlah\s+Cukai\s+Yang\s+Dikenakan(?:\s+Total\s+Tax\s+Charged)?\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );

  const pcbPaid =
    matchLastNumberOnLine(
      flat,
      /(?:Potongan\s+Cukai\s+Bulanan\s*\(PCB\)|Monthly\s+Tax\s+Deductions?\s*\(MTD\))[\s\S]{0,200}?(?:RM\s*)?([\d,]+\.\d{2})/i
    ) || 0;

  const cp500Paid = matchLastNumberOnLine(
    flat,
    /Ansuran\s+CP500[^\d]{0,40}(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
  );

  const otherTaxCredits = matchLastNumberOnLine(
    flat,
    /Jumlah\s+tolakan\s*\/\s*Pelepasan\s+cukai[^\n]{0,120}?\)\s*(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
  );

  const excessPaid =
    matchLastNumberOnLine(
      flat,
      /LEBIHAN\s+BAYARAN\s+(?:TAHUN\s+TAKSIRAN\s+20\d{2}\s+)?(?:YEAR\s+OF\s+ASSESSMENT\s+20\d{2}\s+TAX\s+PAID\s+IN\s+EXCESS\s+)?(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /TAX\s+PAID\s+IN\s+EXCESS\s+(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /EXCESS\s+PAYMENT[^\d]{0,30}(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );
  const balanceDue =
    matchLastNumberOnLine(
      flat,
      /BAKI\s+CUKAI\s+KENA\s+DIBAYAR[^\d]{0,50}(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    matchLastNumberOnLine(
      flat,
      /BALANCE\s+OF\s+TAX\s+PAYABLE[^\d]{0,30}(?:RM\s*)?([\d,]+(?:\.\d{1,2})?)/i
    );
  const declaredRefund =
    excessPaid > 0
      ? excessPaid
      : balanceDue > 0
      ? -balanceDue
      : pcbPaid > 0 || declaredTaxPayable > 0
      ? Math.round((pcbPaid + cp500Paid - declaredTaxPayable) * 100) / 100
      : undefined;

  // Status reliefs (Page 2 of Borang e-BE)
  const selfRelief = matchLastNumberOnLine(
    text,
    /Individu\s+dan\s+saudara\s+tanggungan\s+([\d,]+)/i
  );
  const disabledSelf = matchLastNumberOnLine(
    text,
    /Individu\s+yang\s+kurang\s+upaya\s+([\d,]+)\s*$/im
  );
  const spouseRelief = matchTerhadBox(
    flat,
    "Suami\\s*\\/\\s*Isteri\\s*\\/\\s*Bayaran\\s+alimoni"
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
        childrenUnder18:
          childUnder18Amt > 0 ? Math.round(childUnder18Amt / 2000) : 0,
        childrenHigherEd:
          childHigherEdAmt >= 8000
            ? Math.round(childHigherEdAmt / 8000)
            : childHigherEdAmt > 0
            ? Math.round(childHigherEdAmt / 2000)
            : 0,
        disabledChildren:
          childDisabledAmt > 0 ? Math.round(childDisabledAmt / 6000) : 0,
        disabledChildrenHigherEd: 0,
      }
    : undefined;

  // Core insurance / EPF / SOCSO reliefs (with non-pension & pensionable patterns)
  const lifeInsuranceAmount =
    matchTerhadBox(flat, "Premium\\s+insurans\\s+nyawa") ||
    matchTerhadBox(
      flat,
      "Kategori\\s+penjawat\\s+awam\\s+berpencen\\s*-\\s*Premium\\s+insurans\\s+nyawa"
    );
  const epfEmployee = matchTerhadBox(
    flat,
    "Caruman\\s+KWSP\\/skim\\s+yang\\s+diluluskan"
  );
  const medicalInsuranceAmount = matchTerhadBox(
    flat,
    "Insurans\\s+pendidikan\\s+dan\\s+perubatan"
  );
  const socsoEisEmployee = matchTerhadBox(
    flat,
    "Pertubuhan\\s+Keselamatan\\s+Sosial\\s*\\(PERKESO\\)"
  );

  // Extra reliefs (all Page 1 Donations + Page 2 Relief boxes across YA 2019–2027)
  const extraReliefs: Array<{
    categoryId: string;
    subCategoryId?: string | null;
    label: string;
    amount: number;
  }> = [];
  const pushExtra = (
    categoryId: string,
    label: string,
    amount: number,
    subCategoryId?: string | null
  ) => {
    if (amount > 0) {
      extraReliefs.push({
        categoryId,
        ...(subCategoryId ? { subCategoryId } : {}),
        label,
        amount,
      });
    }
  };

  if (approvedDonations > 0) {
    pushExtra(
      "approved_donations",
      "Approved Donations (Sec. 44(6))",
      approvedDonations
    );
  }

  // Parents Medical Treatment / Care (Terhad 5,000 / 8,000) OR MyKad Parents Allowance (Amaun boleh dituntut)
  const parentsMedicalBox = matchTerhadBox(
    flat,
    "Perbelanjaan\\s+rawatan\\s+perubatan,\\s*keperluan\\s+khas\\s+dan\\s+penjaga\\s+untuk\\s+ibu\\s+bapa"
  );
  const parentsMyKadAllowance = matchLastNumberOnLine(
    flat,
    /Amaun\s+boleh\s+dituntut\s+([\d,]+(?:\.\d{1,2})?)(?=\s+(?:i\.|ii\.|Peralatan|Terhad|[A-Za-z])|$)/i
  );
  if (parentsMedicalBox > 0 && parentsMyKadAllowance === 0) {
    pushExtra(
      "parents_medical",
      "Parents Medical & Care",
      parentsMedicalBox,
      "parents_treatment"
    );
  }
  if (parentsMyKadAllowance > 0) {
    pushExtra(
      "parents_medical",
      "Parents Allowance (MyKad)",
      parentsMyKadAllowance,
      "parents_allowance"
    );
  }

  pushExtra(
    "supporting_equipment",
    "Basic Supporting Equipment",
    matchTerhadBox(flat, "Peralatan\\s+sokongan\\s+asas")
  );
  pushExtra(
    "education_self",
    "Education Fees (Self)",
    matchTerhadBox(flat, "Yuran\\s+pengajian\\s*\\(Sendiri\\)", "[\\d,]+", 340)
  );
  pushExtra(
    "medical_self",
    "Medical Expenses (Self, Spouse & Child)",
    matchTerhadBox(
      flat,
      "Perbelanjaan\\s+perubatan\\s+bagi\\s+penyakit\\s+serius"
    )
  );
  pushExtra(
    "lifestyle",
    "Lifestyle",
    matchTerhadBox(flat, "Gaya\\s+hidup\\s*-\\s*Perbelanjaan", "2,500") ||
      matchTerhadBox(flat, "Gaya\\s+hidup", "2,500")
  );
  pushExtra(
    "sports",
    "Sports Equipment & Activities",
    matchTerhadBox(
      flat,
      "(?:Gaya\\s+hidup\\s*-\\s*Perbelanjaan\\s+tambahan\\s+untuk\\s+aktiviti\\s+sukan|Pembelian\\s+peralatan\\s+sukan)"
    )
  );
  pushExtra(
    "breastfeeding",
    "Breastfeeding equipment",
    matchTerhadBox(flat, "peralatan\\s+penyusuan\\s+ibu")
  );
  pushExtra(
    "childcare",
    "Childcare (TASKA / TADIKA)",
    matchTerhadBox(flat, "taman\\s+asuhan\\s+kanak-kanak\\s*\\/\\s*tadika")
  );
  pushExtra(
    "sspn",
    "SSPN net savings",
    matchTerhadBox(flat, "Skim\\s+Simpanan\\s+Pendidikan\\s+Nasional")
  );
  pushExtra(
    "prs_annuity",
    "PRS / Deferred Annuity",
    matchTerhadBox(flat, "Skim\\s+persaraan\\s+swasta")
  );
  pushExtra(
    "ev_charging",
    "EV Charging & Composting",
    matchTerhadBox(flat, "kemudahan\\s+pengecasan\\s+kenderaan\\s+elektrik")
  );

  // Filing serial number & submission date (from Pengesahan Penerimaan e-BE)
  const serialMatch =
    flat.match(
      /Nombor\s+Siri(?:\s+Serial\s+Number)?\s+((?:BE|B|e-BE)\s*[A-Z0-9-]{4,20})/i
    ) ||
    flat.match(/No\.?\s*(?:Rujukan|Pengesahan)\s*[:#]?\s*([A-Z0-9-]{6,32})/i);
  const filingReferenceNo = serialMatch
    ? serialMatch[1].replace(/\s+/g, " ").trim()
    : null;
  const filingDate = parseFilingDateTime(flat);

  return {
    isAcknowledgement,
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
    declaredRefund,
    pcbPaid,
    cp500Paid,
    otherTaxCredits,
    statusReliefs,
    lifeInsuranceAmount,
    epfEmployee,
    medicalInsuranceAmount,
    socsoEisEmployee,
    extraReliefs,
    filingReferenceNo,
    filingDate,
  };
}
