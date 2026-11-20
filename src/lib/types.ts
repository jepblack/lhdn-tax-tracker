export type TaxYear = 2025 | 2026;

export interface ReliefSubCategory {
  id: string;
  name: string;
  maxLimit: number;
  description: string;
  examples: string[];
}

export interface ReliefCategory {
  id: string;
  name: string;
  shortName: string;
  group: "medical" | "lifestyle" | "savings" | "family" | "housing";
  maxLimit: number;
  formBeRef: string;
  description: string;
  tips: string;
  icon: string;
  subCategories?: ReliefSubCategory[];
}

export interface StatusReliefs {
  individual: boolean;
  disabledIndividual: boolean;
  spouse: boolean;
  disabledSpouse: boolean;
  childrenUnder18: number;
  childrenHigherEd: number;
  disabledChildren: number;
  disabledChildrenHigherEd: number;
}

export interface TaxProfile {
  taxYear: TaxYear;
  annualIncome: number;
  zakatPaid: number;
  pcbPaid: number;
  statusReliefs: StatusReliefs;
}

export type ArchiveCategory =
  | "medical"
  | "dental"
  | "education"
  | "donation"
  | "insurance"
  | "sports"
  | "books"
  | "computer_or_phone"
  | "childcare"
  | "travel"
  | "business_expense"
  | "personal"
  | "other";

export interface LhdnReceiptItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface LhdnReceiptMetadata {
  file_pdf: string;
  capture_date: string;
  transaction_date: string;
  merchant_name: string;
  merchant_registration_or_tax_id: string;
  receipt_number: string;
  payment_method: string;
  card_last4: string;
  currency: string;
  amount_paid: number;
  sst_or_tax_amount: number;
  tax_inclusive: boolean;
  category: ArchiveCategory;
  lhdn_relief_or_expense_type: string;
  items: LhdnReceiptItem[];
  ocr_confidence: "high" | "medium" | "low";
  needs_review: boolean;
  review_reason: string;
  original_file_hash: string;
  notes: string;
}

export interface TaxExpense {
  id: string;
  taxYear: TaxYear;
  categoryId: string;
  subCategoryId?: string | null;
  merchant: string;
  description: string;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  invoiceNumber?: string;
  receiptPath?: string | null;
  receiptUrl?: string | null; // Object URL / signed URL / local data URL
  receiptMimeType?: string | null;
  receiptFileName?: string | null;
  jsonPath?: string | null;
  metadata?: LhdnReceiptMetadata | null;
  aiExtracted?: boolean;
  createdAt: string;
}

export interface SubCategorySummary {
  subCategory: ReliefSubCategory;
  spent: number;
  claimable: number;
  remaining: number;
  overflow: number;
  expenseCount: number;
  percentUsed: number;
}

export interface CategorySummary {
  category: ReliefCategory;
  spent: number;
  claimable: number;
  remaining: number;
  overflow: number;
  expenseCount: number;
  missingReceiptCount: number;
  percentUsed: number;
  subSummaries: SubCategorySummary[];
}

export interface ReliefOpportunity {
  categoryId: string;
  categoryName: string;
  remainingCap: number;
  estimatedTaxSavings: number;
  priority: "high" | "medium" | "low";
  tip: string;
}

export interface TaxCalculationResult {
  taxYear: TaxYear;
  annualIncome: number;
  statusReliefTotal: number;
  expenseReliefSpent: number;
  expenseReliefClaimable: number;
  expenseReliefRemaining: number;
  expenseReliefOverflow: number;
  totalReliefs: number;
  chargeableIncome: number;
  chargeableIncomeWithoutExpenseReliefs: number;
  grossTax: number;
  zakatRebate: number;
  smallIncomeRebate: number;
  netTaxPayable: number;
  taxSavedByExpenseReliefs: number;
  marginalRate: number;
  pcbPaid: number;
  estimatedRefund: number; // positive = refund, negative = balance payable
  retentionUntilYear: number;
  categorySummaries: CategorySummary[];
  opportunities: ReliefOpportunity[];
}

export type ReceiptEligibility = "eligible" | "partial" | "uncertain" | "rejected";

export interface SuggestedReliefOption {
  categoryId: string;
  subCategoryId?: string | null;
  label: string;
  reason: string;
}

export interface ReceiptScanResult {
  eligibility: ReceiptEligibility;
  merchant: string;
  date: string;
  amount: number; // Claimable amount (0 if rejected)
  totalAmount: number; // Full receipt total
  invoiceNumber?: string;
  description?: string;
  suggestedCategoryId: string | null;
  suggestedSubCategoryId?: string | null;
  suggestedOptions?: SuggestedReliefOption[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
  rejectionReason?: string;
  excludedItems?: string[];
  scanEngine?: "ai" | "local-ocr";
  rawText?: string;
  // Extended LHDN Archiving fields
  archiveCategory?: ArchiveCategory;
  merchantRegistrationOrTaxId?: string;
  paymentMethod?: string;
  cardLast4?: string;
  currency?: string;
  sstOrTaxAmount?: number;
  taxInclusive?: boolean;
  items?: LhdnReceiptItem[];
  needsReview?: boolean;
  reviewReason?: string;
  imageQualityIssue?: string;
}

export type AnnualDocType =
  | "ea_form"
  | "kwsp_statement"
  | "insurance_statement"
  | "loan_interest_statement"
  | "form_be_proof"
  | "other_doc";

export interface AnnualTaxDoc {
  id: string;
  taxYear: TaxYear;
  docType: AnnualDocType;
  label: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
  storageProvider: "gdrive" | "local";
}

export interface AnnualDocExtraction {
  docType: AnnualDocType;
  providerName: string;
  annualIncome: number;
  pcbPaid: number;
  zakatPaid: number;
  epfEmployee: number;
  socsoEisEmployee: number;
  lifeInsuranceAmount: number;
  medicalInsuranceAmount: number;
  housingLoanInterest: number;
  summaryNote: string;
  confidence: "high" | "medium" | "low";
}
