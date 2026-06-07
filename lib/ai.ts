import { summarizeLocally } from "@/lib/study";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Error thrown when a Gemini request ultimately fails. `retryable` covers
 *  transient conditions (429 rate-limit, 503 overloaded) the caller can surface
 *  as "try again shortly". */
export class GeminiError extends Error {
  status: number;
  retryable: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.retryable = status === 429 || status === 503;
  }
}

const RETRYABLE_STATUS = new Set([429, 503]);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** POST to Gemini with exponential backoff on transient (429/503) errors.
 *  Honors a Retry-After header when present. Returns the final Response; the
 *  caller decides how to handle a non-ok result. */
async function geminiFetch(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (true) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (networkError) {
      if (attempt >= maxRetries) throw networkError;
      await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250);
      attempt++;
      continue;
    }

    if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt >= maxRetries) {
      return response;
    }

    const retryAfterSec = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
    await sleep(delay);
    attempt++;
  }
}

export async function generateGeminiText(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await geminiFetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1400
      }
    })
  });

  if (!response.ok) {
    throw new GeminiError(response.status, `Gemini request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? null;
}

export async function summarizeStudyContent(title: string, content: string) {
  const prompt = [
    "너는 한국어 AI 학습 어시스턴트다.",
    "다음 학습 자료를 학생이 바로 복습할 수 있도록 마크다운으로 요약하라.",
    "반드시 포함할 항목: 핵심 내용, 주요 개념, 시험 대비 포인트, 3문장 복습 질문.",
    "",
    `제목: ${title}`,
    "",
    content.slice(0, 18000)
  ].join("\n");

  try {
    const result = await generateGeminiText(prompt);
    return result ?? summarizeLocally(title, content);
  } catch {
    return summarizeLocally(title, content);
  }
}

export async function generateQuizFromNote(title: string, content: string) {
  const prompt = [
    "너는 한국어 학습 코치다.",
    "아래 노트 내용을 바탕으로 복습 문제 5개를 생성하라.",
    "각 항목은 JSON 배열의 객체 형식으로만 출력하라. 키는 question, answer를 사용한다.",
    "",
    `노트 제목: ${title}`,
    "",
    content.slice(0, 12000)
  ].join("\n");

  try {
    const result = await generateGeminiText(prompt);
    if (!result) throw new Error("Missing Gemini response");
    const jsonText = result.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(jsonText) as Array<{ question: string; answer: string }>;
    return parsed.filter((item) => item.question && item.answer).slice(0, 5);
  } catch {
    const plain = content.replace(/[#>*_`-]/g, " ").replace(/\s+/g, " ").trim();
    const topic = title || plain.slice(0, 24) || "노트";

    return [
      {
        question: `${topic}에서 가장 중요한 개념은 무엇인가요?`,
        answer: "노트의 제목, 반복되는 키워드, 예시를 기준으로 핵심 개념을 정리합니다."
      },
      {
        question: "이 내용을 한 문장으로 설명한다면 어떻게 말할 수 있나요?",
        answer: plain.slice(0, 160) || "노트 내용을 먼저 작성하면 답안을 더 구체화할 수 있습니다."
      },
      {
        question: "시험 직전에 확인해야 할 포인트는 무엇인가요?",
        answer: "정의, 비교 관계, 예외 조건, 문제 풀이 순서를 우선 확인합니다."
      }
    ];
  }
}

export async function generateStudyKit(title: string, content: string) {
  const [summary, quizzes] = await Promise.all([
    summarizeStudyContent(title, content),
    generateQuizFromNote(title, content)
  ]);

  return { summary, quizzes };
}

// ---- PDF 텍스트 추출 (Gemini 인라인 base64) ----
export async function extractTextFromPdfBase64(base64Data: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const response = await geminiFetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: "application/pdf",
                data: base64Data
              }
            },
            {
              text: "이 PDF의 모든 텍스트 내용을 그대로 추출해라. 형식 변경 없이 원문 텍스트만 반환하라."
            }
          ]
        }
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 }
    })
  });

  if (!response.ok) throw new GeminiError(response.status, `Gemini PDF extraction failed: ${response.status}`);

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n").trim() ?? "";
}

// ---- 자료 기반 멀티턴 Q&A ----
export interface GeminiChatTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export async function answerFromMaterial(
  materialContent: string,
  question: string,
  history: GeminiChatTurn[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const systemInstruction = [
    "너는 한국어 AI 학습 튜터다.",
    "아래 [학습 자료]를 근거로만 질문에 답하라.",
    "자료에 없는 내용은 '자료에 해당 내용이 없습니다'라고 답하라.",
    "답변은 간결하고 정확하게 한국어로 작성하라.",
    "",
    "[학습 자료]",
    materialContent.slice(0, 20000)
  ].join("\n");

  // history + 현재 질문을 contents 배열로 구성
  const contents: GeminiChatTurn[] = [
    ...history,
    { role: "user", parts: [{ text: question }] }
  ];

  const response = await geminiFetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    })
  });

  if (!response.ok) throw new GeminiError(response.status, `Gemini chat failed: ${response.status}`);

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n").trim() ?? "답변을 생성할 수 없습니다.";
}
