import { DEFAULT_STATUS_RELIEFS, getReliefCategories } from "./lhdn-rules";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import { TaxExpense, TaxProfile, TaxYear } from "./types";

const LOCAL_EXPENSES_KEY = "cukaiku_expenses_v1";
const LOCAL_PROFILES_KEY = "cukaiku_profiles_v1";

export function getDefaultProfile(taxYear: TaxYear): TaxProfile {
  return {
    taxYear,
    annualIncome: 96000,
    zakatPaid: 0,
    pcbPaid: 6200,
    statusReliefs: { ...DEFAULT_STATUS_RELIEFS },
  };
}

// ---------- Local Storage Helpers (used when Supabase is not configured or not signed in) ----------

export function loadLocalExpenses(): TaxExpense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_EXPENSES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TaxExpense[];
  } catch {
    return [];
  }
}

export function saveLocalExpenses(expenses: TaxExpense[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(expenses));
  } catch {
    // Handle quota exceeded gracefully if large base64 images are stored locally
    const stripped = expenses.map((e, idx) =>
      idx < expenses.length - 5 && e.receiptUrl?.startsWith("data:")
        ? { ...e, receiptUrl: null }
        : e
    );
    window.localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(stripped));
  }
}

export function loadLocalProfile(taxYear: TaxYear): TaxProfile {
  if (typeof window === "undefined") return getDefaultProfile(taxYear);
  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILES_KEY);
    if (!raw) return getDefaultProfile(taxYear);
    const map = JSON.parse(raw) as Record<string, TaxProfile>;
    return map[String(taxYear)] || getDefaultProfile(taxYear);
  } catch {
    return getDefaultProfile(taxYear);
  }
}

export function saveLocalProfile(profile: TaxProfile): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILES_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, TaxProfile>) : {};
    map[String(profile.taxYear)] = profile;
    window.localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// ---------- Cloud (Supabase) + Local Unified Data Layer ----------

export async function fetchProfile(
  taxYear: TaxYear,
  userId?: string | null
): Promise<TaxProfile> {
  const supabase = getSupabaseClient();
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("tax_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("tax_year", taxYear)
      .maybeSingle();

    if (!error && data) {
      return {
        taxYear,
        annualIncome: Number(data.annual_income),
        zakatPaid: Number(data.zakat_paid),
        pcbPaid: Number(data.pcb_paid),
        statusReliefs: {
          ...DEFAULT_STATUS_RELIEFS,
          ...(data.status_reliefs || {}),
        },
      };
    }
  }
  return loadLocalProfile(taxYear);
}

export async function persistProfile(
  profile: TaxProfile,
  userId?: string | null
): Promise<void> {
  saveLocalProfile(profile);
  const supabase = getSupabaseClient();
  if (supabase && userId) {
    await supabase.from("tax_profiles").upsert(
      {
        user_id: userId,
        tax_year: profile.taxYear,
        annual_income: profile.annualIncome,
        zakat_paid: profile.zakatPaid,
        pcb_paid: profile.pcbPaid,
        status_reliefs: profile.statusReliefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tax_year" }
    );
  }
}

export async function fetchExpenses(
  userId?: string | null
): Promise<TaxExpense[]> {
  const supabase = getSupabaseClient();
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("tax_expenses")
      .select("*")
      .eq("user_id", userId)
      .order("expense_date", { ascending: false });

    if (!error && data) {
      const expenses: TaxExpense[] = await Promise.all(
        data.map(async (row) => {
          let receiptUrl: string | null = null;
          if (row.receipt_path) {
            const { data: signed } = await supabase.storage
              .from("receipts")
              .createSignedUrl(row.receipt_path, 3600);
            receiptUrl = signed?.signedUrl || null;
          }
          return {
            id: row.id,
            taxYear: row.tax_year as TaxYear,
            categoryId: row.category_id,
            subCategoryId: row.sub_category_id,
            merchant: row.merchant,
            description: row.description || "",
            amount: Number(row.amount),
            expenseDate: row.expense_date,
            invoiceNumber: row.invoice_number || "",
            receiptPath: row.receipt_path,
            receiptUrl,
            receiptMimeType: row.receipt_mime_type,
            receiptFileName: row.receipt_file_name,
            aiExtracted: Boolean(row.ai_extracted),
            createdAt: row.created_at,
          };
        })
      );
      return expenses;
    }
  }
  return loadLocalExpenses();
}

