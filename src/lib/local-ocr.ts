import { ReceiptScanResult } from "./types";

interface ClassificationRule {
  categoryId: string;
  subCategoryId?: string | null;
  label: string;
  keywords: string[];
  reason: string;
}

interface RejectionRule {
  label: string;
  keywords: string[];
  reason: string;
}

const REJECTION_RULES: RejectionRule[] = [
  {
    label: "Smartwatch / Wearable",
    keywords: [
      "apple watch",
      "garmin",
      "fitbit",
      "mi band",
      "smartwatch",
      "smart watch",
      "galaxy watch",
      "whoop",
    ],
    reason:
      "Smartwatches and fitness trackers are explicitly excluded by LHDN from both Sports and Lifestyle tax reliefs.",
  },
  {
    label: "Petrol / Transport / Travel",
    keywords: [
      "petronas",
      "shell",
      "petron",
      "caltex",
      "bhp petrol",
      "ron95",
      "ron97",
      "diesel",
      "touch 'n go",
      "touch n go",
      "tng ewallet",
      "parking",
      "autopay",
      "toll",
      "plus highway",
      "grabcar",
      "airasia",
      "malaysia airlines",
      "batik air",
      "agoda",
      "hotel",
      "workshop",
      "car wash",
      "tyre",
    ],
    reason:
      "Petrol, tolls, parking, flights, hotels, and vehicle expenses are not claimable under Malaysian LHDN personal income tax reliefs.",
  },
  {
    label: "Food & Dining",
    keywords: [
      "starbucks",
      "zus coffee",
      "coffee bean",
      "mcdonald",
      "kfc",
      "burger king",
      "texas chicken",
      "secret recipe",
      "oldtown",
      "kopitiam",
      "restoran",
      "restaurant",
      "cafe",
      "bistro",
      "mamak",
      "bakery",
      "tealive",
      "chagee",
      "sushi king",
      "nando",
      "pizza hut",
      "domino",
      "grabfood",
      "foodpanda",
      "nasi lemak",
      "teh tarik",
      "latte",
      "americano",
      "dine in",
      "take away",
      "takeaway",
      "service charge",
    ],
    reason:
      "Food, beverages, cafe, and restaurant dining expenses are not claimable under LHDN personal tax reliefs.",
  },
  {
    label: "Groceries & Supermarket",
    keywords: [
      "jaya grocer",
      "village grocer",
      "lotus's",
      "lotuss",
      "tesco",
      "mydin",
      "giant",
      "99 speedmart",
      "speedmart",
      "kk super mart",
      "kk mart",
      "7-eleven",
      "familymart",
      "econsave",
      "nsk trade",
      "aeon big",
      "cold storage",
      "mercato",
      "supermarket",
      "grocer",
    ],
    reason:
      "General supermarket and grocery receipts are not claimable under LHDN personal tax reliefs.",
  },
  {
    label: "Utilities & Household",
    keywords: [
      "tenaga nasional",
      "tnb",
      "air selangor",
      "syabas",
      "indah water",
      "iwk",
      "mr diy",
      "mr.diy",
      "daiso",
      "ikea",
      "uniqlo",
      "h&m",
      "padini",
      "zara",
      "watson",
      "guardian",
      "sephora",
    ],
    reason:
      "Utilities, clothing, household goods, and general retail/cosmetics purchases are not claimable under LHDN personal tax reliefs.",
  },
  {
    label: "Entertainment & Streaming",
    keywords: [
      "gsc",
      "golden screen",
      "tgv",
      "cinema",
      "netflix",
      "spotify",
      "disney+",
      "youtube premium",
      "karaoke",
      "sunway lagoon",
      "genting",
      "ticket",
    ],
    reason:
      "Entertainment, cinema, theme park, and streaming subscriptions are not claimable under LHDN personal tax reliefs.",
  },
];

