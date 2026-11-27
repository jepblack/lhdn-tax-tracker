"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Crown,
  Eye,
  EyeOff,
  FileCheck2,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  Moon,
  ReceiptText,
  RefreshCw,
  Settings,
  Shield,
  Sun,
  WifiOff,
} from "lucide-react";
import {
  calculateMaxTaxSavingGoal,
  calculateTaxSummary,
} from "@/lib/calculator";
import {
  getGoogleDriveToken,
  saveGoogleDriveToken,
  uploadAnnualDocToGoogleDrive,
} from "@/lib/google-drive";
import {
  isTaxYearRetentionExpired,
  SUPPORTED_TAX_YEARS,
} from "@/lib/lhdn-rules";
import {
  fetchSubscription,
  getDefaultSubscription,
  incrementAiScanUsage,
  persistSubscription,
} from "@/lib/monetization";
import {
  listOfflineQueuedReceipts,
  removeOfflineQueuedReceipt,
} from "@/lib/offline-queue";
import {
  createExpense,
  fetchAnnualStateFromCloud,
  fetchExpenses,
  fetchProfile,
  getDefaultProfile,
  getSampleExpenses,
  loadLocalProfile,
  persistAnnualStateToCloud,
  persistProfile,
  removeExpense,
  saveLocalExpenses,
  syncLocalDataToCloud,
  updateExpense,
  uploadAnnualDocToSupabase,
} from "@/lib/storage";
import { LanguageProvider } from "@/lib/language-context";
import {
  DEFAULT_PERSONALIZATION,
  getCurrentYearMonth,
  getUiCopy,
  LIFE_STAGE_PRESETS,
  LifeStagePresetId,
  loadPersonalization,
  loadRecurringBills,
  RecurringBillTemplate,
  savePersonalization,
  saveRecurringBills,
  STARTER_RECURRING_BILLS,
  UserPersonalization,
} from "@/lib/personalization";
import {
  isFormBePlaceholderExpense,
  isVerifiedAuditExpense,
} from "@/lib/form-be-reconciliation";
import { getSupabaseClient } from "@/lib/supabase";
import {
  AnnualDocExtraction,
  AnnualDocType,
  AnnualTaxDoc,
  FormBeBaseline,
  PaymentGatewayId,
  PlanTier,
  TaxExpense,
  TaxProfile,
  TaxYear,
  UserSubscription,
} from "@/lib/types";
import { BatchImportModal } from "./BatchImportModal";
import { DashboardTab } from "./DashboardTab";
import { FilingToolsSheet, FilingToolTab } from "./FilingToolsSheet";
import {
  hasStoredPdpaConsent,
  LegalPrivacyModal,
  savePdpaConsent,
} from "./LegalPrivacyModal";
import { MyInvoisQrModal } from "./MyInvoisQrModal";
import { QuickGuideModal, WELCOME_SEEN_KEY } from "./QuickStartGuide";
import { PricingModal } from "./PricingModal";
import { ReceiptScannerModal } from "./ReceiptScannerModal";
import { ReceiptsTab } from "./ReceiptsTab";
import { ReliefsTab } from "./ReliefsTab";
import { SettingsTab } from "./SettingsTab";

const ANNUAL_DOCS_KEY = "cukaiku_annual_docs_v1";
const FORM_BE_BASELINES_KEY = "cukaiku_form_be_baselines_v1";

type ActiveTab = "dashboard" | "reliefs" | "receipts" | "settings";

