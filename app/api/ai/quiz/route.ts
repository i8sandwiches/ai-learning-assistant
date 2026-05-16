import { NextResponse } from "next/server";
import { generateQuizFromNote } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; content?: string };
    const title = body.title?.trim() || "학습 노트";
    const content = body.content?.trim() || "";

    if (!content) {
      return NextResponse.json({ error: "문제를 생성할 노트 내용이 비어 있습니다." }, { status: 400 });
    }

    const quizzes = await generateQuizFromNote(title, content);
    return NextResponse.json({ quizzes });
  } catch {
    return NextResponse.json({ error: "복습 문제 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
