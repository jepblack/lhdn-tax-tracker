export interface EaFormExtraction {
  // A. Maklumat Asas
  form_type: "C.P.8A (EA)" | "C.P.8C (EC)" | null;
  form_version: string | null;
  tax_year: number | null;
  form_date: string | null;
  employer_statement_number: string | null;
  employer_tax_number: string | null;

  // B. Maklumat Pekerja
  employee_name: string | null;
  employee_designation: string | null;
  employee_staff_or_payroll_number: string | null;
  employee_nric_or_passport: string | null;
  employee_tin: string | null;
  employee_epf_number: string | null;
  employee_socso_number: string | null;
  employee_category: string | null;
  employment_status: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  retirement_or_contract_end_date: string | null;
  eligible_children_for_tax_relief: number | null;
  lhdnm_branch: string | null;

  // C. Maklumat Majikan
  employer_name: string | null;
  employer_address: string | null;
  employer_phone_number: string | null;
  employer_e_number: string | null;
  employer_income_tax_number: string | null;

  // D. Pendapatan Penggajian, Manfaat dan Tempat Kediaman (Bahagian B sahaja)
  gross_salary_wages_ot: number | null;
  fees_commission_bonus: number | null;
  tips_perquisites_gratuity_allowances: number | null;
  income_tax_paid_by_employer: number | null;
  esos_benefit: number | null;
  gratuity_or_reward: number | null;
  arrears_prior_years: number | null;
  benefits_in_kind: number | null;
  residential_benefit: number | null;
  repayment_from_unapproved_fund: number | null;
  compensation_for_loss_of_employment: number | null;

  // E. Pencen dan Bayaran Berkala (Bahagian C sahaja)
  pension: number | null;
  other_periodic_payments: number | null;

  // F. Jumlah Pendapatan (JUMLAH selepas Bahagian B dan C)
  total_gross_income: number | null;

  // G. Potongan (Bahagian D sahaja)
  pcb_paid_to_lhdnm: number | null;
  cp38: number | null;
  zakat_via_salary_deduction: number | null;
  tp1_relief: number | null;
  zakat_other_than_salary_deduction: number | null;
  children_relief: number | null;

  // H. Caruman Pekerja (Bahagian E sahaja)
  epf_employee_contribution: number | null;
  socso_employee_contribution: number | null;
  other_approved_fund_contribution: number | null;

  // I. Elaun Dikecualikan Cukai (Bahagian F - tidak termasuk dalam total_gross_income)
  tax_exempt_benefits: number | null;

  // J. Pengesahan
  certified_by_name: string | null;
  certified_by_designation: string | null;
  certification_date: string | null;

  warnings: string[];
}

export interface PayslipExtraction {
  sourceType: "monthly" | "ytd" | "ea-form";
  formVersion?: string;
  monthDetected?: string;
  yearDetected?: number;
  monthlyGross: number;
  ytdGross: number;
  estimatedAnnualIncome: number;
  grossSalaryB1a?: number;
  allowancesB1c?: number;
  monthlyPcb: number;
  ytdPcb: number;
  monthlyZakat: number;
  ytdZakat: number;
  employeeEpf: number;
  ytdEpf: number;
  employeeSocso: number;
  ytdSocso: number;
  employeeEis: number;
  ytdEis: number;
  employerName?: string;
  employerNo?: string;
  employerAddress?: string;
  employeeName?: string;
  employeeIc?: string;
  employeePosition?: string;
  employeeEpfNo?: string;
  eaForm?: EaFormExtraction;
  rawText?: string;
  confidence: "high" | "medium" | "low";
  notes: string[];
}

const MONTH_MAP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/**
 * Extracts RM currency amounts from a string, preserving 0.00 values
 * and avoiding dates like 31.12.2025.
 */
function extractAmountsFromStr(str: string): number[] {
  const matches = [
    ...str.matchAll(
      /(?:RM|MYR)?\s*(?<![0-9.])([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})(?![0-9.])/gi
    ),
  ];
  const results: number[] = [];
  for (const m of matches) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isNaN(val) && val >= 0 && val < 5000000) {
      results.push(round2(val));
    }
  }
  return results;
}

/**
 * Searches for a currency amount paired with a specific item label.
 * Returns null if the label is not found or no verifiable amount is near it.
 * Returns 0 (0.00) if the label exists and has 0.00.
 */
function findLabeledAmount(
  targetLines: string[],
  pattern: RegExp,
  excludePattern?: RegExp,
  lookaheadLines = 3
): number | null {
  for (let i = 0; i < targetLines.length; i++) {
    const line = targetLines[i];
    if (!pattern.test(line)) continue;
    if (excludePattern && excludePattern.test(line)) continue;

    const direct = extractAmountsFromStr(line);
    if (direct.length > 0) {
      return direct[direct.length - 1];
    }

    for (let j = 1; j <= lookaheadLines && i + j < targetLines.length; j++) {
      const nextLine = targetLines[i + j];
      // Stop if we encounter another section boundary or numbered/lettered item label
      if (
        /^(?:bahagian\s+[a-f]|section\s+[a-f]|butiran\s+pekerja|c\.?\s*p\.?\s*8[abc]|borang\s*e[ac])/i.test(
          nextLine
        ) ||
        /^(?:\d+\.\s*(?:\([a-z]\)|[A-Za-z])|\([a-f]\)\s+[A-Za-z])/i.test(nextLine)
      ) {
        break;
      }
      const nextAmounts = extractAmountsFromStr(nextLine);
      if (nextAmounts.length > 0) {
        return nextAmounts[nextAmounts.length - 1];
      }
    }
  }
  return null;
}

