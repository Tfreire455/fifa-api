import { env, isOpenAIConfigured } from "../config/env.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_REPAIR_INPUT_CHARS = 24_000;

type AskJsonOptions = {
  /** Instrução de sistema adicional. */
  system?: string;
};

const baseSystemPrompt = [
  "Você é um serviço de dados esportivos da Copa do Mundo FIFA 2026.",
  "Use a busca na web para obter os dados mais recentes antes de responder.",
  "Responda SEMPRE e SOMENTE com JSON válido, sem markdown, sem crases, sem comentários e sem texto fora do JSON.",
  "Não inclua citações nem URLs de páginas na resposta.",
  "Nunca invente placares ou estatísticas: se a informação não estiver disponível, use null nos campos correspondentes.",
  "Use códigos FIFA de três letras para as seleções (ex: BRA, MEX, USA).",
  "Todas as strings precisam estar em uma única linha; não coloque quebras de linha dentro de strings JSON.",
  "Não deixe aspas sem escape dentro de strings."
].join(" ");

const fetchWithTimeout = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const stripJsonFences = (text: string) => {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
};

/**
 * Extrai o primeiro objeto/array JSON do texto.
 * Se o modelo devolver texto antes/depois do JSON, ignoramos.
 */
const extractFirstJson = (text: string): string => {
  const cleaned = stripJsonFences(text);
  const start = cleaned.search(/[{[]/);

  if (start === -1) return cleaned;

  const opener = cleaned[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }

  return cleaned.slice(start);
};

type ResponsesOutputContent = {
  type?: string;
  text?: string;
};

type ResponsesOutputItem = {
  type?: string;
  content?: ResponsesOutputContent[];
};

const extractResponsesText = (payload: {
  output_text?: string;
  output?: ResponsesOutputItem[];
}): string => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const parts: string[] = [];

  for (const item of payload.output || []) {
    if (item.type !== "message") continue;

    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n");
};

/** Remove citações inline que podem quebrar JSON. */
const stripInlineCitations = (text: string) => {
  return text
    .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "")
    .replace(/【[^】]+】/g, "")
    .replace(/[^]+/g, "");
};

const removeTrailingCommas = (text: string) => {
  return text.replace(/,\s*([}\]])/g, "$1");
};

/**
 * Escapa caracteres de controle literais dentro de strings JSON.
 * O erro do usuário vinha de algo como: "score":"2-1\n..."
 * JSON.parse não aceita quebra de linha literal dentro de string.
 */
const escapeControlCharsInsideStrings = (text: string) => {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      if (escaped) {
        output += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        output += char;
        escaped = true;
        continue;
      }

      if (char === '"') {
        output += char;
        inString = false;
        continue;
      }

      if (char === "\n" || char === "\r") {
        output += " ";
        continue;
      }

      if (char === "\t") {
        output += " ";
        continue;
      }

      const code = char.charCodeAt(0);
      if (code >= 0 && code < 32) {
        output += " ";
        continue;
      }

      output += char;
      continue;
    }

    output += char;

    if (char === '"') {
      inString = true;
    }
  }

  return output;
};

/**
 * Tenta fechar JSON parcialmente interrompido.
 * Isso não inventa campos; apenas fecha string/objetos/arrays abertos.
 */
const closePossiblyTruncatedJson = (text: string) => {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let output = "";

  for (const char of text) {
    output += char;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
    } else if (char === "[") {
      stack.push("]");
    } else if (char === "}" || char === "]") {
      const expected = stack[stack.length - 1];
      if (expected === char) stack.pop();
    }
  }

  if (inString) output += '"';

  while (stack.length > 0) {
    output += stack.pop();
  }

  return output;
};

const normalizeJsonCandidate = (text: string) => {
  return removeTrailingCommas(
    escapeControlCharsInsideStrings(stripInlineCitations(stripJsonFences(text)))
  );
};

const tryParseJson = <T>(rawText: string): T | null => {
  const extracted = extractFirstJson(rawText);
  const normalized = normalizeJsonCandidate(extracted);
  const closed = closePossiblyTruncatedJson(normalized);

  const candidates = [extracted, normalized, closed]
    .map((candidate) => removeTrailingCommas(candidate.trim()))
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // tenta próximo candidato
    }
  }

  return null;
};

