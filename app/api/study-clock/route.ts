import { NextResponse } from "next/server";
import { ensureIndexes, loadStudyClock, saveStudyClock } from "@/lib/dbCollections";
import { StudyClock } from "@/lib/types";

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }

  try {
    await ensureIndexes();
    const clock = await loadStudyClock(userId);
    return NextResponse.json({ clock });
  } catch (error) {
    return NextResponse.json(
      { error: "학습 시계를 불러오지 못했습니다.", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: Partial<StudyClock> & { userId?: string };
  try {
    body = (await request.json()) as Partial<StudyClock> & { userId?: string };
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }
  if (
    typeof body.date !== "string" ||
    typeof body.startMs !== "number" ||
    typeof body.accKRW !== "number" ||
    typeof body.todayKRW !== "number"
  ) {
    return NextResponse.json({ error: "학습 시계 데이터가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    await ensureIndexes();
    await saveStudyClock(userId, {
      date: body.date,
      startMs: body.startMs,
      accKRW: body.accKRW,
      todayKRW: body.todayKRW
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "학습 시계를 저장하지 못했습니다.", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