const RELIEF_RULES: ClassificationRule[] = [
  // Sports (must check before lifestyle!)
  {
    categoryId: "sports",
    subCategoryId: "sports_gym",
    label: "Sports — Gym & Training",
    keywords: [
      "anytime fitness",
      "celebrity fitness",
      "fitness first",
      "chi fitness",
      "babel fit",
      "gym membership",
      "pilates",
      "crossfit",
      "swimming class",
      "sports training",
      "coaching fee",
    ],
    reason:
      "Matched gym membership / sports training under LHDN Sports Relief (RM1,000 separate cap).",
  },
  {
    categoryId: "sports",
    subCategoryId: "sports_facility",
    label: "Sports — Court Rental & Competition",
    keywords: [
      "badminton court",
      "pickleball",
      "futsal court",
      "tennis court",
      "court booking",
      "court rental",
      "sports arena",
      "marathon",
      "fun run",
      "race kit",
      "triathlon",
    ],
    reason:
      "Matched sports facility rental / competition fee under LHDN Sports Relief (RM1,000 separate cap).",
  },
  {
    categoryId: "sports",
    subCategoryId: "sports_equipment",
    label: "Sports — Equipment",
    keywords: [
      "decathlon",
      "al-ikhsan",
      "al ikhsan",
      "sports direct",
      "yonex",
      "li-ning",
      "victor sport",
      "badminton",
      "shuttlecock",
      "racket",
      "racquet",
      "running shoe",
      "yoga mat",
      "dumbbell",
      "golf",
      "bicycle",
      "helmet",
      "sporting goods",
    ],
    reason:
      "Matched sports equipment retailer/items under LHDN Sports Relief (RM1,000 separate cap, preserving your Lifestyle cap).",
  },

  // Lifestyle
  {
    categoryId: "lifestyle",
    subCategoryId: "lifestyle_internet",
    label: "Lifestyle — Home Broadband",
    keywords: [
      "unifi",
      "tm technology",
      "telekom malaysia",
      "time dotcom",
      "time fibre",
      "maxis fibre",
      "celcomdigi fibre",
      "home fibre",
      "broadband",
      "internet subscription",
      "astro fibre",
    ],
    reason:
      "Matched home broadband internet subscription under LHDN Lifestyle Relief (RM2,500 cap).",
  },
  {
    categoryId: "lifestyle",
    subCategoryId: "lifestyle_books",
    label: "Lifestyle — Books & Reading",
    keywords: [
      "kinokuniya",
      "popular book",
      "mph book",
      "bookxcess",
      "tsutaya",
      "bookstore",
      "book shop",
      "isbn",
      "novel",
      "textbook",
      "magazine",
      "journal",
      "newspaper",
      "the star",
      "the edge",
      "kindle",
    ],
    reason:
      "Matched books / reading materials under LHDN Lifestyle Relief (RM2,500 cap).",
  },
  {
    categoryId: "lifestyle",
    subCategoryId: "lifestyle_tech",
    label: "Lifestyle — PC / Smartphone / Tablet",
    keywords: [
      "machines",
      "switch apple",
      "apple store",
      "thunder match",
      "all it hypermarket",
      "harvey norman",
      "senheng",
      "senq",
      "macbook",
      "iphone",
      "ipad",
      "laptop",
      "notebook pc",
      "smartphone",
      "tablet",
      "galaxy s2",
      "galaxy tab",
      "thinkpad",
      "dell",
      "lenovo",
    ],
    reason:
      "Matched personal computer, smartphone, or tablet under LHDN Lifestyle Relief (RM2,500 cap).",
  },

  // Medical (Self, Spouse & Child)
  {
    categoryId: "medical_self",
    subCategoryId: "med_dental",
    label: "Medical — Dental",
    keywords: [
      "dental",
      "pergigian",
      "dentist",
      "scaling",
      "polishing",
      "tooth",
      "extraction",
      "root canal",
      "filling",
      "klinik gigi",
    ],
    reason:
      "Matched registered dental examination/treatment under Medical Relief (RM1,000 dental sub-limit).",
  },
  {
    categoryId: "medical_self",
    subCategoryId: "med_vaccination",
    label: "Medical — Vaccination",
    keywords: [
      "vaccine",
      "vaccination",
      "vaksin",
      "influenza",
      "flu shot",
      "hpv",
      "pneumococcal",
      "immunisation",
      "immunization",
    ],
    reason:
      "Matched qualifying vaccination under Medical Relief (RM1,000 vaccination sub-limit).",
  },
  {
    categoryId: "medical_self",
    subCategoryId: "med_checkup",
    label: "Medical — Check-Up / Mental Health / Monitoring",
    keywords: [
      "bp healthcare",
      "pathlab",
      "health screening",
      "blood test",
      "medical check",
      "check-up",
      "checkup",
      "psychologist",
      "psychiatrist",
      "counselling",
      "mental health",
      "blood pressure monitor",
      "glucometer",
      "oximeter",
      "thermometer",
      "self-test",
    ],
    reason:
      "Matched health screening / mental health / self-monitoring device under Medical Relief (RM1,000 sub-limit).",
  },
  {
    categoryId: "medical_self",
    subCategoryId: "med_child_disability",
    label: "Medical — Child Learning Disability",
    keywords: [
      "speech therapy",
      "occupational therapy",
      "early intervention",
      "autism",
      "adhd",
      "dyslexia",
      "developmental assessment",
    ],
    reason:
      "Matched child learning disability assessment/intervention under Medical Relief (RM6,000 sub-limit).",
  },
  {
    categoryId: "medical_self",
    subCategoryId: "med_serious",
    label: "Medical — Hospital / Specialist",
    keywords: [
      "pantai hospital",
      "gleneagles",
      "sunway medical",
      "kpj",
      "prince court",
      "subang jaya medical",
      "thomson hospital",
      "columbia asia",
      "hospital",
      "specialist",
      "fertility",
      "ivf",
      "oncology",
      "cardiology",
      "surgery",
    ],
    reason:
      "Matched hospital/specialist medical bill under Medical Relief (RM10,000 overall cap — verify it qualifies as serious disease/fertility).",
  },

  // Insurance, EPF, PRS, SSPN, SOCSO
  {
    categoryId: "prs_annuity",
    subCategoryId: null,
    label: "PRS / Deferred Annuity",
    keywords: [
      "private retirement",
      "prs",
      "ppa",
      "versa prs",
      "public mutual",
      "deferred annuity",
    ],
    reason:
      "Matched Private Retirement Scheme (PRS) contribution (RM3,000 cap).",
  },
  {
    categoryId: "sspn",
    subCategoryId: null,
    label: "SSPN Net Deposit",
    keywords: ["sspn", "simpan sspn", "ptptn"],
    reason: "Matched SSPN education savings deposit (RM8,000 net deposit cap).",
  },
  {
    categoryId: "socso",
    subCategoryId: null,
    label: "SOCSO / PERKESO",
    keywords: ["socso", "perkeso", "sip", "eis contribution"],
    reason: "Matched SOCSO / PERKESO contribution (RM350 cap).",
  },
  {
    categoryId: "edu_med_insurance",
    subCategoryId: null,
    label: "Education & Medical Insurance",
    keywords: [
      "medical card",
      "medical insurance",
      "health insurance",
      "medical takaful",
      "aia public takaful",
      "education insurance",
    ],
    reason:
      "Matched medical/education insurance premium (RM4,000 cap for YA 2025/2026).",
  },
  {
    categoryId: "epf_life_insurance",
    subCategoryId: "epf_mandatory",
    label: "EPF / KWSP",
    keywords: ["kwsp", "epf", "kumpulan wang simpanan"],
    reason: "Matched EPF / KWSP contribution (RM4,000 sub-limit).",
  },
  {
    categoryId: "epf_life_insurance",
    subCategoryId: "life_insurance",
    label: "Life Insurance / Family Takaful",
    keywords: [
      "life insurance",
      "family takaful",
      "prudential",
      "prubsn",
      "great eastern",
      "allianz life",
      "etiqa",
      "takaful ikhlas",
      "zurich",
      "fwd takaful",
      "sun life",
      "hong leong assurance",
    ],
    reason:
      "Matched Life Insurance / Family Takaful premium (RM3,000 sub-limit within RM7,000 EPF & Life cap).",
  },

  // Family, Education, EV, Housing
  {
    categoryId: "childcare",
    subCategoryId: null,
    label: "Childcare (TASKA / TADIKA)",
    keywords: [
      "taska",
      "tadika",
      "kindergarten",
      "preschool",
      "childcare",
      "montessori",
      "smart reader",
      "q-dees",
      "brainy bunch",
    ],
    reason:
      "Matched registered TASKA/TADIKA childcare fees (RM3,000 cap for children aged 6 & below).",
  },
  {
    categoryId: "ev_charging",
    subCategoryId: null,
    label: "EV Charging Facilities",
    keywords: [
      "gentari",
      "jomcharge",
      "chargev",
      "ev charging",
      "wallbox",
      "supercharger",
      "composting machine",
    ],
    reason:
      "Matched EV charging facility / subscription under LHDN EV Charging Relief (RM2,500 cap).",
  },
  {
    categoryId: "education_self",
    subCategoryId: "edu_tertiary",
    label: "Education Fees (Self)",
    keywords: [
      "universiti",
      "university",
      "tuition fee",
      "semester fee",
      "acca",
      "cpa",
      "master of",
      "doctor of",
      "jpk",
      "upskilling",
    ],
    reason: "Matched self education/upskilling fees (RM7,000 cap).",
  },
  {
    categoryId: "first_home_interest",
    subCategoryId: "home_under_500k",
    label: "First-Home Loan Interest",
    keywords: [
      "housing loan",
      "home financing",
      "mortgage interest",
      "annual loan statement",
    ],
    reason:
      "Matched housing loan interest statement (verify SPA was executed between 2025–2027).",
  },
  {
    categoryId: "approved_donations",
    subCategoryId: null,
    label: "Approved Donations — Sec. 44(6)",
    keywords: [
      "section 44(6)",
      "seksyen 44(6)",
      "44(6)",
      "tax exempt",
      "pengecualian cukai",
      "derma",
      "sumbangan",
      "wakaf",
      "baitulmal",
      "mercy malaysia",
      "makna",
      "national kidney",
      "yayasan",
      "donation",
    ],
    reason:
      "Matched approved charitable donation receipt under Section 44(6) (deductible up to 10% of aggregate income).",
  },
];

