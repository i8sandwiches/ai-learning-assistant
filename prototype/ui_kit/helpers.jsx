/* ============================================================
   helpers.jsx — shared utilities, sample data, Icon, Markdown
   Exposed on window for the other babel scripts.
   ============================================================ */

/* ---- Lucide icon wrapper (CDN UMD `lucide`) ---- */
function Icon({ name, size = 18, className = "", color }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host || !window.lucide) return;
    host.innerHTML = "";
    const el = document.createElement("i");
    el.setAttribute("data-lucide", name);
    host.appendChild(el);
    window.lucide.createIcons({
      attrs: { width: size, height: size, "stroke-width": 2 },
    });
  }, [name, size]);
  return (
    <span
      ref={ref}
      className={"lucide-host " + className}
      style={{ display: "inline-flex", color }}
      aria-hidden="true"
    />
  );
}

/* ---- formatting (from lib/study.ts) ---- */
function formatMinutes(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}분`;
  if (rest === 0) return `${hours}시간`;
  return `${hours}시간 ${rest}분`;
}

const SUBJECTS = ["국어", "영어", "수학", "과학", "사회", "전공", "자격증", "기타"];

/* ---- deterministic study sessions for the demo ---- */
function buildSampleSessions() {
  const out = [];
  const today = new Date();
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 120; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    // denser on weekdays, occasional empty days
    const sessionCount = rand() < (dow === 0 || dow === 6 ? 0.35 : 0.78) ? (rand() < 0.4 ? 2 : 1) : 0;
    for (let s = 0; s < sessionCount; s++) {
      const subject = SUBJECTS[Math.floor(rand() * SUBJECTS.length)];
      const dur = [25, 25, 30, 45, 50, 60, 90][Math.floor(rand() * 7)];
      const end = new Date(d);
      end.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 60));
      out.push({
        sessionId: `s_${i}_${s}`,
        userId: "demo",
        subject,
        timerType: rand() < 0.5 ? "POMODORO" : "STOPWATCH",
        startTime: new Date(end.getTime() - dur * 60000).toISOString(),
        endTime: end.toISOString(),
        durationMinutes: dur,
      });
    }
  }
  return out.sort((a, b) => (a.endTime < b.endTime ? 1 : -1));
}

/* ---- character growth (from lib/study.ts) ---- */
function calculateCharacter(sessions) {
  const totalMinutes = sessions.reduce((s, x) => s + x.durationMinutes, 0);
  const experiencePoint = Math.round(totalMinutes);
  const level = Math.max(1, Math.floor(experiencePoint / 300) + 1);
  const growthStage =
    level >= 12 ? "마스터" : level >= 8 ? "탐구가" : level >= 5 ? "성장기" : level >= 3 ? "새싹" : "입문";
  const status =
    totalMinutes >= 600 ? "긴 호흡의 학습 루틴이 자리 잡고 있어요."
    : totalMinutes >= 180 ? "복습 리듬이 안정적으로 쌓이고 있어요."
    : totalMinutes > 0 ? "첫 학습 기록이 캐릭터를 깨웠어요."
    : "타이머로 학습을 마치면 경험치가 쌓입니다.";
  return { name: "루미", level, experiencePoint, growthStage, status };
}

function recentDays(days = 7) {
  const labels = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    labels.push(d.toISOString().slice(0, 10));
  }
  return labels;
}

/* ---- sample summaries / notes ---- */
const SAMPLE_SUMMARIES = [
  { summaryId: "sum1", title: "운영체제 - 프로세스 스케줄링", sourceType: "material", createdAt: "2026-05-27T10:20:00",
    content: "# 운영체제 - 프로세스 스케줄링 요약\n\n## 핵심 내용\n- 선점형 스케줄링은 실행 중인 프로세스를 중단시키고 다른 프로세스에 CPU를 할당한다.\n- 라운드 로빈은 타임 퀀텀 단위로 프로세스를 순환 실행한다.\n- 우선순위 스케줄링은 기아 상태를 유발할 수 있어 에이징 기법으로 보완한다.\n\n## 복습 포인트\n- 각 알고리즘의 평균 대기 시간을 계산해 보세요.\n- 타이머를 켜고 25분 단위로 읽기, 정리, 문제 풀이를 나누면 좋습니다.\n\n> Gemini API로 생성된 요약입니다." },
  { summaryId: "sum2", title: "자료구조 - 이진 탐색 트리", sourceType: "material", createdAt: "2026-05-26T14:05:00",
    content: "# 자료구조 - 이진 탐색 트리 요약\n\n## 핵심 내용\n- BST는 왼쪽 서브트리의 모든 값이 루트보다 작고 오른쪽은 크다.\n- 균형이 무너지면 탐색이 O(n)까지 느려진다.\n- AVL, 레드-블랙 트리로 균형을 유지한다.\n\n## 복습 포인트\n- 삽입/삭제 시 회전 연산을 직접 그려 보세요." },
  { summaryId: "sum3", title: "영어 모의고사 오답 노트", sourceType: "note", createdAt: "2026-05-25T19:40:00",
    content: "# 영어 모의고사 오답 노트 요약\n\n## 핵심 내용\n- 빈칸 추론은 글의 주제문과 반복되는 키워드를 먼저 찾는다.\n- 어휘 문맥 추론은 앞뒤 문장의 논리 관계를 본다.\n\n> 노트에서 생성된 요약입니다." },
];

const SAMPLE_MATERIALS = [
  { materialId: "m1", fileName: "OS_3장_스케줄링.pdf", fileType: "PDF", uploadedAt: "2026-05-27T10:18:00" },
  { materialId: "m2", fileName: "자료구조_BST.pdf", fileType: "PDF", uploadedAt: "2026-05-26T14:02:00" },
  { materialId: "m3", fileName: "영단어_DAY12.txt", fileType: "TXT", uploadedAt: "2026-05-24T08:30:00" },
];

const SAMPLE_NOTES = [
  { noteId: "n1", title: "운영체제 핵심 정리", subject: "전공", updatedAt: "2026-05-28T09:10:00",
    markdownContent: "## 오늘의 핵심\n- 프로세스와 스레드의 차이\n- 컨텍스트 스위칭 비용\n- 교착 상태의 4가지 조건\n\n## 복습 포인트\n- 세마포어와 뮤텍스 비교\n> 시험 D-14, 매일 1챕터씩" },
  { noteId: "n2", title: "영어 구문 정리", subject: "영어", updatedAt: "2026-05-27T20:30:00",
    markdownContent: "## 오늘의 핵심\n- 가정법 과거완료\n- 도치 구문\n\n## 예문\n- Had I known, I would have come." },
  { noteId: "n3", title: "수학 미적분 공식", subject: "수학", updatedAt: "2026-05-25T16:00:00",
    markdownContent: "## 오늘의 핵심\n- 부분적분 공식\n- 치환적분의 조건" },
];

const SAMPLE_QUIZZES = [
  { quizId: "q1", noteId: "n1", question: "컨텍스트 스위칭이 비용이 큰 이유는?", answer: "레지스터·PCB 저장/복원과 캐시·TLB 무효화 때문입니다." },
  { quizId: "q2", noteId: "n1", question: "교착 상태의 4가지 필요조건은?", answer: "상호 배제, 점유와 대기, 비선점, 순환 대기." },
];

/* ---- cloze parsing / rendering (Anki {{c1::answer::hint}} syntax) ---- */
const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;
function hasCloze(text) { return /\{\{c\d+::/.test(text || ""); }
function clozeToPlain(text) { return (text || "").replace(CLOZE_RE, (_, n, ans) => ans); }
function clozeToBlank(text) { return (text || "").replace(CLOZE_RE, (_, n, ans, hint) => (hint ? `[${hint}]` : "[…]")); }
function nextClozeNum(text) {
  let max = 0, m; CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(text || ""))) max = Math.max(max, +m[1]);
  return max + 1;
}
function renderCloze(text, reveal) {
  const parts = []; let last = 0, m, i = 0; CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(text || ""))) {
    if (m.index > last) parts.push(<React.Fragment key={i++}>{text.slice(last, m.index)}</React.Fragment>);
    const ans = m[2], hint = m[3];
    parts.push(reveal
      ? <span className="cloze-answer" key={i++}>{ans}</span>
      : <span className="cloze-blank" key={i++}>{hint ? `[${hint}]` : "[…]"}</span>);
    last = m.index + m[0].length;
  }
  if (last < (text || "").length) parts.push(<React.Fragment key={i++}>{text.slice(last)}</React.Fragment>);
  return parts;
}
/* label shown on a card row / review header */
function cardKindLabel(c) {
  if (c.type === "cloze") return "빈칸";
  if (c.reversed) return "역방향";
  return "기본";
}
/* front / back text for browse + review (handles cloze) */
function cardFace(c, side) {
  if (c.type === "cloze") return side === "front" ? clozeToBlank(c.text) : clozeToPlain(c.text);
  return side === "front" ? c.front : c.back;
}

/* ---- Anki review history (per-deck daily reviews, ~1yr) for the stats graph ---- */
function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const f = v / Math.pow(10, exp);
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}
function buildAnkiReviewHistory(deckIds, days) {
  const out = {};
  deckIds.forEach((id, di) => {
    let seed = (di + 3) * 97 + 13;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const pts = []; let total = 0, studied = 0;
    for (let i = days - 1; i >= 0; i--) {
      const recency = (days - i) / days;            // grows toward present
      const weekly = (Math.sin(i / 3.5) + 1) / 2;    // intra-week wiggle
      let learn = 0, young = 0, mature = 0;
      if (rand() < 0.42 + recency * 0.42) {
        const base = (6 + recency * 60) * (0.4 + weekly * 0.95) * (0.55 + rand() * 0.95);
        mature = Math.round(base * 0.55);
        young = Math.round(base * 0.30);
        learn = Math.round(base * 0.15 + rand() * 4);
        const t = learn + young + mature;
        if (t > 0) { studied++; total += t; }
      }
      pts.push({ d: -i, learn, young, mature });
    }
    out[id] = {
      points: pts, total, daysStudied: studied, totalDays: days,
      avgStudied: studied ? Math.round(total / studied) : 0,
      avgPeriod: Math.round(total / days),
      pct: Math.round((studied / days) * 100),
    };
  });
  return out;
}

/* ---- sample Anki state ---- */
const SAMPLE_ANKI = {
  decks: [
    { deckId: "d1", name: "전공 - 운영체제" },
    { deckId: "d2", name: "영단어 DAY 1-30" },
    { deckId: "d3", name: "자격증 기출" },
  ],
  counts: {
    d1: { new: 8, learn: 3, due: 12 },
    d2: { new: 20, learn: 5, due: 34 },
    d3: { new: 4, learn: 1, due: 7 },
  },
  cards: {
    d1: [
      { cardId: "c1", type: "basic", state: "due", front: "프로세스와 스레드의 가장 큰 차이는?", back: "프로세스는 독립된 메모리 공간을 갖고, 스레드는 같은 프로세스 내 메모리를 공유한다.", interval: 6 },
      { cardId: "c2", type: "basic", state: "new", front: "교착 상태(Deadlock)의 4가지 필요조건은?", back: "상호 배제, 점유와 대기, 비선점, 순환 대기.", interval: 0 },
      { cardId: "c3", type: "basic", state: "learn", front: "선점형 스케줄링의 정의는?", back: "실행 중인 프로세스를 강제로 중단시키고 CPU를 다른 프로세스에 할당하는 방식.", interval: 1 },
      { cardId: "c7", type: "cloze", state: "new", text: "TCP는 {{c1::연결 지향}} 프로토콜이고, UDP는 {{c2::비연결}} 프로토콜이다.", interval: 0 },
    ],
    d2: [
      { cardId: "c4", type: "basic", state: "due", front: "ubiquitous", back: "(형) 어디에나 있는, 아주 흔한", interval: 4 },
      { cardId: "c5", type: "basic", state: "new", front: "meticulous", back: "(형) 꼼꼼한, 세심한", interval: 0 },
    ],
    d3: [
      { cardId: "c6", type: "cloze", state: "due", text: "TCP 3-way handshake 순서는 {{c1::SYN}} → {{c2::SYN/ACK}} → {{c3::ACK}}.", interval: 9 },
    ],
  },
  log: [
    { ts: "오늘 09:12", text: "프로세스와 스레드의 차이는?", grade: "good", interval: "6일" },
    { ts: "오늘 09:11", text: "ubiquitous", grade: "easy", interval: "10일" },
    { ts: "오늘 09:10", text: "선점형 스케줄링", grade: "again", interval: "1분" },
    { ts: "오늘 09:08", text: "TCP 3-way handshake", grade: "hard", interval: "4일" },
  ],
};

/* ---- tiny markdown -> elements (matches .markdown-preview) ---- */
function MarkdownPreview({ content }) {
  const lines = (content || "").split("\n");
  const out = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("# ")) out.push(<h1 key={i}>{t.slice(2)}</h1>);
    else if (t.startsWith("## ")) out.push(<h2 key={i}>{t.slice(3)}</h2>);
    else if (t.startsWith("### ")) out.push(<h3 key={i}>{t.slice(4)}</h3>);
    else if (t.startsWith("> ")) out.push(<blockquote key={i}>{t.slice(2)}</blockquote>);
    else if (t.startsWith("- ")) out.push(<p key={i} className="bullet-line">{t.slice(2)}</p>);
    else if (t) out.push(<p key={i}>{t}</p>);
  });
  return <div className="markdown-preview">{out}</div>;
}

Object.assign(window, {
  Icon, formatMinutes, SUBJECTS, buildSampleSessions, calculateCharacter,
  recentDays, SAMPLE_SUMMARIES, SAMPLE_MATERIALS, SAMPLE_NOTES, SAMPLE_QUIZZES,
  SAMPLE_ANKI, MarkdownPreview,
  hasCloze, clozeToPlain, clozeToBlank, nextClozeNum, renderCloze, cardKindLabel, cardFace,
  buildAnkiReviewHistory, niceMax,
});
