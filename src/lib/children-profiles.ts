export interface ChildProfile {
  id: string;
  name: string;
  birthOrMyKad: string; // DOB (YYYY-MM-DD / DD/MM/YYYY), MyKad (YYMMDD...), or age
}

const CHILDREN_STORAGE_KEY = "cukaiku_children_profiles_v1";

export function loadChildrenProfiles(): ChildProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHILDREN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChildrenProfiles(list: ChildProfile[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Derives a child's age in the given LHDN Tax Year from:
 * - Plain integer age (only accurate for current year, but supported)
 * - ISO date YYYY-MM-DD
 * - Slash/dash date DD/MM/YYYY
 * - Malaysian MyKad / MyKid 12-digit (or 6-digit YYMMDD prefix)
 */
export function getChildAgeInYear(
  birthOrMyKad: string,
  taxYear: number
): number | null {
  const raw = birthOrMyKad.trim();
  if (!raw) return null;

  // Plain age like "4" or "12"
  if (/^\d{1,2}$/.test(raw)) {
    const ageNow = Number(raw);
    const currentYear = new Date().getFullYear();
    return Math.max(0, ageNow + (taxYear - currentYear));
  }

  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const birthYear = Number(isoMatch[1]);
    return Math.max(0, taxYear - birthYear);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmyMatch) {
    const birthYear = Number(dmyMatch[3]);
    return Math.max(0, taxYear - birthYear);
  }

  // Malaysian MyKad / MyKid: starts with YYMMDD (with or without hyphens)
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 6) {
    const yy = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2, 4));
    const dd = Number(digits.slice(4, 6));
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const currentTwoDigit = new Date().getFullYear() % 100;
      const birthYear = yy > currentTwoDigit + 1 ? 1900 + yy : 2000 + yy;
      return Math.max(0, taxYear - birthYear);
    }
  }

  return null;
}

export function checkCategoryAgeEligibility(
  categoryId: string,
  subCategoryId: string | null | undefined,
  taxYear: number,
  lang: "en" | "bm"
): string | null {
  const children = loadChildrenProfiles();
  if (children.length === 0) return null;

  const ages = children
    .map((c) => getChildAgeInYear(c.birthOrMyKad, taxYear))
    .filter((a): a is number => a !== null);

  if (ages.length === 0) return null;

  if (categoryId === "childcare") {
    const hasUnder6 = ages.some((a) => a <= 6);
    if (!hasUnder6) {
      return lang === "bm"
        ? `Semakan Umur Anak (TT ${taxYear}): Pelepasan Taska/Tadika hanya layak untuk anak berumur 6 tahun ke bawah. Umur anak yang direkodkan ialah ${ages.join(", ")} tahun.`
        : `Child Age Check (YA ${taxYear}): Childcare (Taska/Tadika) relief only applies to children aged 6 & below. Recorded children ages: ${ages.join(", ")}.`;
    }
  }

  if (categoryId === "breastfeeding" || subCategoryId === "breastfeeding") {
    const hasUnder2 = ages.some((a) => a <= 2);
    if (!hasUnder2) {
      return lang === "bm"
        ? `Semakan Umur Anak (TT ${taxYear}): Pelepasan peralatan penyusuan hanya layak untuk anak berumur 2 tahun ke bawah. Umur anak yang direkodkan ialah ${ages.join(", ")} tahun.`
        : `Child Age Check (YA ${taxYear}): Breastfeeding equipment relief only applies to children aged 2 & below. Recorded children ages: ${ages.join(", ")}.`;
    }
  }

  return null;
}