export async function createExpense(
  expense: Omit<TaxExpense, "id" | "createdAt">,
  receiptFile?: File | null,
  userId?: string | null
): Promise<TaxExpense> {
  const supabase = getSupabaseClient();

  if (supabase && userId) {
    let receiptPath: string | null = null;
    let receiptUrl: string | null = null;
    let receiptMimeType: string | null = null;
    let receiptFileName: string | null = null;

    if (receiptFile) {
      const ext = receiptFile.name.split(".").pop() || "jpg";
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      receiptPath = `${userId}/${expense.taxYear}/${safeName}`;
      receiptMimeType = receiptFile.type;
      receiptFileName = receiptFile.name;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(receiptPath, receiptFile, { upsert: false });

      if (!uploadError) {
        const { data: signed } = await supabase.storage
          .from("receipts")
          .createSignedUrl(receiptPath, 3600);
        receiptUrl = signed?.signedUrl || null;
      } else {
        receiptPath = null;
      }
    }

    const { data, error } = await supabase
      .from("tax_expenses")
      .insert({
        user_id: userId,
        tax_year: expense.taxYear,
        category_id: expense.categoryId,
        sub_category_id: expense.subCategoryId || null,
        merchant: expense.merchant,
        description: expense.description,
        amount: expense.amount,
        expense_date: expense.expenseDate,
        invoice_number: expense.invoiceNumber || "",
        receipt_path: receiptPath,
        receipt_mime_type: receiptMimeType,
        receipt_file_name: receiptFileName,
        ai_extracted: Boolean(expense.aiExtracted),
      })
      .select()
      .single();

    if (!error && data) {
      return {
        id: data.id,
        taxYear: data.tax_year as TaxYear,
        categoryId: data.category_id,
        subCategoryId: data.sub_category_id,
        merchant: data.merchant,
        description: data.description || "",
        amount: Number(data.amount),
        expenseDate: data.expense_date,
        invoiceNumber: data.invoice_number || "",
        receiptPath: data.receipt_path,
        receiptUrl,
        receiptMimeType: data.receipt_mime_type,
        receiptFileName: data.receipt_file_name,
        aiExtracted: Boolean(data.ai_extracted),
        createdAt: data.created_at,
      };
    }
  }

  // Local mode: compress image to data URL for preview
  let localDataUrl: string | null = expense.receiptUrl || null;
  if (receiptFile && !localDataUrl) {
    localDataUrl = await fileToCompressedDataUrl(receiptFile);
  }

  const created: TaxExpense = {
    ...expense,
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    receiptUrl: localDataUrl,
    receiptMimeType: receiptFile?.type || expense.receiptMimeType || null,
    receiptFileName: receiptFile?.name || expense.receiptFileName || null,
    createdAt: new Date().toISOString(),
  };

  const existing = loadLocalExpenses();
  saveLocalExpenses([created, ...existing]);
  return created;
}

export async function removeExpense(
  expense: TaxExpense,
  userId?: string | null
): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase && userId && !expense.id.startsWith("local_")) {
    if (expense.receiptPath) {
      await supabase.storage.from("receipts").remove([expense.receiptPath]);
    }
    await supabase
      .from("tax_expenses")
      .delete()
      .eq("id", expense.id)
      .eq("user_id", userId);
    return;
  }

  const existing = loadLocalExpenses();
  saveLocalExpenses(existing.filter((e) => e.id !== expense.id));
}

