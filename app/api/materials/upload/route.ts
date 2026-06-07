import { NextResponse } from "next/server";
import { extractTextFromPdfBase64, GeminiError } from "@/lib/ai";
import { collectionNames, ensureIndexes } from "@/lib/dbCollections";
import { getAppDb } from "@/lib/mongodb";
import { FileType, LearningMaterial } from "@/lib/types";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "파일 파싱 오류" }, { status: 400 });
  }

  const userId = (formData.get("userId") as string | null)?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let fileType: FileType;
  let extractedText = "";

  if (ext === "pdf") {
    fileType = "PDF";
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    try {
      extractedText = await extractTextFromPdfBase64(base64);
    } catch (e) {
      console.error("PDF 추출 오류:", e);
      if (e instanceof GeminiError && e.retryable) {
        return NextResponse.json(
          { error: "AI 서버가 잠시 혼잡합니다. 잠시 후 다시 시도해 주세요." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "PDF 텍스트 추출에 실패했습니다." }, { status: 500 });
    }
  } else if (ext === "txt") {
    fileType = "TXT";
    extractedText = await file.text();
  } else if (ext === "md") {
    fileType = "MD";
    extractedText = await file.text();
  } else {
    return NextResponse.json({ error: "지원하지 않는 파일 형식입니다. (PDF, TXT, MD만 가능)" }, { status: 400 });
  }

  if (!extractedText.trim()) {
    return NextResponse.json({ error: "파일에서 텍스트를 추출할 수 없습니다." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const material: LearningMaterial = {
    materialId: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    fileName: file.name,
    fileType,
    extractedText,
    uploadedAt: now
  };

  await ensureIndexes();
  const db = await getAppDb();
  await db.collection<LearningMaterial>(collectionNames.materials).updateOne({ materialId: material.materialId }, { $set: material }, { upsert: true });

  return NextResponse.json({ material });
}
