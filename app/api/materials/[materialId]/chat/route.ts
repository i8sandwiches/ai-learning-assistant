import { NextResponse } from "next/server";
import { answerFromMaterial, GeminiChatTurn } from "@/lib/ai";
import {
  appendChatMessages,
  collectionNames,
  ensureIndexes,
  getOrCreateChatSession
} from "@/lib/dbCollections";
import { getAppDb } from "@/lib/mongodb";
import { ChatMessage, LearningMaterial } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ materialId: string }> }
) {
  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  const { materialId } = await params;

  await ensureIndexes();
  const chatSession = await getOrCreateChatSession(userId, materialId);
  return NextResponse.json({ messages: chatSession.messages, sessionId: chatSession.sessionId });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ materialId: string }> }
) {
  const { materialId } = await params;

  const body = (await request.json()) as { question?: string; userId?: string };
  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "질문이 비어 있습니다." }, { status: 400 });
  }

  await ensureIndexes();
  const db = await getAppDb();

  // 자료 조회 및 소유권 확인
  const material = await db
    .collection<LearningMaterial>(collectionNames.materials)
    .findOne({ materialId, userId });

  if (!material) {
    return NextResponse.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 });
  }

  // 기존 대화 세션 불러오기 (없으면 생성)
  const chatSession = await getOrCreateChatSession(userId, materialId);

  // Gemini 형식 히스토리 구성 (최근 20턴만 전송)
  const recentMessages = chatSession.messages.slice(-20);
  const history: GeminiChatTurn[] = recentMessages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }]
  }));

  // AI 응답 생성
  let answer: string;
  try {
    answer = await answerFromMaterial(material.extractedText, question, history);
  } catch (e) {
    console.error("Gemini 오류:", e);
    return NextResponse.json({ error: "AI 응답 생성 중 오류가 발생했습니다." }, { status: 500 });
  }

  const now = new Date().toISOString();
  const newMessages: ChatMessage[] = [
    { role: "user", content: question, createdAt: now },
    { role: "assistant", content: answer, createdAt: now }
  ];

  await appendChatMessages(chatSession.sessionId, newMessages);

  return NextResponse.json({ answer, messages: newMessages });
}
