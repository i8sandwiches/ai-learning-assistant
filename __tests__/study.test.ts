import {
  inferFileType,
  validateUpload,
  formatMinutes,
  calculateCharacter,
  recentDays,
  summarizeLocally,
  createId,
  allowedExtensions,
} from "@/lib/study";
import type { StudySession } from "@/lib/types";

/** durationMinutes/endTime만 의미 있는 최소 세션 팩토리 */
function session(durationMinutes: number, endTime: string): StudySession {
  return {
    sessionId: "s",
    userId: "u",
    subject: "공부",
    timerType: "STOPWATCH",
    startTime: endTime,
    endTime,
    durationMinutes,
  };
}

describe("createId", () => {
  it("접두사로 시작하고 매번 고유한 값을 만든다", () => {
    const a = createId("note");
    const b = createId("note");
    expect(a.startsWith("note_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("inferFileType", () => {
  it.each([
    ["lecture.pdf", "PDF"],
    ["NOTE.PDF", "PDF"],
    ["memo.txt", "TXT"],
    ["readme.md", "MD"],
    ["photo.png", "IMAGE"],
    ["photo.JPG", "IMAGE"],
    ["pic.jpeg", "IMAGE"],
    ["pic.webp", "IMAGE"],
  ])("%s → %s", (name, expected) => {
    expect(inferFileType(name)).toBe(expected);
  });

  it("지원하지 않는 확장자는 null", () => {
    expect(inferFileType("archive.zip")).toBeNull();
    expect(inferFileType("noext")).toBeNull();
  });

  it("허용 확장자 목록이 노출된다", () => {
    expect(allowedExtensions).toContain(".pdf");
    expect(allowedExtensions).toContain(".md");
  });
});

describe("validateUpload", () => {
  function fakeFile(name: string, size: number): File {
    const f = new File(["x"], name, { type: "application/octet-stream" });
    Object.defineProperty(f, "size", { value: size });
    return f;
  }

  it("허용 형식 & 10MB 이하 → ok", () => {
    const res = validateUpload(fakeFile("doc.pdf", 1024));
    expect(res).toEqual({ ok: true, fileType: "PDF" });
  });

  it("지원하지 않는 형식은 거부", () => {
    const res = validateUpload(fakeFile("a.zip", 10));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/업로드/);
  });

  it("10MB 초과는 거부", () => {
    const res = validateUpload(fakeFile("big.pdf", 10 * 1024 * 1024 + 1));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/10MB/);
  });

  it("정확히 10MB는 허용 (경계값)", () => {
    const res = validateUpload(fakeFile("edge.pdf", 10 * 1024 * 1024));
    expect(res.ok).toBe(true);
  });
});

describe("formatMinutes", () => {
  it.each([
    [0, "0분"],
    [5, "5분"],
    [60, "1시간"],
    [90, "1시간 30분"],
    [125, "2시간 5분"],
  ])("%d분 → %s", (input, expected) => {
    expect(formatMinutes(input)).toBe(expected);
  });

  it("음수는 0분으로 보정", () => {
    expect(formatMinutes(-30)).toBe("0분");
  });

  it("소수는 반올림", () => {
    expect(formatMinutes(59.6)).toBe("1시간");
  });
});

describe("recentDays", () => {
  it("기본 7일치 라벨을 오름차순으로 반환", () => {
    const days = recentDays();
    expect(days).toHaveLength(7);
    expect([...days].sort()).toEqual(days); // 이미 오름차순
    // 마지막 항목은 오늘
    expect(days[6]).toBe(new Date().toISOString().slice(0, 10));
  });

  it("길이를 지정할 수 있다", () => {
    expect(recentDays(3)).toHaveLength(3);
  });
});

describe("summarizeLocally", () => {
  it("제목과 핵심/복습 섹션을 포함한다", () => {
    const out = summarizeLocally("운영체제", "첫 문장이다. 두 번째 문장이다.");
    expect(out).toContain("# 운영체제 요약");
    expect(out).toContain("## 핵심 내용");
    expect(out).toContain("## 복습 포인트");
    expect(out).toContain("- 첫 문장이다.");
  });

  it("빈 내용도 안전하게 처리한다", () => {
    const out = summarizeLocally("빈자료", "");
    expect(out).toContain("# 빈자료 요약");
    expect(out).toContain("자료 내용을 읽을 수 없어");
  });

  it("최대 5문장까지만 핵심으로 뽑는다", () => {
    const text = "1. 2. 3. 4. 5. 6. 7.".replace(/(\d)\./g, "문장$1.");
    const out = summarizeLocally("t", text);
    const bullets = out.split("\n").filter((l) => l.startsWith("- 문장"));
    expect(bullets.length).toBeLessThanOrEqual(5);
  });
});

describe("calculateCharacter", () => {
  it("세션이 없으면 레벨 1, 출석 0일", () => {
    const c = calculateCharacter("u1", []);
    expect(c.level).toBe(1);
    expect(c.attendanceDays).toBe(0);
    expect(c.totalHours).toBe(0);
    expect(c.characterId).toBe("character_u1");
  });

  it("출석일이 100일 이상이면 레벨 2로 올라간다", () => {
    const sessions = Array.from({ length: 100 }, (_, i) => {
      const d = new Date(2024, 0, 1 + i).toISOString().slice(0, 10);
      return session(10, `${d}T10:00:00.000Z`);
    });
    const c = calculateCharacter("u", sessions);
    expect(c.attendanceDays).toBe(100);
    expect(c.level).toBe(2);
  });

  it("같은 날 여러 세션은 출석 1일로 집계되고 누적 시간은 합산된다", () => {
    const c = calculateCharacter("u", [
      session(60, "2024-03-01T09:00:00.000Z"),
      session(60, "2024-03-01T13:00:00.000Z"),
    ]);
    expect(c.attendanceDays).toBe(1);
    expect(c.totalHours).toBe(2);
    expect(c.experiencePoint).toBe(120);
  });

  it("레벨은 14를 넘지 않는다", () => {
    const sessions = Array.from({ length: 300 }, (_, i) => {
      const d = new Date(2020, 0, 1 + i).toISOString().slice(0, 10);
      return session(10000, `${d}T10:00:00.000Z`);
    });
    const c = calculateCharacter("u", sessions);
    expect(c.level).toBeLessThanOrEqual(14);
    expect(c.progress).toBeGreaterThanOrEqual(0);
    expect(c.progress).toBeLessThanOrEqual(100);
  });
});
