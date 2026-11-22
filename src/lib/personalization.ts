import { StatusReliefs, TaxpayerMode } from "./types";

export type AppLanguage = "en" | "bm";

export type LifeStagePresetId =
  | "single"
  | "family"
  | "freelancer"
  | "homebuyer";

export interface UserPersonalization {
  language: AppLanguage;
  lifeStage?: LifeStagePresetId;
  pinnedCategoryIds: string[];
  taxSavingGoal: number;
  paydayDay: number | null;
}

export interface RecurringBillTemplate {
  id: string;
  merchant: string;
  categoryId: string;
  subCategoryId?: string | null;
  amount: number;
  description: string;
  lastLoggedMonth?: string; // YYYY-MM to prevent double-logging in the same month
}

export interface LifeStagePreset {
  id: LifeStagePresetId;
  titleEn: string;
  titleBm: string;
  subtitleEn: string;
  subtitleBm: string;
  badge: string;
  taxpayerMode: TaxpayerMode;
  pinnedCategoryIds: string[];
  statusReliefsPatch: Partial<StatusReliefs>;
}

const PERSONALIZATION_KEY = "cukaiku_personalization_v1";
const RECURRING_BILLS_KEY = "cukaiku_recurring_bills_v1";

export const DEFAULT_PINNED_CATEGORIES = [
  "lifestyle",
  "medical_self",
  "sspn",
  "ev_charging",
  "epf_life_insurance",
];

export const DEFAULT_PERSONALIZATION: UserPersonalization = {
  language: "en",
  pinnedCategoryIds: DEFAULT_PINNED_CATEGORIES,
  taxSavingGoal: 1500,
  paydayDay: null,
};

export const LIFE_STAGE_PRESETS: LifeStagePreset[] = [
  {
    id: "single",
    titleEn: "Single Professional",
    titleBm: "Bujang / Profesional",
    subtitleEn: "Salaried (e-BE) • Lifestyle, Sports, Medical & PRS",
    subtitleBm: "Makan Gaji (e-BE) • Gaya Hidup, Sukan, Perubatan & PRS",
    badge: "e-BE",
    taxpayerMode: "e-BE",
    pinnedCategoryIds: [
      "lifestyle",
      "sports",
      "medical_self",
      "prs_annuity",
      "epf_life_insurance",
    ],
    statusReliefsPatch: {
      individual: true,
      spouse: false,
      childrenUnder18: 0,
    },
  },
  {
    id: "family",
    titleEn: "Married / Young Family",
    titleBm: "Berkahwin / Keluarga",
    subtitleEn: "Pins SSPN (RM 8k), Childcare (RM 3k) & Family Medical",
    subtitleBm: "Pin SSPN (RM 8k), Taska/Tadika (RM 3k) & Perubatan",
    badge: "Family",
    taxpayerMode: "e-BE",
    pinnedCategoryIds: [
      "sspn",
      "childcare",
      "medical_self",
      "edu_med_insurance",
      "lifestyle",
    ],
    statusReliefsPatch: {
      individual: true,
      spouse: true,
      childrenUnder18: 1,
    },
  },
  {
    id: "freelancer",
    titleEn: "Freelancer / Side Income",
    titleBm: "Pekerja Bebas / Perniagaan",
    subtitleEn: "Form e-B • Business Expenses (Sec 33) + CP500",
    subtitleBm: "Borang e-B • Perbelanjaan Perniagaan (Sek 33) + CP500",
    badge: "e-B",
    taxpayerMode: "e-B",
    pinnedCategoryIds: [
      "lifestyle",
      "medical_self",
      "prs_annuity",
      "education_self",
      "ev_charging",
    ],
    statusReliefsPatch: {
      individual: true,
    },
  },
  {
    id: "homebuyer",
    titleEn: "First-Time Homebuyer",
    titleBm: "Pembeli Rumah Pertama",
    subtitleEn: "Pins Housing Loan Interest (RM 7k / RM 5k) + Lifestyle",
    subtitleBm: "Pin Faedah Pinjaman Rumah (RM 7k / RM 5k) + Gaya Hidup",
    badge: "2025–2027",
    taxpayerMode: "e-BE",
    pinnedCategoryIds: [
      "first_home_interest",
      "lifestyle",
      "medical_self",
      "epf_life_insurance",
      "ev_charging",
    ],
    statusReliefsPatch: {
      individual: true,
    },
  },
];