export function TaxApp() {
  const [taxYear, setTaxYear] = useState<TaxYear>(() => {
    const currentCalendarYear = Math.max(2026, new Date().getFullYear());
    if (typeof window !== "undefined") {
      const saved = Number(window.localStorage.getItem("cukaiku_selected_tax_year"));
      if (saved && SUPPORTED_TAX_YEARS.includes(saved)) {
        return saved;
      }
    }
    return SUPPORTED_TAX_YEARS.includes(currentCalendarYear)
      ? currentCalendarYear
      : SUPPORTED_TAX_YEARS[0] || 2026;
  });
  const taxYearRef = useRef(taxYear);
  taxYearRef.current = taxYear;
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);

  const [profile, setProfile] = useState<TaxProfile>(() =>
    getDefaultProfile(taxYear)
  );
  const [expenses, setExpenses] = useState<TaxExpense[]>([]);
  const expensesRef = useRef<TaxExpense[]>([]);
  expensesRef.current = expenses;
  const [isLoaded, setIsLoaded] = useState(false);
  const [personalization, setPersonalization] = useState<UserPersonalization>(
    DEFAULT_PERSONALIZATION
  );
  const [recurringBills, setRecurringBills] = useState<RecurringBillTemplate[]>(
    STARTER_RECURRING_BILLS
  );
  const copy = getUiCopy(personalization.language);

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCategoryId, setScannerCategoryId] = useState<
    string | undefined
  >(undefined);
  const [scannerSubCategoryId, setScannerSubCategoryId] = useState<
    string | undefined
  >(undefined);
  const [scannerModeInit, setScannerModeInit] = useState<"ocr" | "qr">("ocr");
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [editingExpense, setEditingExpense] = useState<TaxExpense | null>(null);
  const [prefillInvoice, setPrefillInvoice] = useState<string | undefined>(undefined);
  const [prefillDesc, setPrefillDesc] = useState<string | undefined>(undefined);

  // Desktop Sidebar, Offline Queue, Batch import, MyInvois QR, Annual Docs, Dark Mode & Privacy Blur
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchInitialFiles, setBatchInitialFiles] = useState<File[] | null>(
    null
  );
  const [batchDefaultCategoryId, setBatchDefaultCategoryId] = useState<
    string | undefined
  >(undefined);
  const [batchDefaultSubCategoryId, setBatchDefaultSubCategoryId] = useState<
    string | undefined
  >(undefined);
  const [qrOpen, setQrOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingReason, setPricingReason] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription>(() =>
    getDefaultSubscription()
  );
  const [annualDocs, setAnnualDocs] = useState<AnnualTaxDoc[]>([]);
  const annualDocsRef = useRef<AnnualTaxDoc[]>([]);
  useEffect(() => {
    annualDocsRef.current = annualDocs;
  }, [annualDocs]);
  const [formBeBaselines, setFormBeBaselines] = useState<
    Record<string, FormBeBaseline>
  >({});
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalSection, setLegalSection] = useState<"pdpa" | "terms">("pdpa");
  const [pdpaConsented, setPdpaConsented] = useState(true);

  async function refreshOfflineQueueCount() {
    const items = await listOfflineQueuedReceipts();
    setOfflineQueueCount(items.length);
  }

  async function flushOfflineQueue(uid: string | null) {
    if (typeof window !== "undefined" && !window.navigator.onLine) return;
    const queued = await listOfflineQueuedReceipts();
    if (queued.length === 0) return;
    for (const item of queued) {
      try {
        const file =
          item.fileBlob && item.fileName
            ? new File([item.fileBlob], item.fileName, {
                type: item.fileMimeType || "application/pdf",
              })
            : null;
        if (uid) {
          await createExpense({ ...item.expense, offlineQueued: false }, file, uid);
        }
        await removeOfflineQueuedReceipt(item.id);
      } catch {
        // retry on next online event
      }
    }
    await refreshOfflineQueueCount();
  }

  // Load dark mode preference, annual docs, Form BE baselines, PWA shortcuts & redirect upgrades on mount
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("cukaiku_theme_v1");
      if (savedTheme === "dark") {
        setDarkMode(true);
        document.documentElement.classList.add("dark");
        updateThemeColorMeta(true);
      } else {
        updateThemeColorMeta(false);
      }
      const savedDocs = window.localStorage.getItem(ANNUAL_DOCS_KEY);
      if (savedDocs) {
        const parsedDocs = JSON.parse(savedDocs) as AnnualTaxDoc[];
        annualDocsRef.current = parsedDocs;
        setAnnualDocs(parsedDocs);
      }
      const savedBaselines = window.localStorage.getItem(FORM_BE_BASELINES_KEY);
      if (savedBaselines) setFormBeBaselines(JSON.parse(savedBaselines));

      setPersonalization(loadPersonalization());
      setRecurringBills(loadRecurringBills());
      setPdpaConsented(hasStoredPdpaConsent());

      refreshOfflineQueueCount();

      const params = new URLSearchParams(window.location.search);
      const scanShortcut = params.get("scan") || params.get("mode");
      if (scanShortcut === "camera" || scanShortcut === "ocr") {
        setScannerModeInit("ocr");
        setScannerOpen(true);
      } else if (scanShortcut === "qr") {
        setScannerModeInit("qr");
        setScannerOpen(true);
      }

      // Verify Stripe checkout session server-side instead of trusting bare URL query params
      const checkoutSessionId = params.get("checkout_session");
      const checkoutState = params.get("checkout");
      if (checkoutSessionId) {
        fetch("/api/verify-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: checkoutSessionId }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res?.verified && (res.planTier === "pro" || res.planTier === "family")) {
              return persistSubscription(
                {
                  ...getDefaultSubscription(),
                  planTier: res.planTier,
                  gateway: "stripe",
                  expiresAt: res.expiresAt,
                  aiScansLimit: res.aiScansLimit,
                },
                null
              ).then((sub) => setSubscription(sub));
            }
          })
          .catch(() => {});
        window.history.replaceState({}, "", window.location.pathname);
      } else if (checkoutState === "pending_webhook" || checkoutState === "cancelled") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      flushOfflineQueue(userId);
      fetchSubscription(userId).then(setSubscription).catch(() => {});
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function updateThemeColorMeta(isDark: boolean) {
    if (typeof document === "undefined") return;
    const color = isDark ? "#0B0F17" : "#F6F8FA";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
  }

  function openUpgradeModal(reason?: string) {
    setPricingReason(reason || null);
    setPricingOpen(true);
  }

  async function handleUpgradeSuccess(
    nextTier: PlanTier,
    gateway: PaymentGatewayId
  ) {
    const nextSub = await persistSubscription(
      {
        ...subscription,
        planTier: nextTier,
        gateway,
        expiresAt:
          nextTier === "free"
            ? null
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
      userId
    );
    setSubscription(nextSub);
  }

  async function handleAiScanCompleted() {
    const nextSub = await incrementAiScanUsage(subscription, userId);
    setSubscription(nextSub);
  }

  function toggleDarkMode() {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("cukaiku_theme_v1", next ? "dark" : "light");
      updateThemeColorMeta(next);
      return next;
    });
  }

  async function handleUploadAnnualDoc(
    docType: AnnualDocType,
    label: string,
    file: File,
    overrideYear?: TaxYear
  ): Promise<AnnualTaxDoc> {
    const targetYear = overrideYear ?? taxYear;
    const driveToken = getGoogleDriveToken();
    let fileUrl = "";
    let storagePath: string | null = null;
    let storageProvider: "gdrive" | "supabase" | "local" = "local";

    if (driveToken) {
      try {
        const res = await uploadAnnualDocToGoogleDrive(driveToken, targetYear, file);
        fileUrl = res.webViewLink;
        storageProvider = "gdrive";
      } catch {
        // fall back to Supabase Storage or local data URL
      }
    }

    if (!fileUrl && userId) {
      const supaRes = await uploadAnnualDocToSupabase(userId, targetYear, file);
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
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taxYear: targetYear,
      docType,
      label,
      fileName: file.name,
      fileUrl,
      storagePath,
      mimeType: file.type || "application/pdf",
      uploadedAt: new Date().toISOString(),
      storageProvider,
    };

    const nextAll = [
      newDoc,
      ...annualDocsRef.current.filter((d) => d.id !== newDoc.id),
    ];
    annualDocsRef.current = nextAll;
    setAnnualDocs(nextAll);
    try {
      window.localStorage.setItem(ANNUAL_DOCS_KEY, JSON.stringify(nextAll));
    } catch {
      // ignore quota
    }
    if (userId) {
      const targetProfile =
        targetYear === profile.taxYear ? profile : await fetchProfile(targetYear, userId);
      await persistAnnualStateToCloud(
        targetYear,
        nextAll.filter((d) => d.taxYear === targetYear),
        formBeBaselines[String(targetYear)] || null,
        targetProfile,
        userId
      );
    }

    return newDoc;
  }

  async function handleApplyAnnualDocExtraction(
    ext: AnnualDocExtraction,
    doc: AnnualTaxDoc,
    overrideYear?: TaxYear,
    options?: { skipYearSwitch?: boolean }
  ) {
    const targetYear = overrideYear ?? doc.taxYear ?? taxYear;
    const isFormBeImport = doc.docType === "form_be_proof";

    // If the user/AI routed this doc to a different YA than when it was uploaded, move the doc record,
    // and mark its extractionStatus as "extracted" or "manual"
    const nextStatus: AnnualTaxDoc["extractionStatus"] =
      ext.summaryNote === "Entered manually by taxpayer." ? "manual" : "extracted";
    const baseDocs = annualDocsRef.current;
    const updatedDoc: AnnualTaxDoc = {
      ...doc,
      taxYear: targetYear,
      extractionStatus: nextStatus,
      extractionNote: null,
    };
    const effectiveDocs = baseDocs.some((d) => d.id === doc.id)
      ? baseDocs.map((d) => (d.id === doc.id ? updatedDoc : d))
      : [updatedDoc, ...baseDocs];
    annualDocsRef.current = effectiveDocs;
    setAnnualDocs(effectiveDocs);
    try {
      window.localStorage.setItem(ANNUAL_DOCS_KEY, JSON.stringify(effectiveDocs));
    } catch {
      // ignore
    }

    const existingBaseline = formBeBaselines[String(targetYear)];
    const isAckReceiptOnly =
      isFormBeImport &&
      Boolean(
        ext.isAcknowledgement ||
          ((ext.filingReferenceNo || ext.filingDate) &&
            !ext.declaredTotalReliefs &&
            !(ext.extraReliefs && ext.extraReliefs.length > 0) &&
            ext.epfEmployee === 0 &&
            ext.lifeInsuranceAmount === 0 &&
            ext.medicalInsuranceAmount === 0 &&
            ext.socsoEisEmployee === 0)
      );

    // 1. Update Income / PCB / Zakat / Status Reliefs in the target year's Tax Profile
    const baseProfile =
      targetYear === profile.taxYear ? profile : await fetchProfile(targetYear, userId);
    const mergedStatusReliefs =
      isFormBeImport && ext.statusReliefs
        ? {
            ...baseProfile.statusReliefs,
            ...ext.statusReliefs,
            individual: true,
          }
        : baseProfile.statusReliefs;

    // Preserve Aggregate Income if Doc 1 already recorded Approved Donations > 0 and Doc 2 (Acknowledgement) is uploaded afterwards
    const preservePreDonationIncome =
      isAckReceiptOnly &&
      (existingBaseline?.declaredByCategory?.["approved_donations"] || 0) > 0 &&
      (existingBaseline?.declaredIncome || 0) > 0;

    const updatedTargetProfile: TaxProfile = {
      ...baseProfile,
      taxYear: targetYear,
      annualIncome:
        !preservePreDonationIncome && ext.annualIncome > 0
          ? ext.annualIncome
          : baseProfile.annualIncome,
      pcbPaid: ext.pcbPaid > 0 ? ext.pcbPaid : baseProfile.pcbPaid,
      zakatPaid: ext.zakatPaid > 0 ? ext.zakatPaid : baseProfile.zakatPaid,
      cp500Paid:
        (ext.cp500Paid || 0) > 0 ? ext.cp500Paid : baseProfile.cp500Paid,
      otherTaxCredits:
        (ext.otherTaxCredits || 0) > 0
          ? ext.otherTaxCredits
          : baseProfile.otherTaxCredits,
      statusReliefs: mergedStatusReliefs,
    };

    if (
      ext.annualIncome > 0 ||
      ext.pcbPaid > 0 ||
      ext.zakatPaid > 0 ||
      (ext.cp500Paid || 0) > 0 ||
      (ext.otherTaxCredits || 0) > 0 ||
      (isFormBeImport && ext.statusReliefs)
    ) {
      if (targetYear === profile.taxYear) {
        await handleUpdateProfile(updatedTargetProfile);
      } else {
        await persistProfile(updatedTargetProfile, userId);
      }
    }

    // 2. Log corresponding tax reliefs
    // For Form BE imports, merge with any existing YA baseline so uploading both the 5-page Borang e-BE
    // and the 1-page Pengesahan Penerimaan combines itemized reliefs + official Serial No. & Filing Date!
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

      const hasNewItemized = Object.keys(declaredByCategory).length > 0;
      const mergedDeclaredByCategory = hasNewItemized
        ? declaredByCategory
        : existingBaseline?.declaredByCategory || {};

      const baseline: FormBeBaseline = {
        taxYear: targetYear,
        uploadedFileName: isAckReceiptOnly
          ? existingBaseline?.uploadedFileName || doc.fileName
          : doc.fileName,
        acknowledgementFileName: isAckReceiptOnly
          ? doc.fileName
          : existingBaseline?.acknowledgementFileName || null,
        uploadedAt: new Date().toISOString(),
        declaredIncome: preservePreDonationIncome
          ? existingBaseline!.declaredIncome
          : ext.annualIncome || existingBaseline?.declaredIncome || 0,
        declaredPcb: ext.pcbPaid || existingBaseline?.declaredPcb || 0,
        declaredZakat: ext.zakatPaid || existingBaseline?.declaredZakat || 0,
        declaredByCategory: mergedDeclaredByCategory,
        statusReliefs: ext.statusReliefs ?? existingBaseline?.statusReliefs,
        declaredTotalReliefs:
          (ext.declaredTotalReliefs || 0) > 0
            ? ext.declaredTotalReliefs
            : existingBaseline?.declaredTotalReliefs,
        declaredChargeableIncome:
          (ext.declaredChargeableIncome || 0) > 0
            ? ext.declaredChargeableIncome
            : existingBaseline?.declaredChargeableIncome,
        declaredTaxCharged:
          (ext.declaredTaxCharged || 0) > 0
            ? ext.declaredTaxCharged
            : existingBaseline?.declaredTaxCharged,
        declaredTaxRebate:
          (ext.declaredTaxRebate || 0) > 0
            ? ext.declaredTaxRebate
            : existingBaseline?.declaredTaxRebate,
        declaredTaxPayable:
          (ext.declaredTaxPayable || 0) > 0
            ? ext.declaredTaxPayable
            : existingBaseline?.declaredTaxPayable,
        declaredRefund:
          ext.declaredRefund !== undefined && ext.declaredRefund !== null
            ? ext.declaredRefund
            : existingBaseline?.declaredRefund,
        cp500Paid:
          (ext.cp500Paid || 0) > 0
            ? ext.cp500Paid
            : existingBaseline?.cp500Paid,
        otherTaxCredits:
          (ext.otherTaxCredits || 0) > 0
            ? ext.otherTaxCredits
            : existingBaseline?.otherTaxCredits,
        filingReferenceNo:
          ext.filingReferenceNo || existingBaseline?.filingReferenceNo || null,
        filingDate: ext.filingDate || existingBaseline?.filingDate || null,
      };
      setFormBeBaselines((prev) => {
        const next = { ...prev, [String(targetYear)]: baseline };
        try {
          window.localStorage.setItem(FORM_BE_BASELINES_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      if (userId) {
        await persistAnnualStateToCloud(
          targetYear,
          effectiveDocs.filter((d) => d.taxYear === targetYear),
          baseline,
          updatedTargetProfile,
          userId
        );
      }
    } else if (userId) {
      await persistAnnualStateToCloud(
        targetYear,
        effectiveDocs.filter((d) => d.taxYear === targetYear),
        existingBaseline || null,
        updatedTargetProfile,
        userId
      );
    }
    const today = `${targetYear}-${new Date().toISOString().slice(5, 10)}`;
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

    // Smart merge: avoid double-counting categories that already have expenses logged in targetYear
    const yearExisting = expenses.filter((e) => e.taxYear === targetYear);
    const existingByCat: Record<string, number> = {};
    let existingLifeIns = 0;
    for (const e of yearExisting) {
      existingByCat[e.categoryId] = (existingByCat[e.categoryId] || 0) + e.amount;
      if (
        e.categoryId === "epf_life_insurance" &&
        e.subCategoryId === "life_insurance"
      ) {
        existingLifeIns += e.amount;
      }
    }
    const gapAmount = (declared: number, existingAmt: number) =>
      isFormBeImport ? Math.max(0, Math.round((declared - existingAmt) * 100) / 100) : declared;

    const eaEmployerKey =
      doc.docType === "ea_form" &&
      ext.providerName &&
      !/^ea\s*form/i.test(ext.providerName.trim())
        ? ext.providerName
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "")
            .slice(0, 12) || undefined
        : undefined;

    if (ext.epfEmployee > 0) {
      await upsertStatutoryRelief(
        "epf",
        {
          taxYear: targetYear,
          categoryId: "epf_life_insurance",
          subCategoryId: "epf_mandatory",
          merchant: `${provider} — EPF`,
          description: descriptionNote,
          amount: ext.epfEmployee,
          expenseDate: today,
          ...(eaEmployerKey
            ? { invoiceNumber: `PAYSLIP-EPF-${targetYear}-${eaEmployerKey}` }
            : {}),
          ...sharedFileFields,
        },
        null,
        eaEmployerKey
      );
    }

    if (ext.socsoEisEmployee > 0) {
      await upsertStatutoryRelief(
        "socso",
        {
          taxYear: targetYear,
          categoryId: "socso",
          subCategoryId: null,
          merchant: `${provider} — SOCSO & EIS`,
          description: descriptionNote,
          amount: ext.socsoEisEmployee,
          expenseDate: today,
          ...(eaEmployerKey
            ? { invoiceNumber: `PAYSLIP-SOCSO-${targetYear}-${eaEmployerKey}` }
            : {}),
          ...sharedFileFields,
        },
        null,
        eaEmployerKey
      );
    }

    const lifeGap = gapAmount(ext.lifeInsuranceAmount, existingLifeIns);
    if (lifeGap > 0.01) {
      await handleSaveExpense(
        {
          taxYear: targetYear,
          categoryId: "epf_life_insurance",
          subCategoryId: "life_insurance",
          merchant: `${provider} — Life Insurance`,
          description: descriptionNote,
          amount: lifeGap,
          expenseDate: today,
          ...sharedFileFields,
        },
        null,
        undefined,
        options?.skipYearSwitch
      );
    }

    const medGap = gapAmount(ext.medicalInsuranceAmount, existingByCat["edu_med_insurance"] || 0);
    if (medGap > 0.01) {
      await handleSaveExpense(
        {
          taxYear: targetYear,
          categoryId: "edu_med_insurance",
          subCategoryId: null,
          merchant: `${provider} — Medical Insurance`,
          description: descriptionNote,
          amount: medGap,
          expenseDate: today,
          ...sharedFileFields,
        },
        null,
        undefined,
        options?.skipYearSwitch
      );
    }

    const loanGap = gapAmount(ext.housingLoanInterest, existingByCat["first_home_interest"] || 0);
    if (loanGap > 0.01) {
      await handleSaveExpense(
        {
          taxYear: targetYear,
          categoryId: "first_home_interest",
          subCategoryId: "home_under_500k",
          merchant: `${provider} — Housing Loan Interest`,
          description: descriptionNote,
          amount: loanGap,
          expenseDate: today,
          ...sharedFileFields,
        },
        null,
        undefined,
        options?.skipYearSwitch
      );
    }

    if (ext.extraReliefs && ext.extraReliefs.length > 0) {
      for (const extra of ext.extraReliefs) {
        const extraGap = gapAmount(extra.amount, existingByCat[extra.categoryId] || 0);
        if (extraGap > 0.01) {
          existingByCat[extra.categoryId] =
            (existingByCat[extra.categoryId] || 0) + extraGap;
          const isMyKadParentAllowance =
            extra.subCategoryId === "parents_allowance";
          await handleSaveExpense(
            {
              taxYear: targetYear,
              categoryId: extra.categoryId,
              subCategoryId: extra.subCategoryId || null,
              merchant: `${provider} — ${extra.label}`,
              description: isMyKadParentAllowance
                ? `Declared via parent MyKad on ${doc.label} — no medical receipt required`
                : descriptionNote,
              amount: extraGap,
              expenseDate: today,
              ...(isMyKadParentAllowance
                ? {
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
                  }
                : sharedFileFields),
            },
            null,
            undefined,
            options?.skipYearSwitch
          );
        }
      }
    }

    if (
      !options?.skipYearSwitch &&
      targetYear !== taxYear &&
      SUPPORTED_TAX_YEARS.includes(targetYear)
    ) {
      setTaxYear(targetYear);
    }
  }

  function handleUpdateAnnualDocStatus(
    id: string,
    extractionStatus: "extracted" | "failed" | "manual",
    extractionNote?: string | null
  ) {
    const next = annualDocsRef.current.map((d) =>
      d.id === id
        ? { ...d, extractionStatus, extractionNote: extractionNote ?? null }
        : d
    );
    annualDocsRef.current = next;
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

  function handleDeleteAnnualDoc(id: string) {
    const next = annualDocsRef.current.filter((d) => d.id !== id);
    annualDocsRef.current = next;
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
    const [loadedProfile, loadedExpenses, annualState, loadedSub] =
      await Promise.all([
        fetchProfile(yr, uid),
        fetchExpenses(uid),
        uid ? fetchAnnualStateFromCloud(yr, uid) : Promise.resolve(null),
        fetchSubscription(uid),
      ]);
    if (yr !== taxYearRef.current) return;
    setProfile(loadedProfile);
    setExpenses(loadedExpenses);
    setSubscription(loadedSub);
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

  // Filing tools sheet & Quick Guide modal state
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<FilingToolTab>("form-be");
  const [guideOpen, setGuideOpen] = useState(false);

  // Auto-show Quick Guide once on a brand-new user's very first visit
  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(WELCOME_SEEN_KEY) === "1";
      if (!seen && expenses.length === 0) {
        setGuideOpen(true);
        window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
      }
    } catch {
      // ignore storage errors
    }
  }, [isLoaded, expenses.length]);

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
            refreshAllFromCloud(uid, taxYearRef.current);
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
              refreshAllFromCloud(uid, taxYearRef.current);
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
    try {
      window.localStorage.setItem("cukaiku_selected_tax_year", String(taxYear));
    } catch {
      // ignore
    }
    setProfile((prev) =>
      prev.taxYear === taxYear ? prev : loadLocalProfile(taxYear)
    );
    async function load() {
      const [loadedProfile, loadedExpenses, annualState, loadedSub] =
        await Promise.all([
          fetchProfile(taxYear, userId),
          fetchExpenses(userId),
          userId ? fetchAnnualStateFromCloud(taxYear, userId) : Promise.resolve(null),
          fetchSubscription(userId),
        ]);
      if (!cancelled) {
        // Auto-heal any PAYSLIP-SOCSO-<yr> record missing a receipt when PAYSLIP-EPF-<yr> already has the EA/payslip file
        const healedExpenses = loadedExpenses.map((exp) => {
          if (
            exp.categoryId === "socso" &&
            !exp.receiptPath &&
            !exp.receiptUrl &&
            (exp.invoiceNumber?.startsWith("PAYSLIP-SOCSO-") ||
              exp.merchant.toLowerCase().includes("payslip ytd"))
          ) {
            const expectedEpfInv = exp.invoiceNumber?.startsWith("PAYSLIP-SOCSO-")
              ? exp.invoiceNumber.replace("PAYSLIP-SOCSO-", "PAYSLIP-EPF-")
              : null;
            const epfMatch =
              (expectedEpfInv &&
                loadedExpenses.find(
                  (other) =>
                    other.taxYear === exp.taxYear &&
                    other.invoiceNumber === expectedEpfInv &&
                    Boolean(other.receiptPath || other.receiptUrl)
                )) ||
              loadedExpenses.find(
                (other) =>
                  other.taxYear === exp.taxYear &&
                  other.categoryId === "epf_life_insurance" &&
                  other.subCategoryId === "epf_mandatory" &&
                  Boolean(other.receiptPath || other.receiptUrl)
              );
            if (epfMatch) {
              const patched: TaxExpense = {
                ...exp,
                receiptPath: epfMatch.receiptPath,
                receiptUrl: epfMatch.receiptUrl,
                receiptFileName: epfMatch.receiptFileName,
                receiptMimeType: epfMatch.receiptMimeType,
              };
              updateExpense(exp.id, patched, null, userId).catch(() => {});
              return patched;
            }
          }
          return exp;
        });

        setProfile(loadedProfile);
        setExpenses(healedExpenses);
        setSubscription(loadedSub);
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

  const reconciledBaselineKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const baseline = formBeBaselines[String(taxYear)];
    if (!isLoaded || !baseline) return;
    const guardKey = `${userId || "local"}:${taxYear}:${baseline.uploadedAt}`;
    if (reconciledBaselineKeysRef.current.has(guardKey)) return;
    reconciledBaselineKeysRef.current.add(guardKey);

    (async () => {
      const deletedIds = new Set<string>();
      const updatedMap = new Map<string, TaxExpense>();
      const yrList = expensesRef.current.filter((e) => e.taxYear === taxYear);

      for (const [catId, declared] of Object.entries(
        baseline.declaredByCategory || {}
      )) {
        const placeholders = yrList.filter(
          (e) => e.categoryId === catId && isFormBePlaceholderExpense(e)
        );
        if (placeholders.length === 0) continue;
        const verifiedSum = yrList
          .filter((e) => e.categoryId === catId && isVerifiedAuditExpense(e))
          .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const placeholderSum = placeholders.reduce(
          (s, e) => s + (Number(e.amount) || 0),
          0
        );
        const maxAllowed = Math.max(0, Math.round((declared - verifiedSum) * 100) / 100);
        let toTrim = Math.round((placeholderSum - maxAllowed) * 100) / 100;
        if (toTrim <= 0.01) continue;

        for (const ph of placeholders) {
          if (toTrim <= 0.01) break;
          if (ph.amount <= toTrim + 0.01) {
            toTrim = Math.round((toTrim - ph.amount) * 100) / 100;
            await removeExpense(ph, userId);
            deletedIds.add(ph.id);
          } else {
            const nextAmt = Math.round((ph.amount - toTrim) * 100) / 100;
            toTrim = 0;
            const patched = await updateExpense(
              ph.id,
              { ...ph, amount: nextAmt },
              null,
              userId
            );
            updatedMap.set(ph.id, patched);
          }
        }
      }

      if (deletedIds.size > 0 || updatedMap.size > 0) {
        const applyPatch = (list: TaxExpense[]) =>
          list
            .filter((e) => !deletedIds.has(e.id))
            .map((e) => updatedMap.get(e.id) || e);
        expensesRef.current = applyPatch(expensesRef.current);
        setExpenses((prev) => applyPatch(prev));
      }
    })();
  }, [isLoaded, taxYear, userId, formBeBaselines]);

  const summary = useMemo(
    () => calculateTaxSummary(profile, expenses),
    [profile, expenses]
  );

  const yearExpenses = useMemo(
    () => expenses.filter((e) => e.taxYear === taxYear),
    [expenses, taxYear]
  );

  const expenseCountByYear = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const e of expenses) {
      counts[e.taxYear] = (counts[e.taxYear] || 0) + 1;
    }
    return counts;
  }, [expenses]);

  const availableTaxYears = useMemo(() => {
    const set = new Set<number>(SUPPORTED_TAX_YEARS);
    for (const e of expenses) set.add(e.taxYear);
    for (const d of annualDocs) set.add(d.taxYear);
    set.add(taxYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [expenses, annualDocs, taxYear]);

  const missingReceiptsTotal = useMemo(
    () =>
      yearExpenses.filter(
        (e) =>
          !e.receiptPath &&
          !e.receiptUrl &&
          e.subCategoryId !== "parents_allowance"
      ).length,
    [yearExpenses]
  );

  function openScanner(
    categoryId?: string,
    subCategoryId?: string,
    mode: "ocr" | "qr" = "ocr",
    file: File | null = null
  ) {
    setEditingExpense(null);
    setScannerCategoryId(categoryId);
    setScannerSubCategoryId(subCategoryId);
    setScannerModeInit(mode);
    setDroppedFile(file);
    setScannerOpen(true);
  }

  function openEditExpense(expense: TaxExpense) {
    setEditingExpense(expense);
    setScannerCategoryId(expense.categoryId);
    setScannerSubCategoryId(expense.subCategoryId || undefined);
    setScannerModeInit("ocr");
    setDroppedFile(null);
    setScannerOpen(true);
  }

  async function reconcileAndApplySavedExpense(
    saved: TaxExpense,
    receiptFile: File | null,
    isEdit: boolean,
    skipYearSwitch?: boolean
  ): Promise<TaxExpense> {
    const hasReceiptProof = Boolean(
      receiptFile || isVerifiedAuditExpense(saved)
    );
    const deletedIds = new Set<string>();
    const updatedMap = new Map<string, TaxExpense>();

    if (hasReceiptProof && saved.amount > 0) {
      const prevExp = isEdit
        ? expensesRef.current.find((e) => e.id === saved.id)
        : undefined;
      const prevSameCatVerifiedAmt =
        prevExp &&
        prevExp.taxYear === saved.taxYear &&
        prevExp.categoryId === saved.categoryId &&
        isVerifiedAuditExpense(prevExp)
          ? prevExp.amount
          : 0;

      const matching = expensesRef.current
        .filter(
          (e) =>
            e.id !== saved.id &&
            e.taxYear === saved.taxYear &&
            e.categoryId === saved.categoryId &&
            isFormBePlaceholderExpense(e)
        )
        .sort((a, b) => {
          const aExact =
            saved.subCategoryId && a.subCategoryId === saved.subCategoryId ? 0 : 1;
          const bExact =
            saved.subCategoryId && b.subCategoryId === saved.subCategoryId ? 0 : 1;
          return aExact - bExact;
        });

      // Compute exact excess placeholder amount to trim:
      // If a Form e-BE baseline exists for this year/category, clamp remaining placeholders
      // to at most (declared - totalVerifiedInCat), which also heals any prior double-counting.
      const baselineForYr = formBeBaselines[String(saved.taxYear)];
      const declaredInCat =
        baselineForYr?.declaredByCategory?.[saved.categoryId] || 0;
      const otherVerifiedInCat = expensesRef.current
        .filter(
          (e) =>
            e.id !== saved.id &&
            e.taxYear === saved.taxYear &&
            e.categoryId === saved.categoryId &&
            isVerifiedAuditExpense(e)
        )
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const currentPlaceholderTotal = matching.reduce(
        (s, e) => s + (Number(e.amount) || 0),
        0
      );

      const deltaVerified = Math.max(
        0,
        Math.round((saved.amount - prevSameCatVerifiedAmt) * 100) / 100
      );
      let remaining =
        declaredInCat > 0
          ? Math.max(
              deltaVerified,
              Math.round(
                (currentPlaceholderTotal -
                  Math.max(0, declaredInCat - (otherVerifiedInCat + saved.amount))) *
                  100
              ) / 100
            )
          : deltaVerified;

      for (const placeholder of matching) {
        if (remaining <= 0.01) break;
        if (placeholder.amount <= remaining + 0.01) {
          remaining = Math.round((remaining - placeholder.amount) * 100) / 100;
          await removeExpense(placeholder, userId);
          deletedIds.add(placeholder.id);
        } else {
          const nextAmount =
            Math.round((placeholder.amount - remaining) * 100) / 100;
          remaining = 0;
          const patched = await updateExpense(
            placeholder.id,
            { ...placeholder, amount: nextAmount },
            null,
            userId
          );
          updatedMap.set(placeholder.id, patched);
        }
      }
    }

    const applyReconcile = (list: TaxExpense[]) => {
      const base = isEdit
        ? list.map((e) => (e.id === saved.id ? saved : e))
        : [saved, ...list];
      return base
        .filter((e) => !deletedIds.has(e.id))
        .map((e) => updatedMap.get(e.id) || e);
    };
    expensesRef.current = applyReconcile(expensesRef.current);
    setExpenses((prev) => applyReconcile(prev));

    if (
      !skipYearSwitch &&
      saved.taxYear !== taxYear &&
      SUPPORTED_TAX_YEARS.includes(saved.taxYear)
    ) {
      setTaxYear(saved.taxYear);
    }
    return saved;
  }

  async function handleSaveExpense(
    expenseData: Omit<TaxExpense, "id" | "createdAt">,
    receiptFile: File | null,
    editingId?: string,
    skipYearSwitch?: boolean
  ): Promise<TaxExpense> {
    if (editingId) {
      const updated = await updateExpense(
        editingId,
        expenseData,
        receiptFile,
        userId
      );
      return reconcileAndApplySavedExpense(updated, receiptFile, true, skipYearSwitch);
    }
    const created = await createExpense(expenseData, receiptFile, userId);
    return reconcileAndApplySavedExpense(created, receiptFile, false, skipYearSwitch);
  }

  async function handleDeleteExpense(expense: TaxExpense) {
    await removeExpense(expense, userId);
    expensesRef.current = expensesRef.current.filter((e) => e.id !== expense.id);
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    if (expense.invoiceNumber?.startsWith("RECUR-")) {
      const prefix = `RECUR-`;
      const suffixMatch = expense.invoiceNumber.match(/-(\d{4}-\d{2})$/);
      if (suffixMatch) {
        const billId = expense.invoiceNumber.slice(
          prefix.length,
          expense.invoiceNumber.length - suffixMatch[0].length
        );
        const updatedBills = recurringBills.map((b) =>
          b.id === billId && b.lastLoggedMonth === suffixMatch[1]
            ? { ...b, lastLoggedMonth: undefined }
            : b
        );
        handleSaveRecurringBills(updatedBills);
      }
    }
  }

  async function handleUpdateProfile(next: TaxProfile) {
    const normalized: TaxProfile = {
      ...next,
      statusReliefs: {
        ...next.statusReliefs,
        individual: true,
      },
    };
    const incomeOrStatusChanged =
      normalized.annualIncome !== profile.annualIncome ||
      JSON.stringify(normalized.statusReliefs) !==
        JSON.stringify(profile.statusReliefs);
    setProfile(normalized);
    if (incomeOrStatusChanged) {
      const nextMaxGoal = calculateMaxTaxSavingGoal(normalized);
      handleUpdatePersonalization({
        ...personalization,
        taxSavingGoal: nextMaxGoal,
      });
    }
    await persistProfile(normalized, userId);
  }

  function findExistingStatutoryRelief(
    targetYear: number,
    kind: "epf" | "socso",
    employerKey?: string
  ): TaxExpense | undefined {
    const epfInv = employerKey
      ? `PAYSLIP-EPF-${targetYear}-${employerKey}`
      : `PAYSLIP-EPF-${targetYear}`;
    const socsoInv = employerKey
      ? `PAYSLIP-SOCSO-${targetYear}-${employerKey}`
      : `PAYSLIP-SOCSO-${targetYear}`;

    return expenses.find((e) => {
      if (e.taxYear !== targetYear) return false;
      if (employerKey) {
        return e.invoiceNumber === (kind === "epf" ? epfInv : socsoInv);
      }
      if (kind === "epf") {
        return (
          e.invoiceNumber === epfInv ||
          (e.categoryId === "epf_life_insurance" &&
            e.subCategoryId === "epf_mandatory" &&
            (e.merchant.toLowerCase().includes("epf") ||
              e.merchant.toLowerCase().includes("kwsp")))
        );
      }
      return (
        e.invoiceNumber === socsoInv ||
        (e.categoryId === "socso" &&
          (e.merchant.toLowerCase().includes("socso") ||
            e.merchant.toLowerCase().includes("perkeso")))
      );
    });
  }

  async function upsertStatutoryRelief(
    kind: "epf" | "socso",
    payload: Omit<TaxExpense, "id" | "createdAt">,
    file: File | null,
    employerKey?: string
  ): Promise<TaxExpense> {
    const existing = findExistingStatutoryRelief(payload.taxYear, kind, employerKey);
    if (existing) {
      return await handleSaveExpense(
        {
          ...existing,
          ...payload,
          receiptUrl: file
            ? existing.receiptUrl
            : payload.receiptUrl ?? existing.receiptUrl,
          receiptPath: file
            ? existing.receiptPath
            : payload.receiptPath ?? existing.receiptPath,
          receiptFileName: file
            ? file.name
            : payload.receiptFileName ?? existing.receiptFileName,
          receiptMimeType: file
            ? file.type
            : payload.receiptMimeType ?? existing.receiptMimeType,
        },
        file,
        existing.id
      );
    }
    return await handleSaveExpense(payload, file);
  }

  async function handleLogPayslipReliefs(
    epfAmount: number,
    socsoAmount: number,
    payslipFile: File | null,
    employerMeta?: { key: string; name: string }
  ) {
    const today = `${taxYear}-${new Date().toISOString().slice(5, 10)}`;
    const empKey = employerMeta?.key;
    const empLabel = employerMeta?.name ? ` — ${employerMeta.name}` : " (Payslip YTD)";
    const storageFile =
      payslipFile && empKey && !payslipFile.name.startsWith(`${empKey}-`)
        ? new File([payslipFile], `${empKey}-${payslipFile.name}`, {
            type: payslipFile.type,
            lastModified: payslipFile.lastModified,
          })
        : payslipFile;
    let savedEpf: TaxExpense | null = null;
    if (epfAmount > 0) {
      savedEpf = await upsertStatutoryRelief(
        "epf",
        {
          taxYear,
          categoryId: "epf_life_insurance",
          subCategoryId: "epf_mandatory",
          merchant: `KWSP / EPF${empLabel}`,
          description:
            "Auto-extracted from uploaded payslip / EA Form (auto-updates latest YTD per employer)",
          amount: epfAmount,
          expenseDate: today,
          invoiceNumber: empKey ? `PAYSLIP-EPF-${taxYear}-${empKey}` : `PAYSLIP-EPF-${taxYear}`,
          aiExtracted: true,
        },
        storageFile,
        empKey
      );
    }
    if (socsoAmount > 0) {
      const reuseEpfReceipt = Boolean(savedEpf?.receiptPath || savedEpf?.receiptUrl);
      await upsertStatutoryRelief(
        "socso",
        {
          taxYear,
          categoryId: "socso",
          subCategoryId: null,
          merchant: `PERKESO / SOCSO & EIS${empLabel}`,
          description:
            "Auto-extracted from uploaded payslip / EA Form (auto-updates latest YTD per employer)",
          amount: socsoAmount,
          expenseDate: today,
          invoiceNumber: empKey ? `PAYSLIP-SOCSO-${taxYear}-${empKey}` : `PAYSLIP-SOCSO-${taxYear}`,
          aiExtracted: true,
          ...(reuseEpfReceipt && savedEpf
            ? {
                receiptPath: savedEpf.receiptPath,
                receiptUrl: savedEpf.receiptUrl,
                receiptFileName: savedEpf.receiptFileName,
                receiptMimeType: savedEpf.receiptMimeType,
              }
            : {}),
        },
        reuseEpfReceipt ? null : storageFile,
        empKey
      );
    }
  }

  function handleUpdatePersonalization(next: UserPersonalization) {
    setPersonalization(next);
    savePersonalization(next);
  }

  async function handleApplyLifeStage(presetId: LifeStagePresetId) {
    const preset = LIFE_STAGE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    handleUpdatePersonalization({
      ...personalization,
      lifeStage: presetId,
      pinnedCategoryIds: preset.pinnedCategoryIds,
    });
    const nextProfile: TaxProfile = {
      ...profile,
      taxpayerMode: preset.taxpayerMode,
      statusReliefs: {
        ...profile.statusReliefs,
        ...preset.statusReliefsPatch,
      },
    };
    await handleUpdateProfile(nextProfile);
  }

  function handleTogglePinCategory(categoryId: string) {
    const exists = personalization.pinnedCategoryIds.includes(categoryId);
    const nextPinned = exists
      ? personalization.pinnedCategoryIds.filter((id) => id !== categoryId)
      : [...personalization.pinnedCategoryIds, categoryId];
    handleUpdatePersonalization({
      ...personalization,
      pinnedCategoryIds: nextPinned,
    });
  }

  function handleSaveRecurringBills(bills: RecurringBillTemplate[]) {
    setRecurringBills(bills);
    saveRecurringBills(bills);
  }

  async function handleLogRecurringBill(bill: RecurringBillTemplate) {
    const currentMonth = getCurrentYearMonth();
    const expectedInvoice = `RECUR-${bill.id}-${currentMonth}`;
    if (
      expenses.some(
        (e) => e.taxYear === taxYear && e.invoiceNumber === expectedInvoice
      )
    ) {
      return;
    }
    const today = `${taxYear}-${new Date().toISOString().slice(5, 10)}`;
    await handleSaveExpense(
      {
        taxYear,
        categoryId: bill.categoryId,
        subCategoryId: bill.subCategoryId || null,
        merchant: bill.merchant,
        description: `${bill.description} (${currentMonth})`,
        amount: bill.amount,
        expenseDate: today,
        invoiceNumber: `RECUR-${bill.id}-${currentMonth}`,
        aiExtracted: false,
      },
      null
    );
    const updatedBills = recurringBills.map((b) =>
      b.id === bill.id ? { ...b, lastLoggedMonth: currentMonth } : b
    );
    handleSaveRecurringBills(updatedBills);
  }

  function handleLoadSampleData() {
    const samples = getSampleExpenses(taxYear);
    const otherYears = expenses.filter((e) => e.taxYear !== taxYear);
    const merged = [...samples, ...otherYears];
    setExpenses(merged);
    saveLocalExpenses(merged);
  }

  async function handleClearLocalData(targetYear: TaxYear = taxYear) {
    const toDelete = expenses.filter((e) => e.taxYear === targetYear);
    for (const exp of toDelete) {
      await removeExpense(exp, userId);
    }
    const remaining = expenses.filter((e) => e.taxYear !== targetYear);
    setExpenses(remaining);
    saveLocalExpenses(remaining);

    // Clear EA employers, payslip month source, annual docs, and baselines for that year
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(`cukaiku_ea_employers_${targetYear}`);
        window.localStorage.removeItem(`cukaiku_payslip_source_${targetYear}`);
      } catch {
        // ignore
      }
    }

    const nextDocs = annualDocs.filter((d) => d.taxYear !== targetYear);
    setAnnualDocs(nextDocs);
    try {
      window.localStorage.setItem(ANNUAL_DOCS_KEY, JSON.stringify(nextDocs));
    } catch {
      // ignore
    }

    const nextBaselines = { ...formBeBaselines };
    delete nextBaselines[String(targetYear)];
    setFormBeBaselines(nextBaselines);
    try {
      window.localStorage.setItem(
        FORM_BE_BASELINES_KEY,
        JSON.stringify(nextBaselines)
      );
    } catch {
      // ignore
    }

    // Reset profile for targetYear (preserving permanent individual=true)
    const freshProfile: TaxProfile = getDefaultProfile(targetYear);
    if (targetYear === taxYear) {
      setProfile(freshProfile);
    }
    await persistProfile(freshProfile, userId);

    if (userId) {
      persistAnnualStateToCloud(targetYear, [], null, freshProfile, userId).catch(
        () => {}
      );
    }

    // Clear recurring bill locks for that year
    const updatedBills = recurringBills.map((b) =>
      b.lastLoggedMonth?.startsWith(`${targetYear}-`)
        ? { ...b, lastLoggedMonth: undefined }
        : b
    );
    handleSaveRecurringBills(updatedBills);
  }

  const desktopNavItems = [
    { id: "dashboard" as const, label: copy.navDashboard, icon: LayoutDashboard },
    {
      id: "receipts" as const,
      label: copy.navReceipts,
      icon: ReceiptText,
      badge: missingReceiptsTotal > 0 ? missingReceiptsTotal : undefined,
    },
    { id: "reliefs" as const, label: copy.navReliefs, icon: ListChecks },
    { id: "settings" as const, label: copy.navSubmissionsDesktop, icon: FileCheck2 },
  ];

  return (
    <LanguageProvider lang={personalization.language}>
      <div
        className={`min-h-screen overflow-x-hidden bg-canvas text-slate-900 ${
          privacyBlur ? "privacy-mode" : ""
        }`}
      >
      {/* Top Sticky Responsive Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 pt-safe backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-6 sm:py-3">
          {/* Primary Row: Brand + Quick Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-slate-200/80">
                <img
                  src="/icon.png"
                  alt="CukaiKu Logo"
                  className="h-full w-full object-contain p-0.5"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-sm font-bold leading-tight text-slate-900">
                    CukaiKu
                  </h1>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                    {profile.taxpayerMode || "e-BE"}
                  </span>
                </div>
                <p className="truncate text-[11px] text-slate-500">
                  {copy.tagline}
                </p>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {offlineQueueCount > 0 && (
                <span
                  title="Receipts saved offline in IndexedDB — will sync automatically when online"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-900 border border-amber-300"
                >
                  <WifiOff className="h-3 w-3 text-amber-700" />
                  <span className="hidden sm:inline">
                    Saved offline ({offlineQueueCount}) — will sync
                  </span>
                  <span className="sm:hidden">{offlineQueueCount} Offline</span>
                </span>
              )}

              {/* Desktop-only Status & Pro pills (shown on Row 2 on mobile so Row 1 never overflows) */}
              <div className="hidden sm:flex items-center gap-1.5">
                {userEmail ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab("settings")}
                      title={`Signed in as ${userEmail} — tap to view Cloud Sync settings`}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 transition"
                    >
                      <Cloud className="h-3 w-3 text-emerald-600" />
                      <span>{userEmail.split("@")[0]}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleManualRefresh}
                      disabled={refreshing}
                      title="Sync now (pull latest from cloud)"
                      className="rounded-xl p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab("settings")}
                    title={
                      personalization.language === "bm"
                        ? "Sedang dalam Mod Tempatan pada peranti ini. Ketik untuk log masuk dan segerak dengan telefon atau PC anda."
                        : "Currently in Local Mode on this device. Tap to sign in and sync with your phone or PC."
                    }
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-300 hover:bg-amber-100 transition"
                  >
                    <CloudOff className="h-3 w-3 text-amber-600" />
                    <span>{copy.notSynced}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openUpgradeModal()}
                  title={
                    subscription.planTier === "free"
                      ? personalization.language === "bm"
                        ? `Pelan Percuma (${subscription.aiScansUsed}/${subscription.aiScansLimit} Imbasan AI digunakan) — Ketik untuk naik taraf ke Pro`
                        : `Free Plan (${subscription.aiScansUsed}/${subscription.aiScansLimit} AI Scans used) — Tap to upgrade to Pro`
                      : personalization.language === "bm"
                        ? `Pas ${subscription.planTier.toUpperCase()} CukaiKu Aktif`
                        : `CukaiKu ${subscription.planTier.toUpperCase()} Pass Active`
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide transition ${
                    subscription.planTier === "free"
                      ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                      : "bg-emerald-700 text-amber-300 shadow-2xs"
                  }`}
                >
                  <Crown className="h-3 w-3" />
                  <span>
                    {subscription.planTier === "free"
                      ? `Pro • ${Math.max(
                          0,
                          subscription.aiScansLimit - subscription.aiScansUsed
                        )} AI`
                      : subscription.planTier}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleUpdatePersonalization({
                    ...personalization,
                    language: personalization.language === "en" ? "bm" : "en",
                  })
                }
                title={
                  personalization.language === "bm"
                    ? "Tukar bahasa (Bahasa Melayu / Inggeris)"
                    : "Switch language (English / Bahasa Melayu)"
                }
                className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-700 hover:bg-slate-100"
              >
                {personalization.language === "en" ? "EN" : "BM"}
              </button>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                title={
                  personalization.language === "bm"
                    ? "Cara menggunakan CukaiKu (Panduan Ringkas)"
                    : "How to use CukaiKu (Quick Guide)"
                }
                className="rounded-xl p-1.5 sm:p-2 text-slate-500 hover:bg-slate-100"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPrivacyBlur((v) => !v)}
                title={
                  privacyBlur
                    ? personalization.language === "bm"
                      ? "Papar jumlah"
                      : "Show amounts"
                    : personalization.language === "bm"
                      ? "Kaburkan gaji & jumlah"
                      : "Blur salary & amounts"
                }
                className="rounded-xl p-1.5 sm:p-2 text-slate-500 hover:bg-slate-100"
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
                title={
                  darkMode
                    ? personalization.language === "bm"
                      ? "Mod cerah"
                      : "Light mode"
                    : personalization.language === "bm"
                      ? "Mod gelap"
                      : "Dark mode"
                }
                className="rounded-xl p-1.5 sm:p-2 text-slate-500 hover:bg-slate-100"
              >
                {darkMode ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>

              {/* Dynamic Rolling 7-Year LHDN Switcher */}
              <select
                aria-label={
                  personalization.language === "bm"
                    ? "Tahun Taksiran"
                    : "Year of Assessment"
                }
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-emerald-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {availableTaxYears.map((yr) => {
                  const count = expenseCountByYear[yr] || 0;
                  const expired = isTaxYearRetentionExpired(yr);
                  const baseline = formBeBaselines[String(yr)];
                  let statusMark = "";
                  if (baseline) {
                    const verifiedByCat: Record<string, number> = {};
                    for (const exp of expenses) {
                      if (exp.taxYear === yr && (exp.receiptUrl || exp.receiptPath)) {
                        verifiedByCat[exp.categoryId] =
                          (verifiedByCat[exp.categoryId] || 0) + exp.amount;
                      }
                    }
                    const declaredEntries = Object.entries(
                      baseline.declaredByCategory
                    ).filter(([, amt]) => amt > 0);
                    const allVerified =
                      declaredEntries.length > 0 &&
                      declaredEntries.every(
                        ([catId, amt]) => (verifiedByCat[catId] || 0) >= amt - 0.01
                      );
                    statusMark = allVerified ? " ✓" : " •";
                  }
                  return (
                    <option key={yr} value={yr}>
                      {personalization.language === "bm" ? "TT" : "YA"} {yr}
                      {count > 0 ? ` (${count})` : ""}
                      {statusMark}
                      {expired
                        ? personalization.language === "bm"
                          ? " • Tamat"
                          : " • Expired"
                        : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Mobile Sub-Row: Sync Status + Pro Quota Pill (cleanly fits 320px+ screens) */}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 sm:hidden">
            {userEmail ? (
              <div className="inline-flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  className="inline-flex min-w-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200/80"
                >
                  <Cloud className="h-3 w-3 shrink-0 text-emerald-600" />
                  <span className="truncate">{userEmail.split("@")[0]}</span>
                </button>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={refreshing}
                  title="Sync now"
                  className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-300"
              >
                <CloudOff className="h-3 w-3 text-amber-600" />
                <span>Local Mode • Sign In</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openUpgradeModal()}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                subscription.planTier === "free"
                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                  : "bg-emerald-700 text-amber-300"
              }`}
            >
              <Crown className="h-3 w-3" />
              <span>
                {subscription.planTier === "free"
                  ? `Pro • ${Math.max(
                      0,
                      subscription.aiScansLimit - subscription.aiScansUsed
                    )} AI Left`
                  : `${subscription.planTier} Pass`}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Responsive Desktop Left Sidebar (>= 1024px) + Main Content Shell */}
      <div className="mx-auto flex max-w-7xl">
        <aside
          className={`sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col justify-between border-r border-slate-200/80 bg-white/90 p-3 transition-all lg:flex ${
            sidebarCollapsed ? "w-20" : "w-60"
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2 py-1.5">
              {!sidebarCollapsed && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {copy.sidebarNav}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                title={
                  sidebarCollapsed
                    ? personalization.language === "bm"
                      ? "Kembangkan bar sisi"
                      : "Expand sidebar"
                    : personalization.language === "bm"
                      ? "Kuncupkan bar sisi"
                      : "Collapse sidebar"
                }
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
            </div>

            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                    isActive
                      ? "bg-brand-primary text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && item.badge !== undefined && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setToolsTab("form-be");
                setToolsOpen(true);
              }}
              title="Form BE / e-B Worksheet & Simulators"
              className="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
              {!sidebarCollapsed && <span>{copy.workpapersBtn}</span>}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-[11px] text-slate-600">
              <p className="font-bold text-slate-900">
                {copy.vaultSidebarTitle}
              </p>
              <p className="mt-0.5">
                {copy.vaultSidebarDesc
                  .replace("{year}", String(taxYear))
                  .replace("{until}", String(taxYear + 8))}
              </p>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 px-3 pt-4 pb-28 sm:px-6 lg:pb-10">
          {!isLoaded ? (
            <div className="space-y-4">
              <div className="h-44 animate-pulse rounded-2xl bg-slate-200" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
                <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
                <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
              </div>
              <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && (
                <DashboardTab
                  profile={profile}
                  summary={summary}
                  subscription={subscription}
                  taxpayerMode={profile.taxpayerMode || "e-BE"}
                  yearExpenses={yearExpenses}
                  expenseCount={yearExpenses.length}
                  missingReceiptsTotal={missingReceiptsTotal}
                  profileCustomized={
                    profile.annualIncome > 0 ||
                    profile.pcbPaid > 0 ||
                    profile.zakatPaid > 0
                  }
                  hasCloudSync={Boolean(userEmail)}
                  personalization={personalization}
                  recurringBills={recurringBills}
                  formBeBaseline={formBeBaselines[String(taxYear)] || null}
                  onUploadAnnualDoc={handleUploadAnnualDoc}
                  onApplyAnnualDocExtraction={handleApplyAnnualDocExtraction}
                  onUpdateAnnualDocStatus={handleUpdateAnnualDocStatus}
                  onChangeTaxpayerMode={(mode) =>
                    handleUpdateProfile({ ...profile, taxpayerMode: mode })
                  }
                  onApplyLifeStage={handleApplyLifeStage}
                  onUpdatePersonalization={handleUpdatePersonalization}
                  onLogRecurringBill={handleLogRecurringBill}
                  onQuickAdd={(catId, subId) => openScanner(catId, subId)}
                  onDropFileForScan={(file) =>
                    openScanner(undefined, undefined, "ocr", file)
                  }
                  onOpenMyInvoisQr={() =>
                    openScanner(undefined, undefined, "qr", null)
                  }
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onOpenTool={(tool) => {
                    setToolsTab(tool);
                    setToolsOpen(true);
                  }}
                  onOpenUpgrade={openUpgradeModal}
                  onLoadSampleData={handleLoadSampleData}
                  onOpenGuideModal={() => setGuideOpen(true)}
                />
              )}

              {activeTab === "reliefs" && (
                <ReliefsTab
                  taxYear={taxYear}
                  annualIncome={profile.annualIncome}
                  expenses={expenses}
                  summaries={summary.categorySummaries}
                  marginalRate={summary.marginalRate}
                  language={personalization.language}
                  pinnedCategoryIds={personalization.pinnedCategoryIds}
                  formBeBaseline={formBeBaselines[String(taxYear)] || null}
                  onOpenAuditTally={() => {
                    setToolsTab("form-be");
                    setToolsOpen(true);
                  }}
                  onTogglePinCategory={handleTogglePinCategory}
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
                  subscription={subscription}
                  expenses={expenses}
                  annualDocs={annualDocs}
                  formBeBaseline={formBeBaselines[String(taxYear)] || null}
                  onOpenAuditTally={() => {
                    setToolsTab("form-be");
                    setToolsOpen(true);
                  }}
                  onUploadAnnualDoc={handleUploadAnnualDoc}
                  onApplyAnnualDocExtraction={handleApplyAnnualDocExtraction}
                  onUpdateAnnualDocStatus={handleUpdateAnnualDocStatus}
                  onDeleteAnnualDoc={handleDeleteAnnualDoc}
                  onOpenBatchImport={() => setBatchOpen(true)}
                  onOpenMyInvoisQr={() =>
                    openScanner(undefined, undefined, "qr", null)
                  }
                  onOpenUpgrade={openUpgradeModal}
                  onEdit={openEditExpense}
                  onDelete={handleDeleteExpense}
                  onAddNew={() => openScanner()}
                />
              )}

              {activeTab === "settings" && (
                <SettingsTab
                  profile={profile}
                  subscription={subscription}
                  expenses={expenses}
                  userEmail={userEmail}
                  driveConnected={driveConnected}
                  onDriveConnected={() => setDriveConnected(true)}
                  personalization={personalization}
                  recurringBills={recurringBills}
                  onUpdatePersonalization={handleUpdatePersonalization}
                  onApplyLifeStage={handleApplyLifeStage}
                  onSaveRecurringBills={handleSaveRecurringBills}
                  onUpdateProfile={handleUpdateProfile}
                  onOpenUpgrade={openUpgradeModal}
                  onLogPayslipReliefs={handleLogPayslipReliefs}
                  onDeleteExpense={handleDeleteExpense}
                  onLoadSampleData={handleLoadSampleData}
                  onClearLocalData={handleClearLocalData}
                  onOpenLegal={(sec) => {
                    setLegalSection(sec || "pdpa");
                    setLegalOpen(true);
                  }}
                  onAccountWiped={() => {
                    setExpenses([]);
                    setAnnualDocs([]);
                    setFormBeBaselines({});
                    setProfile(getDefaultProfile(taxYear));
                    setSubscription(getDefaultSubscription());
                    setDriveConnected(false);
                    setOfflineQueueCount(0);
                  }}
                />
              )}
            </>
          )}

          {/* Malaysian Law (ITA s.153) & PDPA Compliance Footer */}
          <footer className="mt-6 border-t border-slate-200/80 pt-4 pb-20 text-center text-[11px] text-slate-500 lg:pb-6">
            <p>
              {personalization.language === "bm"
                ? "CukaiKu ialah alat pengurusan resit & penganggar cukai layan diri — bukan ejen cukai berlesen di bawah Seksyen 153 ACP 1967. Sila sahkan angka akhir di MyTax (ez.hasil.gov.my)."
                : "CukaiKu is a self-service receipt organizer & tax estimator — not a licensed tax agent under s.153 Income Tax Act 1967. Always verify final figures on LHDN MyTax (ez.hasil.gov.my)."}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-3 font-semibold text-emerald-700">
              <button
                type="button"
                onClick={() => {
                  setLegalSection("pdpa");
                  setLegalOpen(true);
                }}
                className="hover:underline"
              >
                {personalization.language === "bm"
                  ? "Notis Privasi PDPA (EN/BM)"
                  : "PDPA Privacy Notice (EN/BM)"}
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => {
                  setLegalSection("terms");
                  setLegalOpen(true);
                }}
                className="hover:underline"
              >
                {personalization.language === "bm"
                  ? "Penafian LHDN & Terma E-Dagang"
                  : "LHDN Disclaimer & E-Commerce Terms"}
              </button>
            </div>
          </footer>
        </main>
      </div>

      {/* First-Time PDPA Explicit Consent Banner (Malaysian PDPA 2010 / 2024 Amendment) */}
      {!pdpaConsented && (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-2xl rounded-2xl border border-emerald-300 bg-white/95 p-3.5 shadow-xl backdrop-blur-md lg:bottom-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-700">
              <p className="font-bold text-slate-900">
                {personalization.language === "bm"
                  ? "Privasi PDPA Malaysia & Persetujuan Data"
                  : "Malaysia PDPA Privacy & Data Consent"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {personalization.language === "bm"
                  ? "Kami meminimumkan data peribadi anda (tiada nombor MyKad penuh disimpan) & menyulitkan resit anda mengikut PDPA 2010/2024."
                  : "We minimize personal data (raw MyKad numbers are never stored) & protect your tax receipts under Malaysia's PDPA 2010/2024."}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setLegalSection("pdpa");
                    setLegalOpen(true);
                  }}
                  className="font-semibold text-emerald-700 underline"
                >
                  {personalization.language === "bm"
                    ? "Baca Notis EN/BM"
                    : "Read EN/BM Notice"}
                </button>
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await savePdpaConsent();
                setPdpaConsented(true);
              }}
              className="shrink-0 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              {personalization.language === "bm"
                ? "Saya Setuju"
                : "I Consent"}
            </button>
          </div>
        </div>
      )}

      {/* Mobile & Tablet (< 1024px) Fixed Bottom Navigation Bar with Elevated Circular Scan CTA */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 items-center px-2 py-1.5">
          <NavButton
            icon={LayoutDashboard}
            label={copy.navDashboard}
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <NavButton
            icon={ReceiptText}
            label={copy.navReceipts}
            badge={missingReceiptsTotal > 0 ? missingReceiptsTotal : undefined}
            active={activeTab === "receipts"}
            onClick={() => setActiveTab("receipts")}
          />

          {/* Center Elevated Circular Scan Button (--action-emerald) */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openScanner()}
              aria-label={
                personalization.language === "bm"
                  ? "Imbas atau rekod resit"
                  : "Scan or log receipt"
              }
              style={{ backgroundColor: "var(--action-emerald)" }}
              className="-mt-7 flex h-14 w-14 flex-col items-center justify-center rounded-full text-white shadow-lg shadow-emerald-600/35 ring-4 ring-white transition active:scale-95"
            >
              <Camera className="h-6 w-6" />
              <span className="text-[8px] font-extrabold uppercase tracking-wider">
                {copy.navScan}
              </span>
            </button>
          </div>

          <NavButton
            icon={ListChecks}
            label={copy.navReliefs}
            active={activeTab === "reliefs"}
            onClick={() => setActiveTab("reliefs")}
          />
          <NavButton
            icon={FileCheck2}
            label={copy.navSubmissions}
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
          />
        </div>
      </nav>

      {/* Receipt Scanner & Draggable Post-Scan Bottom Sheet Modal */}
      <ReceiptScannerModal
        isOpen={scannerOpen}
        taxYear={taxYear}
        taxpayerMode={profile.taxpayerMode || "e-BE"}
        subscription={subscription}
        initialCategoryId={scannerCategoryId}
        initialSubCategoryId={scannerSubCategoryId}
        initialScannerMode={scannerModeInit}
        initialFile={droppedFile}
        prefillInvoiceNumber={prefillInvoice}
        prefillDescription={prefillDesc}
        editingExpense={editingExpense}
        categorySummaries={summary.categorySummaries}
        existingExpenses={expenses}
        onClose={() => {
          setScannerOpen(false);
          setEditingExpense(null);
          setDroppedFile(null);
          setPrefillInvoice(undefined);
          setPrefillDesc(undefined);
        }}
        onAiScanCompleted={handleAiScanCompleted}
        onOfflineQueued={refreshOfflineQueueCount}
        onOpenUpgrade={(reason) => {
          setScannerOpen(false);
          openUpgradeModal(reason);
        }}
        onSave={async (d, f, id) => {
          await handleSaveExpense(d, f, id);
        }}
        onUploadAnnualDoc={handleUploadAnnualDoc}
        onApplyAnnualExtraction={async (doc, ext, yr) => {
          await handleApplyAnnualDocExtraction(ext, doc, yr);
        }}
        onOpenBatchWithFiles={(files, catId, subId) => {
          setScannerOpen(false);
          setEditingExpense(null);
          setBatchInitialFiles(files);
          setBatchDefaultCategoryId(catId);
          setBatchDefaultSubCategoryId(subId);
          setBatchOpen(true);
        }}
      />

      {/* Pricing & Malaysia Payment Checkout Modal */}
      <PricingModal
        isOpen={pricingOpen}
        taxYear={taxYear}
        subscription={subscription}
        userEmail={userEmail}
        userId={userId}
        triggerReason={pricingReason}
        onClose={() => {
          setPricingOpen(false);
          setPricingReason(null);
        }}
        onUpgradeSuccess={handleUpgradeSuccess}
      />

      {/* Batch Multi-Receipt Import Modal */}
      <BatchImportModal
        isOpen={batchOpen}
        taxYear={taxYear}
        initialFiles={batchInitialFiles}
        defaultCategoryId={batchDefaultCategoryId}
        defaultSubCategoryId={batchDefaultSubCategoryId}
        onClose={() => {
          setBatchOpen(false);
          setBatchInitialFiles(null);
          setBatchDefaultCategoryId(undefined);
          setBatchDefaultSubCategoryId(undefined);
        }}
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
        onSyncProfileToFormBe={async () => {
          const b = formBeBaselines[String(taxYear)];
          if (!b) return;
          const synced: TaxProfile = {
            ...profile,
            annualIncome:
              b.declaredIncome > 0 ? b.declaredIncome : profile.annualIncome,
            pcbPaid: b.declaredPcb > 0 ? b.declaredPcb : profile.pcbPaid,
            zakatPaid:
              b.declaredZakat !== undefined ? b.declaredZakat : profile.zakatPaid,
            cp500Paid:
              b.cp500Paid !== undefined ? b.cp500Paid : profile.cp500Paid,
            otherTaxCredits:
              b.otherTaxCredits !== undefined
                ? b.otherTaxCredits
                : profile.otherTaxCredits,
            statusReliefs: b.statusReliefs
              ? { ...profile.statusReliefs, ...b.statusReliefs, individual: true }
              : profile.statusReliefs,
          };
          await handleUpdateProfile(synced);
        }}
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

      <QuickGuideModal
        open={guideOpen}
        taxYear={taxYear}
        language={personalization.language}
        hasExpenses={yearExpenses.length > 0}
        onClose={() => setGuideOpen(false)}
        onStartScanning={() => openScanner()}
        onGoToSettings={() => setActiveTab("settings")}
        onLoadSampleData={handleLoadSampleData}
      />

      <LegalPrivacyModal
        isOpen={legalOpen}
        initialLang={personalization.language}
        initialSection={legalSection}
        onClose={() => setLegalOpen(false)}
        onAcceptConsent={() => setPdpaConsented(true)}
      />
    </div>
    </LanguageProvider>
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
