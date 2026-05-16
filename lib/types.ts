export type AuthProvider = "GOOGLE" | "KAKAO";
export type FileType = "PDF" | "IMAGE" | "TXT" | "MD";
export type TimerType = "STOPWATCH" | "POMODORO";

export interface User {
  userId: string;
  email: string;
  nickname: string;
  provider: AuthProvider;
  createdAt: string;
}

export interface LearningMaterial {
  materialId: string;
  userId: string;
  fileName: string;
  fileType: FileType;
  fileUrl?: string;
  extractedText: string;
  uploadedAt: string;
}

export interface Summary {
  summaryId: string;
  userId: string;
  materialId?: string;
  noteId?: string;
  title: string;
  content: string;
  sourceType: "material" | "note";
  createdAt: string;
}

export interface StudyNote {
  noteId: string;
  userId: string;
  title: string;
  markdownContent: string;
  subject: string;
  updatedAt: string;
}

export interface Quiz {
  quizId: string;
  userId: string;
  noteId: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface StudySession {
  sessionId: string;
  userId: string;
  subject: string;
  timerType: TimerType;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface CharacterState {
  characterId: string;
  userId: string;
  name: string;
  level: number;
  experiencePoint: number;
  growthStage: string;
  status: string;
}

export interface AppState {
  user: User | null;
  materials: LearningMaterial[];
  summaries: Summary[];
  notes: StudyNote[];
  quizzes: Quiz[];
  sessions: StudySession[];
}
