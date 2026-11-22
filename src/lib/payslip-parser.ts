export interface PayslipExtraction {
  sourceType: "monthly" | "ytd" | "ea-form";
  monthDetected?: string;
  yearDetected?: number;
  monthlyGross: number;
  ytdGross: number;
  estimatedAnnualIncome: number;
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
 * Parses extracted text from a Malaysian payslip (Swingvy, Kakitangan, Talenox,
 * SQL Payroll, AutoCount, Workday, SAP, etc.) or EA Form (C.P.8A / C.P.8B).
 */
export function parseMalaysianPayslipText(rawText: string): PayslipExtraction {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // EA Form detection heuristics
  const isEaForm =
    /c\.?\s*p\.?\s*8[ab]/i.test(rawText) ||
    /cp\s*8[ab]/i.test(rawText) ||
    /borang\s*e\.?\s*a/i.test(rawText) ||
    /\bea\s*form\b/i.test(rawText) ||
    /penyata\s*saraan\s*daripada\s*penggajian/i.test(rawText) ||
    /penyata\s*saraan/i.test(rawText) ||
    /statement\s*of\s*remuneration/i.test(rawText) ||
    /jumlah\s*\(\s*b1\s*[-–]\s*b5\s*\)/i.test(rawText) ||
    /(?:bahagian\s*b\s*[:\-].*bahagian\s*d\s*[:\-])/is.test(rawText) ||
    /(?:pendapatan\s*penggajian.*potongan\s*cukai\s*bulanan)/is.test(rawText);

  // Detect tax year (especially prominent on EA Forms)
  let yearDetected: number | undefined;
  const yearMatch = rawText.match(
    /(?:bagi\s*tahun|for\s*the\s*year|tahun\s*taksiran|taksiran|year\s*ended)\s*(?:berakhir|ended)?\s*(?:31\s*disember|31\s*december)?\s*(202[0-9])/i
  );
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (yr >= 2020 && yr <= 2035) yearDetected = yr;
  }

  // Detect employer name
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

  // Helper to extract numbers formatted as currency (e.g. 5,000.00 or 5000.00)
  const extractAmountsFromStr = (str: string): number[] => {
    const matches = [
      ...str.matchAll(
        /(?:RM|MYR)?\s*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})\b/gi
      ),
    ];
    const results: number[] = [];
    for (const m of matches) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (val > 0 && val < 5000000) {
        results.push(val);
      }
    }
    return results;
  };

  /**
   * Searches for amounts on lines matching a pattern.
   * If the matching line doesn't have an amount, it inspects up to `lookaheadLines`
   * subsequent lines (handles PDF table extractions where headers and figures split lines).
   */
  const findAmountsNearPattern = (
    pattern: RegExp,
    excludePattern?: RegExp,
    lookaheadLines = 3
  ): number[] => {
    const results: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!pattern.test(line)) continue;
      if (excludePattern && excludePattern.test(line)) continue;

      const direct = extractAmountsFromStr(line);
      if (direct.length > 0) {
        results.push(...direct);
        continue;
      }

      // Check subsequent lines if current line has label only
      for (let j = 1; j <= lookaheadLines && i + j < lines.length; j++) {
        const nextLine = lines[i + j];
        // Stop if entering a new major section
        if (/^(?:bahagian\s+[a-f]|section\s+[a-f]|c\.?p\.?8[ab]|borang\s*ea)/i.test(nextLine)) {
          break;
        }
        const nextAmounts = extractAmountsFromStr(nextLine);
        if (nextAmounts.length > 0) {
          results.push(...nextAmounts);
          break; // take the closest line with figures
        }
      }
    }
    return results;
  };

  // 1. Gross Income / Basic Salary / EA Remuneration
  // EA Form Section B specific patterns
  const eaGrossCandidates = findAmountsNearPattern(
    /(jumlah\s*\(\s*b1\s*[-–]\s*b5\s*\)|jumlah\s*saraan\s*kasar|total\s*gross\s*remuneration|jumlah\s*pendapatan\s*penggajian|jumlah\s*b1|gaji\s*kasar,\s*upah|gaji\s*kasar)/i
  );
  const ytdGrossCandidates = findAmountsNearPattern(
    /(ytd\s*(gross|income|earnings|salary|remuneration)|total\s*gross\s*ytd|gross\s*remuneration|pendapatan\s*kasar)/i
  );
  const monthlyGrossCandidates = findAmountsNearPattern(
    /(total\s*earnings|gross\s*pay|gross\s*salary|gross\s*income|basic\s*salary|basic\s*pay|gaji\s*pokok|jumlah\s*pendapatan)/i,
    /(ytd|employer|majikan|deduction|potongan|net\s*pay|nett\s*pay)/i
  );

  let ytdGross = ytdGrossCandidates.length > 0 ? Math.max(...ytdGrossCandidates) : 0;
  let monthlyGross =
    monthlyGrossCandidates.length > 0 ? Math.max(...monthlyGrossCandidates) : 0;

  // If a line has both current and YTD columns (e.g. "Gross Pay   8,000.00   80,000.00")
  if (monthlyGrossCandidates.length >= 2 && ytdGross === 0) {
    const sorted = [...monthlyGrossCandidates].sort((a, b) => a - b);
    const smallest = sorted[0];
    const largest = sorted[sorted.length - 1];
    if (largest > smallest * 1.8) {
      monthlyGross = smallest;
      ytdGross = largest;
    }
  }

  // 2. PCB / MTD (Potongan Cukai Bulanan)
  // EA Form Section D1 specific
  const eaPcbCandidates = findAmountsNearPattern(
    /(potongan\s*cukai\s*bulanan\s*\(pcb\)|potongan\s*cukai\s*bulanan|d1[\s.:)]|cukai\s*yang\s*dipotong)/i
  );
  const ytdPcbCandidates = findAmountsNearPattern(
    /(ytd\s*(pcb|mtd|tax)|pcb\s*ytd|mtd\s*ytd|total\s*(pcb|mtd)|potongan\s*cukai\s*bulanan.*jumlah)/i
  );
  const pcbCandidates = findAmountsNearPattern(
    /(\bpcb\b|\bmtd\b|monthly\s*tax\s*deduction|potongan\s*cukai\s*bulanan|schedular\s*tax)/i,
    /(ytd|employer|majikan)/i
  );

  let ytdPcb = ytdPcbCandidates.length > 0 ? Math.max(...ytdPcbCandidates) : 0;
  let monthlyPcb = pcbCandidates.length > 0 ? pcbCandidates[0] : 0;
  if (pcbCandidates.length >= 2 && ytdPcb === 0) {
    const sorted = [...pcbCandidates].sort((a, b) => a - b);
    if (sorted[sorted.length - 1] > sorted[0] * 1.5) {
      monthlyPcb = sorted[0];
      ytdPcb = sorted[sorted.length - 1];
    }
  }

  // 3. Zakat
  // EA Form Section D3 specific
  const eaZakatCandidates = findAmountsNearPattern(
    /(zakat\s*yang\s*dibayar\s*melalui\s*potongan\s*gaji|zakat\s*potongan\s*gaji|d3[\s.:)])/i
  );
  const ytdZakatCandidates = findAmountsNearPattern(/(ytd\s*zakat|zakat\s*ytd)/i);
  const zakatCandidates = findAmountsNearPattern(/\bzakat\b/i, /ytd/i);
  let ytdZakat = ytdZakatCandidates.length > 0 ? Math.max(...ytdZakatCandidates) : 0;
  let monthlyZakat = zakatCandidates.length > 0 ? zakatCandidates[0] : 0;
  if (zakatCandidates.length >= 2 && ytdZakat === 0) {
    const sorted = [...zakatCandidates].sort((a, b) => a - b);
    if (sorted[sorted.length - 1] > sorted[0] * 1.5) {
      monthlyZakat = sorted[0];
      ytdZakat = sorted[sorted.length - 1];
    }
  }

  // 4. Employee EPF (KWSP)
  // EA Form Section E1 specific
  const eaEpfCandidates = findAmountsNearPattern(
    /(kumpulan\s*wang\s*simpanan\s*pekerja|kwsp|epf|e1[\s.:)])/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  const ytdEpfCandidates = findAmountsNearPattern(
    /(ytd\s*(epf|kwsp)|employee\s*epf\s*ytd|epf\s*ytd)/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  const epfCandidates = findAmountsNearPattern(
    /(employee\s*(epf|kwsp)|\bepf\b|\bkwsp\b|caruman\s*pekerja)/i,
    /(majikan|employer|ytd|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  let ytdEpf = ytdEpfCandidates.length > 0 ? Math.max(...ytdEpfCandidates) : 0;
  let employeeEpf = epfCandidates.length > 0 ? epfCandidates[0] : 0;
  if (epfCandidates.length >= 2 && ytdEpf === 0) {
    const sorted = [...epfCandidates].sort((a, b) => a - b);
    if (sorted[sorted.length - 1] > sorted[0] * 1.5) {
      employeeEpf = sorted[0];
      ytdEpf = sorted[sorted.length - 1];
    }
  }

  // 5. Employee SOCSO (PERKESO) & EIS (SIP)
  // EA Form Section E2 & E3 specific
  const eaSocsoCandidates = findAmountsNearPattern(
    /(pertubuhan\s*keselamatan\s*sosial|perkeso|socso|e2[\s.:)])/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  const eaEisCandidates = findAmountsNearPattern(
    /(sistem\s*insurans\s*pekerjaan|sip|eis|e3[\s.:)])/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  const socsoCandidates = findAmountsNearPattern(
    /(employee\s*(socso|perkeso)|\bsocso\b|\bperkeso\b)/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );
  const eisCandidates = findAmountsNearPattern(
    /(employee\s*(eis|sip)|\beis\b|\bsip\b)/i,
    /(majikan|employer|^bahagian\s+[a-f]|^section\s+[a-f])/i
  );

  let employeeSocso = socsoCandidates.length > 0 ? socsoCandidates[0] : 0;
  let ytdSocso =
    socsoCandidates.length >= 2 &&
    socsoCandidates[socsoCandidates.length - 1] > socsoCandidates[0] * 1.5
      ? socsoCandidates[socsoCandidates.length - 1]
      : 0;

  let employeeEis = eisCandidates.length > 0 ? eisCandidates[0] : 0;
  let ytdEis =
    eisCandidates.length >= 2 &&
    eisCandidates[eisCandidates.length - 1] > eisCandidates[0] * 1.5
      ? eisCandidates[eisCandidates.length - 1]
      : 0;

  // Compute smart annual / YTD projections
  const notes: string[] = [];
  let sourceType: "monthly" | "ytd" | "ea-form" = "monthly";
  let estimatedAnnualIncome = 0;

  if (isEaForm) {
    sourceType = "ea-form";
    const bestEaGross =
      eaGrossCandidates.length > 0
        ? Math.max(...eaGrossCandidates)
        : ytdGross > 0
        ? ytdGross
        : monthlyGross;
    estimatedAnnualIncome = bestEaGross;
    ytdGross = bestEaGross;

    ytdPcb =
      eaPcbCandidates.length > 0
        ? Math.max(...eaPcbCandidates)
        : ytdPcb || monthlyPcb;

    ytdZakat =
      eaZakatCandidates.length > 0
        ? Math.max(...eaZakatCandidates)
        : ytdZakat || monthlyZakat;

    const bestEpf =
      eaEpfCandidates.length > 0
        ? Math.max(...eaEpfCandidates)
        : ytdEpf || employeeEpf;
    ytdEpf = bestEpf;
    employeeEpf = bestEpf;

    const bestSocso =
      eaSocsoCandidates.length > 0
        ? Math.max(...eaSocsoCandidates)
        : ytdSocso || employeeSocso;
    ytdSocso = bestSocso;
    employeeSocso = bestSocso;

    const bestEis =
      eaEisCandidates.length > 0
        ? Math.max(...eaEisCandidates)
        : ytdEis || employeeEis;
    ytdEis = bestEis;
    employeeEis = bestEis;

    notes.push(
      yearDetected
        ? `Detected Borang EA (C.P.8A) annual totals for Year ${yearDetected}.`
        : "Detected Borang EA (C.P.8A) annual totals."
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
    monthDetected,
    yearDetected,
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
