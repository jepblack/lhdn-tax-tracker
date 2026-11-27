const GEMINI_PREFERRED_MODEL = "gemini-3.8-flash";

let cachedGeminiModels: string[] | null = null;
let cachedGeminiAt = 0;

/**
 * Discovers active Gemini vision/text models for the configured API key,
 * falling back to known stable Flash models so deprecated preview IDs never break parsing.
 */
export async function getActiveGeminiVisionModels(
  apiKey: string
): Promise<string[]> {
  if (cachedGeminiModels && Date.now() - cachedGeminiAt < 10 * 60 * 1000) {
    return cachedGeminiModels;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`
    );
    if (res.ok) {
      const data = await res.json();
      const all: Array<{ name?: string; supportedGenerationMethods?: string[] }> =
        Array.isArray(data.models) ? data.models : [];
      const usable = all
        .filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent")
        )
        .map((m) => String(m.name || "").replace(/^models\//, ""))
        .filter(
          (id) =>
            id &&
            !/(embedding|tts|imagen|veo|aqa|robotics|computer-use)/i.test(id)
        );

      const picked: string[] = [];
      const matchers = [
        /gemini-3\.8-flash$/i,
        /gemini-3\.\d+-flash$/i,
        /gemini-2\.5-flash$/i,
        /gemini-2\.0-flash$/i,
        /^gemini-.*flash(?!.*lite)/i,
        /flash-lite/i,
        /flash/i,
        /gemini/i,
      ];
      for (const rx of matchers) {
        for (const id of usable) {
          if (rx.test(id) && !picked.includes(id)) picked.push(id);
        }
      }
      if (picked.length > 0) {
        cachedGeminiModels = picked.slice(0, 5);
        cachedGeminiAt = Date.now();
        return cachedGeminiModels;
      }
    }
  } catch {
    // ignore discovery errors
  }
  return [
    GEMINI_PREFERRED_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ];
}