/**
 * Preprocess an image file on an offscreen canvas (grayscale + contrast boost)
 * to improve Tesseract OCR accuracy on faded Malaysian thermal receipts.
 */
async function preprocessReceiptImage(file: File): Promise<string | File> {
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const maxWidth = 1600;
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // Grayscale + mild contrast stretch for thermal paper
      const contrast = 1.25;
      const intercept = 128 * (1 - contrast);
      for (let i = 0; i < data.length; i += 4) {
        const gray =
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const boosted = Math.max(0, Math.min(255, gray * contrast + intercept));
        data[i] = boosted;
        data[i + 1] = boosted;
        data[i + 2] = boosted;
      }
      ctx.putImageData(imageData, 0, 0);

      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export async function runLocalReceiptOcr(
  file: File,
  fallbackYear: number,
  onProgress?: (percent: number, statusText: string) => void
): Promise<ReceiptScanResult> {
  if (file.type === "application/pdf") {
    return {
      eligibility: "eligible",
      merchant: cleanFileNameAsMerchant(file.name),
      date: `${fallbackYear}-${new Date().toISOString().slice(5, 10)}`,
      amount: 0,
      totalAmount: 0,
      invoiceNumber: "",
      description: `Attached PDF: ${file.name}`,
      suggestedCategoryId: "lifestyle",
      suggestedSubCategoryId: null,
      confidence: "low",
      reasoning:
        "PDF attached! Built-in browser OCR scans photo/image receipts directly—please verify the amount and LHDN category below.",
      scanEngine: "local-ocr",
    };
  }

  onProgress?.(10, "Enhancing receipt photo...");
  const processedInput = await preprocessReceiptImage(file);

  onProgress?.(20, "Loading on-device OCR engine...");
  const Tesseract = await import("tesseract.js");

  const { data } = await Tesseract.recognize(processedInput, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        const pct = Math.min(95, 25 + Math.round(m.progress * 70));
        onProgress?.(pct, `Reading receipt text... ${pct}%`);
      }
    },
  });

  onProgress?.(98, "Checking LHDN eligibility...");
  const rawText = (data.text || "").trim();
  return parseAndClassifyReceiptText(rawText, fallbackYear);
}

