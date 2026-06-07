import { AppState, ChatMessage, LearningMaterial, MaterialChatSession, Quiz, StudyClock, StudyNote, StudySession, Summary, User, UserPreferences } from "@/lib/types";
import { getAppDb } from "@/lib/mongodb";

export const collectionNames = {
  users: "users",
  materials: "materials",
  summaries: "summaries",
  notes: "notes",
  quizzes: "quizzes",
  sessions: "studySessions",
  preferences: "preferences",
  materialChats: "materialChats",
  studyClocks: "studyClocks"
} as const;

type PreferencesDocument = UserPreferences & { userId: string };
type StudyClockDocument = StudyClock & { userId: string };

const globalForIndexes = globalThis as typeof globalThis & {
  _mongoIndexesPromise?: Promise<void>;
};

export async function ensureIndexes() {
  if (!globalForIndexes._mongoIndexesPromise) {
    globalForIndexes._mongoIndexesPromise = createIndexes().catch((error) => {
      globalForIndexes._mongoIndexesPromise = undefined;
      throw error;
    });
  }

  await globalForIndexes._mongoIndexesPromise;
}

async function createIndexes() {
  const db = await getAppDb();

  await Promise.all([
    db.collection<User>(collectionNames.users).createIndex({ userId: 1 }, { unique: true }),
    db.collection<LearningMaterial>(collectionNames.materials).createIndex({ userId: 1, uploadedAt: -1 }),
    db.collection<LearningMaterial>(collectionNames.materials).createIndex({ materialId: 1 }, { unique: true }),
    db.collection<Summary>(collectionNames.summaries).createIndex({ userId: 1, createdAt: -1 }),
    db.collection<Summary>(collectionNames.summaries).createIndex({ summaryId: 1 }, { unique: true }),
    db.collection<StudyNote>(collectionNames.notes).createIndex({ userId: 1, updatedAt: -1 }),
    db.collection<StudyNote>(collectionNames.notes).createIndex({ noteId: 1 }, { unique: true }),
    db.collection<Quiz>(collectionNames.quizzes).createIndex({ userId: 1, noteId: 1, createdAt: -1 }),
    db.collection<Quiz>(collectionNames.quizzes).createIndex({ quizId: 1 }, { unique: true }),
    db.collection<StudySession>(collectionNames.sessions).createIndex({ userId: 1, endTime: -1 }),
    db.collection<StudySession>(collectionNames.sessions).createIndex({ sessionId: 1 }, { unique: true }),
    db.collection<PreferencesDocument>(collectionNames.preferences).createIndex({ userId: 1 }, { unique: true }),
    db.collection<MaterialChatSession>(collectionNames.materialChats).createIndex({ userId: 1, materialId: 1 }),
    db.collection<MaterialChatSession>(collectionNames.materialChats).createIndex({ sessionId: 1 }, { unique: true }),
    db.collection<StudyClockDocument>(collectionNames.studyClocks).createIndex({ userId: 1 }, { unique: true })
  ]);
}

export async function loadStudyClock(userId: string): Promise<StudyClock | null> {
  const db = await getAppDb();
  const doc = await db.collection<StudyClockDocument>(collectionNames.studyClocks).findOne({ userId });
  if (!doc) return null;
  const { userId: _userId, ...clock } = stripMongoId(doc);
  void _userId;
  return clock;
}

export async function saveStudyClock(userId: string, clock: StudyClock) {
  const db = await getAppDb();
  await db
    .collection<StudyClockDocument>(collectionNames.studyClocks)
    .updateOne({ userId }, { $set: { ...clock, userId } }, { upsert: true });
}

export async function loadPreferences(userId: string): Promise<UserPreferences | null> {
  const db = await getAppDb();
  const doc = await db.collection<PreferencesDocument>(collectionNames.preferences).findOne({ userId });
  if (!doc) return null;
  const { userId: _userId, ...prefs } = stripMongoId(doc);
  void _userId;
  return prefs;
}

export async function savePreferences(userId: string, preferences: UserPreferences) {
  const db = await getAppDb();
  await db
    .collection<PreferencesDocument>(collectionNames.preferences)
    .updateOne({ userId }, { $set: { ...preferences, userId } }, { upsert: true });
}

export async function loadUserState(userId: string): Promise<Omit<AppState, "user">> {
  const db = await getAppDb();
  const [materials, summaries, notes, quizzes, sessions] = await Promise.all([
    db.collection<LearningMaterial>(collectionNames.materials).find({ userId }).sort({ uploadedAt: -1 }).toArray(),
    db.collection<Summary>(collectionNames.summaries).find({ userId }).sort({ createdAt: -1 }).toArray(),
    db.collection<StudyNote>(collectionNames.notes).find({ userId }).sort({ updatedAt: -1 }).toArray(),
    db.collection<Quiz>(collectionNames.quizzes).find({ userId }).sort({ createdAt: -1 }).toArray(),
    db.collection<StudySession>(collectionNames.sessions).find({ userId }).sort({ endTime: -1 }).toArray()
  ]);

  return {
    materials: materials.map(stripMongoId),
    summaries: summaries.map(stripMongoId),
    notes: notes.map(stripMongoId),
    quizzes: quizzes.map(stripMongoId),
    sessions: sessions.map(stripMongoId)
  };
}

// ---- Material Chat ----
export async function getOrCreateChatSession(userId: string, materialId: string): Promise<MaterialChatSession> {
  const db = await getAppDb();
  const existing = await db
    .collection<MaterialChatSession>(collectionNames.materialChats)
    .findOne({ userId, materialId });
  if (existing) return stripMongoId(existing);

  const now = new Date().toISOString();
  const session: MaterialChatSession = {
    sessionId: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    materialId,
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  await db.collection<MaterialChatSession>(collectionNames.materialChats).updateOne({ sessionId: session.sessionId }, { $set: session }, { upsert: true });
  return session;
}

export async function appendChatMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const db = await getAppDb();
  const now = new Date().toISOString();
  await db
    .collection<MaterialChatSession>(collectionNames.materialChats)
    .updateOne({ sessionId }, { $push: { messages: { $each: messages } as never }, $set: { updatedAt: now } });
}

export async function getChatSession(sessionId: string): Promise<MaterialChatSession | null> {
  const db = await getAppDb();
  const doc = await db.collection<MaterialChatSession>(collectionNames.materialChats).findOne({ sessionId });
  return doc ? stripMongoId(doc) : null;
}

export async function getChatSessionByMaterial(userId: string, materialId: string): Promise<MaterialChatSession | null> {
  const db = await getAppDb();
  const doc = await db.collection<MaterialChatSession>(collectionNames.materialChats).findOne({ userId, materialId });
  return doc ? stripMongoId(doc) : null;
}

export async function upsertUser(user: User) {
  const db = await getAppDb();
  await db.collection<User>(collectionNames.users).updateOne({ userId: user.userId }, { $set: user }, { upsert: true });
}

export function stripMongoId<T>(document: T & { _id?: unknown }): T {
  const { _id, ...rest } = document;
  void _id;
  return rest as T;
}
