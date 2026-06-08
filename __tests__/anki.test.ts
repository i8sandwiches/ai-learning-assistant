import {
  esc,
  renderCloze,
  newCard,
  addBasicNote,
  addReversedNote,
  addClozeNote,
  schedule,
  peekLabel,
  getDeckCounts,
  buildQueue,
  getCardFB,
  makeDefaultAnkiState,
  loadAnkiFromStorage,
  saveAnkiToStorage,
  timeAgo,
  todayKey,
} from "@/lib/anki";
import type { AnkiCard, AnkiState } from "@/lib/types";

const DAY = 86400000;
const MIN = 60000;
const learnSteps = [1, 10];

function reviewCard(overrides: Partial<AnkiCard> = {}): AnkiCard {
  return {
    cardId: "c1",
    noteId: "n1",
    deckId: "d1",
    ord: 0,
    state: "review",
    ease: 2.5,
    interval: 10,
    reps: 3,
    lapses: 0,
    learnStep: 0,
    due: Date.now(),
    lastReview: null,
    ...overrides,
  };
}

describe("esc", () => {
  it("HTML 특수문자를 이스케이프한다", () => {
    expect(esc(`<b>"&"</b>`)).toBe("&lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;");
  });
});

describe("renderCloze", () => {
  it("대상 ord는 가려지고 다른 항목은 정답이 노출된다", () => {
    const text = "{{c1::철수}}와 {{c2::영희}}";
    const r = renderCloze(text, 1);
    expect(r.front).toContain("[...]");
    expect(r.front).toContain("영희"); // c2는 정답 노출
    expect(r.back).toContain("철수"); // 뒷면엔 정답
  });

  it("힌트를 대괄호로 표시한다", () => {
    const r = renderCloze("{{c1::답::힌트}}", 1);
    expect(r.front).toContain("[힌트]");
  });
});

describe("newCard", () => {
  it("기본 new 카드를 생성한다", () => {
    const card = newCard("note1", "deck1", 2);
    expect(card.state).toBe("new");
    expect(card.noteId).toBe("note1");
    expect(card.ord).toBe(2);
    expect(card.ease).toBe(2.5);
    expect(card.cardId.startsWith("card_")).toBe(true);
  });
});

describe("노트 추가", () => {
  let s: AnkiState;
  beforeEach(() => {
    s = makeDefaultAnkiState();
    s.notes = [];
    s.cards = [];
  });

  it("기본 노트는 카드 1장", () => {
    addBasicNote(s, "d1", "앞", "뒤", ["tag"]);
    expect(s.notes).toHaveLength(1);
    expect(s.cards).toHaveLength(1);
  });

  it("역방향 노트는 카드 2장", () => {
    addReversedNote(s, "d1", "앞", "뒤", []);
    expect(s.cards).toHaveLength(2);
    expect(s.cards.map((c) => c.ord)).toEqual([0, 1]);
  });

  it("빈칸 노트는 클로즈 개수만큼 카드 생성", () => {
    addClozeNote(s, "d1", "{{c1::a}} {{c2::b}} {{c1::c}}", "", []);
    // c1, c2 → 고유 ord 2개
    expect(s.cards).toHaveLength(2);
    expect(s.cards.map((c) => c.ord).sort()).toEqual([1, 2]);
  });

  it("클로즈 마커가 없으면 ord 1 카드 1장", () => {
    addClozeNote(s, "d1", "마커 없음", "", []);
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0].ord).toBe(1);
  });
});