/**
 * Finds all matching amounts on a pattern (used for monthly/YTD payslip heuristics).
 */
function findAllAmountsNearPattern(
  targetLines: string[],
  pattern: RegExp,
  excludePattern?: RegExp,
  lookaheadLines = 3
): number[] {
  const results: number[] = [];
  for (let i = 0; i < targetLines.length; i++) {
    const line = targetLines[i];
    if (!pattern.test(line)) continue;
    if (excludePattern && excludePattern.test(line)) continue;

    const direct = extractAmountsFromStr(line);
    if (direct.length > 0) {
      results.push(...direct);
      continue;
    }

    for (let j = 1; j <= lookaheadLines && i + j < targetLines.length; j++) {
      const nextLine = targetLines[i + j];
      if (
        /^(?:bahagian\s+[a-f]|section\s+[a-f]|butiran\s+pekerja|c\.?\s*p\.?\s*8[abc]|borang\s*e[ac])/i.test(
          nextLine
        ) ||
        /^(?:\d+\.\s*(?:\([a-z]\)|[A-Za-z])|\([a-f]\)\s+[A-Za-z])/i.test(nextLine)
      ) {
        break;
      }
      const nextAmounts = extractAmountsFromStr(nextLine);
      if (nextAmounts.length > 0) {
        results.push(nextAmounts[nextAmounts.length - 1]);
        break;
      }
    }
  }
  return results;
}

function sliceSectionLines(
  lines: string[],
  startPattern: RegExp,
  endPattern?: RegExp
): string[] {
  const startIdx = lines.findIndex((l) => startPattern.test(l));
  if (startIdx === -1) return [];
  let endIdx = lines.length;
  if (endPattern) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (endPattern.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
  }
  return lines.slice(startIdx, endIdx);
}

/**
 * Extracts structured Borang EA / EC (C.P.8A / C.P.8C) data strictly following
 * Malaysian LHDN section boundaries and label-to-value verification rules.
 */