export const STARTER_RECURRING_BILLS: RecurringBillTemplate[] = [
  {
    id: "tpl-unifi",
    merchant: "Unifi / TIME Fibre",
    categoryId: "lifestyle",
    subCategoryId: "lifestyle_internet",
    amount: 129,
    description: "Monthly home broadband internet",
  },
  {
    id: "tpl-gym",
    merchant: "Gym / Fitness Membership",
    categoryId: "sports",
    subCategoryId: "sports_gym",
    amount: 150,
    description: "Monthly gym membership fee",
  },
  {
    id: "tpl-insurance",
    merchant: "Medical / Education Insurance",
    categoryId: "edu_med_insurance",
    subCategoryId: null,
    amount: 250,
    description: "Monthly medical / takaful policy",
  },
];

export function loadPersonalization(): UserPersonalization {
  if (typeof window === "undefined") return DEFAULT_PERSONALIZATION;
  try {
    const raw = window.localStorage.getItem(PERSONALIZATION_KEY);
    if (!raw) return DEFAULT_PERSONALIZATION;
    const parsed = JSON.parse(raw) as Partial<UserPersonalization>;
    return {
      language: parsed.language === "bm" ? "bm" : "en",
      lifeStage: parsed.lifeStage,
      pinnedCategoryIds:
        Array.isArray(parsed.pinnedCategoryIds) &&
          parsed.pinnedCategoryIds.length > 0
          ? parsed.pinnedCategoryIds
          : DEFAULT_PINNED_CATEGORIES,
      taxSavingGoal:
        typeof parsed.taxSavingGoal === "number" && parsed.taxSavingGoal >= 0
          ? parsed.taxSavingGoal
          : 1500,
      paydayDay:
        typeof parsed.paydayDay === "number" &&
          parsed.paydayDay >= 1 &&
          parsed.paydayDay <= 31
          ? parsed.paydayDay
          : null,
    };
  } catch {
    return DEFAULT_PERSONALIZATION;
  }
}

export function savePersonalization(next: UserPersonalization): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function loadRecurringBills(): RecurringBillTemplate[] {
  if (typeof window === "undefined") return STARTER_RECURRING_BILLS;
  try {
    const raw = window.localStorage.getItem(RECURRING_BILLS_KEY);
    if (!raw) return STARTER_RECURRING_BILLS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : STARTER_RECURRING_BILLS;
  } catch {
    return STARTER_RECURRING_BILLS;
  }
}

export function saveRecurringBills(bills: RecurringBillTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECURRING_BILLS_KEY, JSON.stringify(bills));
  } catch {
    // ignore storage errors
  }
}

export function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isNearPayday(paydayDay: number | null): boolean {
  if (!paydayDay) return false;
  const today = new Date().getDate();
  return Math.abs(today - paydayDay) <= 2;
}

