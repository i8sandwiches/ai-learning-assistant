import { NextResponse } from "next/server";
import { generateStudyKit } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; content?: string };
    const title = body.title?.trim() || "학습 내용";
    const content = body.content?.trim() || "";

    if (!content) {
      return NextResponse.json({ error: "요약과 퀴즈를 생성할 학습 내용이 비어 있습니다." }, { status: 400 });
    }

    const studyKit = await generateStudyKit(title, content);
    return NextResponse.json(studyKit);
  } catch {
    return NextResponse.json({ error: "AI 학습 세트 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
