import { getReliefCategories } from "./lhdn-rules";
import { FormBeBaseline, TaxExpense, TaxYear } from "./types";

export type FormBeCategoryAuditStatus =
  | "verified"
  | "shortfall"
  | "unclaimed"
  | "none";

export interface FormBeCategoryAuditRow {
  catId: string;
  ref: string;
  shortName: string;
  categoryCap: number;
  declared: number;
  verifiedRaw: number;
  verifiedClaimable: number;
  shortfall: number;
  unclaimedExtra: number;
  excessAboveCap: number;
  verifiedReceiptCount: number;
  placeholderAmount: number;
  status: FormBeCategoryAuditStatus;
}

export interface FormBeAuditSummary {
  rows: FormBeCategoryAuditRow[];
  byCategory: Record<string, FormBeCategoryAuditRow>;
  declaredCategoryCount: number;
  verifiedCategoryCount: number;
  totalDeclaredExpenseReliefs: number;
  totalVerifiedClaimable: number;
  totalVerifiedRaw: number;
  totalShortfall: number;
  totalUnclaimedExtra: number;
  isAuditReady: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isVerifiedAuditExpense(exp: TaxExpense): boolean {
  if (exp.subCategoryId === "parents_allowance") return true;
  const hasRealUrl =
    Boolean(exp.receiptUrl) && exp.receiptUrl !== "sample://attached";
  return hasRealUrl || Boolean(exp.receiptPath);
}

export function isFormBePlaceholderExpense(exp: TaxExpense): boolean {
  return (
    !exp.receiptUrl &&
    !exp.receiptPath &&
    Boolean(
      exp.description?.includes("attach supporting receipts for LHDN 7-year audit")
    )
  );
}

/**
 * Computes LHDN cap-aware reconciliation between declared Form e-BE category figures
 * and actual uploaded supporting receipts/statements for a given Year of Assessment.
 */
export function computeFormBeReconciliation(
  taxYear: TaxYear,
  annualIncome: number,
  allExpenses: TaxExpense[],
  baseline: FormBeBaseline | null | undefined
): FormBeAuditSummary | null {
  if (!baseline) return null;

  const yearExpenses = allExpenses.filter(
    (e) =>
      e.taxYear === taxYear &&
      e.claimType !== "business_deductible" &&
      e.categoryId !== "business_expense"
  );

  const donationsRate = taxYear <= 2019 ? 0.07 : 0.1;
  const categories = getReliefCategories(taxYear).map((cat) =>
    cat.id === "approved_donations"
      ? {
          ...cat,
          maxLimit: Math.max(0, Math.round((annualIncome || 0) * donationsRate)),
        }
      : cat
  );
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const allCatIds = Array.from(
    new Set([
      ...categories.map((c) => c.id),
      ...Object.keys(baseline.declaredByCategory || {}),
    ])
  );

  const byCategory: Record<string, FormBeCategoryAuditRow> = {};
  const activeRows: FormBeCategoryAuditRow[] = [];

  for (const catId of allCatIds) {
    const category = catMap.get(catId);
    const catExpenses = yearExpenses.filter((e) => e.categoryId === catId);
    const verifiedExpenses = catExpenses.filter(isVerifiedAuditExpense);
    const placeholderExpenses = catExpenses.filter(isFormBePlaceholderExpense);

    const placeholderAmount = round2(
      placeholderExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    );

    let verifiedRaw = 0;
    let rawClaimableBeforeParentCap = 0;
    const categoryCap = category ? category.maxLimit : Number.MAX_SAFE_INTEGER;

    if (category?.subCategories && category.subCategories.length > 0) {
      const assignedIds = new Set<string>();
      for (const sub of category.subCategories) {
        const subVerified = verifiedExpenses.filter(
          (e) => e.subCategoryId === sub.id
        );
        subVerified.forEach((e) => assignedIds.add(e.id));
        const subSpent = subVerified.reduce(
          (s, e) => s + (Number(e.amount) || 0),
          0
        );
        verifiedRaw += subSpent;
        rawClaimableBeforeParentCap += Math.min(subSpent, sub.maxLimit);
      }
      const unassigned = verifiedExpenses.filter((e) => !assignedIds.has(e.id));
      const unassignedSpent = unassigned.reduce(
        (s, e) => s + (Number(e.amount) || 0),
        0
      );
      verifiedRaw += unassignedSpent;
      rawClaimableBeforeParentCap += unassignedSpent;
    } else {
      verifiedRaw = verifiedExpenses.reduce(
        (s, e) => s + (Number(e.amount) || 0),
        0
      );
      rawClaimableBeforeParentCap = verifiedRaw;
    }

    verifiedRaw = round2(verifiedRaw);
    // LHDN Form e-BE truncates (floors) each relief category total to whole Ringgit
    const verifiedClaimable = Math.floor(
      Math.min(rawClaimableBeforeParentCap, categoryCap)
    );
    const declared = round2(baseline.declaredByCategory?.[catId] || 0);

    // Compare LHDN-valid claimable proof against what was declared on Form e-BE
    const shortfall =
      declared > 0 ? Math.max(0, round2(declared - verifiedClaimable)) : 0;
    const unclaimedExtra =
      verifiedClaimable > declared + 0.01
        ? round2(verifiedClaimable - declared)
        : 0;
    const excessAboveCap =
      verifiedRaw > verifiedClaimable + 0.01
        ? round2(verifiedRaw - verifiedClaimable)
        : 0;

    let status: FormBeCategoryAuditStatus = "none";
    if (declared > 0) {
      status = shortfall <= 0.01 ? "verified" : "shortfall";
    } else if (verifiedClaimable > 0.01) {
      status = "unclaimed";
    }

    const row: FormBeCategoryAuditRow = {
      catId,
      ref: category?.formBeRef || "BE",
      shortName: category?.shortName || catId,
      categoryCap: category ? category.maxLimit : declared,
      declared,
      verifiedRaw,
      verifiedClaimable,
      shortfall,
      unclaimedExtra,
      excessAboveCap,
      verifiedReceiptCount: verifiedExpenses.length,
      placeholderAmount,
      status,
    };

    byCategory[catId] = row;
    if (declared > 0 || verifiedRaw > 0) {
      activeRows.push(row);
    }
  }

  const declaredCategoryCount = activeRows.filter((r) => r.declared > 0).length;
  const verifiedCategoryCount = activeRows.filter(
    (r) => r.declared > 0 && r.status === "verified"
  ).length;
  const totalDeclaredExpenseReliefs = round2(
    activeRows.reduce((s, r) => s + r.declared, 0)
  );
  const totalVerifiedClaimable = round2(
    activeRows.reduce((s, r) => s + r.verifiedClaimable, 0)
  );
  const totalVerifiedRaw = round2(
    activeRows.reduce((s, r) => s + r.verifiedRaw, 0)
  );
  const totalShortfall = round2(
    activeRows.reduce((s, r) => s + r.shortfall, 0)
  );
  const totalUnclaimedExtra = round2(
    activeRows.reduce((s, r) => s + r.unclaimedExtra, 0)
  );

  return {
    rows: activeRows,
    byCategory,
    declaredCategoryCount,
    verifiedCategoryCount,
    totalDeclaredExpenseReliefs,
    totalVerifiedClaimable,
    totalVerifiedRaw,
    totalShortfall,
    totalUnclaimedExtra,
    isAuditReady: totalShortfall <= 0.01,
  };
}