export function parseAndClassifyReceiptText(
  rawText: string,
  fallbackYear: number
): ReceiptScanResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const lower = rawText.toLowerCase();
  const merchant = extractMerchant(lines);
  const date = extractDate(rawText, fallbackYear);
  const totalAmount = extractAmount(lines, rawText);
  const invoiceNumber = extractInvoiceNumber(rawText);

  if (rawText.length < 12) {
    return {
      eligibility: "rejected",
      merchant: merchant || "Unreadable Image",
      date,
      amount: 0,
      totalAmount,
      invoiceNumber,
      description: "",
      suggestedCategoryId: null,
      suggestedSubCategoryId: null,
      confidence: "low",
      reasoning: "Could not read enough receipt text from this image.",
      rejectionReason:
        "No readable receipt text was detected. Try taking a clearer, well-lit photo of the receipt (or override to enter manually).",
      scanEngine: "local-ocr",
      rawText,
    };
  }

  // 1. Check explicit LHDN hard-rejection rules first (smartwatch/fitness tracker)
  const hardRejectFirst = REJECTION_RULES.slice(0, 1);
  for (const rule of hardRejectFirst) {
    const matchedKw = rule.keywords.find((kw) => lower.includes(kw));
    if (matchedKw) {
      return {
        eligibility: "rejected",
        merchant: merchant || rule.label,
        date,
        amount: 0,
        totalAmount,
        invoiceNumber,
        description: `Detected: ${matchedKw}`,
        suggestedCategoryId: null,
        suggestedSubCategoryId: null,
        confidence: "high",
        reasoning: rule.reason,
        rejectionReason: rule.reason,
        scanEngine: "local-ocr",
        rawText,
      };
    }
  }

  // 1b. Mobile/telco bills without clear voice vs. data breakdown:
  // Extract recurring/monthly charges excluding SST, mark uncertain, and warn user.
  const telcoKw = [
    "u mobile",
    "umobile",
    "hotlink",
    "xpax",
    "postpaid",
    "prepaid",
    "mobile plan",
    "yes 5g",
    "digi postpaid",
    "maxis postpaid",
    "celcom postpaid",
  ].find((kw) => lower.includes(kw));
  if (
    telcoKw &&
    !lower.includes("fibre") &&
    !lower.includes("broadband") &&
    !lower.includes("u home") &&
    !lower.includes("home 5g")
  ) {
    const preTaxMatch = rawText.match(
      /(?:Total\s+(?:Current\s+)?Charges\s*\(?(?:excl(?:uding)?\.?\s*(?:Svc\.?|Service)\s*Tax|before\s*(?:SST|tax))\)?|Current\s+Charges\s*\(?(?:excl(?:uding)?\.?\s*(?:Svc\.?|Service)\s*Tax|before\s*(?:SST|tax))\)?|Caj\s+Semasa\s*\(?(?:sebelum\s+cukai|tidak\s+termasuk\s+cukai)\)?|Sub-?total\s*\(?(?:before\s*(?:SST|tax)|excl\.?\s*tax)\)?)[^\d\n]{0,35}(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
    );
    const preTaxAmt = preTaxMatch
      ? Number(preTaxMatch[1].replace(/,/g, "")) || 0
      : 0;
    const recurringMatch = rawText.match(
      /(?:Monthly\s+(?:Recurring\s+)?Charges?|Recurring\s+Charges?|Current\s+Charges?)[^\d\n]{0,35}(?:RM|MYR)?\s*([\d,]+\.\d{2})/i
    );
    const recurringAmt = recurringMatch
      ? Number(recurringMatch[1].replace(/,/g, "")) || 0
      : 0;
    const baseAmt = recurringAmt > 0 ? recurringAmt : totalAmount;
    const sstRx =
      /(?:Total\s+Service\s+Tax|Service\s+Tax(?:\s*\(\d+%\))?|Cukai\s+Perkhidmatan|\bST\s*\(\d+%\)|\bST\b)[^\d\n]{0,35}(?:RM|MYR)?\s*([\d,]+\.\d{2})/gi;
    let sstAmt = 0;
    let sm: RegExpExecArray | null;
    while ((sm = sstRx.exec(rawText)) !== null) {
      const v = Number(sm[1].replace(/,/g, "")) || 0;
      if (v > 0 && (baseAmt <= 0 || v < baseAmt * 0.2)) sstAmt = v;
    }
    const netAmt =
      preTaxAmt > 0
        ? preTaxAmt
        : baseAmt > sstAmt && sstAmt > 0
        ? Math.round((baseAmt - sstAmt) * 100) / 100
        : baseAmt;
    const warnMsg =
      "No clear voice vs. data breakdown detected on this telco bill. Extracted recurring monthly charges (excluding SST) under Lifestyle — Internet. Warning: under LHDN rules, only home broadband or dedicated data plans qualify (personal mobile voice plans are not claimable); verify before claiming.";
    return {
      eligibility: "uncertain",
      merchant: merchant || "Telco / Mobile Bill",
      date,
      amount: netAmt,
      totalAmount: baseAmt > netAmt ? baseAmt : netAmt,
      sstOrTaxAmount: sstAmt,
      taxInclusive: true,
      currency: "MYR",
      invoiceNumber,
      description: "Telco monthly recurring charges (excl. SST — verify LHDN eligibility)",
      suggestedCategoryId: "lifestyle",
      suggestedSubCategoryId: "lifestyle_internet",
      suggestedOptions: [
        {
          categoryId: "lifestyle",
          subCategoryId: "lifestyle_internet",
          label: "Lifestyle — Internet Broadband",
          reason:
            "Recurring telco charges (excl. SST). Only claim if this is a qualifying broadband/data subscription.",
        },
      ],
      confidence: "medium",
      needsReview: true,
      reviewReason: warnMsg,
      reasoning: warnMsg,
      scanEngine: "local-ocr",
      rawText,
    };
  }

  // 2. Check LHDN relief category rules
  for (const rule of RELIEF_RULES) {
    const matchedKw = rule.keywords.find((kw) => lower.includes(kw));
    if (matchedKw) {
      return {
        eligibility: "eligible",
        merchant: merchant || rule.label,
        date,
        amount: totalAmount,
        totalAmount,
        invoiceNumber,
        description: `Matched "${matchedKw}"`,
        suggestedCategoryId: rule.categoryId,
        suggestedSubCategoryId: rule.subCategoryId ?? null,
        confidence: totalAmount > 0 ? "high" : "medium",
        reasoning: rule.reason,
        scanEngine: "local-ocr",
        rawText,
      };
    }
  }

  // 3. Check general non-claimable rejection rules (F&B, petrol, groceries, retail, entertainment)
  for (const rule of REJECTION_RULES.slice(2)) {
    const matchedKw = rule.keywords.find((kw) => lower.includes(kw));
    if (matchedKw) {
      return {
        eligibility: "rejected",
        merchant: merchant || rule.label,
        date,
        amount: 0,
        totalAmount,
        invoiceNumber,
        description: `Detected non-claimable: ${matchedKw}`,
        suggestedCategoryId: null,
        suggestedSubCategoryId: null,
        confidence: "high",
        reasoning: rule.reason,
        rejectionReason: rule.reason,
        scanEngine: "local-ocr",
        rawText,
      };
    }
  }

  // 4. Unknown receipt purpose — mark uncertain and suggest closest LHDN categories to ask the user
  const clinicHint = /\b(klinik|clinic|poliklinik|dr\.|doctor|medical|pharmacy|farmasi)\b/i.test(lower);
  const suggestedOptions = clinicHint
    ? [
        {
          categoryId: "medical_self",
          subCategoryId: "med_checkup",
          label: "Medical — Check-Up / Screening",
          reason: "Complete medical check-up, blood test, or mental health (RM1,000 sub-limit).",
        },
        {
          categoryId: "medical_self",
          subCategoryId: "med_vaccination",
          label: "Medical — Vaccination",
          reason: "Qualifying vaccines like Influenza, HPV, or Pneumococcal (RM1,000 sub-limit).",
        },
        {
          categoryId: "parents_medical",
          subCategoryId: "parents_treatment",
          label: "Parents Medical / Care",
          reason: "Medical treatment or care for parents/grandparents (RM8,000 cap).",
        },
      ]
    : [
        {
          categoryId: "lifestyle",
          subCategoryId: "lifestyle_tech",
          label: "Lifestyle — Tech / Books / Broadband",
          reason: "PC, smartphone, tablet, books, or home internet (RM2,500 cap).",
        },
        {
          categoryId: "sports",
          subCategoryId: "sports_equipment",
          label: "Sports — Equipment / Gym / Court",
          reason: "Sports gear, gym membership, or court rental (RM1,000 separate cap).",
        },
        {
          categoryId: "medical_self",
          subCategoryId: "med_checkup",
          label: "Medical — Check-Up / Dental / Serious",
          reason: "Qualifying medical, dental, or health screening expense.",
        },
      ];

  return {
    eligibility: "uncertain",
    merchant: merchant || "Unknown Merchant",
    date,
    amount: totalAmount,
    totalAmount,
    invoiceNumber,
    description: "",
    suggestedCategoryId: suggestedOptions[0].categoryId,
    suggestedSubCategoryId: suggestedOptions[0].subCategoryId,
    suggestedOptions,
    confidence: "low",
    needsReview: true,
    reviewReason:
      "Receipt purpose could not be confirmed automatically — please select the closest LHDN category below or discard if non-claimable.",
    reasoning:
      "Couldn't confirm the exact purpose from this receipt. Pick the closest LHDN relief below, or discard if it isn't claimable.",
    scanEngine: "local-ocr",
    rawText,
  };
}

