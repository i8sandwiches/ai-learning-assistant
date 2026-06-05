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
  if (!fileType) return { ok: false as const, message: "PDF, 이미지, TXT, MD 파일만 업로드할 수 있습니다." };
  if (file.size > maxBytes) return { ok: false as const, message: "10MB 이하의 학습 자료만 업로드할 수 있습니다." };
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

const RANK_LEVELS = [
  { lv:  1, name: "춘식이",        desc: "자아를 버리고 공부해!",                   metric: "attend", need: 100 },
  { lv:  2, name: "염전 현장감독관", desc: "공부계의 말년병장? 사회는 실전이다!",      metric: "attend", need: 100 },
  { lv:  3, name: "염전 사장",      desc: "공부 안하시면 사장님 나빠요!",             metric: "hours",  need: 100 },
  { lv:  4, name: "경찰관",         desc: "공부 안하면 잡아갑니다~",                  metric: "hours",  need: 100 },
  { lv:  5, name: "경찰서장",       desc: "공부 안하고 뺑기는 ㄴㄴ",                 metric: "hours",  need: 100 },
  { lv:  6, name: "군수",           desc: "공부유스",                               metric: "hours",  need: 200 },
  { lv:  7, name: "도의원",         desc: "공부계의 초신성",                         metric: "hours",  need: 200 },
  { lv:  8, name: "시장",           desc: "시장님 공부 안하시고 그러면 안돼요!",       metric: "hours",  need: 300 },
  { lv:  9, name: "도지사",         desc: "다음 여정을 위한 중요한 발판!",            metric: "hours",  need: 300 },
  { lv: 10, name: "당대표",         desc: "어쩌면 실세",                             metric: "hours",  need: 300 },
  { lv: 11, name: "언론사 회장",    desc: "양날의 검, 소통의 창이자 선동의 창",        metric: "hours",  need: 400 },
  { lv: 12, name: "부르주아",       desc: "모두가 선망하는 물주",                     metric: "hours",  need: 400 },
  { lv: 13, name: "대통령",         desc: "임기는 5년! 출석률 80% 미만이면 강등",     metric: "hours",  need: 500 },
  { lv: 14, name: "프리메이슨",     desc: "글로벌 리스트",                           metric: "fixed",  need: 0   },
];
const HOUR_THRESHOLDS = [0, 100, 200, 300, 500, 700, 1000, 1300, 1600, 2000, 2400, 2900];

export function calculateCharacter(userId: string, sessions: StudySession[]): CharacterState {
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalHours = totalMinutes / 60;
  const experiencePoint = Math.round(totalMinutes);
  const uniqueDays = new Set(sessions.map(s => s.endTime.slice(0, 10)));
  const attendanceDays = uniqueDays.size;

  let level = 1;
  if (attendanceDays >= 100) level = 2;
  if (attendanceDays >= 200) {
    level = 3;
    for (let i = HOUR_THRESHOLDS.length - 1; i >= 0; i--) {
      if (totalHours >= HOUR_THRESHOLDS[i]) { level = 3 + i; break; }
    }
  }
  level = Math.min(level, 14);

  if (level === 13) {
    const sorted = [...uniqueDays].sort();
    const span = Math.max(1, Math.round((Date.now() - new Date(sorted[0]).getTime()) / 86400000));
    if (attendanceDays / span < 0.8) level = 1;
  }

  const rank = RANK_LEVELS[level - 1];

  let progress = 0;
  if (level === 14) {
    progress = 100;
  } else if (rank.metric === "attend") {
    progress = Math.min(100, Math.max(0, Math.round(((attendanceDays - (level - 1) * 100) / 100) * 100)));
  } else {
    const idx = level - 3;
    const baseH = HOUR_THRESHOLDS[idx] || 0;
    const nextH = HOUR_THRESHOLDS[idx + 1] ?? (baseH + rank.need);
    progress = Math.min(100, Math.max(0, Math.round(((totalHours - baseH) / (nextH - baseH)) * 100)));
  }

  let nextInfo = "";
  if (level < 14) {
    const nr = RANK_LEVELS[level];
    if (rank.metric === "attend") {
      nextInfo = `출석 ${Math.max(0, level * 100 - attendanceDays)}일 더 → ${nr.name}`;
    } else {
      const idx = level - 3;
      const nextH = HOUR_THRESHOLDS[idx + 1] ?? ((HOUR_THRESHOLDS[idx] || 0) + rank.need);
      nextInfo = `공부 ${Math.max(0, Math.ceil(nextH - totalHours))}시간 더 → ${nr.name}`;
    }
  }

  return {
    characterId: `character_${userId}`,
    userId,
    name: "루미",
    rankName: rank.name,
    level,
    experiencePoint,
    growthStage: rank.name,
    status: rank.desc,
    desc: rank.desc,
    attendanceDays,
    progress,
    nextInfo,
    totalHours: Math.round(totalHours),
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
  const picked = sentences.slice(0, 5).map(s => s.trim()).filter(Boolean);
  const preview = picked.length > 0 ? picked : [clean.slice(0, 220) || "자료 내용을 읽을 수 없어 파일명과 메타데이터를 기준으로 요약했습니다."];

  return [
    `# ${title} 요약`,
    "",
    "## 핵심 내용",
    ...preview.map(s => `- ${s}`),
    "",
    "## 복습 포인트",
    "- 중요한 용어와 개념을 노트로 옮겨 다시 설명해 보세요.",
    "- 타이머를 켜고 25분 단위로 읽기, 정리, 문제 풀이를 나누면 좋습니다.",
    "",
    "> Gemini API 키가 없거나 호출에 실패해 로컬 요약으로 생성되었습니다."
  ].join("\n");
}