describe("schedule (SM-2 유사 스케줄러)", () => {
  it("new 카드 Again(0)은 learn 단계로 되돌린다", () => {
    const card = newCard("n", "d");
    const next = schedule(card, 0, learnSteps);
    expect(next.state).toBe("learn");
    expect(next.learnStep).toBe(0);
    expect(next.due - Date.now()).toBeCloseTo(learnSteps[0] * MIN, -3);
  });

  it("new 카드 Easy(3)는 즉시 review로 졸업한다", () => {
    const next = schedule(newCard("n", "d"), 3, learnSteps);
    expect(next.state).toBe("review");
    expect(next.interval).toBe(4);
  });

  it("learn 마지막 단계에서 Good(2)이면 review로 졸업한다", () => {
    const card = newCard("n", "d");
    card.state = "learn";
    card.learnStep = learnSteps.length - 1;
    const next = schedule(card, 2, learnSteps);
    expect(next.state).toBe("review");
    expect(next.interval).toBe(1);
  });

  it("learn 중간 단계에서 Good(2)이면 다음 단계로 진행", () => {
    const card = newCard("n", "d");
    card.state = "learn";
    card.learnStep = 0;
    const next = schedule(card, 2, learnSteps);
    expect(next.state).toBe("learn");
    expect(next.learnStep).toBe(1);
  });

  it("review 카드 Again(0)은 lapse 증가 + ease 감소 + learn 복귀", () => {
    const card = reviewCard({ ease: 2.5, lapses: 0 });
    const next = schedule(card, 0, learnSteps);
    expect(next.state).toBe("learn");
    expect(next.lapses).toBe(1);
    expect(next.ease).toBeCloseTo(2.3, 5);
  });

  it("review 카드 Good(2)은 interval을 ease배로 늘린다", () => {
    const card = reviewCard({ ease: 2.5, interval: 10 });
    const next = schedule(card, 2, learnSteps);
    expect(next.interval).toBe(25); // round(10 * 2.5)
    expect(next.reps).toBe(4);
  });

  it("review 카드 Easy(3)은 ease를 0.15 올린다", () => {
    const card = reviewCard({ ease: 2.5, interval: 10 });
    const next = schedule(card, 3, learnSteps);
    expect(next.ease).toBeCloseTo(2.65, 5);
    expect(next.interval).toBeGreaterThan(25);
  });

  it("ease는 최소 1.3 이하로 내려가지 않는다", () => {
    const card = reviewCard({ ease: 1.35 });
    const next = schedule(card, 0, learnSteps);
    expect(next.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("원본 카드를 변경하지 않는다(불변)", () => {
    const card = reviewCard({ interval: 10 });
    const copy = { ...card };
    schedule(card, 2, learnSteps);
    expect(card).toEqual(copy);
  });
});

describe("peekLabel", () => {
  it("learn 결과는 분 단위 라벨", () => {
    const label = peekLabel(newCard("n", "d"), 0, learnSteps);
    expect(label).toMatch(/분$/);
  });

  it("review 졸업 결과는 일 단위 라벨", () => {
    const label = peekLabel(newCard("n", "d"), 3, learnSteps);
    expect(label).toBe("4일");
  });
});

describe("getDeckCounts / buildQueue", () => {
  function stateWith(cards: Partial<AnkiCard>[]): AnkiState {
    const s = makeDefaultAnkiState();
    s.notes = [];
    s.cards = cards.map((c, i) => newCardFull(c, i));
    s.todayCounts = { new: 0, learn: 0, review: 0 };
    return s;
  }
  function newCardFull(c: Partial<AnkiCard>, i: number): AnkiCard {
    return { ...reviewCard({ cardId: `c${i}`, deckId: "d1" }), ...c };
  }

  it("suspended 카드는 집계/큐에서 제외된다", () => {
    const s = stateWith([
      { state: "suspended" },
      { state: "new", due: Date.now() },
    ]);
    const counts = getDeckCounts(s, "d1");
    expect(counts.total).toBe(1);
    expect(counts.new).toBe(1);
  });

  it("newPerDay 한도를 넘지 않는다", () => {
    const s = stateWith(Array.from({ length: 50 }, () => ({ state: "new" as const, due: Date.now() })));
    s.settings.newPerDay = 20;
    expect(getDeckCounts(s, "d1").new).toBe(20);
    expect(buildQueue(s, "d1")).toHaveLength(20);
  });

  it("아직 due가 안 된 review 카드는 큐에 안 들어간다", () => {
    const s = stateWith([
      { state: "review", due: Date.now() + DAY },
      { state: "review", due: Date.now() - 1000 },
    ]);
    expect(buildQueue(s, "d1")).toHaveLength(1);
  });

  it("큐 순서: learn → review → new", () => {
    const s = stateWith([
      { state: "new", due: Date.now() - 1 },
      { state: "review", due: Date.now() - 1 },
      { state: "learn", due: Date.now() - 1 },
    ]);
    const q = buildQueue(s, "d1");
    expect(q.map((c) => c.state)).toEqual(["learn", "review", "new"]);
  });
});

describe("getCardFB", () => {
  it("basic 노트 앞/뒤를 반환한다", () => {
    const s = makeDefaultAnkiState();
    s.notes = [];
    s.cards = [];
    addBasicNote(s, "d1", "질문", "정답", []);
    const fb = getCardFB(s, s.cards[0]);
    expect(fb.front).toBe("질문");
    expect(fb.back).toBe("정답");
  });

  it("역방향 카드(ord=1)는 앞뒤가 뒤집힌다", () => {
    const s = makeDefaultAnkiState();
    s.notes = [];
    s.cards = [];
    addReversedNote(s, "d1", "앞면", "뒷면", []);
    const reversed = s.cards.find((c) => c.ord === 1)!;
    const fb = getCardFB(s, reversed);
    expect(fb.front).toBe("뒷면");
    expect(fb.back).toBe("앞면");
  });

  it("노트를 찾지 못하면 placeholder를 반환한다", () => {
    const s = makeDefaultAnkiState();
    const fb = getCardFB(s, reviewCard({ noteId: "없는노트" }));
    expect(fb.front).toBe("—");
  });
});

describe("makeDefaultAnkiState", () => {
  it("기본 덱과 시드 노트/카드를 포함한다", () => {
    const s = makeDefaultAnkiState();
    expect(s.decks.length).toBeGreaterThanOrEqual(3);
    expect(s.notes.length).toBeGreaterThan(0);
    expect(s.cards.length).toBeGreaterThan(0);
    expect(s.todayDate).toBe(todayKey());
  });
});

describe("localStorage 연동", () => {
  beforeEach(() => localStorage.clear());

  it("저장한 상태를 다시 불러올 수 있다", () => {
    const s = makeDefaultAnkiState();
    s.activeDeckId = "deck_test";
    saveAnkiToStorage(s, "user1");
    const loaded = loadAnkiFromStorage("user1");
    expect(loaded.activeDeckId).toBe("deck_test");
  });

  it("저장된 값이 없으면 기본 상태를 반환한다", () => {
    const loaded = loadAnkiFromStorage("nobody");
    expect(loaded.decks.length).toBeGreaterThanOrEqual(3);
  });

  it("날짜가 바뀌면 오늘 카운트를 리셋한다", () => {
    const s = makeDefaultAnkiState();
    s.todayDate = "2000-01-01";
    s.todayCounts = { new: 5, learn: 3, review: 9 };
    saveAnkiToStorage(s, "u");
    const loaded = loadAnkiFromStorage("u");
    expect(loaded.todayDate).toBe(todayKey());
    expect(loaded.todayCounts).toEqual({ new: 0, learn: 0, review: 0 });
  });
});

describe("timeAgo", () => {
  it.each([
    [30 * 1000, "방금"],
    [5 * 60 * 1000, "분 전"],
    [3 * 60 * 60 * 1000, "시간 전"],
    [2 * DAY, "일 전"],
  ])("%dms 전 → %s 포함", (ago, expected) => {
    expect(timeAgo(Date.now() - ago)).toContain(expected);
  });
});
