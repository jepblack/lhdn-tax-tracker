let cachedModelIds: string[] | null = null;
let cachedAt = 0;

async function getGroqActiveModelIds(apiKey: string): Promise<string[]> {
  if (cachedModelIds && Date.now() - cachedAt < 10 * 60 * 1000) {
    return cachedModelIds;
  }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const ids: string[] = Array.isArray(data.data)
      ? data.data
          .map((m: { id?: string; active?: boolean }) =>
            m.active === false ? "" : String(m.id || "")
          )
          .filter(Boolean)
      : [];
    cachedModelIds = ids;
    cachedAt = Date.now();
    return ids;
  } catch {
    return [];
  }
}

function pickCandidateModels(allIds: string[], needsVision: boolean): string[] {
  const skipPattern = /(whisper|tts|guard|prompt-guard|safeguard|orpheus|playai|distil-whisper|embedding|allam)/i;
  const usable = allIds.filter((id) => !skipPattern.test(id));

  if (needsVision) {
    const visionMatchers = [
      /qwen.*3\.8/i,
      /qwen.*3\.6/i,
      /qwen.*vl/i,
      /llama-4/i,
      /vision/i,
      /qwen/i,
    ];
    const picked: string[] = [];
    for (const rx of visionMatchers) {
      for (const id of usable) {
        if (rx.test(id) && !picked.includes(id)) picked.push(id);
      }
    }
    if (picked.length > 0) return picked.slice(0, 3);
    return ["qwen/qwen3.8-27b", "meta-llama/llama-4-maverick-17b-128e-instruct"];
  }

  // Text-only extraction (fast & ultra-reliable for text PDFs)
  const textMatchers = [
    /llama-3\.3-70b-versatile/i,
    /qwen.*3\.8/i,
    /qwen/i,
    /llama-3\.1-8b-instant/i,
    /llama/i,
  ];
  const picked: string[] = [];
  for (const rx of textMatchers) {
    for (const id of usable) {
      if (rx.test(id) && !picked.includes(id)) picked.push(id);
    }
  }
  if (picked.length > 0) return picked.slice(0, 3);
  return ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
}

/**
 * Fast (~1s) multimodal vision/text JSON extraction via Groq.
 * Auto-discovers active models on the account so deprecated model IDs never break scanning.
 */
export async function callGroqJson(params: {
  apiKey: string;
  prompt: string;
  textContent?: string | null;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const {
    apiKey,
    prompt,
    textContent,
    imageBase64,
    imageMimeType,
    maxTokens = 1000,
  } = params;

  const needsVision = !textContent && Boolean(imageBase64);
  const allIds = await getGroqActiveModelIds(apiKey);
  const candidates = pickCandidateModels(allIds, needsVision);

  const userContent = textContent
    ? `${prompt}\n\nDOCUMENT TEXT:\n${textContent.slice(0, 15000)}`
    : [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${imageMimeType || "image/jpeg"};base64,${imageBase64}`,
          },
        },
      ];

  let lastError = "No Groq model succeeded";

  for (const model of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = `${model} HTTP ${res.status}: ${errText.slice(0, 140)}`;
        continue;
      }

      const json = await res.json();
      const raw = String(json.choices?.[0]?.message?.content || "").trim();
      const match = raw.match(/\{[\s\S]*\}/);
      return JSON.parse((match ? match[0] : raw).trim());
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `Groq failed (${lastError}) [available=${allIds.slice(0, 5).join(",")}]`
  );
}