export function getUiCopy(lang: AppLanguage) {
  if (lang === "bm") {
    return {
      // Navigation & Header
      navDashboard: "Utama",
      navReceipts: "Resit",
      navScan: "Imbas",
      navReliefs: "Pelepasan",
      navSubmissions: "Profil",
      navSubmissionsDesktop: "Profil & e-Filing",
      tagline: "Pelepasan LHDN & Arkib e-Invois",
      notSynced: "Belum Disegerak",
      sidebarNav: "Navigasi",
      workpapersBtn: "Kertas Kerja e-Filing",
      vaultSidebarTitle: "Arkib Audit 7-Tahun LHDN",
      vaultSidebarDesc: "Rekod TT {year} disimpan sehingga {until} di bawah Seksyen 82A ACP.",

      // Dashboard & Hero
      dropzoneTitle: "Muat Naik / Seret & Lepas Resit PDF atau e-Invois LHDN",
      dropzoneBadge: "Arkib Auto ~300KB",
      dropzoneSub: "Lepaskan bil klinik, PDF Shopee/Lazada, bil internet, atau resit QR MyInvois untuk ekstrak AI segera.",
      scanMyInvoisQr: "Imbas QR MyInvois",
      selectPdfImage: "Pilih PDF / Gambar",
      filingProfile: "Profil Cukai LHDN:",
      salariedMode: "Makan Gaji (e-BE)",
      freelancerMode: "Pekerja Bebas / Campuran (e-B)",
      personalReliefsTab: "Pelepasan Peribadi",
      businessExpensesTab: "Perbelanjaan Perniagaan",
      deadlineBe: "Tarikh Akhir Borang e-BE: 30 April",
      deadlineB: "Tarikh Akhir Borang e-B: 30 Jun",
      daysLeft: "hari lagi",
      cp500Active: "Ansuran Dwi-Bulanan CP500 Aktif",
      verifyMyInvois: "Sahkan QR MyInvois",
      missingQrSuffix: "resit tanpa UUID QR MyInvois",
      totalReliefsTitle: "Jumlah Pelepasan Cukai",
      businessExpensesTitle: "Perbelanjaan Perniagaan (Sek 33)",
      taxBracket: "Kadar Cukai",
      reliefUtilization: "Penggunaan Pelepasan Resit",
      targetLabel: "sasaran",
      taxSavedReceipts: "Cukai Dijimat (Resit)",
      estRefund: "Anggaran Lebihan (Refund)",
      estBalanceDue: "Anggaran Baki Cukai",
      keepUntilLabel: "Simpanan audit 7-tahun LHDN: Simpan sehingga",
      editIncomeBtn: "Ubah Pendapatan",
      toolFormBe: "Borang e-BE",
      toolSimulator: "Simulator",
      toolWhatIf: "Simulasi",
      toolJointSep: "Bersama/Asing",
      pinnedCapsTitle: "Had Pelepasan Dipin",
      customizePins: "Ubah Pin",
      maxCapReached: "Had maksimum dicapai",
      remainingLabel: "baki",
      recurringTitle: "Bil Bulanan Berulang (1-Tap)",
      logBillNow: "Rekod Bulan Ini",
      loggingBill: "Merekod...",
      loggedThisMonth: "Direkod",
      goalTitle: "Sasaran Penjimatan Cukai",
      savedLabel: "dijimatkan",
      goalLabel: "Sasaran",
      editBtn: "Ubah",
      cancelBtn: "Batal",
      saveBtn: "Simpan",
      paydayBanner: "Hari Gaji Tiba! Jangan lupa muat naik slip gaji & bil bulanan.",
      paydaySub: "Hari gaji ditetapkan pada {day} haribulan setiap bulan dalam Tetapan.",
      uploadPayslipBtn: "Muat Naik Slip Gaji",
      lifeStageTitle: "Tetapan Pantas Profil Kehidupan (1-Tap)",
      changeAnytimeSettings: "Ubah bila-bila masa di Tetapan",
      maximizeReliefsTitle: "Maksimumkan Pelepasan Anda",
      before31Dec: "Sebelum 31 Dis",
      unusedCapRemaining: "baki had belum digunakan",
      addBtn: "+ Tambah",
      missingReceiptsTitle: "tuntutan tiada bukti resit",
      missingReceiptsSub: "Lampirkan resit untuk kekal bersedia audit LHDN 7 tahun",
      emptyStartTitle: "Mula jejak resit TT {year}",
      emptyStartDesc: "Ambil gambar resit pertama dengan pengkelasan AI automatik, atau muat naik data contoh Malaysia.",
      scanFirstReceipt: "+ Imbas Resit Pertama",
      loadSampleData: "Muat Data Contoh TT {year}",

      // Quick Start Checklist & Guide Modal
      quickStartTitle: "Mula Di Sini — Tetapan Pantas TT {year}",
      doneLabel: "selesai",
      quickStartSub: "Ikuti 4 langkah mudah ini untuk maksimumkan pulangan cukai LHDN anda.",
      step1Title: "1. Tetapkan Pendapatan & Borang (e-BE / e-B)",
      step1Desc: "Masukkan gaji tahunan atau muat naik Slip Gaji / Borang EA untuk kiraan cukai tepat.",
      step1CtaEdit: "Ubah Profil",
      step1CtaSet: "Tetapkan Gaji",
      step2Title: "2. Imbas Resit Pertama atau QR MyInvois",
      step2Desc: "Ambil gambar resit klinik, kedai buku, atau sukan — AI auto-padankan kategori LHDN.",
      step2CtaAnother: "Imbas Lagi",
      step2CtaScan: "Imbas Resit",
      step3Title: "3. Semak Baki Had Pelepasan",
      step3Desc: "Lihat penjimatan cukai dalam Gaya Hidup (RM 2,500), Perubatan (RM 10,000), & SSPN.",
      step3Cta: "Lihat Had",
      step4Title: "4. Sandarkan Arkib Audit 7-Tahun",
      step4Desc: "Log masuk Google 1-klik memastikan resit anda disegerakkan antara telefon & PC.",
      step4CtaSynced: "Disegerak",
      step4CtaSignIn: "Log Masuk",
      trySampleBtn: "Cuba Data Contoh TT {year}",
      howItWorksBtn: "Cara CukaiKu Berfungsi",
      dismissGuide: "Tutup panduan",
      guideModalTitle: "Cara Menggunakan CukaiKu",
      guideModalSub: "Pelepasan Cukai LHDN Malaysia & Arkib Resit 7-Tahun",
      pillar1Title: "Tetapkan Pendapatan & Jenis Borang",
      pillar1Desc: "Pilih Makan Gaji (Borang e-BE, akhir 30 April) atau Pekerja Bebas (Borang e-B, akhir 30 Jun). Muat naik Slip Gaji atau Borang EA untuk isi PCB & KWSP automatik.",
      pillar2Title: "Imbas Resit atau QR MyInvois",
      pillar2Desc: "Tekan butang Imbas hijau bila-bila masa (walaupun luar talian). AI mengekstrak nama kedai, tarikh, jumlah RM dan memadankan had pelepasan LHDN.",
      pillar3Title: "Fail MyTax & Simpan Pek Audit 7-Tahun",
      pillar3Desc: "Jejak baki had Gaya Hidup, Sukan, Perubatan & SSPN sepanjang tahun. Buka Kertas Kerja e-Filing untuk panduan Borang BE/B & arkib ZIP 1-klik.",
      guideStartScanning: "Imbas Resit Pertama",
      guideSetIncomeFirst: "1. Tetapkan Pendapatan",

      // Reliefs Tab
      pinGuideText: "Tekan ★ pada mana-mana pelepasan untuk pin ke halaman Utama",
      pinnedCountLabel: "dipin",
      filterAll: "Semua",
      filterLifestyle: "Gaya Hidup & Sukan",
      filterMedical: "Perubatan",
      filterSavings: "KWSP & Insurans",
      filterFamily: "Keluarga",
      filterHousing: "Rumah & EV",
      maxedBadge: "Had Penuh",

      // Receipts Tab
      retentionUntil: "Simpanan LHDN 7-tahun sehingga",
      receiptsTabBtn: "Resit",
      annualDocsTabBtn: "Dokumen Tahunan",
      auditZipBtn: "ZIP Audit",

      // Settings Tab
      personalizationTitle: "Penyesuaian & Peringatan Pintar",
      lifeStagePresetLabel: "Praset Profil Kehidupan (1-Tap)",
      taxSavingGoalLabel: "Sasaran Penjimatan Cukai (RM)",
      paydayReminderLabel: "Peringatan Hari Gaji Bulanan (Hari 1–31)",
      recurringBillsMgrTitle: "Bil Bulanan Berulang (1-Tap)",
      savedCount: "disimpan",
      addRecurringBtn: "+ Tambah Bil Berulang",
      removeBtn: "Buang",
      filingModeTitle: "Borang e-Filing LHDN (TT {year})",
      filingModeSub: "Tukar antara Makan Gaji (Borang e-BE, akhir 30 April) dan Pekerja Bebas / Perniagaan (Borang e-B, akhir 30 Jun + CP500).",
      incomeEstimateTitle: "Anggaran Pendapatan & Cukai TT {year}",
      incomeEstimateSub: "Muat naik slip gaji / Borang EA untuk isi automatik, atau ubah terus.",
      annualIncomeLabel: "Pendapatan Tahunan (RM)",
      pcbPaidLabel: "PCB Dibayar YTD (RM)",
      zakatPaidLabel: "Rebat Zakat / Fitrah (RM)",
      statusReliefsTitle: "Pelepasan Status & Keluarga (Tanpa Resit)",
      cloudVaultTitle: "Segerak Awan & Arkib 7-Tahun LHDN",
      cloudActiveTitle: "CukaiKu Cloud Sync: Active",
      signOutBtn: "Log Keluar",
      upgradeBtn: "Naik Taraf (RM 29)",
      managePassBtn: "Urus Pas",
      freeStarterLabel: "Permulaan Percuma",
      proPassLabel: "Pas Pro",
      familyPassLabel: "Pas Keluarga & Bersama",
      localBrowserMode: "Sedang Dalam Mod Pelayar Tempatan",
      localBrowserDesc: "Resit dan angka yang dimasukkan kekal pada peranti ini sahaja. Untuk segerak antara telefon dan PC, log masuk di bawah dengan akaun yang sama.",
      useEmailPassword: "Guna emel & kata laluan",
      enableDriveBtn: "Aktifkan Arkib Google Drive (Pilihan)",
      pushLocalBtn: "Muat Naik Resit Tempatan ke Awan",
      backupDriveBtn: "Sandar TT {year} ke Drive",
      statusIndividual: "Individu & Tanggungan",
      statusDisabledIndividual: "Individu Kurang Upaya (OKU)",
      statusSpouse: "Pelepasan Pasangan (Tiada Pendapatan / Bersama)",
      statusDisabledSpouse: "Pasangan Kurang Upaya (OKU)",
      statusChildUnder18: "Anak Belum Berkahwin (Bawah 18 Tahun)",
      statusChildHigherEd: "Anak 18+ (Diploma / Ijazah)",
      statusDisabledChild: "Anak Kurang Upaya (OKU)",
      dataToolsTitle: "Data Contoh & Tetap Semula",
      clearYearBtn: "Padam Data Tempatan TT {year}",

      // Receipts Tab Extended
      searchReceiptsPlaceholder: "Cari kedai, no. invois, atau penerangan...",
      allCategoriesOpt: "Semua Kategori",
      missingProofOnly: "Tiada Bukti Resit Sahaja",
      emptyReceiptsTitle: "Tiada resit untuk TT {year}",
      emptyReceiptsDesc: "Ambil gambar atau muat naik resit pertama TT {year} anda untuk membina arkib audit.",
      addFirstReceiptBtn: "+ Tambah Resit Pertama",
      batchImportBtn: "Import Pukal",
      attachedBadge: "Resit Dilampirkan",
      missingBadge: "Tiada Resit",

      // Scanner Modal
      scannerPhotoTab: "Foto Resit (OCR)",
      scannerQrTab: "Pengimbas QR MyInvois",
      scannerSnapBtn: "Ambil Foto / Muat Naik",
      scannerPersonalClaim: "Pelepasan Cukai Peribadi",
      scannerBusinessClaim: "Perbelanjaan Perniagaan (Sek 33)",
      scannerMerchantLabel: "Nama Kedai / Penjual",
      scannerAmountLabel: "Jumlah (RM)",
      scannerDateLabel: "Tarikh Resit",
      scannerCategoryLabel: "Kategori Pelepasan LHDN",
      scannerSaveBtn: "Simpan Resit",
      scannerUpdateBtn: "Kemaskini Resit",
      scannerCancelBtn: "Batal",

      // Filing Tools & Pricing
      toolsSheetTitle: "Kertas Kerja e-Filing & Kalkulator",
      toolsTabFormBe: "Panduan e-BE / e-B",
      toolsTabSimulator: "Kalkulator Cukai",
      toolsTabWhatIf: "Simulasi Had",
      toolsTabJoint: "Bersama vs Asing",
      pricingTitle: "Naik Taraf ke CukaiKu Pro",
      pricingSub: "Imbasan AI Tanpa Had + Pek Audit LHDN 7-Tahun",
    };
  }

  return {
    // Navigation & Header
    navDashboard: "Dashboard",
    navReceipts: "Receipts",
    navScan: "Scan",
    navReliefs: "Reliefs",
    navSubmissions: "Submissions",
    navSubmissionsDesktop: "Submissions & Profile",
    tagline: "LHDN Relief & e-Invoice Vault",
    notSynced: "Not Synced",
    sidebarNav: "Navigation",
    workpapersBtn: "e-Filing Workpapers",
    vaultSidebarTitle: "LHDN 7-Year Audit Vault",
    vaultSidebarDesc: "YA {year} records retained until {until} under ITA Section 82A.",

    // Dashboard & Hero
    dropzoneTitle: "Upload / Drag & Drop PDF Receipt or LHDN e-Invoice",
    dropzoneBadge: "~300KB Auto-Archive",
    dropzoneSub: "Drop any clinic bill, Shopee/Lazada PDF, broadband invoice, or MyInvois QR receipt for instant AI extraction.",
    scanMyInvoisQr: "Scan MyInvois QR",
    selectPdfImage: "Select PDF / Image",
    filingProfile: "LHDN Filing Profile:",
    salariedMode: "Salaried (e-BE)",
    freelancerMode: "Freelancer / Mixed (e-B)",
    personalReliefsTab: "Personal Reliefs",
    businessExpensesTab: "Business Expenses",
    deadlineBe: "Form e-BE Deadline: 30 April",
    deadlineB: "Form e-B Deadline: 30 June",
    daysLeft: "days left",
    cp500Active: "CP500 Bi-Monthly Instalments Active",
    verifyMyInvois: "Verify MyInvois QR",
    missingQrSuffix: "receipt(s) without MyInvois QR UUID",
    totalReliefsTitle: "Total Claimable Reliefs",
    businessExpensesTitle: "Business Deductible Expenses (Sec 33)",
    taxBracket: "Tax Bracket",
    reliefUtilization: "Expense Relief Utilization",
    targetLabel: "target",
    taxSavedReceipts: "Tax Saved (Receipts)",
    estRefund: "Est. LHDN Refund",
    estBalanceDue: "Est. Balance Due",
    keepUntilLabel: "LHDN 7-year audit retention: Keep until",
    editIncomeBtn: "Edit Income",
    toolFormBe: "Form BE",
    toolSimulator: "Simulator",
    toolWhatIf: "What-If",
    toolJointSep: "Joint/Sep",
    pinnedCapsTitle: "Pinned Relief Progress",
    customizePins: "Customize Pins",
    maxCapReached: "Max cap reached",
    remainingLabel: "remaining",
    recurringTitle: "1-Tap Monthly Recurring Bills",
    logBillNow: "Log This Month",
    loggingBill: "Logging...",
    loggedThisMonth: "Logged",
    goalTitle: "Personal Tax-Saving Goal",
    savedLabel: "saved",
    goalLabel: "Goal",
    editBtn: "Edit",
    cancelBtn: "Cancel",
    saveBtn: "Save",
    paydayBanner: "Payday Reminder! Log your latest payslip & monthly bills now.",
    paydaySub: "Payday set to day {day} each month in Settings.",
    uploadPayslipBtn: "Upload Payslip/EA Form",
    lifeStageTitle: "1-Tap Life-Stage Setup",
    changeAnytimeSettings: "Change anytime in Settings",
    maximizeReliefsTitle: "Maximize Your Reliefs",
    before31Dec: "Before 31 Dec",
    unusedCapRemaining: "unused cap remaining",
    addBtn: "+ Add",
    missingReceiptsTitle: "missing receipt proof",
    missingReceiptsSub: "Attach receipts to stay LHDN audit-ready for 7 years",
    emptyStartTitle: "Start tracking YA {year} receipts",
    emptyStartDesc: "Snap your first receipt with AI auto-categorization, or load sample Malaysian reliefs to explore how sub-limits work.",
    scanFirstReceipt: "+ Scan First Receipt",
    loadSampleData: "Load Sample YA {year} Data",

    // Quick Start Checklist & Guide Modal
    quickStartTitle: "Where to Start — YA {year} Quick Setup",
    doneLabel: "done",
    quickStartSub: "Follow these 4 quick steps to maximize your LHDN tax refund.",
    step1Title: "1. Set Income & Form (e-BE / e-B)",
    step1Desc: "Enter your annual salary or upload your Payslip / EA Form for accurate tax bracket calculation.",
    step1CtaEdit: "Edit Profile",
    step1CtaSet: "Set Income",
    step2Title: "2. Snap First Receipt or MyInvois QR",
    step2Desc: "Take a photo of a clinic, bookshop, or sports receipt — AI auto-tags the LHDN category.",
    step2CtaAnother: "Scan Another",
    step2CtaScan: "Scan Receipt",
    step3Title: "3. Check Remaining Relief Caps",
    step3Desc: "See unused tax savings in Lifestyle (RM 2,500), Medical (RM 10,000), & SSPN.",
    step3Cta: "View Caps",
    step4Title: "4. Back Up 7-Year Audit Trail",
    step4Desc: "1-click Google Sign-In keeps your receipts synced across phone and PC.",
    step4CtaSynced: "Synced",
    step4CtaSignIn: "Sign In",
    trySampleBtn: "Try Sample YA {year} Data",
    howItWorksBtn: "How CukaiKu Works",
    dismissGuide: "Dismiss guide",
    guideModalTitle: "How to Use CukaiKu",
    guideModalSub: "Malaysia LHDN Tax Relief & 7-Year Receipt Vault",
    pillar1Title: "Set Your Income & Form Mode",
    pillar1Desc: "Choose Salaried (Form e-BE, due 30 April) or Freelancer / Mixed Income (Form e-B, due 30 June). Upload your Payslip or EA Form to auto-fill PCB & EPF.",
    pillar2Title: "Snap Receipts or Scan MyInvois QR",
    pillar2Desc: "Tap the green Scan button anytime (even offline in clinics or basements). AI extracts the merchant, date, and RM amount and matches the right LHDN relief cap.",
    pillar3Title: "File MyTax & Keep 7-Year Audit Pack",
    pillar3Desc: "Track remaining Lifestyle, Sports, Medical & SSPN caps all year. At tax time, open e-Filing Workpapers for a Form BE/B cheat sheet & 1-click ZIP archive.",
    guideStartScanning: "Scan First Receipt",
    guideSetIncomeFirst: "1. Set Income First",

    // Reliefs Tab
    pinGuideText: "Tap ★ on any relief to pin it onto your Dashboard",
    pinnedCountLabel: "pinned",
    filterAll: "All",
    filterLifestyle: "Lifestyle & Sports",
    filterMedical: "Medical",
    filterSavings: "EPF & Insurance",
    filterFamily: "Family",
    filterHousing: "Housing & EV",
    maxedBadge: "Maxed",

    // Receipts Tab
    retentionUntil: "LHDN 7-year retention until",
    receiptsTabBtn: "Receipts",
    annualDocsTabBtn: "Annual Docs",
    auditZipBtn: "Audit ZIP",

    // Settings Tab
    personalizationTitle: "Personalization & Smart Reminders",
    lifeStagePresetLabel: "1-Tap Life-Stage Preset",
    taxSavingGoalLabel: "Tax-Saving Goal (RM)",
    paydayReminderLabel: "Monthly Payday Reminder (Day 1–31)",
    recurringBillsMgrTitle: "1-Tap Monthly Recurring Bills",
    savedCount: "saved",
    addRecurringBtn: "+ Add Recurring Bill",
    removeBtn: "Remove",
    filingModeTitle: "LHDN e-Filing Submission Form (YA {year})",
    filingModeSub: "Switch between Salaried (Form e-BE, due 30 April) and Freelancer / Sole Proprietor / Mixed Income (Form e-B, due 30 June + CP500).",
    incomeEstimateTitle: "YA {year} Income & Tax Estimate",
    incomeEstimateSub: "Upload a payslip / EA Form to auto-fill, or edit figures directly.",
    annualIncomeLabel: "Annual Income (RM)",
    pcbPaidLabel: "PCB / MTD Paid YTD (RM)",
    zakatPaidLabel: "Zakat / Fitrah Rebate (RM)",
    statusReliefsTitle: "Status & Family Reliefs (No Receipt Needed)",
    cloudVaultTitle: "Cloud Sync & 7-Year LHDN Vault",
    cloudActiveTitle: "CukaiKu Cloud Sync: Active",
    signOutBtn: "Sign Out",
    upgradeBtn: "Upgrade (RM 29)",
    managePassBtn: "Manage Pass",
    freeStarterLabel: "Free Starter",
    proPassLabel: "Pro Pass",
    familyPassLabel: "Family & Joint Pass",
    localBrowserMode: "Currently in Local Browser Mode",
    localBrowserDesc: "Receipts and numbers entered on this device stay in this browser only. To sync across your phone and PC, sign in below with the same account on both devices.",
    useEmailPassword: "Use email & password instead",
    enableDriveBtn: "Enable Google Drive Archive (Optional)",
    pushLocalBtn: "Push Local Receipts to Cloud",
    backupDriveBtn: "Back Up YA {year} to Drive",
    statusIndividual: "Individual & Dependent Relatives",
    statusDisabledIndividual: "Disabled Individual (OKU)",
    statusSpouse: "Spouse Relief (No Income / Joint)",
    statusDisabledSpouse: "Disabled Spouse (OKU)",
    statusChildUnder18: "Unmarried Children (Under 18)",
    statusChildHigherEd: "Children 18+ (Diploma / Degree)",
    statusDisabledChild: "Disabled Child (OKU)",
    dataToolsTitle: "Sample & Reset Data",
    clearYearBtn: "Clear Local YA {year} Data",

    // Receipts Tab Extended
    searchReceiptsPlaceholder: "Search merchant, invoice no., or description...",
    allCategoriesOpt: "All Categories",
    missingProofOnly: "Missing Receipt Proof Only",
    emptyReceiptsTitle: "No receipts for YA {year} yet",
    emptyReceiptsDesc: "Snap or upload your first YA {year} receipt to build your audit vault.",
    addFirstReceiptBtn: "+ Add First Receipt",
    batchImportBtn: "Batch AI",
    attachedBadge: "Receipt Attached",
    missingBadge: "Missing Receipt",

    // Scanner Modal
    scannerPhotoTab: "Receipt Photo (OCR)",
    scannerQrTab: "MyInvois QR Scanner",
    scannerSnapBtn: "Take Photo / Upload",
    scannerPersonalClaim: "Personal Tax Relief",
    scannerBusinessClaim: "Business Deductible Expense",
    scannerMerchantLabel: "Merchant Name",
    scannerAmountLabel: "Amount (RM)",
    scannerDateLabel: "Receipt Date",
    scannerCategoryLabel: "LHDN Relief Category",
    scannerSaveBtn: "Save Receipt",
    scannerUpdateBtn: "Update Receipt",
    scannerCancelBtn: "Cancel",

    // Filing Tools & Pricing
    toolsSheetTitle: "e-Filing Workpapers & Calculators",
    toolsTabFormBe: "Form e-BE / e-B Sheet",
    toolsTabSimulator: "Tax Calculator",
    toolsTabWhatIf: "What-If",
    toolsTabJoint: "Joint vs Separate",
    pricingTitle: "Upgrade to CukaiKu Pro",
    pricingSub: "Unlimited AI Receipt Vision + 7-Year LHDN Audit Pack",
  };
}
