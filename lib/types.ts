export type AuthProvider = "GOOGLE" | "KAKAO" | "NAVER" | "GUEST";
export type FileType = "PDF" | "IMAGE" | "TXT" | "MD";
export type TimerType = "STOPWATCH" | "POMODORO" | "TIMER";

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
  category?: string;
}

export interface Summary {
  summaryId: string;
  userId: string;
  materialId?: string;
  noteId?: string;
  title: string;
  content: string;
  sourceType: "material" | "note";
  category?: string;
  updatedAt?: string;
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
  rankName: string;
  level: number;
  experiencePoint: number;
  growthStage: string;
  status: string;
  desc: string;
  attendanceDays: number;
  progress: number;
  nextInfo: string;
  totalHours: number;
}

export interface AppState {
  user: User | null;
  materials: LearningMaterial[];
  summaries: Summary[];
  notes: StudyNote[];
  quizzes: Quiz[];
  sessions: StudySession[];
}

// ---- User preferences (synced across devices via DB) ----
export interface TimetableBlock {
  label: string;
  color: string;
}

export interface CalendarSched {
  id: string;
  text: string;
  color: string;
}

export interface TimerPreset {
  id: string;
  name: string;
  study: number;
  brk: number;
  repeat: number;
}

export interface TimerFav {
  id: string;
  name: string;
  h: number;
  m: number;
  s: number;
}

export interface UserPreferences {
  timetable: Record<string, TimetableBlock>;
  scheds: Record<string, CalendarSched[]>;
  categories: string[];
  presets: TimerPreset[];
  timerFavs: TimerFav[];
}

// ---- Header study clock (per-account, synced across devices) ----
export interface StudyClock {
  date: string;     // YYYY-MM-DD of the tracking day
  startMs: number;  // epoch ms when today's tracking started
  accKRW: number;   // accumulated study value from previous days (KRW)
  todayKRW: number; // last-checkpointed value for `date` (used for day rollover)
}

// ---- Material Chat ----
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface MaterialChatSession {
  sessionId: string;
  userId: string;
  materialId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ---- Anki ----
export type CardState = "new" | "learn" | "review" | "suspended";
export type AnkiGrade = 0 | 1 | 2 | 3;

export interface AnkiDeck {
  deckId: string;
  name: string;
  createdAt: number;
}

export interface AnkiNote {
  noteId: string;
  deckId: string;
  type: "basic" | "cloze";
  fields: { front?: string; back?: string; text?: string; extra?: string };
  tags: string[];
  createdAt: number;
}

export interface AnkiCard {
  cardId: string;
  noteId: string;
  deckId: string;
  ord: number;
  state: CardState;
  ease: number;
  interval: number;
  reps: number;
  lapses: number;
  learnStep: number;
  due: number;
  lastReview: number | null;
}

export interface AnkiReviewLog {
  ts: number;
  cardId: string;
  grade: AnkiGrade;
  prevInterval: number;
  newInterval: number;
}

export interface AnkiSettings {
  newPerDay: number;
  reviewPerDay: number;
  learnSteps: number[];
}

export interface AnkiState {
  activeDeckId: string;
  decks: AnkiDeck[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  reviewLog: AnkiReviewLog[];
  todayDate: string;
  todayCounts: { new: number; learn: number; review: number };
  settings: AnkiSettings;
}
