import { AnkiCard, AnkiGrade, AnkiNote, AnkiState } from "./types";

const DAY = 86400000;
const MIN = 60000;

export function nowMs() { return Date.now(); }
export function todayKey() { return new Date().toISOString().slice(0, 10); }

export function createAId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function newCard(noteId: string, deckId: string, ord = 0): AnkiCard {
  return {
    cardId: createAId("card"),
    noteId, deckId, ord,
    state: "new",
    ease: 2.5, interval: 0, reps: 0, lapses: 0, learnStep: 0,
    due: nowMs(),
    lastReview: null,
  };
}

export function addBasicNote(s: AnkiState, deckId: string, front: string, back: string, tags: string[]) {
  const noteId = createAId("note");
  s.notes.push({ noteId, deckId, type: "basic", fields: { front, back }, tags, createdAt: nowMs() });
  s.cards.push(newCard(noteId, deckId, 0));
}

export function addClozeNote(s: AnkiState, deckId: string, text: string, extra: string, tags: string[]) {
  const matches = [...text.matchAll(/\{\{c(\d+)::/g)];
  const ords = [...new Set(matches.map(m => parseInt(m[1], 10)))].sort((a, b) => a - b);
  if (!ords.length) ords.push(1);
  const noteId = createAId("note");
  s.notes.push({ noteId, deckId, type: "cloze", fields: { text, extra: extra || "" }, tags, createdAt: nowMs() });
  for (const ord of ords) s.cards.push(newCard(noteId, deckId, ord));
}

export function renderCloze(text: string, ord: number): { front: string; back: string } {
  const re = /\{\{c(\d+)::([^}:]+?)(?:::([^}]*))?\}\}/g;
  const front = text.replace(re, (_m, n, ans, hint) =>
    parseInt(n, 10) === ord
      ? `<span class="cloze">${hint ? `[${esc(hint)}]` : "[...]"}</span>`
      : esc(ans)
  );
  const back = text.replace(re, (_m, n, ans) =>
    parseInt(n, 10) === ord
      ? `<span class="cloze-ans">${esc(ans)}</span>`
      : esc(ans)
  );
  return { front, back };
}

export function esc(s: string) {
  return String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch));
}

export function schedule(card: AnkiCard, grade: AnkiGrade, learnSteps: number[]): AnkiCard {
  const c = { ...card };
  if (c.state === "new" || c.state === "learn") {
    if (grade === 0) {
      c.state = "learn"; c.learnStep = 0; c.due = nowMs() + learnSteps[0] * MIN;
    } else if (grade === 1) {
      c.state = "learn";
      const step = learnSteps[c.learnStep] ?? learnSteps[learnSteps.length - 1];
      c.due = nowMs() + step * MIN;
    } else if (grade === 2) {
      if (c.learnStep + 1 >= learnSteps.length) {
        c.state = "review"; c.interval = 1; c.reps = 1; c.due = nowMs() + DAY;
      } else {
        c.state = "learn"; c.learnStep += 1; c.due = nowMs() + learnSteps[c.learnStep] * MIN;
      }
    } else {
      c.state = "review"; c.interval = 4; c.reps = 1;
      c.ease = Math.min(2.75, c.ease + 0.15); c.due = nowMs() + 4 * DAY;
    }
  } else {
    if (grade === 0) {
      c.lapses += 1; c.ease = Math.max(1.3, c.ease - 0.2);
      c.state = "learn"; c.learnStep = 0; c.interval = 0; c.due = nowMs() + learnSteps[0] * MIN;
    } else if (grade === 1) {
      const next = Math.max(c.interval + 1, Math.round(c.interval * 1.2));
      c.interval = next; c.ease = Math.max(1.3, c.ease - 0.15); c.reps += 1; c.due = nowMs() + next * DAY;
    } else if (grade === 2) {
      const next = Math.max(c.interval + 1, Math.round(c.interval * c.ease));
      c.interval = next; c.reps += 1; c.due = nowMs() + next * DAY;
    } else {
      const next = Math.max(c.interval + 1, Math.round(c.interval * c.ease * 1.3));
      c.interval = next; c.ease += 0.15; c.reps += 1; c.due = nowMs() + next * DAY;
    }
  }
  c.lastReview = nowMs();
  return c;
}

