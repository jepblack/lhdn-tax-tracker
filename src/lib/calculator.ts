import {
  getReliefCategories,
  getStatusReliefAmounts,
  getTaxBracketsForYear,
} from "./lhdn-rules";
import {
  CategorySummary,
  ReliefOpportunity,
  SubCategorySummary,
  TaxCalculationResult,
  TaxExpense,
  TaxProfile,
  TaxYear,
} from "./types";

export function calculateProgressiveTax(
  chargeableIncome: number,
  taxYear: TaxYear = 2026
): {
  tax: number;
  marginalRate: number;
} {
  if (chargeableIncome <= 0) {
    return { tax: 0, marginalRate: 0 };
  }

  const brackets = getTaxBracketsForYear(taxYear);
  for (const bracket of brackets) {
    if (chargeableIncome <= bracket.max) {
      const taxableInBracket = chargeableIncome - bracket.min;
      const tax = bracket.baseTax + taxableInBracket * bracket.rate;
      return {
        tax: Math.round(tax * 100) / 100,
        marginalRate: bracket.rate,
      };
    }
  }

  const last = brackets[brackets.length - 1];
  return {
    tax: Math.round((last.baseTax + (chargeableIncome - last.min) * last.rate) * 100) / 100,
    marginalRate: last.rate,
  };
}

export function calculateStatusReliefsTotal(profile: TaxProfile): number {
  const amounts = getStatusReliefAmounts(profile.taxYear);
  const s = profile.statusReliefs;
  let total = 0;

  if (s.individual) total += amounts.individual;
  if (s.disabledIndividual) total += amounts.disabledIndividual;
  if (s.spouse) total += amounts.spouse;
  if (s.disabledSpouse) total += amounts.disabledSpouse;
  total += (s.childrenUnder18 || 0) * amounts.childUnder18;
  total += (s.childrenHigherEd || 0) * amounts.childHigherEd;
  total += (s.disabledChildren || 0) * amounts.disabledChild;
  total += (s.disabledChildrenHigherEd || 0) * amounts.disabledChildHigherEd;

  return total;
}

/**
 * Computes the realistic maximum tax saving (in RM) achievable from claiming
 * LHDN expense reliefs given the taxpayer's gross annual income and status reliefs.
 */
export function calculateMaxTaxSavingGoal(profile: TaxProfile): number {
  const statusTotal = calculateStatusReliefsTotal(profile);
  const annualIncome = Math.max(0, profile.annualIncome || 0);
  const baseChargeable = Math.max(0, annualIncome - statusTotal);
  if (baseChargeable <= 0) return 0;

  const baseTaxObj = calculateProgressiveTax(baseChargeable, profile.taxYear);
  const baseRebate =
    baseChargeable > 0 && baseChargeable <= 35000
      ? profile.statusReliefs.spouse
        ? 800
        : 400
      : 0;
  const taxBeforeExpenses = Math.max(0, baseTaxObj.tax - baseRebate);

  const donationsRate = profile.taxYear <= 2019 ? 0.07 : 0.1;
  const totalMaxCategoryCaps = getReliefCategories(profile.taxYear).reduce(
    (sum, cat) =>
      sum +
      (cat.id === "approved_donations"
        ? Math.max(0, Math.round(annualIncome * donationsRate))
        : cat.maxLimit),
    0
  );

  const minChargeable = Math.max(0, baseChargeable - totalMaxCategoryCaps);
  const minTaxObj = calculateProgressiveTax(minChargeable, profile.taxYear);
  const minRebate =
    minChargeable > 0 && minChargeable <= 35000
      ? profile.statusReliefs.spouse
        ? 800
        : 400
      : 0;
  const taxAfterMaxExpenses = Math.max(0, minTaxObj.tax - minRebate);

  return Math.max(0, Math.round(taxBeforeExpenses - taxAfterMaxExpenses));
}