export function parseEaFormText(rawText: string): EaFormExtraction {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const warnings: string[] = [];

  // A. Maklumat Asas
  const isEc = /c\.?\s*p\.?\s*8c|borang\s*ec/i.test(rawText);
  const isEa = /c\.?\s*p\.?\s*8a|borang\s*ea|penyata\s*saraan/i.test(rawText);
  const form_type: EaFormExtraction["form_type"] = isEc
    ? "C.P.8C (EC)"
    : isEa
    ? "C.P.8A (EA)"
    : null;

  const pinMatch = rawText.match(/Pin\.?\s*(\d{4})/i);
  const form_version = pinMatch ? `Pin. ${pinMatch[1]}` : null;

  let tax_year: number | null = null;
  const yearMatch = rawText.match(
    /(?:bagi\s*tahun\s*berakhir\s*31\s*disember|for\s*the\s*year\s*ended\s*31\s*december|tahun\s*saraan|tahun\s*taksiran)\s*[:\-]?\s*(20[1-3][0-9])/i
  );
  if (yearMatch) {
    tax_year = parseInt(yearMatch[1], 10);
  }

  const stmtMatch = rawText.match(/(?:no\.?\s*siri|serial\s*no\.?)\s*[:\-]?\s*([A-Z0-9\-\/]{3,30})/i);
  const employer_statement_number = stmtMatch ? stmtMatch[1].trim() : null;

  const empTaxMatch = rawText.match(
    /(?:no\.?\s*cukai\s*pendapatan\s*majikan|employer'?s?\s*tax\s*no\.?)\s*[:\-]?\s*([A-Z0-9\-\s]{5,25})/i
  );
  const employer_tax_number = empTaxMatch ? empTaxMatch[1].trim() : null;

  // C. Maklumat Majikan
  const employerSection = sliceSectionLines(
    lines,
    /(?:nama\s*dan\s*alamat\s*majikan|nama\s*majikan|no\.?\s*majikan|borang\s*e[ac]|c\.?\s*p\.?\s*8)/i,
    /(?:butiran\s*pekerja|bahagian\s*a\b)/i
  );
  const employerJoined = employerSection.join("\n");

  const eNoMatch =
    employerJoined.match(/no\.?\s*majikan\s*[:\-]?\s*(E\s*[0-9\-\s]{5,20})/i) ||
    rawText.match(/\b(E\s*\d{8,12}(?:-\d{2})?)\b/i);
  const employer_e_number = eNoMatch ? eNoMatch[1].replace(/\s+/g, " ").trim() : null;

  const phoneMatch = employerJoined.match(
    /(?:no\.?\s*tel(?:efon)?|tel(?:ephone)?)\s*[:\-]?\s*([0-9\-\s+()]{7,20})/i
  );
  const employer_phone_number = phoneMatch ? phoneMatch[1].trim() : null;

  let employer_name: string | null = null;
  let employer_address: string | null = null;
  const empNameIdx = employerSection.findIndex((l) =>
    /(?:nama\s*dan\s*alamat\s*majikan|nama\s*majikan|name\s*of\s*employer)/i.test(l)
  );
  if (empNameIdx !== -1) {
    const sameLine = employerSection[empNameIdx]
      .replace(/.*?(?:nama\s*dan\s*alamat\s*majikan|nama\s*majikan|name\s*of\s*employer)\s*[:\-]?\s*/i, "")
      .trim();
    const addrParts: string[] = [];
    if (sameLine.length > 2 && !/no\.?\s*majikan/i.test(sameLine)) {
      employer_name = sameLine;
    }
    for (let k = empNameIdx + 1; k < employerSection.length && k <= empNameIdx + 4; k++) {
      const l = employerSection[k];
      if (/no\.?\s*majikan|no\.?\s*cukai|butiran\s*pekerja|no\.?\s*tel/i.test(l)) break;
      if (!employer_name && l.length > 2) {
        employer_name = l;
      } else if (l.length > 2) {
        addrParts.push(l);
      }
    }
    if (addrParts.length > 0) {
      employer_address = addrParts.join(", ");
    }
  }

  // B. Maklumat Pekerja (BUTIRAN PEKERJA / BAHAGIAN A)
  let employee_name: string | null = null;
  let employee_designation: string | null = null;
  let employee_staff_or_payroll_number: string | null = null;
  let employee_nric_or_passport: string | null = null;
  let employee_tin: string | null = null;
  let employee_epf_number: string | null = null;
  let employee_socso_number: string | null = null;
  let eligible_children_for_tax_relief: number | null = null;

  const employeeSection = sliceSectionLines(
    lines,
    /(?:butiran\s*pekerja|bahagian\s*a\b)/i,
    /bahagian\s*b\b/i
  );
  for (let i = 0; i < employeeSection.length; i++) {
    const l = employeeSection[i];
    if (!employee_name && /(?:^|\d+\.?\s*)nama\b(?!\s*majikan)/i.test(l)) {
      const val = l.replace(/.*?nama\s*(?:pekerja)?\s*[:\-]?\s*/i, "").trim();
      if (val.length > 2 && !/no\.?\s*k\.?p/i.test(val)) {
        employee_name = val;
      } else if (i + 1 < employeeSection.length && !/no\.?\s*k\.?p/i.test(employeeSection[i + 1])) {
        employee_name = employeeSection[i + 1];
      }
    }
    if (!employee_designation && /jawatan\b/i.test(l)) {
      const val = l.replace(/.*?jawatan\s*[:\-]?\s*/i, "").trim();
      if (val.length > 1 && !/no\.?\s*k/i.test(val)) {
        employee_designation = val;
      } else if (i + 1 < employeeSection.length && !/no\.?\s*k/i.test(employeeSection[i + 1])) {
        employee_designation = employeeSection[i + 1];
      }
    }
    if (!employee_staff_or_payroll_number && /(?:no\.?\s*kakitangan|no\.?\s*pekerja|no\.?\s*gaji|staff\s*no)/i.test(l)) {
      const val = l.replace(/.*?(?:no\.?\s*kakitangan|no\.?\s*pekerja|no\.?\s*gaji|staff\s*no\.?)\s*[:\-]?\s*/i, "").trim();
      if (val.length >= 2) employee_staff_or_payroll_number = val;
    }
    if (!employee_nric_or_passport && /(?:no\.?\s*k\.?\s*p\.?|no\.?\s*kad\s*pengenalan|new\s*i\.?c)/i.test(l)) {
      const icMatch =
        l.match(/\b(\d{6}[-\s]?\d{2}[-\s]?\d{4})\b/) ||
        (i + 1 < employeeSection.length
          ? employeeSection[i + 1].match(/\b(\d{6}[-\s]?\d{2}[-\s]?\d{4})\b/)
          : null);
      if (icMatch) {
        employee_nric_or_passport = icMatch[1].trim();
      } else {
        const val = l.replace(/.*?(?:no\.?\s*k\.?\s*p\.?|no\.?\s*kad\s*pengenalan)\s*(?:\/\s*pasport)?\s*[:\-]?\s*/i, "").trim();
        if (val.length >= 5) employee_nric_or_passport = val;
      }
    }
    if (!employee_tin && /(?:no\.?\s*pengenalan\s*cukai|no\.?\s*cukai\s*pendapatan|\btin\b)/i.test(l)) {
      const val = l.replace(/.*?(?:no\.?\s*pengenalan\s*cukai|no\.?\s*cukai\s*pendapatan|\btin\b)\s*[:\-]?\s*/i, "").trim();
      if (val.length >= 5) employee_tin = val;
    }
    if (!employee_epf_number && /(?:no\.?\s*k\.?w\.?s\.?p\.?|no\.?\s*akaun\s*kwsp)/i.test(l)) {
      const epfMatch =
        l.match(/(?:no\.?\s*k\.?w\.?s\.?p\.?|no\.?\s*akaun\s*kwsp)\s*[:\-]?\s*([A-Z0-9\-]{5,20})/i) ||
        (i + 1 < employeeSection.length
          ? employeeSection[i + 1].match(/\b([0-9]{6,12})\b/)
          : null);
      if (epfMatch) employee_epf_number = epfMatch[1].trim();
    }
    if (!employee_socso_number && /(?:no\.?\s*perkeso|no\.?\s*socso)/i.test(l)) {
      const val = l.replace(/.*?(?:no\.?\s*perkeso|no\.?\s*socso)\s*[:\-]?\s*/i, "").trim();
      if (val.length >= 5) employee_socso_number = val;
    }
    if (eligible_children_for_tax_relief === null && /(?:bilangan\s*anak|anak\s*yang\s*layak)/i.test(l)) {
      const numM = l.match(/(\d+)/);
      if (numM) eligible_children_for_tax_relief = parseInt(numM[1], 10);
    }
  }

  // D. Pendapatan Penggajian (Bahagian B sahaja)
  const sectionBLines = sliceSectionLines(
    lines,
    /bahagian\s*b\b/i,
    /bahagian\s*c\b/i
  );
  const bLines = sectionBLines.length > 0 ? sectionBLines : sliceSectionLines(lines, /bahagian\s*b\b/i, /bahagian\s*d\b/i);

  const gross_salary_wages_ot = findLabeledAmount(
    bLines,
    /(?:gaji\s*kasar,\s*upah\s*atau\s*gaji\s*cuti|gaji\s*kasar,\s*upah|\(\s*a\s*\)\s*gaji\s*kasar)/i
  );
  const fees_commission_bonus = findLabeledAmount(
    bLines,
    /(?:fi\s*(?:\([^)]*\)\s*)?,?\s*komisen\s*atau\s*bonus|\(\s*b\s*\)\s*fi)/i
  );
  const tips_perquisites_gratuity_allowances = findLabeledAmount(
    bLines,
    /(?:tip\s*kasar,\s*perkuisit,\s*penerimaan\s*sagu\s*hati|tip\s*kasar,\s*perkuisit|\(\s*c\s*\)\s*tip\s*kasar)/i
  );
  const income_tax_paid_by_employer = findLabeledAmount(
    bLines,
    /(?:cukai\s*pendapatan\s*yang\s*dibayar\s*oleh\s*majikan|\(\s*d\s*\)\s*cukai\s*pendapatan)/i
  );
  const esos_benefit = findLabeledAmount(
    bLines,
    /(?:manfaat\s*skim\s*opsyen\s*saham|\besos\b)/i
  );
  const gratuity_or_reward = findLabeledAmount(
    bLines,
    /(?:ganjaran\s*bagi\s*tempoh|gratuity\s*for\s*the\s*period)/i
  );
  const arrears_prior_years = findLabeledAmount(
    bLines,
    /(?:bayaran\s*tunggakan\s*dan\s*lain-lain|arrears\s*and\s*others)/i
  );
  const benefits_in_kind = findLabeledAmount(
    bLines,
    /(?:manfaat\s*berupa\s*barangan|benefits\s*in\s*kind)/i
  );
  const residential_benefit = findLabeledAmount(
    bLines,
    /(?:nilai\s*tempat\s*kediaman|value\s*of\s*living\s*accommodation)/i
  );
  const repayment_from_unapproved_fund = findLabeledAmount(
    bLines,
    /(?:bayaran\s*balik\s*daripada\s*kumpulan\s*wang\s*simpanan|refund\s*from\s*unapproved)/i
  );
  const compensation_for_loss_of_employment = findLabeledAmount(
    bLines,
    /(?:pampasan\s*kerana\s*kehilangan\s*pekerjaan|compensation\s*for\s*loss\s*of\s*employment)/i
  );

  // E. Pencen dan Bayaran Berkala (Bahagian C sahaja)
  const sectionCLines = sliceSectionLines(
    lines,
    /bahagian\s*c\b/i,
    /bahagian\s*d\b/i
  );
  const pension = findLabeledAmount(
    sectionCLines,
    /(?:^\s*1\.?\s*pencen\b|\bpencen\b(?!\s*dan\s*lain-lain|\s*yang\s*diluluskan))/i,
    /^bahagian\s*c/i
  );
  const other_periodic_payments = findLabeledAmount(
    sectionCLines,
    /(?:anuiti\s*atau\s*bayaran\s*berkala|annuities\s*or\s*other\s*periodical)/i
  );

  // F. Jumlah Pendapatan (JUMLAH selepas Bahagian B dan C)
  const jumlahSource = sectionCLines.length > 0 ? sectionCLines : sliceSectionLines(lines, /bahagian\s*b\b/i, /bahagian\s*d\b/i);
  let total_gross_income = findLabeledAmount(
    jumlahSource,
    /(?:\bjumlah\b(?:\s*\(\s*b1\s*[-–]\s*b5\s*\)|\s*\(\s*b\s*\+\s*c\s*\)|\s*saraan\s*kasar|\s*pendapatan)?|\btotal\b)/i,
    /(?:potongan|bahagian\s*d|section\s*d)/i
  );

  const bAndCItems = [
    gross_salary_wages_ot,
    fees_commission_bonus,
    tips_perquisites_gratuity_allowances,
    income_tax_paid_by_employer,
    esos_benefit,
    gratuity_or_reward,
    arrears_prior_years,
    benefits_in_kind,
    residential_benefit,
    repayment_from_unapproved_fund,
    compensation_for_loss_of_employment,
    pension,
    other_periodic_payments,
  ].filter((v): v is number => v !== null);

  const computedSum = round2(bAndCItems.reduce((a, b) => a + b, 0));

  if (total_gross_income === null && bAndCItems.length > 0) {
    total_gross_income = computedSum;
    warnings.push("Ruang JUMLAH selepas Bahagian B & C tidak ditemui; jumlah dikira daripada item Bahagian B & C.");
  } else if (
    total_gross_income !== null &&
    bAndCItems.length > 0 &&
    Math.abs(total_gross_income - computedSum) > 0.05
  ) {
    warnings.push(
      `Jumlah bercetak (${total_gross_income.toFixed(2)}) tidak sepadan dengan hasil tambah item Bahagian B & C yang dikesan (${computedSum.toFixed(2)}); nilai bercetak dikekalkan.`
    );
  }

  // G. Potongan (Bahagian D sahaja)
  const sectionDLines = sliceSectionLines(
    lines,
    /bahagian\s*d\b/i,
    /bahagian\s*e\b/i
  );
  const pcb_paid_to_lhdnm = findLabeledAmount(
    sectionDLines,
    /(?:potongan\s*cukai\s*bulanan\s*\(pcb\)\s*(?:tahun\s*semasa\s*)?yang\s*dibayar\s*kepada\s*lhdnm|potongan\s*cukai\s*bulanan)/i,
    /^bahagian\s*d/i
  );
  const cp38 = findLabeledAmount(sectionDLines, /(?:arahan\s*potongan\s*cp\s*38|\bcp\s*38\b)/i);
  const zakat_via_salary_deduction = findLabeledAmount(
    sectionDLines,
    /(?:zakat\s*yang\s*dibayar\s*melalui\s*potongan\s*gaji)/i
  );
  const tp1_relief = findLabeledAmount(
    sectionDLines,
    /(?:borang\s*tp1.*pelepasan|tuntutan\s*potongan.*tp1)/i
  );
  const zakat_other_than_salary_deduction = findLabeledAmount(
    sectionDLines,
    /(?:zakat\s*selain\s*yang\s*dibayar\s*melalui\s*potongan\s*gaji)/i
  );
  const children_relief = findLabeledAmount(
    sectionDLines,
    /(?:jumlah\s*pelepasan\s*(?:bagi|untuk)\s*anak)/i
  );

  // H. Caruman Pekerja (Bahagian E sahaja)
  const sectionELines = sliceSectionLines(
    lines,
    /bahagian\s*e\b/i,
    /bahagian\s*f\b/i
  );
  const epf_employee_contribution = findLabeledAmount(
    sectionELines,
    /(?:kumpulan\s*wang\s*simpanan\s*pekerja|\bkwsp\b|\bepf\b)/i,
    /(?:^bahagian\s*e|majikan|employer)/i
  );
  const socso_employee_contribution = findLabeledAmount(
    sectionELines,
    /(?:\bperkeso\b|\bsocso\b|pertubuhan\s*keselamatan\s*sosial)/i,
    /(?:^bahagian\s*e|majikan|employer)/i
  );
  const other_approved_fund_contribution = findLabeledAmount(
    sectionELines,
    /(?:sistem\s*insurans\s*pekerjaan|\bsip\b|\beis\b|kumpulan\s*wang\s*simpanan\/pencen\s*lain)/i,
    /(?:^bahagian\s*e|majikan|employer)/i
  );

  // I. Elaun Dikecualikan Cukai (Bahagian F sahaja - berasingan daripada total_gross_income)
  const sectionFLines = sliceSectionLines(lines, /bahagian\s*f\b/i);
  const tax_exempt_benefits = findLabeledAmount(
    sectionFLines,
    /(?:jumlah\s*elaun\s*\/\s*perkuisit|dikecualikan\s*cukai|tax\s*exempt)/i
  );

  // J. Pengesahan
  let certified_by_name: string | null = null;
  let certified_by_designation: string | null = null;
  let certification_date: string | null = null;

  const certLines = sliceSectionLines(lines, /(?:nama\s*pegawai|pengesahan|tarikh\s*[:\-]?\s*\d)/i);
  for (const l of certLines) {
    if (!certified_by_name && /^nama\b/i.test(l)) {
      const v = l.replace(/^nama\s*[:\-]?\s*/i, "").trim();
      if (v.length > 2) certified_by_name = v;
    }
    if (!certified_by_designation && /^jawatan\b/i.test(l)) {
      const v = l.replace(/^jawatan\s*[:\-]?\s*/i, "").trim();
      if (v.length > 2) certified_by_designation = v;
    }
    if (!certification_date && /tarikh\b/i.test(l)) {
      const dm = l.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);
      if (dm) certification_date = dm[1];
    }
  }

  return {
    form_type,
    form_version,
    tax_year,
    form_date: certification_date,
    employer_statement_number,
    employer_tax_number,
    employee_name,
    employee_designation,
    employee_staff_or_payroll_number,
    employee_nric_or_passport,
    employee_tin,
    employee_epf_number,
    employee_socso_number,
    employee_category: null,
    employment_status: null,
    employment_start_date: null,
    employment_end_date: null,
    retirement_or_contract_end_date: null,
    eligible_children_for_tax_relief,
    lhdnm_branch: null,
    employer_name,
    employer_address,
    employer_phone_number,
    employer_e_number,
    employer_income_tax_number: employer_tax_number,
    gross_salary_wages_ot,
    fees_commission_bonus,
    tips_perquisites_gratuity_allowances,
    income_tax_paid_by_employer,
    esos_benefit,
    gratuity_or_reward,
    arrears_prior_years,
    benefits_in_kind,
    residential_benefit,
    repayment_from_unapproved_fund,
    compensation_for_loss_of_employment,
    pension,
    other_periodic_payments,
    total_gross_income,
    pcb_paid_to_lhdnm,
    cp38,
    zakat_via_salary_deduction,
    tp1_relief,
    zakat_other_than_salary_deduction,
    children_relief,
    epf_employee_contribution,
    socso_employee_contribution,
    other_approved_fund_contribution,
    tax_exempt_benefits,
    certified_by_name,
    certified_by_designation,
    certification_date,
    warnings,
  };
}

