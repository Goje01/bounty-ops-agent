async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = 10,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isTemporaryError =
      error?.status === 503 ||
      error?.code === 503 ||
      error?.message?.includes("503") ||
      error?.message?.includes("high demand") ||
      error?.message?.includes("overloaded");

    if (retries > 0 && isTemporaryError) {
      await new Promise((res) => setTimeout(res, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

function isDailyQuotaExhausted(error: any): boolean {
  return (
    error?.status === 429 &&
    typeof error?.message === "string" &&
    error.message.includes("PerDayPerProjectPerModel")
  );
}

async function callGeminiOnce(
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env to enable AI-powered answers."
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err: any = new Error(`Gemini API error (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no usable response.");
  }
  return text;
}

function getModelChain(): string[] {
  const primary = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const fallbacks = ["gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"].filter(
    (m) => m !== primary
  );
  return [primary, ...fallbacks];
}

export async function askGemini(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const models = getModelChain();
  let lastError: unknown;

  for (const model of models) {
    try {
      return await callWithRetry(() => callGeminiOnce(model, systemPrompt, userMessage));
    } catch (err) {
      lastError = err;
      if (isDailyQuotaExhausted(err)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}