import { NextRequest, NextResponse } from "next/server";

/* ============================================================
   AI Tutor 서버 프록시
   ============================================================
   키는 서버 전용 환경변수(.env.local / Vercel)에 둡니다.
   NEXT_PUBLIC_ 접두사가 없으므로 브라우저 번들에 노출되지 않습니다.

     TUTOR_API_KEY=발급받은_키
     TUTOR_PROVIDER=gemini        # gemini | openai | claude | custom (선택)
     TUTOR_MODEL=gemini-2.0-flash # (선택)
     TUTOR_ENDPOINT=...           # (선택, provider 기본 endpoint 덮어쓰기)

   Gemini 키 발급: https://aistudio.google.com/apikey
   ============================================================ */

type Provider = "gemini" | "openai" | "claude" | "custom";

const PROVIDER = (process.env.TUTOR_PROVIDER || "gemini") as Provider;
const API_KEY = process.env.TUTOR_API_KEY || "";
const MODEL = process.env.TUTOR_MODEL || "gemini-2.5-flash";
const SYSTEM_PROMPT =
  "당신은 친절하고 침착한 AI 학습 튜터입니다. 한국어로 답변하되, 코드 예제와 단계별 설명을 적극적으로 사용하세요. 답변은 학생이 직접 추론할 수 있도록 가이드하는 방향으로 작성하며, 지나치게 길지 않게 핵심을 짚어주세요.";

const DEFAULT_ENDPOINT: Record<Provider, string> = {
  // Gemini는 모델 이름이 URL에 들어가므로 MODEL 값으로 동적 생성
  gemini: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
  custom: "",
};
const ENDPOINT = process.env.TUTOR_ENDPOINT || DEFAULT_ENDPOINT[PROVIDER] || "";

const isConfigured = !!(ENDPOINT && API_KEY);

type Msg = { role: string; content: string };

function demoReply(messages: Msg[]) {
  const last = messages[messages.length - 1]?.content || "";
  return `**(데모 모드)** 실제 응답을 받으려면 서버 환경변수 \`TUTOR_API_KEY\`를 설정한 뒤 다시 배포(또는 재시작)하세요.\n\n질문: "${last.slice(0, 80)}${last.length > 80 ? "…" : ""}"\n\n좋은 질문입니다. 이 주제를 이해하려면 세 가지를 살펴보면 좋습니다:\n\n1. **기본 개념** — 가장 단순한 형태부터 시작\n2. **핵심 패턴** — 반복되는 구조 파악\n3. **응용** — 실제 문제에 적용\n\n\`\`\`python\ndef example(n):\n    if n <= 1:\n        return n\n    return example(n - 1) + example(n - 2)\n\`\`\`\n\n어느 부분부터 더 깊이 살펴볼까요?`;
}

async function callProvider(messages: Msg[]): Promise<string> {
  let url: string, headers: Record<string, string>, body: string;
  if (PROVIDER === "claude") {
    url = ENDPOINT;
    headers = { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" };
    body = JSON.stringify({ model: MODEL || "claude-sonnet-4-5", max_tokens: 2048, system: SYSTEM_PROMPT, messages });
  } else if (PROVIDER === "openai") {
    url = ENDPOINT;
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    body = JSON.stringify({ model: MODEL || "gpt-4o", messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages] });
  } else if (PROVIDER === "gemini") {
    const cleaned = messages.filter(m => m.content?.trim());
    url = `${ENDPOINT}?key=${API_KEY}`;
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: cleaned.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });
  } else {
    url = ENDPOINT;
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    body = JSON.stringify({ model: MODEL, messages });
  }
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`API 오류 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (PROVIDER === "claude") return data.content?.[0]?.text || "";
  if (PROVIDER === "openai") return data.choices?.[0]?.message?.content || "";
  if (PROVIDER === "gemini") return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return data.content || data.text || data.message || JSON.stringify(data);
}

export async function GET() {
  return NextResponse.json({ configured: isConfigured });
}

export async function POST(req: NextRequest) {
  let messages: Msg[] = [];
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (!isConfigured) {
    return NextResponse.json({ reply: demoReply(messages), configured: false });
  }

  try {
    const reply = await callProvider(messages);
    return NextResponse.json({ reply, configured: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
