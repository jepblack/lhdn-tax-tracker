const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

/**
 * Fast (~1s) multimodal vision/text JSON extraction via Groq's Llama 4 Scout.
 * Works with either extracted PDF text or a base64 JPEG/PNG image.
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 180)}`);
    }

    const json = await res.json();
    const raw = String(json.choices?.[0]?.message?.content || "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse((match ? match[0] : raw).trim());
  } finally {
    clearTimeout(timer);
  }
}
