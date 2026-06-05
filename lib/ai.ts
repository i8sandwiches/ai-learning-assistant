import { summarizeLocally } from "@/lib/study";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function generateGeminiText(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
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