const KNOWN_MY_MERCHANTS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(tm\s*unifi|unifi\s*home|tm\s*technology)\b/i, name: "TM Unifi" },
  { pattern: /\b(time\s*dotcom|time\s*fibre)\b/i, name: "TIME Fibre" },
  { pattern: /\bmaxis\s*fibre\b/i, name: "Maxis Fibre" },
  { pattern: /\bcelcomdigi\s*fibre\b/i, name: "CelcomDigi Fibre" },
  { pattern: /\bdecathlon\b/i, name: "Decathlon Malaysia" },
  { pattern: /\bal[\-\s]?ikhsan\b/i, name: "Al-Ikhsan Sports" },
  { pattern: /\bsports\s*direct\b/i, name: "Sports Direct Malaysia" },
  { pattern: /\bkinokuniya\b/i, name: "Kinokuniya" },
  { pattern: /\bpopular\s*book/i, name: "Popular Bookstore" },
  { pattern: /\bmph\s*book/i, name: "MPH Bookstores" },
  { pattern: /\bbookxcess\b/i, name: "BookXcess" },
  { pattern: /\bbp\s*healthcare\b/i, name: "BP Healthcare" },
  { pattern: /\bpathlab\b/i, name: "Pathlab Malaysia" },
  { pattern: /\bsunway\s*medical\b/i, name: "Sunway Medical Centre" },
  { pattern: /\bpantai\s*hospital\b/i, name: "Pantai Hospital" },
  { pattern: /\bgleneagles\b/i, name: "Gleneagles Hospital" },
  { pattern: /\bprince\s*court\b/i, name: "Prince Court Medical Centre" },
  { pattern: /\bcolumbia\s*asia\b/i, name: "Columbia Asia Hospital" },
  { pattern: /\bthomson\s*hospital\b/i, name: "Thomson Hospital" },
  { pattern: /\baia\s*public\s*takaful\b/i, name: "AIA Public Takaful" },
  { pattern: /\baia\s*bhd\b/i, name: "AIA Malaysia" },
  { pattern: /\bprubsn\b/i, name: "Prudential BSN Takaful" },
  { pattern: /\bprudential\b/i, name: "Prudential Malaysia" },
  { pattern: /\bgreat\s*eastern\b/i, name: "Great Eastern" },
  { pattern: /\ballianz\b/i, name: "Allianz Malaysia" },
  { pattern: /\betiqa\b/i, name: "Etiqa Takaful" },
  { pattern: /\btakaful\s*ikhlas\b/i, name: "Takaful Ikhlas" },
  { pattern: /\bfwd\s*takaful\b/i, name: "FWD Takaful" },
  { pattern: /\bkwsp\b|\bepf\b/i, name: "KWSP / EPF" },
  { pattern: /\bperkeso\b|\bsocso\b/i, name: "PERKESO / SOCSO" },
  { pattern: /\bsimpan\s*sspn\b|\bptptn\b/i, name: "Simpan SSPN (PTPTN)" },
  { pattern: /\bgentari\b/i, name: "Gentari" },
  { pattern: /\bjomcharge\b/i, name: "JomCharge" },
  { pattern: /\bchargev\b/i, name: "ChargEV" },
  { pattern: /\banytime\s*fitness\b/i, name: "Anytime Fitness" },
  { pattern: /\bcelebrity\s*fitness\b/i, name: "Celebrity Fitness" },
  { pattern: /\bfitness\s*first\b/i, name: "Fitness First" },
  { pattern: /\bmachines\s*sdn\b/i, name: "Machines" },
  { pattern: /\bharvey\s*norman\b/i, name: "Harvey Norman" },
  { pattern: /\bsenheng\b/i, name: "Senheng" },
];

