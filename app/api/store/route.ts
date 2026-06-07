import { NextResponse } from "next/server";
import { collectionNames, ensureIndexes, loadPreferences, loadUserState, savePreferences, upsertUser } from "@/lib/dbCollections";
import { getAppDb } from "@/lib/mongodb";
import { LearningMaterial, Quiz, StudyNote, StudySession, Summary, User, UserPreferences } from "@/lib/types";

type StoreOperation =
  | {
      operation: "login";
      user: User;
    }
  | {
      operation: "saveMaterialSummary";
      userId: string;
      material: LearningMaterial;
      summary: Summary;
    }
  | {
      operation: "addSummary";
      userId: string;
      summary: Summary;
    }
  | {
      operation: "deleteSummary";
      userId: string;
      summaryId: string;
    }
  | {
      operation: "upsertNote";
      userId: string;
      note: StudyNote;
    }
  | {
      operation: "deleteNote";
      userId: string;
      noteId: string;
    }
  | {
      operation: "addQuizzes";
      userId: string;
      quizzes: Quiz[];
    }
  | {
      operation: "addSession";
      userId: string;
      session: StudySession;
    }
  | {
      operation: "savePreferences";
      userId: string;
      preferences: UserPreferences;
    };

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }

    await ensureIndexes();
    const [data, preferences] = await Promise.all([loadUserState(userId), loadPreferences(userId)]);
    return NextResponse.json({ ...data, preferences });
  } catch (error) {
    return NextResponse.json(
      {
        error: "학습 데이터를 불러오지 못했습니다.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StoreOperation;
    const db = await getAppDb();
    await ensureIndexes();

    if (body.operation === "login") {
      await upsertUser(body.user);
      return NextResponse.json({ ok: true });
    }

    const userId = body.userId;
    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }

    switch (body.operation) {
      case "saveMaterialSummary": {
        assertOwner(userId, body.material.userId);
        assertOwner(userId, body.summary.userId);
        await Promise.all([
          db
            .collection<LearningMaterial>(collectionNames.materials)
            .updateOne({ materialId: body.material.materialId, userId }, { $set: body.material }, { upsert: true }),
          db
            .collection<Summary>(collectionNames.summaries)
            .updateOne({ summaryId: body.summary.summaryId, userId }, { $set: body.summary }, { upsert: true })
        ]);
        break;
      }
      case "addSummary": {
        assertOwner(userId, body.summary.userId);
        await db
          .collection<Summary>(collectionNames.summaries)
          .updateOne({ summaryId: body.summary.summaryId, userId }, { $set: body.summary }, { upsert: true });
        break;
      }
      case "deleteSummary": {
        await db.collection<Summary>(collectionNames.summaries).deleteOne({ summaryId: body.summaryId, userId });
        break;
      }
      case "upsertNote": {
        assertOwner(userId, body.note.userId);
        await db
          .collection<StudyNote>(collectionNames.notes)
          .updateOne({ noteId: body.note.noteId, userId }, { $set: body.note }, { upsert: true });
        break;
      }
      case "deleteNote": {
        await Promise.all([
          db.collection<StudyNote>(collectionNames.notes).deleteOne({ noteId: body.noteId, userId }),
          db.collection<Quiz>(collectionNames.quizzes).deleteMany({ noteId: body.noteId, userId }),
          db.collection<Summary>(collectionNames.summaries).deleteMany({ noteId: body.noteId, userId })
        ]);
        break;
      }
      case "addQuizzes": {
        if (body.quizzes.length > 0) {
          await Promise.all(
            body.quizzes.map((quiz) => {
              assertOwner(userId, quiz.userId);
              return db
                .collection<Quiz>(collectionNames.quizzes)
                .updateOne({ quizId: quiz.quizId, userId }, { $set: quiz }, { upsert: true });
            })
          );
        }
        break;
      }
      case "addSession": {
        assertOwner(userId, body.session.userId);
        await db
          .collection<StudySession>(collectionNames.sessions)
          .updateOne({ sessionId: body.session.sessionId, userId }, { $set: body.session }, { upsert: true });
        break;
      }
      case "savePreferences": {
        await savePreferences(userId, body.preferences);
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "학습 데이터를 저장하지 못했습니다.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

function assertOwner(expectedUserId: string, actualUserId: string) {
  if (expectedUserId !== actualUserId) {
    throw new Error("사용자 데이터 소유자가 일치하지 않습니다.");
  }
}
