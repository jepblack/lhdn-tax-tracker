import {
  archiveReceiptToGoogleDrive,
  getGoogleDriveToken,
  saveGoogleDriveToken,
} from "./google-drive";
import {
  DEFAULT_STATUS_RELIEFS,
  getReliefCategories,
  SUPPORTED_TAX_YEARS,
} from "./lhdn-rules";
import { buildJsonMetadataFile } from "./receipt-archiver";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import {
  AnnualTaxDoc,
  FormBeBaseline,
  TaxExpense,
  TaxProfile,
  TaxYear,
} from "./types";

const LOCAL_EXPENSES_KEY = "cukaiku_expenses_v1";
const LOCAL_PROFILES_KEY = "cukaiku_profiles_v1";
const LOCAL_ANNUAL_DOCS_KEY = "cukaiku_annual_docs_v1";
const LOCAL_BASELINES_KEY = "cukaiku_form_be_baselines_v1";

export function getDefaultProfile(taxYear: TaxYear): TaxProfile {
  return {
    taxYear,
    annualIncome: 96000,
    zakatPaid: 0,
    pcbPaid: 6200,
    taxpayerMode: "e-BE",
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

function loadLocalAnnualDocs(): AnnualTaxDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ANNUAL_DOCS_KEY);
    return raw ? (JSON.parse(raw) as AnnualTaxDoc[]) : [];
  } catch {
    return [];
  }
}