function extractMerchant(lines: string[]): string {
  const fullTopText = lines.slice(0, 20).join(" ");

  // Pass 1: Known Malaysian brands / providers
  for (const brand of KNOWN_MY_MERCHANTS) {
    if (brand.pattern.test(fullTopText)) {
      return brand.name;
    }
  }

  // Pass 2: Malaysian business / clinic / institution entity line in top 15 lines
  const entityPattern =
    /\b(sdn\.?\s*bhd\.?|berhad|bhd\.?|klinik|clinic|hospital|dental|pergigian|pharmacy|farmasi|takaful|insurance|enterprise|trading|centre|center|academy|institute|universiti|university|taska|tadika|kindergarten|fitness|gym|medical|specialist)\b/i;
  const headerOrNoisePattern =
    /\b(tax\s*invoice|official\s*receipt|cash\s*bill|e[\-\s]?invoice|invoice\s*no|receipt\s*no|bill\s*no|date\s*:|time\s*:|tel\s*:|fax\s*:|sst\s*(no|id|reg)|gst\s*(no|id|reg)|tin\s*:|reg\.?\s*no|co\.?\s*no|page\s*\d|cashier|customer|bill\s*to|ship\s*to|sold\s*to|account\s*no|member\s*id|welcome|thank\s*you)\b/i;
  const addressPattern =
    /\b(jalan|jln\.?|lorong|persiaran|lebuh|taman|bandar|lot\s*\d|no\.?\s*\d+|level\s*\d|floor|tingkat|blok|block|kuala\s*lumpur|selangor|petaling\s*jaya|subang\s*jaya|shah\s*alam|puchong|cheras|ampang|cyberjaya|putrajaya|penang|pulau\s*pinang|johor\s*bahru|melaka|ipoh|seremban|kota\s*kinabalu|kuching|\b\d{5}\b)\b/i;

  for (const line of lines.slice(0, 15)) {
    if (headerOrNoisePattern.test(line)) continue;
    if (addressPattern.test(line) && !entityPattern.test(line)) continue;
    if (entityPattern.test(line)) {
      const cleaned = cleanCompanyLine(line);
      if (cleaned.length >= 3) return cleaned;
    }
  }

  // Pass 3: First clean non-header, non-address, non-numeric line in top 10 lines
  for (const line of lines.slice(0, 10)) {
    const cleaned = cleanCompanyLine(line);
    if (cleaned.length < 3 || cleaned.length > 55) continue;
    if (headerOrNoisePattern.test(cleaned)) continue;
    if (addressPattern.test(cleaned)) continue;
    if (/^(www\.|http|[\d\s\-()+/:.,]+$)/i.test(cleaned)) continue;
    // Skip lines that are mostly digits/symbols
    const letterCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
    if (letterCount < 3) continue;
    return cleaned;
  }

  return "";
}