/**
 * Parses extracted text from a Malaysian payslip (Swingvy, Kakitangan, Talenox,
 * SQL Payroll, AutoCount, Workday, SAP, etc.) or EA/EC Form (C.P.8A / C.P.8C).
 */
export function parseMalaysianPayslipText(rawText: string): PayslipExtraction {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const isEaForm =
    /c\.?\s*p\.?\s*8[abc]/i.test(rawText) ||
    /cp\s*8[abc]/i.test(rawText) ||
    /borang\s*e[ac]/i.test(rawText) ||
    /\bea\s*form\b/i.test(rawText) ||
    /penyata\s*saraan/i.test(rawText) ||
    /statement\s*of\s*remuneration/i.test(rawText) ||
    /butiran\s*pekerja/i.test(rawText) ||
    /jumlah\s*\(\s*b1\s*[-–]\s*b5\s*\)/i.test(rawText) ||
    /(?:bahagian\s*b\b.*bahagian\s*d\b)/is.test(rawText);

  if (isEaForm) {
    const ea = parseEaFormText(rawText);
    const notes: string[] = [];
    const verLabel = ea.form_version ? `${ea.form_type || "C.P.8A"} ${ea.form_version}` : (ea.form_type || "C.P.8A");
    notes.push(
      ea.tax_year
        ? `Detected Borang EA (${verLabel}) for Year ${ea.tax_year}.`
        : `Detected Borang EA (${verLabel}).`
    );
    if (ea.warnings.length > 0) {
      notes.push(...ea.warnings);
    }

    const totalIncome = ea.total_gross_income ?? 0;
    const pcb = ea.pcb_paid_to_lhdnm ?? 0;
    const epf = ea.epf_employee_contribution ?? 0;
    const socso = ea.socso_employee_contribution ?? 0;
    const zakat = ea.zakat_via_salary_deduction ?? 0;
    const foundCount = [totalIncome > 0, ea.pcb_paid_to_lhdnm !== null, ea.epf_employee_contribution !== null].filter(Boolean).length;
    const confidence: "high" | "medium" | "low" =
      foundCount >= 2 && ea.warnings.length === 0 ? "high" : foundCount >= 1 ? "medium" : "low";

    return {
      sourceType: "ea-form",
      formVersion: ea.form_version || undefined,
      yearDetected: ea.tax_year || undefined,
      employerName: ea.employer_name || undefined,
      employerNo: ea.employer_e_number || undefined,
      employerAddress: ea.employer_address || undefined,
      employeeName: ea.employee_name || undefined,
      employeeIc: ea.employee_nric_or_passport || undefined,
      employeePosition: ea.employee_designation || undefined,
      employeeEpfNo: ea.employee_epf_number || undefined,
      monthlyGross: 0,
      ytdGross: round2(totalIncome),
      estimatedAnnualIncome: round2(totalIncome),
      grossSalaryB1a: ea.gross_salary_wages_ot ?? undefined,
      allowancesB1c: ea.tips_perquisites_gratuity_allowances ?? undefined,
      monthlyPcb: round2(pcb),
      ytdPcb: round2(pcb),
      monthlyZakat: round2(zakat),
      ytdZakat: round2(zakat),
      employeeEpf: round2(epf),
      ytdEpf: round2(epf),
      employeeSocso: round2(socso),
      ytdSocso: round2(socso),
      employeeEis: 0,
      ytdEis: 0,
      eaForm: ea,
      rawText,
      confidence,
      notes,
    };
  }

  // Monthly / YTD Payslip flow
  let employerName: string | undefined;
  const employerMatch = rawText.match(
    /(?:nama\s*majikan|name\s*of\s*employer)\s*[:\-]?\s*([A-Za-z0-9\s.,&'()\/-]{3,80})/i
  );
  if (employerMatch) {
    const raw = employerMatch[1].split(/\r?\n/)[0].trim();
    if (raw.length > 2 && !/no\s*majikan/i.test(raw)) {
      employerName = raw;
    }
  }

  let detectedMonthNum = new Date().getMonth() + 1;
  let monthDetected: string | undefined;
  const monthMatch = rawText.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[\s,\-\/]*202[4-7]/i
  );
  if (monthMatch) {
    monthDetected = monthMatch[0];
    detectedMonthNum = MONTH_MAP[monthMatch[1].toLowerCase()] || detectedMonthNum;
  }

  const ytdGrossCandidates = findAllAmountsNearPattern(
    lines,
    /(ytd\s*(gross|income|earnings|salary|remuneration)|total\s*gross\s*ytd|gross\s*remuneration|pendapatan\s*kasar)/i
  );
  const monthlyGrossCandidates = findAllAmountsNearPattern(
    lines,
    /(total\s*earnings|gross\s*pay|gross\s*salary|gross\s*income|basic\s*salary|basic\s*pay|gaji\s*pokok|jumlah\s*pendapatan)/i,
    /(ytd|employer|majikan|deduction|potongan|net\s*pay|nett\s*pay)/i
  );

  let ytdGross = ytdGrossCandidates.length > 0 ? Math.max(...ytdGrossCandidates) : 0;
  let monthlyGross =
    monthlyGrossCandidates.length > 0 ? Math.max(...monthlyGrossCandidates) : 0;

  if (monthlyGrossCandidates.length >= 2 && ytdGross === 0) {
    const sorted = [...monthlyGrossCandidates].sort((a, b) => a - b);
    const smallest = sorted[0];
    const largest = sorted[sorted.length - 1];
    if (largest > smallest * 1.8 && smallest > 0) {
      monthlyGross = smallest;
      ytdGross = largest;
    }
  }

  const ytdPcbCandidates = findAllAmountsNearPattern(
    lines,
    /(ytd\s*(pcb|mtd|tax)|pcb\s*ytd|mtd\s*ytd|total\s*(pcb|mtd)|potongan\s*cukai\s*bulanan.*jumlah)/i
  );
  const pcbCandidates = findAllAmountsNearPattern(
    lines,
    /(\bpcb\b|\bmtd\b|monthly\s*tax\s*deduction|potongan\s*cukai\s*bulanan|schedular\s*tax)/i,
    /(ytd|employer|majikan)/i
  );

  let ytdPcb = ytdPcbCandidates.length > 0 ? Math.max(...ytdPcbCandidates) : 0;
  let monthlyPcb = pcbCandidates.length > 0 ? pcbCandidates[0] : 0;
  if (pcbCandidates.length >= 2 && ytdPcb === 0) {
    const sorted = [...pcbCandidates].sort((a, b) => a - b);
    if (sorted[0] > 0 && sorted[sorted.length - 1] > sorted[0] * 1.5) {
      monthlyPcb = sorted[0];
      ytdPcb = sorted[sorted.length - 1];
    }
  }

  const ytdZakatCandidates = findAllAmountsNearPattern(lines, /(ytd\s*zakat|zakat\s*ytd)/i);
  const zakatCandidates = findAllAmountsNearPattern(lines, /\bzakat\b/i, /ytd/i);
  let ytdZakat = ytdZakatCandidates.length > 0 ? Math.max(...ytdZakatCandidates) : 0;
  let monthlyZakat = zakatCandidates.length > 0 ? zakatCandidates[0] : 0;
  if (zakatCandidates.length >= 2 && ytdZakat === 0) {
    const sorted = [...zakatCandidates].sort((a, b) => a - b);
    if (sorted[0] > 0 && sorted[sorted.length - 1] > sorted[0] * 1.5) {
      monthlyZakat = sorted[0];
      ytdZakat = sorted[sorted.length - 1];
    }
  }

  const ytdEpfCandidates = findAllAmountsNearPattern(
    lines,
    /(ytd\s*(epf|kwsp)|employee\s*epf\s*ytd|epf\s*ytd)/i,
    /(majikan|employer)/i
  );
  const epfCandidates = findAllAmountsNearPattern(
    lines,
    /(employee\s*(epf|kwsp)|\bepf\b|\bkwsp\b|caruman\s*pekerja)/i,
    /(majikan|employer|ytd)/i
  );
  let ytdEpf = ytdEpfCandidates.length > 0 ? Math.max(...ytdEpfCandidates) : 0;
  let employeeEpf = epfCandidates.length > 0 ? epfCandidates[0] : 0;
  if (epfCandidates.length >= 2 && ytdEpf === 0) {
    const sorted = [...epfCandidates].sort((a, b) => a - b);
    if (sorted[0] > 0 && sorted[sorted.length - 1] > sorted[0] * 1.5) {
      employeeEpf = sorted[0];
      ytdEpf = sorted[sorted.length - 1];
    }
  }

  const socsoCandidates = findAllAmountsNearPattern(
    lines,
    /(employee\s*(socso|perkeso)|\bsocso\b|\bperkeso\b)/i,
    /(majikan|employer)/i
  );
  const eisCandidates = findAllAmountsNearPattern(
    lines,
    /(employee\s*(eis|sip)|\beis\b|\bsip\b)/i,
    /(majikan|employer)/i
  );

  const employeeSocso = socsoCandidates.length > 0 ? socsoCandidates[0] : 0;
  let ytdSocso =
    socsoCandidates.length >= 2 &&
    socsoCandidates[0] > 0 &&
    socsoCandidates[socsoCandidates.length - 1] > socsoCandidates[0] * 1.5
      ? socsoCandidates[socsoCandidates.length - 1]
      : 0;

  const employeeEis = eisCandidates.length > 0 ? eisCandidates[0] : 0;
  let ytdEis =
    eisCandidates.length >= 2 &&
    eisCandidates[0] > 0 &&
    eisCandidates[eisCandidates.length - 1] > eisCandidates[0] * 1.5
      ? eisCandidates[eisCandidates.length - 1]
      : 0;

  const notes: string[] = [];
  let sourceType: "monthly" | "ytd" = "monthly";
  let estimatedAnnualIncome = 0;

  if (ytdGross > 0) {
    sourceType = "ytd";
    estimatedAnnualIncome =
      monthlyGross > 0 && detectedMonthNum < 12
        ? Math.round(ytdGross + monthlyGross * (12 - detectedMonthNum))
        : Math.round(ytdGross);
    notes.push(
      monthlyGross > 0 && detectedMonthNum < 12
        ? `Used YTD Gross + remaining ${12 - detectedMonthNum} month(s) projected.`
        : "Extracted YTD figures directly from payslip."
    );
  } else if (monthlyGross > 0) {
    sourceType = "monthly";
    estimatedAnnualIncome = Math.round(monthlyGross * 12);
    if (ytdPcb === 0 && monthlyPcb > 0) {
      ytdPcb = Math.round(monthlyPcb * detectedMonthNum * 100) / 100;
      notes.push(
        `Estimated YTD PCB as RM${monthlyPcb.toFixed(2)} × ${detectedMonthNum} months${monthDetected ? ` (${monthDetected})` : ""}.`
      );
    }
    if (ytdZakat === 0 && monthlyZakat > 0) {
      ytdZakat = Math.round(monthlyZakat * detectedMonthNum * 100) / 100;
    }
    if (ytdEpf === 0 && employeeEpf > 0) {
      ytdEpf = Math.round(employeeEpf * detectedMonthNum * 100) / 100;
    }
    if (ytdSocso === 0 && employeeSocso > 0) {
      ytdSocso = Math.round(employeeSocso * detectedMonthNum * 100) / 100;
    }
    if (ytdEis === 0 && employeeEis > 0) {
      ytdEis = Math.round(employeeEis * detectedMonthNum * 100) / 100;
    }
    notes.push(
      `Projected annual income as Monthly Gross (RM${monthlyGross.toLocaleString("en-MY")}) × 12.`
    );
  }

  const foundCount = [
    estimatedAnnualIncome > 0,
    ytdPcb > 0 || monthlyPcb > 0,
    ytdEpf > 0 || employeeEpf > 0,
  ].filter(Boolean).length;

  const confidence: "high" | "medium" | "low" =
    foundCount >= 2 ? "high" : foundCount === 1 ? "medium" : "low";

  if (foundCount === 0) {
    notes.push(
      "Could not auto-detect salary/PCB numbers — check the scanned text or enter values manually."
    );
  }

  return {
    sourceType,
    monthDetected,
    employerName,
    monthlyGross: round2(monthlyGross),
    ytdGross: round2(ytdGross),
    estimatedAnnualIncome: round2(estimatedAnnualIncome),
    monthlyPcb: round2(monthlyPcb),
    ytdPcb: round2(ytdPcb),
    monthlyZakat: round2(monthlyZakat),
    ytdZakat: round2(ytdZakat),
    employeeEpf: round2(employeeEpf),
    ytdEpf: round2(ytdEpf),
    employeeSocso: round2(employeeSocso),
    ytdSocso: round2(ytdSocso),
    employeeEis: round2(employeeEis),
    ytdEis: round2(ytdEis),
    rawText,
    confidence,
    notes,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
