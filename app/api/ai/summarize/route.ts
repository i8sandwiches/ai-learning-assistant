import { NextResponse } from "next/server";
import { summarizeStudyContent } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; content?: string };
    const title = body.title?.trim() || "학습 자료";
    const content = body.content?.trim() || "";

    if (!content) {
      return NextResponse.json({ error: "요약할 학습 내용이 비어 있습니다." }, { status: 400 });
    }

    const summary = await summarizeStudyContent(title, content);
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ error: "AI 요약 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