export function calculateTaxSummary(
  profile: TaxProfile,
  allExpenses: TaxExpense[]
): TaxCalculationResult {
  const yearExpenses = allExpenses.filter(
    (e) =>
      e.taxYear === profile.taxYear &&
      e.claimType !== "business_deductible" &&
      e.categoryId !== "business_expense"
  );
  const donationsRateForYear = profile.taxYear <= 2019 ? 0.07 : 0.1;
  const categories = getReliefCategories(profile.taxYear).map((cat) =>
    cat.id === "approved_donations"
      ? {
          ...cat,
          maxLimit: Math.max(0, Math.round((profile.annualIncome || 0) * donationsRateForYear)),
        }
      : cat
  );

  const categorySummaries: CategorySummary[] = categories.map((category) => {
    const catExpenses = yearExpenses.filter((e) => e.categoryId === category.id);
    const missingReceiptCount = catExpenses.filter(
      (e) =>
        !e.receiptPath &&
        !e.receiptUrl &&
        e.subCategoryId !== "parents_allowance"
    ).length;

    const subSummaries: SubCategorySummary[] = [];
    let rawClaimableBeforeParentCap = 0;
    let totalSpent = 0;

    if (category.subCategories && category.subCategories.length > 0) {
      // Track expenses mapped to known subcategories
      const assignedIds = new Set<string>();

      for (const sub of category.subCategories) {
        const subExpenses = catExpenses.filter((e) => e.subCategoryId === sub.id);
        subExpenses.forEach((e) => assignedIds.add(e.id));

        const spent = sumAmounts(subExpenses);
        const claimable = Math.min(spent, sub.maxLimit);
        const overflow = Math.max(0, spent - sub.maxLimit);
        const remaining = Math.max(0, sub.maxLimit - spent);

        totalSpent += spent;
        rawClaimableBeforeParentCap += claimable;

        subSummaries.push({
          subCategory: sub,
          spent,
          claimable,
          remaining,
          overflow,
          expenseCount: subExpenses.length,
          percentUsed: sub.maxLimit > 0 ? Math.min(100, Math.round((claimable / sub.maxLimit) * 100)) : 0,
        });
      }

      // Any uncategorized expenses under this parent category
      const unassigned = catExpenses.filter((e) => !assignedIds.has(e.id));
      const unassignedSpent = sumAmounts(unassigned);
      totalSpent += unassignedSpent;
      rawClaimableBeforeParentCap += unassignedSpent;
    } else {
      totalSpent = sumAmounts(catExpenses);
      rawClaimableBeforeParentCap = totalSpent;
    }

    const claimable = Math.min(rawClaimableBeforeParentCap, category.maxLimit);
    const remaining = Math.max(0, category.maxLimit - claimable);
    const overflow = Math.max(0, totalSpent - claimable);

    return {
      category,
      spent: round2(totalSpent),
      claimable: round2(claimable),
      remaining: round2(remaining),
      overflow: round2(overflow),
      expenseCount: catExpenses.length,
      missingReceiptCount,
      percentUsed:
        category.maxLimit > 0
          ? Math.min(100, Math.round((claimable / category.maxLimit) * 100))
          : 0,
      subSummaries,
    };
  });

  const statusReliefTotal = calculateStatusReliefsTotal(profile);
  const expenseReliefSpent = round2(
    categorySummaries.reduce((acc, c) => acc + c.spent, 0)
  );
  const expenseReliefClaimable = round2(
    categorySummaries.reduce((acc, c) => acc + c.claimable, 0)
  );
  const approvedDonationsClaimable = round2(
    categorySummaries.find((c) => c.category.id === "approved_donations")
      ?.claimable || 0
  );
  // LHDN Form e-BE Page 1 deducts Section 44(6) Approved Donations from Aggregate Income
  // to yield Total Income (Jumlah Pendapatan), before subtracting Pelepasan (Total Reliefs).
  const totalIncome = Math.max(
    0,
    round2(profile.annualIncome - approvedDonationsClaimable)
  );
  const expenseReliefWithoutDonations = round2(
    Math.max(0, expenseReliefClaimable - approvedDonationsClaimable)
  );
  const expenseReliefRemaining = round2(
    categorySummaries.reduce((acc, c) => acc + c.remaining, 0)
  );
  const expenseReliefOverflow = round2(
    categorySummaries.reduce((acc, c) => acc + c.overflow, 0)
  );

  const totalReliefs = round2(statusReliefTotal + expenseReliefWithoutDonations);
  const chargeableIncome = Math.max(0, round2(totalIncome - totalReliefs));
  const chargeableIncomeWithoutExpenseReliefs = Math.max(
    0,
    round2(profile.annualIncome - statusReliefTotal)
  );

  const { tax: grossTax, marginalRate } = calculateProgressiveTax(
    chargeableIncome,
    profile.taxYear
  );
  const { tax: grossTaxWithoutExpenseReliefs } = calculateProgressiveTax(
    chargeableIncomeWithoutExpenseReliefs,
    profile.taxYear
  );

  // Small income rebate: RM400 if chargeable income <= RM35,000 (additional RM400 if spouse relief claimed)
  let smallIncomeRebate = 0;
  if (chargeableIncome > 0 && chargeableIncome <= 35000) {
    smallIncomeRebate = profile.statusReliefs.spouse ? 800 : 400;
  }

  const zakatRebate = Math.max(0, profile.zakatPaid || 0);
  const otherTaxCredits = Math.max(0, profile.otherTaxCredits || 0);
  const netTaxPayable = Math.max(
    0,
    round2(grossTax - smallIncomeRebate - zakatRebate - otherTaxCredits)
  );

  const taxSavedByExpenseReliefs = Math.max(
    0,
    round2(grossTaxWithoutExpenseReliefs - grossTax)
  );

  const estimatedRefund = round2(
    (profile.pcbPaid || 0) + (profile.cp500Paid || 0) - netTaxPayable
  );

  // Highlight top high-ROI unused relief opportunities
  const highRoiIds = new Set([
    "lifestyle",
    "sports",
    "prs_annuity",
    "epf_life_insurance",
    "edu_med_insurance",
    "socso",
    "medical_self",
    "sspn",
  ]);

  const opportunities: ReliefOpportunity[] = categorySummaries
    .filter((s) => s.remaining > 0 && highRoiIds.has(s.category.id))
    .map((s) => {
      const estimatedTaxSavings = round2(s.remaining * marginalRate);
      let priority: "high" | "medium" | "low" = "medium";
      if (
        s.category.id === "lifestyle" ||
        s.category.id === "sports" ||
        s.category.id === "prs_annuity" ||
        s.category.id === "socso"
      ) {
        priority = "high";
      } else if (s.category.id === "sspn" && profile.statusReliefs.childrenUnder18 === 0 && profile.statusReliefs.childrenHigherEd === 0) {
        priority = "low";
      }

      return {
        categoryId: s.category.id,
        categoryName: s.category.shortName,
        remainingCap: s.remaining,
        estimatedTaxSavings,
        priority,
        tip: s.category.tips,
      };
    })
    .filter((o) => o.priority !== "low")
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
      return b.estimatedTaxSavings - a.estimatedTaxSavings;
    })
    .slice(0, 5);

  return {
    taxYear: profile.taxYear,
    annualIncome: profile.annualIncome,
    approvedDonationsClaimable,
    totalIncome,
    statusReliefTotal,
    expenseReliefSpent,
    expenseReliefClaimable,
    expenseReliefRemaining,
    expenseReliefOverflow,
    totalReliefs,
    chargeableIncome,
    chargeableIncomeWithoutExpenseReliefs,
    grossTax,
    zakatRebate,
    smallIncomeRebate,
    netTaxPayable,
    taxSavedByExpenseReliefs,
    marginalRate,
    pcbPaid: profile.pcbPaid || 0,
    estimatedRefund,
    // LHDN 7-year retention from filing year (YA 2026 filed in 2027 -> keep until 2034)
    retentionUntilYear: profile.taxYear + 8,
    categorySummaries,
    opportunities,
  };
}

function sumAmounts(expenses: TaxExpense[]): number {
  return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatRM(amount: number, showDecimals = false): string {
  return `RM ${amount.toLocaleString("en-MY", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })}`;
}
