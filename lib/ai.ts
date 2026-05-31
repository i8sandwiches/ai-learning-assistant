import { summarizeLocally } from "@/lib/study";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type GeneratedQuiz = {
  question: string;
  answer: string;
};

type StudyKitResponse = {
  summary: string;
  quizzes: GeneratedQuiz[];
};

type GeminiGenerationConfig = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseJsonSchema?: unknown;
};

const quizArraySchema = {
  type: "array",
  minItems: 5,
  maxItems: 5,
  items: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "학습자가 풀 복습 문제"
      },
      answer: {
        type: "string",
        description: "문제의 정답과 짧은 해설"
      }
    },
    required: ["question", "answer"]
  }
};

const studyKitSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "마크다운 형식의 학습 요약"
    },
    quizzes: quizArraySchema
  },
  required: ["summary", "quizzes"]
};

export async function generateGeminiText(prompt: string, generationConfig: GeminiGenerationConfig = {}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1400,
        ...generationConfig
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status}`);
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
    const result = await generateGeminiText(prompt, {
      temperature: 0.25,
      maxOutputTokens: 1200,
      responseMimeType: "application/json",
      responseJsonSchema: quizArraySchema
    });
    if (!result) throw new Error("Missing Gemini response");
    const parsed = parseGeminiJson<GeneratedQuiz[]>(result);
    return normalizeQuizzes(parsed, title, content);
  } catch {
    return buildLocalQuizzes(title, content);
  }
}

export async function generateStudyKit(title: string, content: string): Promise<StudyKitResponse> {
  const prompt = [
    "너는 한국어 AI 학습 코치다.",
    "아래 학습 내용을 바탕으로 학습자가 바로 복습할 수 있는 요약과 퀴즈를 생성하라.",
    "요약은 마크다운으로 작성하고, 핵심 개념, 시험 대비 포인트, 헷갈리기 쉬운 부분을 포함하라.",
    "퀴즈는 내용 이해를 확인하는 문제 5개로 구성하라.",
    "",
    `학습 제목: ${title}`,
    "",
    content.slice(0, 18000)
  ].join("\n");

  try {
    const result = await generateGeminiText(prompt, {
      temperature: 0.3,
      maxOutputTokens: 2200,
      responseMimeType: "application/json",
      responseJsonSchema: studyKitSchema
    });

    if (!result) throw new Error("Missing Gemini response");

    const parsed = parseGeminiJson<StudyKitResponse>(result);
    const summary = parsed.summary?.trim() || summarizeLocally(title, content);

    return {
      summary,
      quizzes: normalizeQuizzes(parsed.quizzes, title, content)
    };
  } catch {
    return {
      summary: summarizeLocally(title, content),
      quizzes: buildLocalQuizzes(title, content)
    };
  }
}

function parseGeminiJson<T>(text: string): T {
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");

    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as T;
    }

    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1)) as T;
    }

    throw new Error("Gemini response was not valid JSON");
  }
}

function normalizeQuizzes(items: unknown, title: string, content: string) {
  const parsed = Array.isArray(items) ? items : [];
  const quizzes = parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const quiz = item as Partial<GeneratedQuiz>;
      const question = typeof quiz.question === "string" ? quiz.question.trim() : "";
      const answer = typeof quiz.answer === "string" ? quiz.answer.trim() : "";

      return question && answer ? { question, answer } : null;
    })
    .filter((item): item is GeneratedQuiz => item !== null)
    .slice(0, 5);

  return quizzes.length > 0 ? quizzes : buildLocalQuizzes(title, content);
}

function buildLocalQuizzes(title: string, content: string): GeneratedQuiz[] {
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
    },
    {
      question: "이 내용에서 서로 비교하거나 구분해야 할 요소는 무엇인가요?",
      answer: "비슷한 용어, 원인과 결과, 장점과 한계처럼 헷갈리기 쉬운 쌍을 찾아 표로 정리해 보세요."
    },
    {
      question: "실제 문제나 사례에 적용한다면 어떤 순서로 생각해야 하나요?",
      answer: "먼저 핵심 개념을 정의하고, 조건을 확인한 뒤, 노트의 예시와 연결해 결론을 검토합니다."
    }
  ];
}