export function getSampleExpenses(taxYear: TaxYear): TaxExpense[] {
  const y = String(taxYear);
  const now = new Date().toISOString();
  return [
    {
      id: `sample_${y}_1`,
      taxYear,
      categoryId: "lifestyle",
      subCategoryId: "lifestyle_internet",
      merchant: "TM Unifi Fibre (Jan–Oct)",
      description: "Monthly 300Mbps home broadband bills (10 months)",
      amount: 1490,
      expenseDate: `${y}-10-15`,
      invoiceNumber: `UNI-${y}-1088`,
      receiptFileName: "unifi_2026_statements.pdf",
      receiptUrl: "sample://attached",
      aiExtracted: true,
      createdAt: now,
    },
    {
      id: `sample_${y}_2`,
      taxYear,
      categoryId: "lifestyle",
      subCategoryId: "lifestyle_books",
      merchant: "Kinokuniya KLCC",
      description: "Technical & personal finance books",
      amount: 340,
      expenseDate: `${y}-07-22`,
      invoiceNumber: `KINO-${y}-441`,
      receiptFileName: "kinokuniya_receipt.jpg",
      receiptUrl: "sample://attached",
      aiExtracted: true,
      createdAt: now,
    },
    {
      id: `sample_${y}_3`,
      taxYear,
      categoryId: "sports",
      subCategoryId: "sports_equipment",
      merchant: "Decathlon Malaysia",
      description: "Badminton racket, shuttlecocks & running shoes",
      amount: 620,
      expenseDate: `${y}-05-11`,
      invoiceNumber: `DEC-${y}-902`,
      receiptFileName: "decathlon_receipt.jpg",
      receiptUrl: "sample://attached",
      aiExtracted: true,
      createdAt: now,
    },
    {
      id: `sample_${y}_4`,
      taxYear,
      categoryId: "medical_self",
      subCategoryId: "med_dental",
      merchant: "Klinik Pergigian Harmoni",
      description: "Annual dental scaling, polishing & check-up",
      amount: 380,
      expenseDate: `${y}-04-18`,
      invoiceNumber: `DENT-${y}-219`,
      receiptFileName: "dental_receipt.jpg",
      receiptUrl: "sample://attached",
      aiExtracted: true,
      createdAt: now,
    },
    {
      id: `sample_${y}_5`,
      taxYear,
      categoryId: "medical_self",
      subCategoryId: "med_checkup",
      merchant: "BP Healthcare Lab",
      description: "Comprehensive annual blood screening package",
      amount: 550,
      expenseDate: `${y}-08-03`,
      invoiceNumber: `BPH-${y}-772`,
      receiptFileName: "bp_health_screening.pdf",
      receiptUrl: "sample://attached",
      aiExtracted: false,
      createdAt: now,
    },
    {
      id: `sample_${y}_6`,
      taxYear,
      categoryId: "epf_life_insurance",
      subCategoryId: "epf_mandatory",
      merchant: "KWSP / EPF (Payslip YTD)",
      description: "Employee mandatory EPF contributions",
      amount: 4000,
      expenseDate: `${y}-10-31`,
      invoiceNumber: "EA-EPF-YTD",
      receiptUrl: null, // Intentionally missing to demonstrate Missing Receipt alert
      createdAt: now,
    },
    {
      id: `sample_${y}_7`,
      taxYear,
      categoryId: "edu_med_insurance",
      subCategoryId: null,
      merchant: "AIA Public Takaful",
      description: "Annual medical card & takaful certificate",
      amount: 2880,
      expenseDate: `${y}-09-01`,
      invoiceNumber: `AIA-${y}-5512`,
      receiptFileName: "aia_tax_statement.pdf",
      receiptUrl: "sample://attached",
      aiExtracted: false,
      createdAt: now,
    },
    {
      id: `sample_${y}_8`,
      taxYear,
      categoryId: "socso",
      subCategoryId: null,
      merchant: "PERKESO / SOCSO (Payslip YTD)",
      description: "Employee SOCSO & EIS contributions",
      amount: 350,
      expenseDate: `${y}-10-31`,
      invoiceNumber: "EA-SOCSO-YTD",
      receiptFileName: "socso_payslip.pdf",
      receiptUrl: "sample://attached",
      aiExtracted: false,
      createdAt: now,
    },
  ];
}

export function exportExpensesToCsv(expenses: TaxExpense[], taxYear: TaxYear): void {
  const categories = getReliefCategories(taxYear);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const headers = [
    "Tax Year",
    "Form BE Ref",
    "Relief Category",
    "Sub-Category",
    "Expense Date",
    "Merchant",
    "Description",
    "Amount (RM)",
    "Invoice No",
    "Receipt Attached",
    "Retain Until",
  ];

  const rows = expenses
    .filter((e) => e.taxYear === taxYear)
    .map((e) => {
      const cat = catMap.get(e.categoryId);
      const sub = cat?.subCategories?.find((s) => s.id === e.subCategoryId);
      return [
        String(e.taxYear),
        cat?.formBeRef || "",
        cat?.name || e.categoryId,
        sub?.name || "",
        e.expenseDate,
        e.merchant,
        e.description,
        e.amount.toFixed(2),
        e.invoiceNumber || "",
        e.receiptPath || e.receiptUrl ? "Yes" : "Missing",
        String(e.taxYear + 8),
      ];
    });

  const csvContent = [headers, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `LHDN_YA${taxYear}_Tax_Reliefs_Audit_Summary.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const maxDim = 900;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve("");
    };
    img.src = objectUrl;
  });
}

export { isSupabaseConfigured };