type WebSearchToolType = "web_search" | "web_search_preview";

const callResponsesApi = async (
  prompt: string,
  options: AskJsonOptions,
  toolType: WebSearchToolType = "web_search"
): Promise<string> => {
  const tool: Record<string, unknown> = { type: toolType };

  if (toolType === "web_search") {
    tool.search_context_size = "medium";
  }

  const body: Record<string, unknown> = {
    model: env.openaiModel,
    tools: [tool],
    tool_choice: "required",
    max_output_tokens: 12_000,
    input: [
      {
        role: "system",
        content: [baseSystemPrompt, options.system].filter(Boolean).join("\n")
      },
      { role: "user", content: prompt }
    ]
  };

  const response = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openaiApiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    if (
      toolType === "web_search" &&
      response.status === 400 &&
      /web_search/i.test(errorText)
    ) {
      return callResponsesApi(prompt, options, "web_search_preview");
    }

    throw new Error(`OpenAI Responses API ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const payload = (await response.json()) as Parameters<typeof extractResponsesText>[0];
  return extractResponsesText(payload);
};

const callChatCompletionsApi = async (
  prompt: string,
  options: AskJsonOptions
): Promise<string> => {
  const response = await fetchWithTimeout(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openaiApiKey}`
    },
    body: JSON.stringify({
      model: env.openaiSearchModel,
      web_search_options: { search_context_size: "medium" },
      max_completion_tokens: 12_000,
      messages: [
        {
          role: "system",
          content: [baseSystemPrompt, options.system].filter(Boolean).join("\n")
        },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI Chat API ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  return payload.choices?.[0]?.message?.content || "";
};

const repairJsonWithOpenAI = async (rawText: string): Promise<string | null> => {
  if (!isOpenAIConfigured()) return null;

  const repairPrompt = [
    "Corrija o texto abaixo para JSON válido.",
    "Preserve os dados existentes.",
    "Não adicione explicações, markdown, comentários nem campos inventados.",
    "Se um campo estiver truncado ou impossível de recuperar, use null ou array vazio.",
    "Responda somente com JSON válido.",
    "Texto:",
    rawText.slice(0, MAX_REPAIR_INPUT_CHARS)
  ].join("\n");

  const body = {
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Você é um reparador de JSON. Responda apenas com JSON válido."
      },
      {
        role: "user",
        content: repairPrompt
      }
    ]
  };

  const call = async (withResponseFormat: boolean) => {
    const response = await fetchWithTimeout(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`
      },
      body: JSON.stringify(withResponseFormat ? body : { ...body, response_format: undefined })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenAI JSON repair ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return payload.choices?.[0]?.message?.content || null;
  };

  try {
    return await call(true);
  } catch {
    try {
      return await call(false);
    } catch (error) {
      console.warn("[openai] Reparação de JSON falhou:", error);
      return null;
    }
  }
};

export const askOpenAIForJson = async <T>(
  prompt: string,
  options: AskJsonOptions = {}
): Promise<T | null> => {
  if (!isOpenAIConfigured()) return null;

  let rawText = "";

  try {
    rawText = await callResponsesApi(prompt, options);
  } catch (responsesError) {
    console.warn("[openai] Responses API falhou, tentando Chat Completions (search model):", responsesError);

    try {
      rawText = await callChatCompletionsApi(prompt, options);
    } catch (chatError) {
      console.error("[openai] Chat Completions também falhou:", chatError);
      return null;
    }
  }

  if (!rawText.trim()) return null;

  const parsed = tryParseJson<T>(rawText);
  if (parsed) return parsed;

  const extracted = extractFirstJson(stripInlineCitations(rawText));
  console.warn("[openai] JSON inválido recebido. Tentando reparar automaticamente.", extracted.slice(0, 500));

  const repaired = await repairJsonWithOpenAI(extracted);
  if (repaired) {
    const repairedParsed = tryParseJson<T>(repaired);
    if (repairedParsed) return repairedParsed;
  }

  console.error("[openai] Não foi possível interpretar JSON. Usando fallback local.", extracted.slice(0, 500));
  return null;
};

export { isOpenAIConfigured };
