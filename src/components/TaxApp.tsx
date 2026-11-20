"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  LayoutDashboard,
  ListChecks,
  Moon,
  ReceiptText,
  RefreshCw,
  Settings,
  Shield,
  Sun,
} from "lucide-react";
import { calculateTaxSummary } from "@/lib/calculator";
import {
  getGoogleDriveToken,
  saveGoogleDriveToken,
  uploadAnnualDocToGoogleDrive,
} from "@/lib/google-drive";
import { SUPPORTED_TAX_YEARS } from "@/lib/lhdn-rules";
import {
  createExpense,
  fetchAnnualStateFromCloud,
  fetchExpenses,
  fetchProfile,
  getDefaultProfile,
  getSampleExpenses,
  persistAnnualStateToCloud,
  persistProfile,
  removeExpense,
  saveLocalExpenses,
  syncLocalDataToCloud,
  updateExpense,
  uploadAnnualDocToSupabase,
} from "@/lib/storage";
import { getSupabaseClient } from "@/lib/supabase";
import {
  AnnualDocExtraction,
  AnnualDocType,
  AnnualTaxDoc,
  FormBeBaseline,
  TaxExpense,
  TaxProfile,
  TaxYear,
} from "@/lib/types";
import { BatchImportModal } from "./BatchImportModal";
import { DashboardTab } from "./DashboardTab";
import { FilingToolsSheet, FilingToolTab } from "./FilingToolsSheet";
import { MyInvoisQrModal } from "./MyInvoisQrModal";
import { ReceiptScannerModal } from "./ReceiptScannerModal";
import { ReceiptsTab } from "./ReceiptsTab";
import { ReliefsTab } from "./ReliefsTab";
import { SettingsTab } from "./SettingsTab";

const ANNUAL_DOCS_KEY = "cukaiku_annual_docs_v1";
const FORM_BE_BASELINES_KEY = "cukaiku_form_be_baselines_v1";

type ActiveTab = "dashboard" | "reliefs" | "receipts" | "settings";