export function peekLabel(card: AnkiCard, grade: AnkiGrade, learnSteps: number[]): string {
  const next = schedule(card, grade, learnSteps);
  if (next.state === "learn") {
    const ms = next.due - nowMs();
    if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}분`;
    if (ms < DAY) return `${Math.round(ms / MIN / 60)}시간`;
    return `${Math.round(ms / DAY)}일`;
  }
  return `${next.interval}일`;
}

export function getDeckCounts(s: AnkiState, deckId: string) {
  const t = nowMs();
  const cards = s.cards.filter(c => c.deckId === deckId && c.state !== "suspended");
  const tc = s.todayCounts;
  return {
    new: Math.max(0, Math.min(cards.filter(c => c.state === "new").length, s.settings.newPerDay - tc.new)),
    learn: cards.filter(c => c.state === "learn" && c.due <= t).length,
    review: Math.max(0, Math.min(cards.filter(c => c.state === "review" && c.due <= t).length, s.settings.reviewPerDay - tc.review)),
    total: cards.length,
  };
}

export function buildQueue(s: AnkiState, deckId: string): AnkiCard[] {
  const t = nowMs();
  const cards = s.cards.filter(c => c.deckId === deckId && c.state !== "suspended");
  const tc = s.todayCounts;
  const newRem = Math.max(0, s.settings.newPerDay - tc.new);
  const revRem = Math.max(0, s.settings.reviewPerDay - tc.review);
  const learning = cards.filter(c => c.state === "learn" && c.due <= t).sort((a, b) => a.due - b.due);
  const review = cards.filter(c => c.state === "review" && c.due <= t).sort((a, b) => a.due - b.due).slice(0, revRem);
  const news = cards.filter(c => c.state === "new").sort((a, b) => a.due - b.due).slice(0, newRem);
  return [...learning, ...review, ...news];
}

export function getCardFB(s: AnkiState, card: AnkiCard) {
  const note = s.notes.find(n => n.noteId === card.noteId);
  if (!note) return { front: "—", back: "—", deckName: "" };
  const deck = s.decks.find(d => d.deckId === card.deckId);
  if (note.type === "cloze") {
    const r = renderCloze(note.fields.text ?? "", card.ord);
    const extra = note.fields.extra ? `<div class="cloze-extra">${esc(note.fields.extra)}</div>` : "";
    return { front: r.front, back: r.back + extra, deckName: deck?.name ?? "" };
  }
  return { front: esc(note.fields.front ?? ""), back: esc(note.fields.back ?? ""), deckName: deck?.name ?? "" };
}

const SEED_SAMPLES = [
  { front: "문맥 교환(Context Switch)의 정의는?", back: "CPU가 한 프로세스의 상태를 저장하고 다른 것으로 복원해 실행을 전환하는 작업." },
  { front: "교착상태(Deadlock) 4가지 필요조건은?", back: "상호 배제, 점유와 대기, 비선점, 순환 대기." },
  { front: "TCP 3-way handshake 순서는?", back: "SYN → SYN-ACK → ACK." },
  { front: "ubiquitous", back: "어디에나 있는, 도처에 존재하는." },
  { front: "mitigate", back: "완화하다, (위험·고통을) 덜다." },
];

export function makeDefaultAnkiState(): AnkiState {
  const defaultDeckId = "deck_default";
  const s: AnkiState = {
    activeDeckId: defaultDeckId,
    decks: [{ deckId: defaultDeckId, name: "기본 덱", createdAt: nowMs() }],
    notes: [], cards: [], reviewLog: [],
    todayDate: todayKey(),
    todayCounts: { new: 0, learn: 0, review: 0 },
    settings: { newPerDay: 20, reviewPerDay: 200, learnSteps: [1, 10] },
  };
  const csId = createAId("deck");
  const enId = createAId("deck");
  s.decks.push(
    { deckId: csId, name: "CS · 운영체제", createdAt: nowMs() },
    { deckId: enId, name: "영어 · 어휘", createdAt: nowMs() },
  );
  for (const { front, back } of SEED_SAMPLES.slice(0, 3)) addBasicNote(s, csId, front, back, []);
  for (const { front, back } of SEED_SAMPLES.slice(3)) addBasicNote(s, enId, front, back, []);
  addClozeNote(s, csId, "제3 정규형(3NF)은 2NF를 만족하고 모든 비주요 속성이 기본 키에 {{c1::이행적}}으로 종속되지 않을 것을 요구한다.", "", []);
  return s;
}

export function loadAnkiFromStorage(): AnkiState {
  try {
    const raw = localStorage.getItem("anki_state_v3");
    if (raw) {
      const parsed = JSON.parse(raw) as AnkiState;
      if (parsed.todayDate !== todayKey()) {
        parsed.todayDate = todayKey();
        parsed.todayCounts = { new: 0, learn: 0, review: 0 };
      }
      return { ...makeDefaultAnkiState(), ...parsed };
    }
  } catch { /* ignore */ }
  return makeDefaultAnkiState();
}

export function saveAnkiToStorage(s: AnkiState) {
  try { localStorage.setItem("anki_state_v3", JSON.stringify(s)); } catch { /* ignore */ }
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "방금";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  return `${Math.floor(diff / 86400000)}일 전`;
}