function loadLocalBaselines(): Record<string, FormBeBaseline> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_BASELINES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FormBeBaseline>) : {};
  } catch {
    return {};
  }
}

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
      const rawStatus = { ...(data.status_reliefs || {}) } as Record<string, unknown>;
      const savedMode =
        rawStatus._taxpayerMode === "e-B" ? "e-B" : "e-BE";
      delete rawStatus._annualDocs;
      delete rawStatus._formBeBaseline;
      delete rawStatus._taxpayerMode;
      return {
        taxYear,
        annualIncome: Number(data.annual_income),
        zakatPaid: Number(data.zakat_paid),
        pcbPaid: Number(data.pcb_paid),
        taxpayerMode: savedMode,
        statusReliefs: {
          ...DEFAULT_STATUS_RELIEFS,
          ...rawStatus,
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
    // Preserve any synced _annualDocs / _formBeBaseline stored inside status_reliefs jsonb
    const { data: existing } = await supabase
      .from("tax_profiles")
      .select("status_reliefs")
      .eq("user_id", userId)
      .eq("tax_year", profile.taxYear)
      .maybeSingle();

    const existingStatus = (existing?.status_reliefs || {}) as Record<string, unknown>;
    const mergedStatus: Record<string, unknown> = {
      ...profile.statusReliefs,
      _taxpayerMode: profile.taxpayerMode || "e-BE",
    };
    if (existingStatus._annualDocs !== undefined) {
      mergedStatus._annualDocs = existingStatus._annualDocs;
    }
    if (existingStatus._formBeBaseline !== undefined) {
      mergedStatus._formBeBaseline = existingStatus._formBeBaseline;
    }

    const { error } = await supabase.from("tax_profiles").upsert(
      {
        user_id: userId,
        tax_year: profile.taxYear,
        annual_income: profile.annualIncome,
        zakat_paid: profile.zakatPaid,
        pcb_paid: profile.pcbPaid,
        status_reliefs: mergedStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tax_year" }
    );
    if (error) {
      console.error("Failed to persist profile to Supabase:", error);
    }
  }
}

export async function uploadAnnualDocToSupabase(
  userId: string,
  taxYear: TaxYear,
  file: File
): Promise<{ storagePath: string; signedUrl: string } | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const storagePath = `${userId}/AnnualDocs/${taxYear}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("receipts")
    .upload(storagePath, file, { upsert: true });
  if (error) {
    console.error("Failed to upload annual doc to Supabase Storage:", error);
    return null;
  }
  const { data: signed } = await supabase.storage
    .from("receipts")
    .createSignedUrl(storagePath, 3600);
  return {
    storagePath,
    signedUrl: signed?.signedUrl || "",
  };
}

export async function fetchAnnualStateFromCloud(
  taxYear: TaxYear,
  userId?: string | null
): Promise<{ docs: AnnualTaxDoc[]; baseline: FormBeBaseline | null } | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("tax_profiles")
    .select("status_reliefs")
    .eq("user_id", userId)
    .eq("tax_year", taxYear)
    .maybeSingle();

  if (error || !data?.status_reliefs) return null;
  const raw = data.status_reliefs as Record<string, unknown>;
  const rawDocs = Array.isArray(raw._annualDocs)
    ? (raw._annualDocs as AnnualTaxDoc[])
    : [];
  const baseline = (raw._formBeBaseline as FormBeBaseline | null) || null;

  // Refresh signed URLs for Supabase-stored annual docs
  const docs = await Promise.all(
    rawDocs.map(async (d) => {
      if (d.storageProvider === "supabase" && d.storagePath) {
        const { data: signed } = await supabase.storage
          .from("receipts")
          .createSignedUrl(d.storagePath, 3600);
        if (signed?.signedUrl) {
          return { ...d, fileUrl: signed.signedUrl };
        }
      }
      return d;
    })
  );

  return { docs, baseline };
}

export async function persistAnnualStateToCloud(
  taxYear: TaxYear,
  docsForYear: AnnualTaxDoc[],
  baselineForYear: FormBeBaseline | null,
  profile: TaxProfile,
  userId?: string | null
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return;

  // Strip huge inline base64 data URLs before saving to Postgres JSONB
  const sanitizedDocs = docsForYear.map((d) =>
    d.fileUrl?.startsWith("data:") ? { ...d, fileUrl: "" } : d
  );

  const { data: existing } = await supabase
    .from("tax_profiles")
    .select("annual_income, zakat_paid, pcb_paid, status_reliefs")
    .eq("user_id", userId)
    .eq("tax_year", taxYear)
    .maybeSingle();

  const existingStatus = (existing?.status_reliefs || profile.statusReliefs || {}) as Record<string, unknown>;
  const nextStatus: Record<string, unknown> = {
    ...existingStatus,
    _annualDocs: sanitizedDocs,
    _formBeBaseline: baselineForYear,
  };

  const { error } = await supabase.from("tax_profiles").upsert(
    {
      user_id: userId,
      tax_year: taxYear,
      annual_income: existing?.annual_income ?? profile.annualIncome,
      zakat_paid: existing?.zakat_paid ?? profile.zakatPaid,
      pcb_paid: existing?.pcb_paid ?? profile.pcbPaid,
      status_reliefs: nextStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tax_year" }
  );
  if (error) {
    console.error("Failed to persist annual docs/baseline to Supabase:", error);
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
            if (String(row.receipt_path).startsWith("gdrive:")) {
              receiptUrl = String(row.receipt_path).replace(/^gdrive:/, "");
            } else {
              const { data: signed } = await supabase.storage
                .from("receipts")
                .createSignedUrl(row.receipt_path, 3600);
              receiptUrl = signed?.signedUrl || null;
            }
          }
          return {
            id: row.id,
            taxYear: row.tax_year as TaxYear,
            categoryId: row.category_id,
            subCategoryId: row.sub_category_id,
            claimType:
              row.category_id === "business_expense" ||
              row.sub_category_id === "business_deductible"
                ? "business_deductible"
                : "personal_relief",
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

/**
 * Syncs any local expenses or profiles stored in browser memory to the user's Supabase cloud account.
 * This ensures that work done before signing in is not stranded in the browser.
 */
export async function getCloudSyncStatus(userId: string): Promise<{
  cloudExpensesCount: number;
  cloudProfilesCount: number;
  localExpensesCount: number;
  error: string | null;
}> {
  const localExpensesCount = loadLocalExpenses().length;
  const supabase = getSupabaseClient();
  if (!supabase || !userId) {
    return {
      cloudExpensesCount: 0,
      cloudProfilesCount: 0,
      localExpensesCount,
      error: "Supabase not connected or user not signed in.",
    };
  }

  const [expRes, profRes] = await Promise.all([
    supabase
      .from("tax_expenses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("tax_profiles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const err = expRes.error || profRes.error;
  return {
    cloudExpensesCount: expRes.count || 0,
    cloudProfilesCount: profRes.count || 0,
    localExpensesCount,
    error: err ? `${err.code || ""} ${err.message}`.trim() : null,
  };
}

export async function syncLocalDataToCloud(
  userId: string
): Promise<{ syncedExpenses: number; syncedProfile: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { syncedExpenses: 0, syncedProfile: false };

  let syncedExpenses = 0;
  let syncedProfile = false;
  let lastError: string | undefined;

  // 1. Sync Profile
  try {
    for (const yr of SUPPORTED_TAX_YEARS) {
      const localProf = loadLocalProfile(yr);
      if (localProf && (localProf.annualIncome !== 96000 || localProf.zakatPaid > 0 || localProf.pcbPaid !== 6200)) {
        await persistProfile(localProf, userId);
        syncedProfile = true;
      }
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Failed to sync profile";
    console.warn("Could not sync local profile to cloud:", err);
  }

  // 2. Sync Expenses
  try {
    const local = loadLocalExpenses();
    if (local.length > 0) {
      const { data: cloudData, error: fetchErr } = await supabase
        .from("tax_expenses")
        .select("id, expense_date, merchant, amount")
        .eq("user_id", userId);

      if (fetchErr) {
        lastError = `${fetchErr.code || ""} ${fetchErr.message}`.trim();
      } else {
        const existingKeys = new Set(
          (cloudData || []).map(
            (r) => `${r.expense_date}_${r.merchant}_${Number(r.amount).toFixed(2)}`
          )
        );

        for (const exp of local) {
          const key = `${exp.expenseDate}_${exp.merchant}_${Number(exp.amount).toFixed(2)}`;
          if (!existingKeys.has(key)) {
            const { error: insErr } = await supabase.from("tax_expenses").insert({
              user_id: userId,
              tax_year: exp.taxYear,
              category_id: exp.categoryId,
              sub_category_id: exp.subCategoryId || null,
              merchant: exp.merchant,
              description: exp.description || "",
              amount: exp.amount,
              expense_date: exp.expenseDate,
              invoice_number: exp.invoiceNumber || "",
              receipt_path: exp.receiptPath || null,
              receipt_mime_type: exp.receiptMimeType || null,
              receipt_file_name: exp.receiptFileName || null,
              ai_extracted: Boolean(exp.aiExtracted),
            });
            if (!insErr) {
              syncedExpenses++;
            } else {
              lastError = `${insErr.code || ""} ${insErr.message}`.trim();
              console.error("Failed to sync local expense:", insErr);
            }
          }
        }
        // Clear migrated local expenses once confirmed in cloud so deleted cloud receipts never resurrect on refresh
        if (!lastError) {
          saveLocalExpenses([]);
        }
      }
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Failed to sync expenses";
    console.warn("Could not sync local expenses to cloud:", err);
  }

  // 3. Sync Annual Docs & Form BE Baselines
  try {
    const localDocs = loadLocalAnnualDocs();
    const localBaselines = loadLocalBaselines();
    for (const yr of SUPPORTED_TAX_YEARS) {
      const docsForYear = localDocs.filter((d) => d.taxYear === yr);
      const baselineForYear = localBaselines[String(yr)] || null;
      if (docsForYear.length > 0 || baselineForYear) {
        const cloudState = await fetchAnnualStateFromCloud(yr, userId);
        const existingDocs = cloudState?.docs || [];
        const existingDocIds = new Set(existingDocs.map((d) => d.id));
        const mergedDocs = [
          ...existingDocs,
          ...docsForYear.filter((d) => !existingDocIds.has(d.id)),
        ];
        const mergedBaseline = cloudState?.baseline || baselineForYear;
        if (mergedDocs.length > existingDocs.length || (!cloudState?.baseline && baselineForYear)) {
          await persistAnnualStateToCloud(
            yr,
            mergedDocs,
            mergedBaseline,
            loadLocalProfile(yr),
            userId
          );
        }
      }
    }
  } catch (err) {
    console.warn("Could not sync annual docs/baselines to cloud:", err);
  }

  return { syncedExpenses, syncedProfile, error: lastError };
}

export async function createExpense(
  expense: Omit<TaxExpense, "id" | "createdAt">,
  receiptFile?: File | null,
  userId?: string | null
): Promise<TaxExpense> {
  const supabase = getSupabaseClient();
  const driveToken = getGoogleDriveToken();

  // Prefer Google Drive (/CukaiKu/Receipts/YYYY/) when signed in with Google Drive scope
  let driveWebViewLink: string | null = null;
  if (driveToken && (receiptFile || expense.metadata)) {
    try {
      const archived = await archiveReceiptToGoogleDrive(
        driveToken,
        expense.taxYear,
        receiptFile || null,
        expense
      );
      if (archived.pdfWebViewLink) {
        driveWebViewLink = archived.pdfWebViewLink;
      }
    } catch (err) {
      if (err instanceof Error && err.message === "DRIVE_TOKEN_EXPIRED") {
        saveGoogleDriveToken(null);
      }
      console.warn("Google Drive upload skipped, using fallback storage:", err);
    }
  }

  if (supabase && userId) {
    let receiptPath: string | null = null;
    let receiptUrl: string | null = null;
    let receiptMimeType: string | null = null;
    let receiptFileName: string | null = null;

    if (driveWebViewLink) {
      receiptPath = `gdrive:${driveWebViewLink}`;
      receiptUrl = driveWebViewLink;
      receiptMimeType = receiptFile?.type || "application/pdf";
      receiptFileName =
        expense.metadata?.file_pdf || receiptFile?.name || "receipt.pdf";
    } else if (receiptFile) {
      const folder = `${userId}/Receipts/${expense.taxYear}`;
      const pdfName =
        expense.metadata?.file_pdf ||
        receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
      receiptPath = `${folder}/${pdfName}`;
      receiptMimeType = receiptFile.type || "application/pdf";
      receiptFileName = pdfName;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(receiptPath, receiptFile, { upsert: true });

      if (!uploadError) {
        const { data: signed } = await supabase.storage
          .from("receipts")
          .createSignedUrl(receiptPath, 3600);
        receiptUrl = signed?.signedUrl || null;
      } else {
        receiptPath = null;
      }

      // Also archive paired LHDN JSON metadata file alongside the PDF
      if (expense.metadata) {
        const jsonFile = buildJsonMetadataFile(expense.metadata);
        const jsonPath = `${folder}/${jsonFile.name}`;
        await supabase.storage
          .from("receipts")
          .upload(jsonPath, jsonFile, { upsert: true });
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
        jsonPath: receiptPath ? receiptPath.replace(/\.pdf$/i, ".json") : null,
        metadata: expense.metadata || null,
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

export async function updateExpense(
  existingId: string,
  expense: Omit<TaxExpense, "id" | "createdAt">,
  receiptFile?: File | null,
  userId?: string | null
): Promise<TaxExpense> {
  const supabase = getSupabaseClient();
  const driveToken = getGoogleDriveToken();

  let driveWebViewLink: string | null = null;
  if (driveToken && (receiptFile || expense.metadata)) {
    try {
      const archived = await archiveReceiptToGoogleDrive(
        driveToken,
        expense.taxYear,
        receiptFile || null,
        expense
      );
      if (archived.pdfWebViewLink) {
        driveWebViewLink = archived.pdfWebViewLink;
      }
    } catch (err) {
      if (err instanceof Error && err.message === "DRIVE_TOKEN_EXPIRED") {
        saveGoogleDriveToken(null);
      }
    }
  }

  if (supabase && userId && !existingId.startsWith("local_")) {
    let receiptPath = expense.receiptPath || null;
    let receiptUrl = expense.receiptUrl || null;
    let receiptMimeType = expense.receiptMimeType || null;
    let receiptFileName = expense.receiptFileName || null;

    if (driveWebViewLink) {
      receiptPath = `gdrive:${driveWebViewLink}`;
      receiptUrl = driveWebViewLink;
      receiptMimeType = receiptFile?.type || "application/pdf";
      receiptFileName =
        expense.metadata?.file_pdf || receiptFile?.name || "receipt.pdf";
    } else if (receiptFile) {
      const folder = `${userId}/Receipts/${expense.taxYear}`;
      const pdfName =
        expense.metadata?.file_pdf ||
        receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
      receiptPath = `${folder}/${pdfName}`;
      receiptMimeType = receiptFile.type || "application/pdf";
      receiptFileName = pdfName;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(receiptPath, receiptFile, { upsert: true });

      if (!uploadError) {
        const { data: signed } = await supabase.storage
          .from("receipts")
          .createSignedUrl(receiptPath, 3600);
        receiptUrl = signed?.signedUrl || null;
      }

      if (expense.metadata) {
        const jsonFile = buildJsonMetadataFile(expense.metadata);
        await supabase.storage
          .from("receipts")
          .upload(`${folder}/${jsonFile.name}`, jsonFile, { upsert: true });
      }
    }

    const { data, error } = await supabase
      .from("tax_expenses")
      .update({
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId)
      .eq("user_id", userId)
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
        jsonPath: receiptPath ? receiptPath.replace(/\.pdf$/i, ".json") : null,
        metadata: expense.metadata || null,
        aiExtracted: Boolean(data.ai_extracted),
        createdAt: data.created_at,
      };
    }
  }

  // Local mode update
  let localDataUrl = driveWebViewLink || expense.receiptUrl || null;
  if (receiptFile && !driveWebViewLink) {
    localDataUrl = await fileToCompressedDataUrl(receiptFile);
  }

  const existing = loadLocalExpenses();
  const prev = existing.find((e) => e.id === existingId);
  const updated: TaxExpense = {
    ...expense,
    id: existingId,
    receiptUrl: localDataUrl,
    receiptMimeType:
      receiptFile?.type || expense.receiptMimeType || prev?.receiptMimeType || null,
    receiptFileName:
      expense.receiptFileName || receiptFile?.name || prev?.receiptFileName || null,
    createdAt: prev?.createdAt || new Date().toISOString(),
  };

  saveLocalExpenses(existing.map((e) => (e.id === existingId ? updated : e)));
  return updated;
}

export async function removeExpense(
  expense: TaxExpense,
  userId?: string | null
): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase && userId && !expense.id.startsWith("local_")) {
    const pathsToRemove: string[] = [];
    if (expense.receiptPath && !expense.receiptPath.startsWith("gdrive:")) {
      pathsToRemove.push(expense.receiptPath);
      if (expense.receiptPath.toLowerCase().endsWith(".pdf")) {
        pathsToRemove.push(expense.receiptPath.replace(/\.pdf$/i, ".json"));
      }
    }
    if (pathsToRemove.length > 0) {
      await supabase.storage.from("receipts").remove(pathsToRemove);
    }
    await supabase
      .from("tax_expenses")
      .delete()
      .eq("id", expense.id)
      .eq("user_id", userId);
  }

  // Also remove from localStorage (matching by id or signature) so it cannot resurrect
  const targetKey = `${expense.expenseDate}_${expense.merchant}_${Number(expense.amount).toFixed(2)}`;
  const existing = loadLocalExpenses();
  saveLocalExpenses(
    existing.filter(
      (e) =>
        e.id !== expense.id &&
        `${e.expenseDate}_${e.merchant}_${Number(e.amount).toFixed(2)}` !== targetKey
    )
  );
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

  // Annual LHDN Index CSV matching archiving specification
  const headers = [
    "filename",
    "date",
    "merchant",
    "amount",
    "currency",
    "category",
    "payment_method",
    "tax_amount",
    "ocr_confidence",
    "needs_review",
    "form_be_ref",
    "lhdn_relief",
    "receipt_number",
    "retain_until",
  ];

  const rows = expenses
    .filter((e) => e.taxYear === taxYear)
    .map((e) => {
      const cat = catMap.get(e.categoryId);
      const m = e.metadata;
      return [
        m?.file_pdf || e.receiptFileName || "",
        m?.transaction_date || e.expenseDate,
        m?.merchant_name || e.merchant,
        (m?.amount_paid ?? e.amount).toFixed(2),
        m?.currency || "MYR",
        m?.category || cat?.shortName || e.categoryId,
        m?.payment_method || "",
        (m?.sst_or_tax_amount ?? 0).toFixed(2),
        m?.ocr_confidence || (e.aiExtracted ? "high" : "manual"),
        m?.needs_review ? "true" : "false",
        cat?.formBeRef || "",
        cat?.name || e.categoryId,
        m?.receipt_number || e.invoiceNumber || "",
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
  link.download = `Receipts_${taxYear}_LHDN_Index.csv`;
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
