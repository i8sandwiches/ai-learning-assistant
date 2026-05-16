import { CharacterState, FileType, StudySession } from "@/lib/types";

export const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md"];

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function inferFileType(fileName: string): FileType | null {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".txt")) return "TXT";
  if (lower.endsWith(".md")) return "MD";
  if (/\.(png|jpg|jpeg|webp)$/.test(lower)) return "IMAGE";

  return null;
}

export function validateUpload(file: File) {
  const fileType = inferFileType(file.name);
  const maxBytes = 10 * 1024 * 1024;

  if (!fileType) {
    return { ok: false as const, message: "PDF, 이미지, TXT, MD 파일만 업로드할 수 있습니다." };
  }

  if (file.size > maxBytes) {
    return { ok: false as const, message: "10MB 이하의 학습 자료만 업로드할 수 있습니다." };
  }

  return { ok: true as const, fileType };
}

export function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (hours === 0) return `${rest}분`;
  if (rest === 0) return `${hours}시간`;
  return `${hours}시간 ${rest}분`;
}

export function calculateCharacter(userId: string, sessions: StudySession[]): CharacterState {
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const experiencePoint = Math.round(totalMinutes * 10);
  const level = Math.max(1, Math.floor(experiencePoint / 300) + 1);
  const stage =
    level >= 12 ? "마스터" : level >= 8 ? "탐구가" : level >= 5 ? "성장기" : level >= 3 ? "새싹" : "입문";
  const status =
    totalMinutes >= 600
      ? "긴 호흡의 학습 루틴이 자리 잡고 있어요."
      : totalMinutes >= 180
        ? "복습 리듬이 안정적으로 쌓이고 있어요."
        : totalMinutes > 0
          ? "첫 학습 기록이 캐릭터를 깨웠어요."
          : "타이머로 학습을 마치면 경험치가 쌓입니다.";

  return {
    characterId: `character_${userId}`,
    userId,
    name: "루미",
    level,
    experiencePoint,
    growthStage: stage,
    status
  };
}

export function recentDays(days = 7) {
  const labels: string[] = [];
  const now = new Date();

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    labels.push(date.toISOString().slice(0, 10));
  }

  return labels;
}

export function summarizeLocally(title: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?。？！]+[.!?。？！]?/g) ?? [];
  const picked = sentences.slice(0, 5).map((sentence) => sentence.trim()).filter(Boolean);
  const preview = picked.length > 0 ? picked : [clean.slice(0, 220) || "자료 내용을 읽을 수 없어 파일명과 메타데이터를 기준으로 요약했습니다."];

  return [
    `# ${title} 요약`,
    "",
    "## 핵심 내용",
    ...preview.map((sentence) => `- ${sentence}`),
    "",
    "## 복습 포인트",
    "- 중요한 용어와 개념을 노트로 옮겨 다시 설명해 보세요.",
    "- 타이머를 켜고 25분 단위로 읽기, 정리, 문제 풀이를 나누면 좋습니다.",
    "",
    "> Gemini API 키가 없거나 호출에 실패해 로컬 요약으로 생성되었습니다."
  ].join("\n");
}
