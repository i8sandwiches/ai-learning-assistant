import {
  GeminiError,
  generateGeminiText,
  summarizeStudyContent,
  generateQuizFromNote,
  generateStudyKit,
  extractTextFromPdfBase64,
  answerFromMaterial,
} from "@/lib/ai";

/** Gemini 응답 JSON을 흉내 내는 헬퍼 */
function geminiResponse(text: string, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as unknown as Response;
}

function errorResponse(status: number, headers: Record<string, string> = {}) {
  return {
    ok: false,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => ({}),
  } as unknown as Response;
}

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

/** global.fetch를 mock으로 교체하고 mock 함수를 돌려준다.
 *  jsdom 환경에선 fetch가 spyOn 가능한 프로퍼티가 아니라 직접 할당한다. */
function mockFetch(impl: () => Promise<Response>) {
  const fn = jest.fn(impl);
  (global as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  delete (global as Partial<typeof globalThis>).fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

describe("GeminiError", () => {
  it("429/503은 retryable", () => {
    expect(new GeminiError(429, "x").retryable).toBe(true);
    expect(new GeminiError(503, "x").retryable).toBe(true);
  });
  it("그 외 상태는 not retryable", () => {
    expect(new GeminiError(400, "x").retryable).toBe(false);
    expect(new GeminiError(500, "x").retryable).toBe(false);
  });
});

describe("generateGeminiText", () => {
  it("API 키가 없으면 null을 반환하고 fetch를 호출하지 않는다", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = mockFetch(() => Promise.resolve(geminiResponse("never")));
    const result = await generateGeminiText("프롬프트");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("정상 응답의 텍스트를 합쳐서 반환한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(geminiResponse("요약 결과")));
    const result = await generateGeminiText("프롬프트");
    expect(result).toBe("요약 결과");
  });

  it("비-재시도 오류 상태는 GeminiError를 던진다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(errorResponse(400)));
    await expect(generateGeminiText("p")).rejects.toBeInstanceOf(GeminiError);
  });
});

describe("summarizeStudyContent", () => {
  it("Gemini 성공 시 그 결과를 사용한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(geminiResponse("# AI 요약")));
    const out = await summarizeStudyContent("제목", "내용");
    expect(out).toBe("# AI 요약");
  });

  it("키가 없으면 로컬 요약으로 폴백한다", async () => {
    delete process.env.GEMINI_API_KEY;
    const out = await summarizeStudyContent("운영체제", "첫 문장. 둘째 문장.");
    expect(out).toContain("# 운영체제 요약");
    expect(out).toContain("로컬 요약");
  });

  it("Gemini 오류 시에도 로컬 요약으로 폴백한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(errorResponse(400)));
    const out = await summarizeStudyContent("제목", "본문 내용.");
    expect(out).toContain("# 제목 요약");
  });
});

describe("generateQuizFromNote", () => {
  it("JSON 배열 응답을 파싱한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const payload = JSON.stringify([
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ]);
    mockFetch(() => Promise.resolve(geminiResponse(payload)));
    const quizzes = await generateQuizFromNote("제목", "내용");
    expect(quizzes).toHaveLength(2);
    expect(quizzes[0]).toEqual({ question: "Q1", answer: "A1" });
  });

  it("코드펜스(```json)로 감싼 응답도 파싱한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fenced = "```json\n" + JSON.stringify([{ question: "Q", answer: "A" }]) + "\n```";
    mockFetch(() => Promise.resolve(geminiResponse(fenced)));
    const quizzes = await generateQuizFromNote("t", "c");
    expect(quizzes).toHaveLength(1);
  });

  it("question/answer가 비면 걸러낸다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const payload = JSON.stringify([
      { question: "Q", answer: "A" },
      { question: "", answer: "A" },
      { question: "Q", answer: "" },
    ]);
    mockFetch(() => Promise.resolve(geminiResponse(payload)));
    const quizzes = await generateQuizFromNote("t", "c");
    expect(quizzes).toHaveLength(1);
  });

  it("키가 없으면 규칙 기반 폴백 퀴즈를 반환한다", async () => {
    delete process.env.GEMINI_API_KEY;
    const quizzes = await generateQuizFromNote("자료구조", "스택은 LIFO 구조다.");
    expect(quizzes.length).toBeGreaterThan(0);
    expect(quizzes[0].question).toContain("자료구조");
  });

  it("잘못된 JSON 응답이면 폴백한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(geminiResponse("이건 JSON이 아님")));
    const quizzes = await generateQuizFromNote("제목", "내용");
    expect(quizzes.length).toBeGreaterThan(0);
  });
});

describe("generateStudyKit", () => {
  it("요약과 퀴즈를 함께 반환한다", async () => {
    delete process.env.GEMINI_API_KEY;
    const kit = await generateStudyKit("제목", "내용 문장.");
    expect(kit.summary).toContain("# 제목 요약");
    expect(Array.isArray(kit.quizzes)).toBe(true);
    expect(kit.quizzes.length).toBeGreaterThan(0);
  });
});

describe("geminiFetch 재시도 백오프", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("503(재시도 가능) 후 성공하면 결과를 반환한다", async () => {
    const fetchFn = mockFetch(
      jest
        .fn()
        .mockResolvedValueOnce(errorResponse(503))
        .mockResolvedValueOnce(geminiResponse("성공")) as unknown as () => Promise<Response>
    );
    const promise = generateGeminiText("p");
    // 첫 시도 실패 후 backoff 타이머를 모두 흘려보낸다
    await jest.runAllTimersAsync();
    await expect(promise).resolves.toBe("성공");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("네트워크 예외도 maxRetries 안에서 재시도한다", async () => {
    const fetchFn = mockFetch(
      jest
        .fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(geminiResponse("회복")) as unknown as () => Promise<Response>
    );
    const promise = generateGeminiText("p");
    await jest.runAllTimersAsync();
    await expect(promise).resolves.toBe("회복");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("계속 503이면 결국 GeminiError를 던진다", async () => {
    mockFetch(() => Promise.resolve(errorResponse(503)));
    const promise = generateGeminiText("p");
    const assertion = expect(promise).rejects.toBeInstanceOf(GeminiError);
    await jest.runAllTimersAsync();
    await assertion;
  });
});

describe("extractTextFromPdfBase64", () => {
  it("키가 없으면 에러를 던진다", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(extractTextFromPdfBase64("YWJj")).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("추출된 텍스트를 반환한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(geminiResponse("PDF 본문 텍스트")));
    await expect(extractTextFromPdfBase64("YWJj")).resolves.toBe("PDF 본문 텍스트");
  });

  it("오류 응답이면 GeminiError를 던진다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(errorResponse(400)));
    await expect(extractTextFromPdfBase64("YWJj")).rejects.toBeInstanceOf(GeminiError);
  });
});

describe("answerFromMaterial", () => {
  it("키가 없으면 에러를 던진다", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(answerFromMaterial("자료", "질문", [])).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("자료 기반 답변을 반환한다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(geminiResponse("자료에 따르면 정답은 A입니다.")));
    const answer = await answerFromMaterial("학습 자료 본문", "정답이 뭐야?", [
      { role: "user", parts: [{ text: "이전 질문" }] },
      { role: "model", parts: [{ text: "이전 답변" }] },
    ]);
    expect(answer).toBe("자료에 따르면 정답은 A입니다.");
  });

  it("오류 응답이면 GeminiError를 던진다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch(() => Promise.resolve(errorResponse(500)));
    await expect(answerFromMaterial("자료", "질문", [])).rejects.toBeInstanceOf(GeminiError);
  });
});
