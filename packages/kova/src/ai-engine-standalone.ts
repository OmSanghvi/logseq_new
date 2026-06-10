/**
 * Standalone AI engine for KOVA — uses any OpenAI-compatible endpoint
 * (Ollama, OpenAI, Anthropic via proxy, etc.) without the opencode SDK.
 * Configured via localStorage keys:
 *   kova-llm-endpoint   default: http://localhost:11434/v1
 *   kova-llm-model      default: llama3
 *   kova-llm-api-key    default: (empty)
 */

export function getEndpoint(): string {
  try { return localStorage.getItem("kova-llm-endpoint") ?? "http://localhost:11434/v1" }
  catch { return "http://localhost:11434/v1" }
}

export function getModel(): string {
  try { return localStorage.getItem("kova-llm-model") ?? "llama3" }
  catch { return "llama3" }
}

export function getApiKey(): string {
  try { return localStorage.getItem("kova-llm-api-key") ?? "" }
  catch { return "" }
}

export function setLLMConfig(endpoint: string, model: string, apiKey = "") {
  try {
    localStorage.setItem("kova-llm-endpoint", endpoint)
    localStorage.setItem("kova-llm-model", model)
    localStorage.setItem("kova-llm-api-key", apiKey)
  } catch { /* quota */ }
}

export async function chat(prompt: string): Promise<string> {
  const url    = getEndpoint().replace(/\/$/, "") + "/chat/completions"
  const apiKey = getApiKey()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model:       getModel(),
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens:  1200,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`LLM request failed (${resp.status}): ${text}`)
  }

  const data = await resp.json()
  return data?.choices?.[0]?.message?.content ?? ""
}
