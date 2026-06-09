import { NextResponse } from "next/server";
import { ensureIndexes, loadTutorSessions, saveTutorSessions } from "@/lib/dbCollections";
import { TutorChatSession } from "@/lib/types";

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }

  try {
    await ensureIndexes();
    const sessions = await loadTutorSessions(userId);
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: "튜터 대화를 불러오지 못했습니다.", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: { userId?: string; sessions?: TutorChatSession[] };
  try {
    body = (await request.json()) as { userId?: string; sessions?: TutorChatSession[] };
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(body.sessions)) {
    return NextResponse.json({ error: "튜터 대화 데이터가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    await ensureIndexes();
    await saveTutorSessions(userId, body.sessions);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "튜터 대화를 저장하지 못했습니다.", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