function cleanCompanyLine(line: string): string {
  return line
    .replace(/\(\s*\d{4,12}[\-\s]?[A-Z0-9]*\s*\)/gi, "") // remove (123456-X) reg numbers
    .replace(/[^a-zA-Z0-9&'.,()\-\/\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 55);
}

function extractAmount(lines: string[], rawText: string): number {
  const totalKeyword =
    /(grand\s*total|total\s*payable|total\s*amount|total\s*due|amount\s*due|amount\s*paid|nett\s*total|net\s*total|total\s*incl|total\s*\(?rm\)?|jumlah\s*besar|jumlah\s*bayaran|jumlah\b|total\b|balance\s*due|paid\s*amount)/i;
  const ignoreKeyword =
    /(subtotal|sub\s*total|sub-total|discount|change|rounding|sst|gst|tax\s*6%|tax\s*8%|points|qty|quantity|item|unit)/i;
  const decimalAmountRegex =
    /(?:RM|MYR)?\s*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})/gi;
  const rmWholeOrDecimalRegex =
    /(?:RM|MYR)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/gi;

  // Pass 1: Look at lines with "TOTAL"/"JUMLAH" keywords (check same line AND next line!)
  let bestFromTotalLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (totalKeyword.test(line) && !ignoreKeyword.test(line)) {
      const candidateLines = [line, lines[i + 1] || ""].join(" ");
      const matches = [
        ...candidateLines.matchAll(decimalAmountRegex),
        ...candidateLines.matchAll(rmWholeOrDecimalRegex),
      ];
      for (const m of matches) {
        const val = parseFloat(m[1].replace(/,/g, ""));
        if (val > 0 && val < 200000) {
          bestFromTotalLine = val;
        }
      }
    }
  }
  if (bestFromTotalLine > 0) return bestFromTotalLine;

  // Pass 2: Fallback to largest RM/MYR-prefixed amount in the receipt (decimal or whole)
  const rmMatches = [...rawText.matchAll(rmWholeOrDecimalRegex)];
  let maxRm = 0;
  for (const m of rmMatches) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (val > maxRm && val < 200000) maxRm = val;
  }
  if (maxRm > 0) return maxRm;

  // Pass 3: Fallback to largest decimal currency-like number (also supports comma thousands)
  const anyMatches = [
    ...rawText.matchAll(/\b([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]{1,5}\.[0-9]{2})\b/g),
  ];
  let maxAny = 0;
  for (const m of anyMatches) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (val > maxAny && val < 50000) maxAny = val;
  }
  return maxAny;
}

function extractDate(rawText: string, fallbackYear: number): string {
  // YYYY-MM-DD
  const iso = rawText.match(/\b(202[0-9])[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (Malaysian standard)
  const dmy = rawText.match(/\b(0?[1-9]|[12][0-9]|3[01])[-/.](0?[1-9]|1[0-2])[-/.](202[0-9])\b/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  // DD MMM YYYY (e.g., 14 Mar 2026)
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const named = rawText.match(
    /\b(0?[1-9]|[12][0-9]|3[01])\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+(202[0-9])\b/i
  );
  if (named) {
    const mm = months[named[2].toLowerCase().slice(0, 3)];
    return `${named[3]}-${mm}-${named[1].padStart(2, "0")}`;
  }

  return `${fallbackYear}-${new Date().toISOString().slice(5, 10)}`;
}

function extractInvoiceNumber(rawText: string): string {
  const m = rawText.match(
    /(?:inv(?:oice)?|receipt|bill|doc|ref)\s*(?:no\.?|#|:)\s*([A-Z0-9\-\/]{4,24})/i
  );
  return m ? m[1].trim() : "";
}

function cleanFileNameAsMerchant(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-]+/g, " ")
    .trim()
    .slice(0, 45);
}
