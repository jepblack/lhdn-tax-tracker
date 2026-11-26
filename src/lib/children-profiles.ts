export interface ChildProfile {
  id: string;
  name: string;
  birthOrMyKad: string; // Stored strictly as YYYY-MM, YYYY, or plain age (raw MyKad is immediately sanitized!)
}

const CHILDREN_STORAGE_KEY = "cukaiku_children_profiles_v1";

/**
 * PDPA Data Minimization:
 * Converts any entered Malaysian MyKad / MyKid (YYMMDD-PB-#### or 12 digits) or full DOB
 * into Birth Year & Month ONLY ("YYYY-MM") so raw IC numbers are NEVER persisted to storage.
 */
export function sanitizeChildBirthInput(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  // Plain integer age like "4" or "12"
  if (/^\d{1,2}$/.test(raw)) {
    const ageNow = Number(raw);
    const birthYear = new Date().getFullYear() - ageNow;
    return String(birthYear);
  }

  // Already YYYY or YYYY-MM
  const ymMatch = raw.match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (ymMatch) {
    const yr = Number(ymMatch[1]);
    const mo = ymMatch[2] ? String(Number(ymMatch[2])).padStart(2, "0") : "";
    return mo ? `${yr}-${mo}` : `${yr}`;
  }

  // ISO date YYYY-MM-DD -> keep YYYY-MM only
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const yr = Number(isoMatch[1]);
    const mo = String(Number(isoMatch[2])).padStart(2, "0");
    return `${yr}-${mo}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY -> keep YYYY-MM only
  const dmyMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmyMatch) {
    const yr = Number(dmyMatch[3]);
    const mo = String(Number(dmyMatch[2])).padStart(2, "0");
    return `${yr}-${mo}`;
  }

  // Malaysian MyKad / MyKid (6 to 12 digits starting with YYMMDD) -> convert to YYYY-MM & discard IC!
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 6) {
    const yy = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2, 4));
    const dd = Number(digits.slice(4, 6));
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const currentTwoDigit = new Date().getFullYear() % 100;
      const birthYear = yy > currentTwoDigit + 1 ? 1900 + yy : 2000 + yy;
      return `${birthYear}-${String(mm).padStart(2, "0")}`;
    }
  }

  return raw.replace(/\d{6,}/g, "[REDACTED]");
}

export function loadChildrenProfiles(): ChildProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHILDREN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Auto-sanitize any legacy stored MyKad numbers on read
    const sanitized = parsed.map((c: ChildProfile) => ({
      ...c,
      birthOrMyKad: sanitizeChildBirthInput(String(c.birthOrMyKad || "")),
    }));
    window.localStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return [];
  }
}

export function saveChildrenProfiles(list: ChildProfile[]): void {
  if (typeof window === "undefined") return;
  try {
    const sanitized = list.map((c) => ({
      ...c,
      birthOrMyKad: sanitizeChildBirthInput(c.birthOrMyKad),
    }));
    window.localStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // ignore
  }
}

export function getChildAgeInYear(
  birthOrMyKad: string,
  taxYear: number
): number | null {
  const clean = sanitizeChildBirthInput(birthOrMyKad);
  if (!clean) return null;

  const yrMatch = clean.match(/^(\d{4})/);
  if (yrMatch) {
    return Math.max(0, taxYear - Number(yrMatch[1]));
  }
  if (/^\d{1,2}$/.test(clean)) {
    const ageNow = Number(clean);
    return Math.max(0, ageNow + (taxYear - new Date().getFullYear()));
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