export function TaxApp() {
  const [taxYear, setTaxYear] = useState<TaxYear>(2026);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);

  const [profile, setProfile] = useState<TaxProfile>(() =>
    getDefaultProfile(2026)
  );
  const [expenses, setExpenses] = useState<TaxExpense[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCategoryId, setScannerCategoryId] = useState<
    string | undefined
  >(undefined);
  const [scannerSubCategoryId, setScannerSubCategoryId] = useState<
    string | undefined
  >(undefined);
  const [editingExpense, setEditingExpense] = useState<TaxExpense | null>(null);
  const [prefillInvoice, setPrefillInvoice] = useState<string | undefined>(undefined);
  const [prefillDesc, setPrefillDesc] = useState<string | undefined>(undefined);

  // Batch import, MyInvois QR, Annual Docs, Dark Mode & Privacy Blur
  const [batchOpen, setBatchOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [annualDocs, setAnnualDocs] = useState<AnnualTaxDoc[]>([]);
  const [formBeBaselines, setFormBeBaselines] = useState<
    Record<string, FormBeBaseline>
  >({});
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Load dark mode preference, annual docs & Form BE baselines on mount
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("cukaiku_theme_v1");
      if (savedTheme === "dark") {
        setDarkMode(true);
        document.documentElement.classList.add("dark");
      }
      const savedDocs = window.localStorage.getItem(ANNUAL_DOCS_KEY);
      if (savedDocs) setAnnualDocs(JSON.parse(savedDocs));
      const savedBaselines = window.localStorage.getItem(FORM_BE_BASELINES_KEY);
      if (savedBaselines) setFormBeBaselines(JSON.parse(savedBaselines));
    } catch {
      // ignore
    }
  }, []);

  function toggleDarkMode() {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("cukaiku_theme_v1", next ? "dark" : "light");
      return next;
    });
  }

  async function handleUploadAnnualDoc(
    docType: AnnualDocType,
    label: string,
    file: File
  ): Promise<AnnualTaxDoc> {
    const driveToken = getGoogleDriveToken();
    let fileUrl = "";
    let storagePath: string | null = null;
    let storageProvider: "gdrive" | "supabase" | "local" = "local";

    if (driveToken) {
      try {
        const res = await uploadAnnualDocToGoogleDrive(driveToken, taxYear, file);
        fileUrl = res.webViewLink;
        storageProvider = "gdrive";
      } catch {
        // fall back to Supabase Storage or local data URL
      }
    }

    if (!fileUrl && userId) {
      const supaRes = await uploadAnnualDocToSupabase(userId, taxYear, file);
      if (supaRes) {
        fileUrl = supaRes.signedUrl;
        storagePath = supaRes.storagePath;
        storageProvider = "supabase";
      }
    }

    if (!fileUrl) {
      fileUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
    }

    const newDoc: AnnualTaxDoc = {
      id: `doc_${Date.now()}`,
      taxYear,
      docType,
      label,
      fileName: file.name,
      fileUrl,
      storagePath,
      mimeType: file.type || "application/pdf",
      uploadedAt: new Date().toISOString(),
      storageProvider,
    };

    const nextAll = [newDoc, ...annualDocs];
    setAnnualDocs(nextAll);
    try {
      window.localStorage.setItem(ANNUAL_DOCS_KEY, JSON.stringify(nextAll));
    } catch {
      // ignore quota
    }
    if (userId) {
      await persistAnnualStateToCloud(
        taxYear,
        nextAll.filter((d) => d.taxYear === taxYear),
        formBeBaselines[String(taxYear)] || null,
        profile,
        userId
      );
    }

    return newDoc;
  }

  async function handleApplyAnnualDocExtraction(
    ext: AnnualDocExtraction,
    doc: AnnualTaxDoc
  ) {
    // 1. Update Income / PCB / Zakat in Tax Profile if extracted
    if (ext.annualIncome > 0 || ext.pcbPaid > 0 || ext.zakatPaid > 0) {
      await handleUpdateProfile({
        ...profile,
        annualIncome:
          ext.annualIncome > 0 ? ext.annualIncome : profile.annualIncome,
        pcbPaid: ext.pcbPaid > 0 ? ext.pcbPaid : profile.pcbPaid,
        zakatPaid: ext.zakatPaid > 0 ? ext.zakatPaid : profile.zakatPaid,
      });
    }

    // 2. Log corresponding tax reliefs
    // For Form BE imports, save a FormBeBaseline for live audit reconciliation AND
    // intentionally leave receiptUrl/receiptPath null so CukaiKu flags missing supporting receipts!
    const isFormBeImport = doc.docType === "form_be_proof";
    if (isFormBeImport) {
      const declaredByCategory: Record<string, number> = {};
      const epfLife = (ext.epfEmployee || 0) + (ext.lifeInsuranceAmount || 0);
      if (epfLife > 0) declaredByCategory["epf_life_insurance"] = epfLife;
      if (ext.socsoEisEmployee > 0) declaredByCategory["socso"] = ext.socsoEisEmployee;
      if (ext.medicalInsuranceAmount > 0) {
        declaredByCategory["edu_med_insurance"] = ext.medicalInsuranceAmount;
      }
      if (ext.housingLoanInterest > 0) {
        declaredByCategory["first_home_interest"] = ext.housingLoanInterest;
      }
      for (const extra of ext.extraReliefs || []) {
        if (extra.amount > 0) {
          declaredByCategory[extra.categoryId] =
            (declaredByCategory[extra.categoryId] || 0) + extra.amount;
        }
      }
      const baseline: FormBeBaseline = {
        taxYear,
        uploadedFileName: doc.fileName,
        uploadedAt: new Date().toISOString(),
        declaredIncome: ext.annualIncome || 0,
        declaredPcb: ext.pcbPaid || 0,
        declaredZakat: ext.zakatPaid || 0,
        declaredByCategory,
      };
      setFormBeBaselines((prev) => {
        const next = { ...prev, [String(taxYear)]: baseline };
        try {
          window.localStorage.setItem(FORM_BE_BASELINES_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      if (userId) {
        const currentDocs = annualDocs.some((d) => d.id === doc.id)
          ? annualDocs
          : [doc, ...annualDocs];
        await persistAnnualStateToCloud(
          taxYear,
          currentDocs.filter((d) => d.taxYear === taxYear),
          baseline,
          profile,
          userId
        );
      }
    }
    const today = `${taxYear}-${new Date().toISOString().slice(5, 10)}`;
    const provider = ext.providerName || doc.label;
    const sharedFileFields = isFormBeImport
      ? {
          receiptUrl: null,
          receiptPath: null,
          receiptFileName: null,
          receiptMimeType: null,
          aiExtracted: true,
        }
      : {
          receiptUrl: doc.fileUrl,
          receiptPath:
            doc.storageProvider === "gdrive"
              ? `gdrive:${doc.fileUrl}`
              : doc.storageProvider === "supabase"
              ? doc.storagePath || null
              : null,
          receiptFileName: doc.fileName,
          receiptMimeType: doc.mimeType,
          aiExtracted: true,
        };
    const descriptionNote = isFormBeImport
      ? `Imported from ${doc.label} — attach supporting receipts for LHDN 7-year audit`
      : `Extracted from ${doc.label}`;

    if (ext.epfEmployee > 0) {
      await handleSaveExpense(
        {
          taxYear,
          categoryId: "epf_life_insurance",
          subCategoryId: "epf_mandatory",
          merchant: `${provider} — EPF`,
          description: descriptionNote,
          amount: ext.epfEmployee,
          expenseDate: today,
          ...sharedFileFields,
        },
        null
      );
    }

    if (ext.socsoEisEmployee > 0) {
      await handleSaveExpense(
        {
          taxYear,
          categoryId: "socso",
          subCategoryId: null,
          merchant: `${provider} — SOCSO & EIS`,
          description: descriptionNote,
          amount: ext.socsoEisEmployee,
          expenseDate: today,
          ...sharedFileFields,
        },
        null
      );
    }

    if (ext.lifeInsuranceAmount > 0) {
      await handleSaveExpense(
        {
          taxYear,
          categoryId: "epf_life_insurance",
          subCategoryId: "life_insurance",
          merchant: `${provider} — Life Insurance`,
          description: descriptionNote,
          amount: ext.lifeInsuranceAmount,
          expenseDate: today,
          ...sharedFileFields,
        },
        null
      );
    }

    if (ext.medicalInsuranceAmount > 0) {
      await handleSaveExpense(
        {
          taxYear,
          categoryId: "edu_med_insurance",
          subCategoryId: null,
          merchant: `${provider} — Medical Insurance`,
          description: descriptionNote,
          amount: ext.medicalInsuranceAmount,
          expenseDate: today,
          ...sharedFileFields,
        },
        null
      );
    }

    if (ext.housingLoanInterest > 0) {
      await handleSaveExpense(
        {
          taxYear,
          categoryId: "first_home_interest",
          subCategoryId: "home_under_500k",
          merchant: `${provider} — Housing Loan Interest`,
          description: descriptionNote,
          amount: ext.housingLoanInterest,
          expenseDate: today,
          ...sharedFileFields,
        },
        null
      );
    }

    if (ext.extraReliefs && ext.extraReliefs.length > 0) {
      for (const extra of ext.extraReliefs) {
        if (extra.amount > 0) {
          await handleSaveExpense(
            {
              taxYear,
              categoryId: extra.categoryId,
              subCategoryId: extra.subCategoryId || null,
              merchant: `${provider} — ${extra.label}`,
              description: descriptionNote,
              amount: extra.amount,
              expenseDate: today,
              ...sharedFileFields,
            },
            null
          );
        }
      }
    }
  }

  function handleDeleteAnnualDoc(id: string) {
    const next = annualDocs.filter((d) => d.id !== id);
    setAnnualDocs(next);
    try {
      window.localStorage.setItem(ANNUAL_DOCS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    if (userId) {
      persistAnnualStateToCloud(
        taxYear,
        next.filter((d) => d.taxYear === taxYear),
        formBeBaselines[String(taxYear)] || null,
        profile,
        userId
      );
    }
  }

  const [refreshing, setRefreshing] = useState(false);

  async function refreshAllFromCloud(uid: string | null, yr: TaxYear) {
    const [loadedProfile, loadedExpenses, annualState] = await Promise.all([
      fetchProfile(yr, uid),
      fetchExpenses(uid),
      uid ? fetchAnnualStateFromCloud(yr, uid) : Promise.resolve(null),
    ]);
    setProfile(loadedProfile);
    setExpenses(loadedExpenses);
    if (annualState) {
      setAnnualDocs((prev) => {
        const otherYears = prev.filter((d) => d.taxYear !== yr);
        const merged = [...annualState.docs, ...otherYears];
        try {
          window.localStorage.setItem(ANNUAL_DOCS_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      });
      if (annualState.baseline) {
        setFormBeBaselines((prev) => {
          const next = { ...prev, [String(yr)]: annualState.baseline! };
          try {
            window.localStorage.setItem(FORM_BE_BASELINES_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    }
    setIsLoaded(true);
  }

  async function handleManualRefresh() {
    if (!userId || refreshing) return;
    setRefreshing(true);
    try {
      await syncLocalDataToCloud(userId);
      await refreshAllFromCloud(userId, taxYear);
    } finally {
      setRefreshing(false);
    }
  }

  // Filing tools sheet state
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<FilingToolTab>("form-be");

  // Listen to Supabase auth state + capture Google Drive provider_token
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id || null;
      setUserId(uid);
      setUserEmail(data.session?.user?.email || null);
      if (data.session?.provider_token) {
        saveGoogleDriveToken(data.session.provider_token);
        setDriveConnected(true);
      } else {
        setDriveConnected(Boolean(getGoogleDriveToken()));
      }
      if (uid) {
        syncLocalDataToCloud(uid).then((res) => {
          if (res.syncedExpenses > 0 || res.syncedProfile) {
            refreshAllFromCloud(uid, taxYear);
          }
        });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const uid = session?.user?.id || null;
        setUserId(uid);
        setUserEmail(session?.user?.email || null);
        if (session?.provider_token) {
          saveGoogleDriveToken(session.provider_token);
          setDriveConnected(true);
        } else if (!session) {
          saveGoogleDriveToken(null);
          setDriveConnected(false);
        }
        if (uid) {
          syncLocalDataToCloud(uid).then((res) => {
            if (res.syncedExpenses > 0 || res.syncedProfile) {
              refreshAllFromCloud(uid, taxYear);
            }
          });
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load profile, expenses & annual docs whenever taxYear or userId changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [loadedProfile, loadedExpenses, annualState] = await Promise.all([
        fetchProfile(taxYear, userId),
        fetchExpenses(userId),
        userId ? fetchAnnualStateFromCloud(taxYear, userId) : Promise.resolve(null),
      ]);
      if (!cancelled) {
        setProfile(loadedProfile);
        setExpenses(loadedExpenses);
        if (annualState) {
          setAnnualDocs((prev) => {
            const otherYears = prev.filter((d) => d.taxYear !== taxYear);
            const merged = [...annualState.docs, ...otherYears];
            try {
              window.localStorage.setItem(ANNUAL_DOCS_KEY, JSON.stringify(merged));
            } catch {
              // ignore
            }
            return merged;
          });
          if (annualState.baseline) {
            setFormBeBaselines((prev) => {
              const next = { ...prev, [String(taxYear)]: annualState.baseline! };
              try {
                window.localStorage.setItem(FORM_BE_BASELINES_KEY, JSON.stringify(next));
              } catch {
                // ignore
              }
              return next;
            });
          }
        }
        setIsLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [taxYear, userId]);

  const summary = useMemo(
    () => calculateTaxSummary(profile, expenses),
    [profile, expenses]
  );

  const yearExpenses = useMemo(
    () => expenses.filter((e) => e.taxYear === taxYear),
    [expenses, taxYear]
  );

  const missingReceiptsTotal = useMemo(
    () => yearExpenses.filter((e) => !e.receiptPath && !e.receiptUrl).length,
    [yearExpenses]
  );

  function openScanner(categoryId?: string, subCategoryId?: string) {
    setEditingExpense(null);
    setScannerCategoryId(categoryId);
    setScannerSubCategoryId(subCategoryId);
    setScannerOpen(true);
  }

  function openEditExpense(expense: TaxExpense) {
    setEditingExpense(expense);
    setScannerCategoryId(expense.categoryId);
    setScannerSubCategoryId(expense.subCategoryId || undefined);
    setScannerOpen(true);
  }

  async function handleSaveExpense(
    expenseData: Omit<TaxExpense, "id" | "createdAt">,
    receiptFile: File | null,
    editingId?: string
  ) {
    if (editingId) {
      const updated = await updateExpense(
        editingId,
        expenseData,
        receiptFile,
        userId
      );
      setExpenses((prev) =>
        prev.map((e) => (e.id === editingId ? updated : e))
      );
      return;
    }
    const created = await createExpense(expenseData, receiptFile, userId);
    setExpenses((prev) => [created, ...prev]);
  }

  async function handleDeleteExpense(expense: TaxExpense) {
    await removeExpense(expense, userId);
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
  }

  async function handleUpdateProfile(next: TaxProfile) {
    setProfile(next);
    await persistProfile(next, userId);
  }

  async function handleLogPayslipReliefs(
    epfAmount: number,
    socsoAmount: number,
    payslipFile: File | null
  ) {
    const today = `${taxYear}-${new Date().toISOString().slice(5, 10)}`;
    if (epfAmount > 0) {
      const epfExpense = await createExpense(
        {
          taxYear,
          categoryId: "epf_life_insurance",
          subCategoryId: "epf_mandatory",
          merchant: "KWSP / EPF (Payslip YTD)",
          description: "Auto-extracted from uploaded payslip / EA Form",
          amount: epfAmount,
          expenseDate: today,
          invoiceNumber: `PAYSLIP-EPF-${taxYear}`,
          aiExtracted: true,
        },
        payslipFile,
        userId
      );
      setExpenses((prev) => [epfExpense, ...prev]);
    }
    if (socsoAmount > 0) {
      const socsoExpense = await createExpense(
        {
          taxYear,
          categoryId: "socso",
          subCategoryId: null,
          merchant: "PERKESO / SOCSO & EIS (Payslip YTD)",
          description: "Auto-extracted from uploaded payslip / EA Form",
          amount: socsoAmount,
          expenseDate: today,
          invoiceNumber: `PAYSLIP-SOCSO-${taxYear}`,
          aiExtracted: true,
        },
        payslipFile,
        userId
      );
      setExpenses((prev) => [socsoExpense, ...prev]);
    }
  }

  function handleLoadSampleData() {
    const samples = getSampleExpenses(taxYear);
    const otherYears = expenses.filter((e) => e.taxYear !== taxYear);
    const merged = [...samples, ...otherYears];
    setExpenses(merged);
    saveLocalExpenses(merged);
  }

  function handleClearLocalData() {
    const remaining = expenses.filter((e) => e.taxYear !== taxYear);
    setExpenses(remaining);
    saveLocalExpenses(remaining);
  }

  return (
    <div
      className={`min-h-screen bg-slate-50 text-slate-900 ${
        privacyBlur ? "privacy-mode" : ""
      }`}
    >
      {/* Top Sticky Mobile Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight text-slate-900">
                CukaiKu
              </h1>
              <p className="text-[11px] text-slate-500">
                LHDN Relief & Receipt Vault
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {userEmail ? (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  title={`Signed in as ${userEmail} — tap to view Cloud Sync settings`}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 transition"
                >
                  <Cloud className="h-3 w-3 text-emerald-600" />
                  <span className="hidden sm:inline">{userEmail.split("@")[0]}</span>
                  <span className="sm:hidden">Synced</span>
                </button>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={refreshing}
                  title="Sync now (pull latest from cloud)"
                  className="rounded-xl p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                title="Currently in Local Mode on this device. Tap to sign in and sync with your phone or PC."
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 border border-amber-300 hover:bg-amber-100 transition animate-pulse"
              >
                <CloudOff className="h-3 w-3 text-amber-600" />
                <span>Not Synced</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setPrivacyBlur((v) => !v)}
              title={privacyBlur ? "Show amounts" : "Blur salary & amounts"}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            >
              {privacyBlur ? (
                <EyeOff className="h-4 w-4 text-emerald-600" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? "Light mode" : "Dark mode"}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            >
              {darkMode ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            {/* Year of Assessment Switcher */}
            <div className="flex items-center rounded-xl bg-slate-100 p-1">
              {SUPPORTED_TAX_YEARS.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setTaxYear(yr)}
                  className={`rounded-lg px-2 py-1 text-xs font-bold transition ${
                    taxYear === yr
                      ? "bg-white text-emerald-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-24">
        {!isLoaded ? (
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />
            <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
            <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && (
              <DashboardTab
                summary={summary}
                expenseCount={yearExpenses.length}
                missingReceiptsTotal={missingReceiptsTotal}
                onQuickAdd={(catId) => openScanner(catId)}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onOpenTool={(tool) => {
                  setToolsTab(tool);
                  setToolsOpen(true);
                }}
                onLoadSampleData={handleLoadSampleData}
              />
            )}

            {activeTab === "reliefs" && (
              <ReliefsTab
                summaries={summary.categorySummaries}
                marginalRate={summary.marginalRate}
                onAddExpenseForCategory={(catId, subId) =>
                  openScanner(catId, subId)
                }
              />
            )}

            {activeTab === "receipts" && (
              <ReceiptsTab
                taxYear={taxYear}
                profile={profile}
                summary={summary}
                expenses={expenses}
                annualDocs={annualDocs}
                onUploadAnnualDoc={handleUploadAnnualDoc}
                onApplyAnnualDocExtraction={handleApplyAnnualDocExtraction}
                onDeleteAnnualDoc={handleDeleteAnnualDoc}
                onOpenBatchImport={() => setBatchOpen(true)}
                onOpenMyInvoisQr={() => setQrOpen(true)}
                onEdit={openEditExpense}
                onDelete={handleDeleteExpense}
                onAddNew={() => openScanner()}
              />
            )}

            {activeTab === "settings" && (
              <SettingsTab
                profile={profile}
                expenses={expenses}
                userEmail={userEmail}
                driveConnected={driveConnected}
                onUpdateProfile={handleUpdateProfile}
                onLogPayslipReliefs={handleLogPayslipReliefs}
                onLoadSampleData={handleLoadSampleData}
                onClearLocalData={handleClearLocalData}
              />
            )}
          </>
        )}
      </main>

      {/* Bottom Mobile Navigation Bar with Center Scan Button */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto grid max-w-2xl grid-cols-5 items-center px-2 py-1.5">
          <NavButton
            icon={LayoutDashboard}
            label="Overview"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <NavButton
            icon={ListChecks}
            label="Reliefs"
            active={activeTab === "reliefs"}
            onClick={() => setActiveTab("reliefs")}
          />

          {/* Center Floating Scan Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openScanner()}
              aria-label="Scan or log receipt"
              className="-mt-6 flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/35 ring-4 ring-white transition active:scale-95"
            >
              <Camera className="h-6 w-6" />
            </button>
          </div>

          <NavButton
            icon={ReceiptText}
            label="Vault"
            badge={missingReceiptsTotal > 0 ? missingReceiptsTotal : undefined}
            active={activeTab === "receipts"}
            onClick={() => setActiveTab("receipts")}
          />
          <NavButton
            icon={Settings}
            label="Profile"
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
          />
        </div>
      </nav>

      {/* Receipt Scanner & Add/Edit Expense Modal */}
      <ReceiptScannerModal
        isOpen={scannerOpen}
        taxYear={taxYear}
        initialCategoryId={scannerCategoryId}
        initialSubCategoryId={scannerSubCategoryId}
        prefillInvoiceNumber={prefillInvoice}
        prefillDescription={prefillDesc}
        editingExpense={editingExpense}
        categorySummaries={summary.categorySummaries}
        existingExpenses={expenses}
        onClose={() => {
          setScannerOpen(false);
          setEditingExpense(null);
          setPrefillInvoice(undefined);
          setPrefillDesc(undefined);
        }}
        onSave={handleSaveExpense}
      />

      {/* Batch Multi-Receipt Import Modal */}
      <BatchImportModal
        isOpen={batchOpen}
        taxYear={taxYear}
        onClose={() => setBatchOpen(false)}
        onSaveItem={async (exp, file) => {
          await handleSaveExpense(exp, file);
        }}
      />

      {/* LHDN MyInvois QR Scanner Modal */}
      <MyInvoisQrModal
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        onDetected={(payload) => {
          setEditingExpense(null);
          setPrefillInvoice(payload.invoiceUuid);
          setPrefillDesc(`MyInvois e-Invoice: ${payload.rawUrl}`);
          setScannerOpen(true);
        }}
      />

      {/* Filing & Tax Maximizer Tools Sheet */}
      <FilingToolsSheet
        isOpen={toolsOpen}
        initialTab={toolsTab}
        profile={profile}
        summary={summary}
        expenses={expenses}
        formBeBaseline={formBeBaselines[String(taxYear)] || null}
        onClearFormBeBaseline={() => {
          setFormBeBaselines((prev) => {
            const next = { ...prev };
            delete next[String(taxYear)];
            try {
              window.localStorage.setItem(
                FORM_BE_BASELINES_KEY,
                JSON.stringify(next)
              );
            } catch {
              // ignore
            }
            return next;
          });
        }}
        onClose={() => setToolsOpen(false)}
        onQuickAdd={(catId, subId) => openScanner(catId, subId)}
        onQuickLogTemplate={async (tpl) => {
          const today = `${taxYear}-${new Date().toISOString().slice(5, 10)}`;
          await handleSaveExpense(
            {
              taxYear,
              categoryId: tpl.categoryId,
              subCategoryId: tpl.subCategoryId || null,
              merchant: tpl.merchant,
              description: tpl.description,
              amount: tpl.amount,
              expenseDate: today,
              aiExtracted: false,
            },
            null
          );
        }}
      />
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition ${
        active ? "text-emerald-700" : "text-slate-400 hover:text-slate-700"
      }`}
    >
      <div className="relative">
        <Icon className="h-5 w-5" />
        {badge !== undefined && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}
