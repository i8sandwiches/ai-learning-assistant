import { NextResponse } from "next/server";
import { ensureIndexes } from "@/lib/dbCollections";
import { getAppDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getAppDb();
    await db.command({ ping: 1 });
    await ensureIndexes();

    return NextResponse.json({
      ok: true,
      database: db.databaseName,
      message: "MongoDB 연결이 정상입니다."
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "MongoDB 연결에 실패했습니다.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
