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
      results.push(val);
    }
  }
  return results;
}

/**
 * Searches for amounts on lines matching a pattern within a given line slice.
 * Verifies each number against its item label; if no amount is on the label line,
 * inspects up to `lookaheadLines` subsequent lines, stopping at the next item or section.
 */
function findAmountsNearPatternInLines(
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
      // If multiple amounts on the same line, the rightmost column is the field value
      results.push(direct[direct.length - 1]);
      continue;
    }

    for (let j = 1; j <= lookaheadLines && i + j < targetLines.length; j++) {
      const nextLine = targetLines[i + j];
      // Stop if we hit another section or another numbered/lettered item label
      if (
        /^(?:bahagian\s+[a-f]|section\s+[a-f]|butiran\s+pekerja|c\.?\s*p\.?\s*8[ab]|borang\s*ea)/i.test(
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

/**
 * Slices lines between a start section regex and an end section regex.
 */
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
 * Parses extracted text from a Malaysian payslip (Swingvy, Kakitangan, Talenox,
 * SQL Payroll, AutoCount, Workday, SAP, etc.) or EA Form (C.P.8A Pin. 2017 / 2023+).
 */
export function parseMalaysianPayslipText(rawText: string): PayslipExtraction {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const isEaForm =
    /c\.?\s*p\.?\s*8[ab]/i.test(rawText) ||
    /cp\s*8[ab]/i.test(rawText) ||
    /borang\s*e\.?\s*a/i.test(rawText) ||
    /\bea\s*form\b/i.test(rawText) ||
    /penyata\s*saraan\s*daripada\s*penggajian/i.test(rawText) ||
    /penyata\s*saraan/i.test(rawText) ||
    /statement\s*of\s*remuneration/i.test(rawText) ||
    /butiran\s*pekerja/i.test(rawText) ||
    /jumlah\s*\(\s*b1\s*[-–]\s*b5\s*\)/i.test(rawText) ||
    /(?:bahagian\s*b\b.*bahagian\s*d\b)/is.test(rawText);

  const versionMatch = rawText.match(/C\.?\s*P\.?\s*8[AB]\s*[-–]?\s*Pin\.?\s*\d{4}/i);
  const formVersion = versionMatch ? versionMatch[0].replace(/\s+/g, " ").trim() : undefined;

  // Detect tax year (especially prominent on EA Forms)
  let yearDetected: number | undefined;
  const yearMatch = rawText.match(
    /(?:bagi\s*tahun|for\s*the\s*year|tahun\s*taksiran|taksiran|year\s*ended)\s*(?:berakhir|ended)?\s*(?:31\s*disember|31\s*december)?\s*(20[1-3][0-9])/i
  );
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (yr >= 2015 && yr <= 2035) yearDetected = yr;
  }

  // Employer & Employee metadata (for EA Forms)
  let employerName: string | undefined;
  let employerNo: string | undefined;
  let employerAddress: string | undefined;
  let employeeName: string | undefined;
  let employeeIc: string | undefined;
  let employeePosition: string | undefined;
  let employeeEpfNo: string | undefined;

  if (isEaForm) {
    const employerSection = sliceSectionLines(
      lines,
      /(?:nama\s*dan\s*alamat\s*majikan|nama\s*majikan|no\.?\s*majikan|borang\s*ea|c\.?\s*p\.?\s*8)/i,
      /(?:butiran\s*pekerja|bahagian\s*a\b)/i
    );
    const employerJoined = employerSection.join("\n");

    const eNoMatch =
      employerJoined.match(/no\.?\s*majikan\s*[:\-]?\s*(E\s*[0-9\-\s]{5,20})/i) ||
      rawText.match(/\b(E\s*\d{8,12}(?:-\d{2})?)\b/i);
    if (eNoMatch) {
      employerNo = eNoMatch[1].replace(/\s+/g, " ").trim();
    }

    const empNameIdx = employerSection.findIndex((l) =>
      /(?:nama\s*dan\s*alamat\s*majikan|nama\s*majikan|name\s*of\s*employer)/i.test(l)
    );
    if (empNameIdx !== -1) {
      const sameLine = employerSection[empNameIdx]
        .replace(/.*?(?:nama\s*dan\s*alamat\s*majikan|nama\s*majikan|name\s*of\s*employer)\s*[:\-]?\s*/i, "")
        .trim();
      const addrParts: string[] = [];
      if (sameLine.length > 2 && !/no\.?\s*majikan/i.test(sameLine)) {
        employerName = sameLine;
      }
      for (let k = empNameIdx + 1; k < employerSection.length && k <= empNameIdx + 4; k++) {
        const l = employerSection[k];
        if (/no\.?\s*majikan|no\.?\s*cukai|butiran\s*pekerja/i.test(l)) break;
        if (!employerName && l.length > 2) {
          employerName = l;
        } else if (l.length > 2) {
          addrParts.push(l);
        }
      }
      if (addrParts.length > 0) {
        employerAddress = addrParts.join(", ");
      }
    }

    // Employee metadata from BUTIRAN PEKERJA / BAHAGIAN A
    const employeeSection = sliceSectionLines(
      lines,
      /(?:butiran\s*pekerja|bahagian\s*a\b)/i,
      /bahagian\s*b\b/i
    );
    for (let i = 0; i < employeeSection.length; i++) {
      const l = employeeSection[i];
      if (!employeeName && /(?:^|\d+\.?\s*)nama\b(?!\s*majikan)/i.test(l)) {
        const val = l.replace(/.*?nama\s*(?:pekerja)?\s*[:\-]?\s*/i, "").trim();
        if (val.length > 2 && !/no\.?\s*k\.?p/i.test(val)) {
          employeeName = val;
        } else if (i + 1 < employeeSection.length && !/no\.?\s*k\.?p/i.test(employeeSection[i + 1])) {
          employeeName = employeeSection[i + 1];
        }
      }
      if (!employeeIc && /(?:no\.?\s*k\.?\s*p\.?|no\.?\s*kad\s*pengenalan|new\s*i\.?c)/i.test(l)) {
        const icMatch =
          l.match(/\b(\d{6}[-\s]?\d{2}[-\s]?\d{4})\b/) ||
          (i + 1 < employeeSection.length
            ? employeeSection[i + 1].match(/\b(\d{6}[-\s]?\d{2}[-\s]?\d{4})\b/)
            : null);
        if (icMatch) {
          employeeIc = icMatch[1].trim();
        } else {
          const val = l.replace(/.*?(?:no\.?\s*k\.?\s*p\.?|no\.?\s*kad\s*pengenalan)\s*(?:\/\s*pasport)?\s*[:\-]?\s*/i, "").trim();
          if (val.length >= 5) employeeIc = val;
        }
      }
      if (!employeePosition && /jawatan\b/i.test(l)) {
        const val = l.replace(/.*?jawatan\s*[:\-]?\s*/i, "").trim();
        if (val.length > 1 && !/no\.?\s*k/i.test(val)) {
          employeePosition = val;
        } else if (i + 1 < employeeSection.length && !/no\.?\s*k/i.test(employeeSection[i + 1])) {
          employeePosition = employeeSection[i + 1];
        }
      }
      if (!employeeEpfNo && /(?:no\.?\s*k\.?w\.?s\.?p\.?|no\.?\s*akaun\s*kwsp)/i.test(l)) {
        const epfMatch =
          l.match(/(?:no\.?\s*k\.?w\.?s\.?p\.?|no\.?\s*akaun\s*kwsp)\s*[:\-]?\s*([A-Z0-9\-]{5,20})/i) ||
          (i + 1 < employeeSection.length
            ? employeeSection[i + 1].match(/\b([0-9]{6,12})\b/)
            : null);
        if (epfMatch) {
          employeeEpfNo = epfMatch[1].trim();
        }
      }
    }
  } else {
    const employerMatch = rawText.match(
      /(?:nama\s*majikan|name\s*of\s*employer)\s*[:\-]?\s*([A-Za-z0-9\s.,&'()\/-]{3,80})/i
    );
    if (employerMatch) {
      const raw = employerMatch[1].split(/\r?\n/)[0].trim();
      if (raw.length > 2 && !/no\s*majikan/i.test(raw)) {
        employerName = raw;
      }
    }
  }

  // Detect payslip month (to estimate YTD if only monthly figures exist)
  let detectedMonthNum = new Date().getMonth() + 1;
  let monthDetected: string | undefined;
  const monthMatch = rawText.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[\s,\-\/]*202[4-7]/i
  );
  if (monthMatch) {
    monthDetected = monthMatch[0];
    detectedMonthNum = MONTH_MAP[monthMatch[1].toLowerCase()] || detectedMonthNum;
  }

  // Section-scoped EA Form extraction
  let grossSalaryB1a = 0;
  let allowancesB1c = 0;
  let eaTotalIncome = 0;
  let eaPcb = 0;
  let eaZakat = 0;
  let eaEpf = 0;
  let eaSocso = 0;
  let eaEis = 0;

  if (isEaForm) {
    // Income: read Bahagian B and Bahagian C ONLY
    const sectionBCLines = sliceSectionLines(
      lines,
      /bahagian\s*b\b/i,
      /bahagian\s*d\b/i
    );
    const incomeLines = sectionBCLines.length > 0 ? sectionBCLines : lines;

    const b1aCandidates = findAmountsNearPatternInLines(
      incomeLines,
      /(?:gaji\s*kasar,\s*upah\s*atau\s*gaji\s*cuti|gaji\s*kasar,\s*upah|\(\s*a\s*\)\s*gaji\s*kasar)/i
    );
    if (b1aCandidates.length > 0) {
      grossSalaryB1a = b1aCandidates[0];
    }

    const b1cCandidates = findAmountsNearPatternInLines(
      incomeLines,
      /(?:tip\s*kasar,\s*perkuisit|penerimaan\s*sagu\s*hati\s*atau\s*elaun|\(\s*c\s*\)\s*tip\s*kasar)/i
    );
    if (b1cCandidates.length > 0) {
      allowancesB1c = b1cCandidates[0];
    }

    // Look for JUMLAH after Bahagian B and C (Pin. 2017 uses "JUMLAH" at the end of Section C)
    const sectionCLines = sliceSectionLines(
      incomeLines,
      /bahagian\s*c\b/i,
      /bahagian\s*d\b/i
    );
    const jumlahSource = sectionCLines.length > 0 ? sectionCLines : incomeLines;
    const jumlahCandidates = findAmountsNearPatternInLines(
      jumlahSource,
      /(?:\bjumlah\b(?:\s*\(\s*b1\s*[-–]\s*b5\s*\)|\s*\(\s*b\s*\+\s*c\s*\)|\s*saraan\s*kasar|\s*pendapatan)?|\btotal\b)/i,
      /(?:potongan|bahagian\s*d|section\s*d)/i
    );
    if (jumlahCandidates.length > 0) {
      // Pick the largest / final JUMLAH in Bahagian B-C
      eaTotalIncome = Math.max(...jumlahCandidates);
    }

    if (eaTotalIncome === 0 && (grossSalaryB1a > 0 || allowancesB1c > 0)) {
      eaTotalIncome = round2(grossSalaryB1a + allowancesB1c);
    }

    // Deductions: Bahagian D
    const sectionDLines = sliceSectionLines(
      lines,
      /bahagian\s*d\b/i,
      /bahagian\s*e\b/i
    );
    const dedLines = sectionDLines.length > 0 ? sectionDLines : lines;

    const pcbFound = findAmountsNearPatternInLines(
      dedLines,
      /(?:potongan\s*cukai\s*bulanan\s*\(pcb\)\s*(?:tahun\s*semasa\s*)?yang\s*dibayar\s*kepada\s*lhdnm|potongan\s*cukai\s*bulanan)/i,
      /(?:^bahagian\s*d|majikan|employer)/i
    );
    if (pcbFound.length > 0) eaPcb = pcbFound[0];

    const zakatFound = findAmountsNearPatternInLines(
      dedLines,
      /(?:zakat\s*yang\s*dibayar\s*melalui\s*potongan\s*gaji|\bzakat\b)/i,
      /(?:^bahagian\s*d|majikan|employer)/i
    );
    if (zakatFound.length > 0) eaZakat = zakatFound[0];

    // Contributions: Bahagian E
    const sectionELines = sliceSectionLines(
      lines,
      /bahagian\s*e\b/i,
      /bahagian\s*f\b/i
    );
    const contribLines = sectionELines.length > 0 ? sectionELines : lines;

    const epfFound = findAmountsNearPatternInLines(
      contribLines,
      /(?:kumpulan\s*wang\s*simpanan\s*pekerja|\bkwsp\b|\bepf\b)/i,
      /(?:^bahagian\s*e|majikan|employer)/i
    );
    if (epfFound.length > 0) eaEpf = epfFound[0];

    const socsoFound = findAmountsNearPatternInLines(
      contribLines,
      /(?:\bperkeso\b|\bsocso\b|pertubuhan\s*keselamatan\s*sosial)/i,
      /(?:^bahagian\s*e|majikan|employer)/i
    );
    if (socsoFound.length > 0) eaSocso = socsoFound[0];

    const eisFound = findAmountsNearPatternInLines(
      contribLines,
      /(?:sistem\s*insurans\s*pekerjaan|\bsip\b|\beis\b)/i,
      /(?:^bahagian\s*e|majikan|employer)/i
    );
    if (eisFound.length > 0) eaEis = eisFound[0];
  }

  // Monthly / YTD Payslip fallback patterns (used when not EA Form, or as backup)
  const ytdGrossCandidates = findAmountsNearPatternInLines(
    lines,
    /(ytd\s*(gross|income|earnings|salary|remuneration)|total\s*gross\s*ytd|gross\s*remuneration|pendapatan\s*kasar)/i
  );
  const monthlyGrossCandidates = findAmountsNearPatternInLines(
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

  const ytdPcbCandidates = findAmountsNearPatternInLines(
    lines,
    /(ytd\s*(pcb|mtd|tax)|pcb\s*ytd|mtd\s*ytd|total\s*(pcb|mtd)|potongan\s*cukai\s*bulanan.*jumlah)/i
  );
  const pcbCandidates = findAmountsNearPatternInLines(
    lines,
    /(\bpcb\b|\bmtd\b|monthly\s*tax\s*deduction|potongan\s*cukai\s*bulanan|schedular\s*tax)/i,
    /(ytd|employer|majikan|^bahagian\s+[a-f])/i
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

  const ytdZakatCandidates = findAmountsNearPatternInLines(lines, /(ytd\s*zakat|zakat\s*ytd)/i);
  const zakatCandidates = findAmountsNearPatternInLines(lines, /\bzakat\b/i, /ytd/i);
  let ytdZakat = ytdZakatCandidates.length > 0 ? Math.max(...ytdZakatCandidates) : 0;
  let monthlyZakat = zakatCandidates.length > 0 ? zakatCandidates[0] : 0;
  if (zakatCandidates.length >= 2 && ytdZakat === 0) {
    const sorted = [...zakatCandidates].sort((a, b) => a - b);
    if (sorted[0] > 0 && sorted[sorted.length - 1] > sorted[0] * 1.5) {
      monthlyZakat = sorted[0];
      ytdZakat = sorted[sorted.length - 1];
    }
  }

  const ytdEpfCandidates = findAmountsNearPatternInLines(
    lines,
    /(ytd\s*(epf|kwsp)|employee\s*epf\s*ytd|epf\s*ytd)/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  const epfCandidates = findAmountsNearPatternInLines(
    lines,
    /(employee\s*(epf|kwsp)|\bepf\b|\bkwsp\b|caruman\s*pekerja)/i,
    /(majikan|employer|ytd|^bahagian\s+[a-f]|^section\s+[a-f])/i
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

  const socsoCandidates = findAmountsNearPatternInLines(
    lines,
    /(employee\s*(socso|perkeso)|\bsocso\b|\bperkeso\b)/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  const eisCandidates = findAmountsNearPatternInLines(
    lines,
    /(employee\s*(eis|sip)|\beis\b|\bsip\b)/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );

  let employeeSocso = socsoCandidates.length > 0 ? socsoCandidates[0] : 0;
  let ytdSocso =
    socsoCandidates.length >= 2 &&
    socsoCandidates[0] > 0 &&
    socsoCandidates[socsoCandidates.length - 1] > socsoCandidates[0] * 1.5
      ? socsoCandidates[socsoCandidates.length - 1]
      : 0;

  let employeeEis = eisCandidates.length > 0 ? eisCandidates[0] : 0;
  let ytdEis =
    eisCandidates.length >= 2 &&
    eisCandidates[0] > 0 &&
    eisCandidates[eisCandidates.length - 1] > eisCandidates[0] * 1.5
      ? eisCandidates[eisCandidates.length - 1]
      : 0;

  // Compute smart annual / YTD projections
  const notes: string[] = [];
  let sourceType: "monthly" | "ytd" | "ea-form" = "monthly";
  let estimatedAnnualIncome = 0;

  if (isEaForm) {
    sourceType = "ea-form";
    estimatedAnnualIncome = eaTotalIncome > 0 ? eaTotalIncome : ytdGross || monthlyGross;
    ytdGross = estimatedAnnualIncome;

    ytdPcb = eaPcb > 0 ? eaPcb : ytdPcb || monthlyPcb;
    ytdZakat = eaZakat; // Keep 0.00 explicitly if Bahagian D Zakat is 0.00
    ytdEpf = eaEpf > 0 ? eaEpf : ytdEpf || employeeEpf;
    employeeEpf = ytdEpf;
    ytdSocso = eaSocso > 0 ? eaSocso : ytdSocso || employeeSocso;
    employeeSocso = ytdSocso;
    ytdEis = eaEis; // Keep 0.00 explicitly if Bahagian E SIP is 0.00
    employeeEis = ytdEis;

    const verLabel = formVersion || "C.P.8A";
    notes.push(
      yearDetected
        ? `Detected Borang EA (${verLabel}) annual totals for Year ${yearDetected}.`
        : `Detected Borang EA (${verLabel}) annual totals.`
    );
  } else if (ytdGross > 0) {
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
    formVersion,
    monthDetected,
    yearDetected,
    employerName,
    employerNo,
    employerAddress,
    employeeName,
    employeeIc,
    employeePosition,
    employeeEpfNo,
    monthlyGross: round2(monthlyGross),
    ytdGross: round2(ytdGross),
    estimatedAnnualIncome: round2(estimatedAnnualIncome),
    grossSalaryB1a: isEaForm ? round2(grossSalaryB1a) : undefined,
    allowancesB1c: isEaForm ? round2(allowancesB1c) : undefined,
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
