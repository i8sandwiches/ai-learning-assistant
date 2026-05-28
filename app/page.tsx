"use client";

import {
  BarChart3,
  BookOpenText,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  LayersIcon,
  LogOut,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  TimerReset,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import { AnkiCard, AnkiGrade, AnkiState, AppState, AuthProvider, LearningMaterial, Quiz, StudyNote, StudySession, Summary, TimerType, User } from "@/lib/types";
import { addBasicNote, addClozeNote, buildQueue, createAId, esc, getDeckCounts, getCardFB, loadAnkiFromStorage, makeDefaultAnkiState, peekLabel, renderCloze, saveAnkiToStorage, schedule, timeAgo, todayKey } from "@/lib/anki";
import { calculateCharacter, createId, formatMinutes, recentDays, summarizeLocally, validateUpload } from "@/lib/study";

const initialState: AppState = {
  user: null,
  materials: [],
  summaries: [],
  notes: [],
  quizzes: [],
  sessions: []
};

const subjects = ["국어", "영어", "수학", "과학", "사회", "전공", "자격증", "기타"];

type TabId = "overview" | "materials" | "notes" | "timer" | "stats" | "anki";
type HeatView = "year" | "month" | "week";

export default function Home() {
  const [state, setState] = useState<AppState>(initialState);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedSummaryId, setSelectedSummaryId] = useState<string>("");
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [noteDraft, setNoteDraft] = useState({ title: "새 학습 노트", subject: "기타", markdownContent: "## 오늘의 핵심\n- " });
  const [uploadStatus, setUploadStatus] = useState("학습 자료를 업로드하면 AI 요약을 바로 생성합니다.");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [storageStatus, setStorageStatus] = useState("MongoDB 대기 중");
  const [timerType, setTimerType] = useState<TimerType>("STOPWATCH");
  const [timerSubject, setTimerSubject] = useState("전공");
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const timerStartRef = useRef<Date | null>(null);

  // Anki state
  const [anki, setAnki] = useState<AnkiState>(makeDefaultAnkiState);
  const [ankiLoaded, setAnkiLoaded] = useState(false);
  const [ankiDeckId, setAnkiDeckId] = useState<string>("");
  const [ankiSubView, setAnkiSubView] = useState<"today" | "browse" | "stats" | "io">("today");
  const [ankiSearch, setAnkiSearch] = useState("");
  const [ankiSelNoteId, setAnkiSelNoteId] = useState("");
  const [reviewQueue, setReviewQueue] = useState<AnkiCard[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewBack, setReviewBack] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    void syncGoogleSession();
  }, []);

  useEffect(() => {
    const loaded = loadAnkiFromStorage();
    setAnki(loaded);
    setAnkiDeckId(loaded.activeDeckId || (loaded.decks[0]?.deckId ?? ""));
    setAnkiLoaded(true);
  }, []);

  // persist anki to localStorage on change (but not on first load)
  useEffect(() => {
    if (!ankiLoaded) return;
    saveAnkiToStorage(anki);
  }, [anki, ankiLoaded]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setSeconds((value) => {
        if (timerType === "POMODORO") {
          return Math.max(0, value - 1);
        }

        return value + 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, timerType]);

  useEffect(() => {
    if (timerType === "POMODORO" && isRunning && seconds === 0) {
      finishTimer();
    }
  }, [seconds, isRunning, timerType]);

  // Anki keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!reviewOpen) return;
      if (e.key === "Escape") { setReviewOpen(false); return; }
      if (!reviewBack) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); setReviewBack(true); }
      } else {
        if (e.key === "1") ankiGrade(0);
        else if (e.key === "2") ankiGrade(1);
        else if (e.key === "3" || e.key === " " || e.key === "Enter") { e.preventDefault(); ankiGrade(2); }
        else if (e.key === "4") ankiGrade(3);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewOpen, reviewBack, reviewIdx, reviewQueue]);

  function startReview(deckId: string) {
    const queue = buildQueue(anki, deckId);
    setReviewQueue(queue);
    setReviewIdx(0);
    setReviewBack(false);
    setReviewOpen(true);
  }

  function ankiGrade(grade: AnkiGrade) {
    const card = reviewQueue[reviewIdx];
    if (!card) return;
    const updated = schedule(card, grade, anki.settings.learnSteps);
    const newCounts = { ...anki.todayCounts };
    if (card.state === "new") newCounts.new += 1;
    else if (card.state === "review") newCounts.review += 1;
    else if (card.state === "learn") newCounts.learn += 1;
    const newLog = [{ ts: Date.now(), cardId: card.cardId, grade, prevInterval: card.interval, newInterval: updated.interval }, ...anki.reviewLog].slice(0, 1000);
    const newCards = anki.cards.map(c => c.cardId === card.cardId ? updated : c);
    let nextQueue = reviewQueue;
    if (updated.state === "learn" && updated.due - Date.now() < 10 * 60000) {
      nextQueue = [...reviewQueue, updated];
    }
    setAnki(prev => ({ ...prev, cards: newCards, reviewLog: newLog, todayCounts: newCounts }));
    setReviewQueue(nextQueue);
    setReviewIdx(i => i + 1);
    setReviewBack(false);
  }

  const currentUser = state.user;

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    const userId = currentUser.userId;

    async function loadRemoteState() {
      try {
        const response = await fetch(`/api/store?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error("Remote state request failed");
        const data = (await response.json()) as Omit<AppState, "user">;

        if (!cancelled) {
          setState((previous) => (previous.user?.userId === userId ? { ...previous, ...data } : previous));
          setStorageStatus("MongoDB 연결됨");
        }
      } catch {
        if (!cancelled) {
          setStorageStatus("MongoDB 연결 실패");
        }
      }
    }

    void loadRemoteState();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.userId]);

  const userSessions = useMemo(
    () => state.sessions.filter((session) => session.userId === currentUser?.userId),
    [state.sessions, currentUser?.userId]
  );
  const character = useMemo(
    () => calculateCharacter(currentUser?.userId ?? "guest", userSessions),
    [currentUser?.userId, userSessions]
  );
  const selectedSummary = state.summaries.find((summary) => summary.summaryId === selectedSummaryId) ?? state.summaries[0];
  const selectedNote = state.notes.find((note) => note.noteId === selectedNoteId) ?? state.notes[0];
  const noteQuizzes = state.quizzes.filter((quiz) => quiz.noteId === selectedNote?.noteId);

  useEffect(() => {
    if (selectedNote) {
      setNoteDraft({
        title: selectedNote.title,
        subject: selectedNote.subject,
        markdownContent: selectedNote.markdownContent
      });
    }
  }, [selectedNote?.noteId]);

  async function syncGoogleSession() {
    const session = await getSession();
    const email = session?.user?.email;

    if (!email) return;

    const user: User = {
      userId: `google_${email.toLowerCase()}`,
      email,
      nickname: session.user?.name ?? email.split("@")[0],
      provider: "GOOGLE",
      createdAt: new Date().toISOString()
    };

    setState((previous) => ({ ...previous, user }));
    await persistStore({ operation: "login", user });
  }

  async function login(provider: AuthProvider) {
    if (provider === "GOOGLE") {
      await signIn("google", { callbackUrl: "/" });
      return;
    }
    if (provider === "NAVER") {
      await signIn("naver", { callbackUrl: "/" });
      return;
    }

    const user: User = {
      userId: `demo_${provider.toLowerCase()}`,
      email: "learner.kakao@example.com",
      nickname: "Kakao 학습자",
      provider,
      createdAt: new Date().toISOString()
    };

    setState((previous) => ({ ...previous, user }));
    await persistStore({ operation: "login", user });
  }

  async function logout() {
    setIsRunning(false);
    setState((previous) => ({ ...previous, user: null }));
    const session = await getSession();
    if (session) {
      await signOut({ callbackUrl: "/" });
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    const validation = validateUpload(file);
    if (!validation.ok) {
      setUploadStatus(validation.message);
      event.target.value = "";
      return;
    }

    setIsSummarizing(true);
    setUploadStatus("파일을 읽고 AI 요약을 생성하는 중입니다.");

    const extractedText = await readFileForSummary(file, validation.fileType);
    const material: LearningMaterial = {
      materialId: createId("material"),
      userId: currentUser.userId,
      fileName: file.name,
      fileType: validation.fileType,
      extractedText,
      uploadedAt: new Date().toISOString()
    };

    const content = await requestSummary(file.name, extractedText);
    const summary: Summary = {
      summaryId: createId("summary"),
      userId: currentUser.userId,
      materialId: material.materialId,
      title: file.name.replace(/\.[^.]+$/, ""),
      content,
      sourceType: "material",
      createdAt: new Date().toISOString()
    };

    setState((previous) => ({
      ...previous,
      materials: [material, ...previous.materials],
      summaries: [summary, ...previous.summaries]
    }));
    setSelectedSummaryId(summary.summaryId);
    setUploadStatus("요약이 생성되어 저장되었습니다.");
    setIsSummarizing(false);
    void persistStore({ operation: "saveMaterialSummary", userId: currentUser.userId, material, summary });
    event.target.value = "";
  }

  async function readFileForSummary(file: File, fileType: LearningMaterial["fileType"]) {
    if (fileType === "TXT" || fileType === "MD") {
      return file.text();
    }

    if (fileType === "IMAGE") {
      return `이미지 학습 자료: ${file.name}. 실제 Gemini API 키가 있으면 이미지 해석 파이프라인으로 확장할 수 있습니다.`;
    }

    return `PDF 학습 자료: ${file.name}. 브라우저 MVP에서는 파일 메타데이터와 사용자가 추가한 노트를 중심으로 요약합니다.`;
  }

  async function requestSummary(title: string, content: string) {
    try {
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content })
      });

      if (!response.ok) throw new Error("Summary request failed");
      const data = (await response.json()) as { summary: string };
      return data.summary;
    } catch {
      return summarizeLocally(title, content);
    }
  }

  async function persistStore(payload: Record<string, unknown>) {
    try {
      const response = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Store request failed");
      setStorageStatus("MongoDB 연결됨");
    } catch {
      setStorageStatus("MongoDB 저장 실패");
    }
  }

  async function saveNote() {
    if (!currentUser || !noteDraft.title.trim()) return;

    const now = new Date().toISOString();
    if (selectedNote) {
      const updatedNote: StudyNote = {
        ...selectedNote,
        ...noteDraft,
        title: noteDraft.title.trim(),
        updatedAt: now
      };

      setState((previous) => ({
        ...previous,
        notes: previous.notes.map((note) => (note.noteId === selectedNote.noteId ? updatedNote : note))
      }));
      void persistStore({ operation: "upsertNote", userId: currentUser.userId, note: updatedNote });
      return;
    }

    const note: StudyNote = {
      noteId: createId("note"),
      userId: currentUser.userId,
      title: noteDraft.title.trim(),
      subject: noteDraft.subject,
      markdownContent: noteDraft.markdownContent,
      updatedAt: now
    };

    setState((previous) => ({ ...previous, notes: [note, ...previous.notes] }));
    setSelectedNoteId(note.noteId);
    void persistStore({ operation: "upsertNote", userId: currentUser.userId, note });
  }

  function newNote() {
    setSelectedNoteId("");
    setNoteDraft({ title: "새 학습 노트", subject: "기타", markdownContent: "## 오늘의 핵심\n- " });
  }

  function deleteNote(noteId: string) {
    if (!currentUser) return;

    setState((previous) => ({
      ...previous,
      notes: previous.notes.filter((note) => note.noteId !== noteId),
      quizzes: previous.quizzes.filter((quiz) => quiz.noteId !== noteId),
      summaries: previous.summaries.filter((summary) => summary.noteId !== noteId)
    }));
    setSelectedNoteId("");
    void persistStore({ operation: "deleteNote", userId: currentUser.userId, noteId });
  }

  async function summarizeNote() {
    if (!currentUser || !selectedNote) return;
    const content = await requestSummary(selectedNote.title, selectedNote.markdownContent);
    const summary: Summary = {
      summaryId: createId("summary"),
      userId: currentUser.userId,
      noteId: selectedNote.noteId,
      title: `${selectedNote.title} 노트 요약`,
      content,
      sourceType: "note",
      createdAt: new Date().toISOString()
    };

    setState((previous) => ({ ...previous, summaries: [summary, ...previous.summaries] }));
    setSelectedSummaryId(summary.summaryId);
    setActiveTab("materials");
    void persistStore({ operation: "addSummary", userId: currentUser.userId, summary });
  }

  async function generateQuiz() {
    if (!currentUser || !selectedNote) return;

    const response = await fetch("/api/ai/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: selectedNote.title, content: selectedNote.markdownContent })
    });
    const data = (await response.json()) as { quizzes: Array<{ question: string; answer: string }> };
    const generated: Quiz[] = data.quizzes.map((quiz) => ({
      quizId: createId("quiz"),
      userId: currentUser.userId,
      noteId: selectedNote.noteId,
      question: quiz.question,
      answer: quiz.answer,
      createdAt: new Date().toISOString()
    }));

    setState((previous) => ({ ...previous, quizzes: [...generated, ...previous.quizzes] }));
    void persistStore({ operation: "addQuizzes", userId: currentUser.userId, quizzes: generated });
  }

  function deleteSummary(summaryId: string) {
    if (!currentUser) return;

    setState((previous) => ({ ...previous, summaries: previous.summaries.filter((summary) => summary.summaryId !== summaryId) }));
    setSelectedSummaryId("");
    void persistStore({ operation: "deleteSummary", userId: currentUser.userId, summaryId });
  }

  function startTimer() {
    timerStartRef.current = new Date();
    setIsRunning(true);
  }

  function pauseTimer() {
    setIsRunning(false);
  }

  function resetTimer() {
    setIsRunning(false);
    setSeconds(timerType === "POMODORO" ? 25 * 60 : 0);
    timerStartRef.current = null;
  }

  function finishTimer() {
    if (!currentUser) return;

    const started = timerStartRef.current ?? new Date(Date.now() - seconds * 1000);
    const durationMinutes = timerType === "POMODORO" ? 25 : Math.max(1, Math.round(seconds / 60));
    const session: StudySession = {
      sessionId: createId("session"),
      userId: currentUser.userId,
      subject: timerSubject,
      timerType,
      startTime: started.toISOString(),
      endTime: new Date().toISOString(),
      durationMinutes
    };

    setState((previous) => ({ ...previous, sessions: [session, ...previous.sessions] }));
    void persistStore({ operation: "addSession", userId: currentUser.userId, session });
    resetTimer();
  }

  function switchTimerType(nextType: TimerType) {
    setTimerType(nextType);
    setIsRunning(false);
    setSeconds(nextType === "POMODORO" ? 25 * 60 : 0);
  }

  if (!currentUser) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark">
            <Sparkles size={28} />
          </div>
          <h1>AI 학습 어시스턴트</h1>
          <p>자료 요약, 노트 복습, 타이머 기록, 캐릭터 성장까지 한 흐름으로 관리합니다.</p>
          <div className="auth-actions">
            <button className="provider-button google" onClick={() => login("GOOGLE")}>
              Google 계정으로 로그인
            </button>
            <button className="provider-button kakao" onClick={() => login("KAKAO")}>
              Kakao로 시작
            </button>
            <button className="provider-button naver" onClick={() => login("NAVER")}>
              Naver로 시작
            </button>
          </div>
        </section>
      </main>
    );
  }

  const totalMinutes = userSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const todayMinutes = userSessions
    .filter((session) => session.endTime.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum, session) => sum + session.durationMinutes, 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="app-logo">
            <Sparkles size={22} />
            <span>AI 학습 어시스턴트</span>
          </div>
          <nav className="nav-list">
            <NavButton icon={<BarChart3 size={18} />} label="대시보드" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
            <NavButton icon={<UploadCloud size={18} />} label="자료/요약" active={activeTab === "materials"} onClick={() => setActiveTab("materials")} />
            <NavButton icon={<BookOpenText size={18} />} label="학습 노트" active={activeTab === "notes"} onClick={() => setActiveTab("notes")} />
            <NavButton icon={<Clock3 size={18} />} label="타이머" active={activeTab === "timer"} onClick={() => setActiveTab("timer")} />
            <NavButton icon={<Flame size={18} />} label="통계" active={activeTab === "stats"} onClick={() => setActiveTab("stats")} />
            <NavButton icon={<LayersIcon size={18} />} label="Anki 카드" active={activeTab === "anki"} onClick={() => setActiveTab("anki")} />
          </nav>
        </div>
        <div className="profile-box">
          <strong>{currentUser.nickname}</strong>
          <span>{currentUser.provider} 로그인</span>
          <button className="ghost-button" onClick={logout}>
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </aside>

      <section className="content">
        {activeTab === "overview" ? (
          <header className="page-header">
            <div className="title-wrap">
              <p className="eyebrow">Personal learning dashboard</p>
              <h1 className="page-title">학습 대시보드</h1>
            </div>
            <ActivityHeatmap sessions={userSessions} />
          </header>
        ) : (
          <header className="topbar">
            <div>
              <p className="eyebrow">Personal learning cockpit</p>
              <h2>{tabTitle(activeTab)}</h2>
            </div>
            <div className="topbar-actions">
              <span className="status-pill">
                <CheckCircle2 size={16} />
                {storageStatus}
              </span>
            </div>
          </header>
        )}

        {activeTab === "overview" && (
          <Overview
            character={character}
            totalMinutes={totalMinutes}
            todayMinutes={todayMinutes}
            sessions={userSessions}
            anki={anki}
            onGoMaterials={() => setActiveTab("materials")}
            onGoTimer={() => setActiveTab("timer")}
            onGoAnki={() => { setActiveTab("anki"); startReview(ankiDeckId); }}
          />
        )}

        {activeTab === "materials" && (
          <MaterialsView
            summaries={state.summaries}
            materials={state.materials}
            selectedSummary={selectedSummary}
            selectedSummaryId={selectedSummaryId}
            uploadStatus={uploadStatus}
            isSummarizing={isSummarizing}
            onUpload={handleUpload}
            onSelectSummary={setSelectedSummaryId}
            onDeleteSummary={deleteSummary}
          />
        )}

        {activeTab === "notes" && (
          <NotesView
            notes={state.notes}
            selectedNote={selectedNote}
            selectedNoteId={selectedNoteId}
            noteDraft={noteDraft}
            quizzes={noteQuizzes}
            onSelectNote={setSelectedNoteId}
            onDraftChange={setNoteDraft}
            onSave={saveNote}
            onNew={newNote}
            onDelete={deleteNote}
            onSummarize={summarizeNote}
            onQuiz={generateQuiz}
          />
        )}

        {activeTab === "timer" && (
          <TimerView
            timerType={timerType}
            seconds={seconds}
            isRunning={isRunning}
            subject={timerSubject}
            sessions={userSessions}
            onTypeChange={switchTimerType}
            onSubjectChange={setTimerSubject}
            onStart={startTimer}
            onPause={pauseTimer}
            onFinish={finishTimer}
            onReset={resetTimer}
          />
        )}

        {activeTab === "stats" && <StatsView sessions={userSessions} />}

        {activeTab === "anki" && (
          <AnkiView
            anki={anki}
            setAnki={setAnki}
            deckId={ankiDeckId}
            setDeckId={setAnkiDeckId}
            subView={ankiSubView}
            setSubView={setAnkiSubView}
            search={ankiSearch}
            setSearch={setAnkiSearch}
            selNoteId={ankiSelNoteId}
            setSelNoteId={setAnkiSelNoteId}
            onStartReview={startReview}
          />
        )}
      </section>

      {reviewOpen && (
        <ReviewModal
          queue={reviewQueue}
          idx={reviewIdx}
          backShown={reviewBack}
          anki={anki}
          onReveal={() => setReviewBack(true)}
          onGrade={ankiGrade}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </main>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function calcStreak(sessions: StudySession[]): number {
  const dates = new Set(sessions.map(s => s.endTime.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function Overview({
  character, totalMinutes, todayMinutes, sessions, anki, onGoMaterials, onGoTimer, onGoAnki
}: {
  character: ReturnType<typeof calculateCharacter>;
  totalMinutes: number;
  todayMinutes: number;
  sessions: StudySession[];
  anki: AnkiState;
  onGoMaterials: () => void;
  onGoTimer: () => void;
  onGoAnki: () => void;
}) {
  const weekStart = recentDays(7)[0];
  const weekMinutes = sessions.filter(s => s.endTime.slice(0, 10) >= weekStart).reduce((a, s) => a + s.durationMinutes, 0);
  const streak = calcStreak(sessions);

  const totalAnkiNew = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).new, 0);
  const totalAnkiLearn = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).learn, 0);
  const totalAnkiReview = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).review, 0);
  const totalAnkiDue = totalAnkiNew + totalAnkiLearn + totalAnkiReview;
  const ankiDone = anki.todayCounts.new + anki.todayCounts.learn + anki.todayCounts.review;
  const ankiTotal = totalAnkiDue + ankiDone;
  const ankiPct = ankiTotal ? Math.round((ankiDone / ankiTotal) * 100) : 0;

  return (
    <div className="overview-grid">
      <div className="overview-main">
        <section className="panel">
          <div className="panel-head">
            <h3 className="panel-title">최근 학습 기록</h3>
            <span className="panel-meta">최신 5개</span>
          </div>
          <SessionList sessions={sessions.slice(0, 5)} />
          <div className="inline-actions" style={{ marginTop: 16 }}>
            <button className="primary-button" onClick={onGoMaterials}><UploadCloud size={16} /> 자료 업로드</button>
            <button className="secondary-button" onClick={onGoTimer}><Clock3 size={16} /> 타이머 시작</button>
          </div>
        </section>
        <CalendarWidget sessions={sessions} />
      </div>

      <aside className="rail">
        <CharacterCard character={character} />

        <section className="today-stats">
          <h4>오늘 / 누적</h4>
          <div className="ts-row"><span>오늘 학습</span><span className="v">{formatMinutes(todayMinutes)}</span></div>
          <div className="ts-row"><span>이번 주</span><span className="v">{formatMinutes(weekMinutes)}</span></div>
          <div className="ts-row"><span>총 학습 시간</span><span className="v">{formatMinutes(totalMinutes)}</span></div>
          <div className="ts-row"><span>연속 학습</span><span className="v">{streak}일</span></div>
        </section>

        <section className="anki" aria-label="Anki 스케줄러">
          <div className="anki-head">
            <div className="anki-title"><span className="dot" />ANKI 스케줄러</div>
            <div className="anki-due">오늘 마감 · 23:59</div>
          </div>
          <div className="anki-stats">
            <div className="anki-stat new"><span className="n">{totalAnkiNew}</span><span className="l">신규</span></div>
            <div className="anki-stat learn"><span className="n">{totalAnkiLearn}</span><span className="l">학습 중</span></div>
            <div className="anki-stat due"><span className="n">{totalAnkiReview}</span><span className="l">복습</span></div>
          </div>
          <div className="anki-foot">
            <div className="anki-progress"><i style={{ width: `${ankiPct}%` }} /></div>
            <button className="anki-cta" type="button" onClick={onGoAnki}>
              복습 시작 →
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function CalendarWidget({ sessions }: { sessions: StudySession[] }) {
  const [calDate, setCalDate] = useState(() => new Date());
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const today = new Date();
  const sessionDays = new Set(
    sessions
      .filter(s => s.endTime.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`)
      .map(s => parseInt(s.endTime.slice(8, 10), 10))
  );

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    cells.push(
      <div key={d} className={`cal-cell ${isToday ? "today" : ""}`}>
        <div className="d">{d}</div>
        {sessionDays.has(d) && <div className="cal-mark" />}
      </div>
    );
  }
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(<div key={`t${i}`} className="cal-cell empty" />);

  return (
    <section className="panel">
      <div className="cal-head">
        <h3 className="panel-title">{year}년 {month + 1}월</h3>
        <div className="cal-nav">
          <button className="cal-btn" aria-label="이전 달" onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
          <button className="cal-btn today-btn" onClick={() => setCalDate(new Date())}>오늘</button>
          <button className="cal-btn" aria-label="다음 달" onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
        </div>
      </div>
      <div className="cal">
        {["월", "화", "수", "목", "금", "토", "일"].map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells}
      </div>
    </section>
  );
}

function ActivityHeatmap({ sessions }: { sessions: StudySession[] }) {
  const [view, setView] = useState<HeatView>("year");
  const [refDate, setRefDate] = useState(() => new Date());

  const minutesByDate = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((session) => {
      const key = session.endTime.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + session.durationMinutes);
    });
    return map;
  }, [sessions]);

  const visibleDates = useMemo(() => buildHeatDates(view, refDate), [view, refDate]);
  const totalVisibleMinutes = visibleDates.reduce((sum, item) => sum + (item ? minutesByDate.get(dateKey(item)) ?? 0 : 0), 0);

  function moveHeat(delta: number) {
    setRefDate((current) => {
      const next = new Date(current);
      if (view === "year") next.setFullYear(current.getFullYear() + delta);
      if (view === "month") next.setMonth(current.getMonth() + delta);
      if (view === "week") next.setDate(current.getDate() + delta * 7);
      return next;
    });
  }

  function cycleView() {
    setView((current) => (current === "year" ? "month" : current === "month" ? "week" : "year"));
  }

  return (
    <section className="header-heatmap" aria-label="학습 활동">
      <div className="hh-head">
        <div className="hh-nav">
          <button className="hh-arrow" aria-label="이전" type="button" onClick={() => moveHeat(-1)}>‹</button>
          <button className="hh-title-btn" type="button" title="클릭해서 연, 월, 주 전환" onClick={cycleView}>
            {heatTitle(view, refDate)}
          </button>
          <button className="hh-arrow" aria-label="다음" type="button" onClick={() => moveHeat(1)}>›</button>
        </div>
        <div className="hh-title"><span className="dot" />학습 활동</div>
      </div>
      <div className={`hh-body is-${view}`}>
        <div className="heat-days">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className={`heat-grid view-${view}`}>
          {visibleDates.map((item, index) => {
            if (!item) return <div key={`empty-${index}`} className="heat-cell empty" />;
            const key = dateKey(item);
            const minutes = minutesByDate.get(key) ?? 0;
            return (
              <div
                key={key}
                className={`heat-cell ${heatLevel(minutes)} ${isSameDay(item, new Date()) ? "today" : ""}`}
                data-date={key}
                title={`${key} · ${formatMinutes(minutes)}`}
              >
                {view === "month" && (
                  <>
                    <span className="hc-d">{item.getDate()}</span>
                    <span className="hc-m">{minutes > 0 ? formatMinutes(minutes) : ""}</span>
                  </>
                )}
                {view === "week" && (
                  <>
                    <span className="hc-dow">{["일", "월", "화", "수", "목", "금", "토"][item.getDay()]}</span>
                    <span className="hc-d">{item.getMonth() + 1}/{item.getDate()}</span>
                    <span className="hc-m">{formatMinutes(minutes)}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="heat-legend">
        <span>{formatMinutes(totalVisibleMinutes)}</span>
        <span className="heat-sep">·</span>
        <span>적음</span>
        <span className="swatch s0" />
        <span className="swatch s1" />
        <span className="swatch s2" />
        <span className="swatch s3" />
        <span className="swatch s4" />
        <span>많음</span>
      </div>
    </section>
  );
}

function buildHeatDates(view: HeatView, refDate: Date): Array<Date | null> {
  if (view === "year") {
    const start = new Date(refDate.getFullYear(), 0, 1);
    const end = new Date(refDate.getFullYear(), 11, 31);
    const dates: Array<Date | null> = Array.from({ length: start.getDay() }, () => null);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    return dates;
  }

  if (view === "month") {
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
    const dates: Array<Date | null> = Array.from({ length: start.getDay() }, () => null);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    return dates;
  }

  const start = new Date(refDate);
  start.setDate(refDate.getDate() - refDate.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function heatTitle(view: HeatView, date: Date) {
  if (view === "year") return `${date.getFullYear()}`;
  if (view === "month") return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}.${start.getDate()}-${end.getMonth() + 1}.${end.getDate()}`;
}

function heatLevel(minutes: number) {
  if (minutes >= 180) return "l4";
  if (minutes >= 120) return "l3";
  if (minutes >= 60) return "l2";
  if (minutes > 0) return "l1";
  return "";
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function MaterialsView({
  summaries,
  materials,
  selectedSummary,
  selectedSummaryId,
  uploadStatus,
  isSummarizing,
  onUpload,
  onSelectSummary,
  onDeleteSummary
}: {
  summaries: Summary[];
  materials: LearningMaterial[];
  selectedSummary?: Summary;
  selectedSummaryId: string;
  uploadStatus: string;
  isSummarizing: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectSummary: (summaryId: string) => void;
  onDeleteSummary: (summaryId: string) => void;
}) {
  return (
    <div className="two-column">
      <section className="panel">
        <div className="section-heading">
          <h3>학습 자료 업로드</h3>
          <span>PDF · 이미지 · TXT · MD</span>
        </div>
        <label className={`upload-zone ${isSummarizing ? "busy" : ""}`}>
          <UploadCloud size={36} />
          <strong>{isSummarizing ? "요약 생성 중" : "파일 선택"}</strong>
          <span>{uploadStatus}</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md" onChange={onUpload} disabled={isSummarizing} />
        </label>
        <div className="list-block">
          <h4>업로드 자료</h4>
          {materials.length === 0 ? (
            <p className="empty-text">아직 업로드한 자료가 없습니다.</p>
          ) : (
            materials.map((material) => (
              <div className="list-row" key={material.materialId}>
                <FileText size={17} />
                <div>
                  <strong>{material.fileName}</strong>
                  <span>{material.fileType} · {new Date(material.uploadedAt).toLocaleString("ko-KR")}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h3>저장된 요약</h3>
          <span>{summaries.length}개</span>
        </div>
        <div className="split-list">
          <div className="summary-list">
            {summaries.length === 0 ? (
              <p className="empty-text">요약이 생성되면 이곳에 저장됩니다.</p>
            ) : (
              summaries.map((summary) => (
                <button
                  className={`summary-item ${summary.summaryId === selectedSummaryId ? "active" : ""}`}
                  key={summary.summaryId}
                  onClick={() => onSelectSummary(summary.summaryId)}
                >
                  <strong>{summary.title}</strong>
                  <span>{summary.sourceType === "material" ? "자료 요약" : "노트 요약"}</span>
                </button>
              ))
            )}
          </div>
          <article className="summary-detail">
            {selectedSummary ? (
              <>
                <div className="detail-title">
                  <div>
                    <h4>{selectedSummary.title}</h4>
                    <span>{new Date(selectedSummary.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                  <button className="icon-button danger" aria-label="요약 삭제" onClick={() => onDeleteSummary(selectedSummary.summaryId)}>
                    <Trash2 size={17} />
                  </button>
                </div>
                <MarkdownPreview content={selectedSummary.content} />
              </>
            ) : (
              <p className="empty-text">조회할 요약을 선택하세요.</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}

function NotesView({
  notes,
  selectedNote,
  selectedNoteId,
  noteDraft,
  quizzes,
  onSelectNote,
  onDraftChange,
  onSave,
  onNew,
  onDelete,
  onSummarize,
  onQuiz
}: {
  notes: StudyNote[];
  selectedNote?: StudyNote;
  selectedNoteId: string;
  noteDraft: { title: string; subject: string; markdownContent: string };
  quizzes: Quiz[];
  onSelectNote: (noteId: string) => void;
  onDraftChange: (draft: { title: string; subject: string; markdownContent: string }) => void;
  onSave: () => void;
  onNew: () => void;
  onDelete: (noteId: string) => void;
  onSummarize: () => void;
  onQuiz: () => void;
}) {
  return (
    <div className="notes-layout">
      <section className="panel note-index">
        <div className="section-heading">
          <h3>노트 목록</h3>
          <button className="icon-button" aria-label="새 노트" onClick={onNew}>
            <Plus size={17} />
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="empty-text">첫 학습 노트를 작성해 보세요.</p>
        ) : (
          notes.map((note) => (
            <button
              key={note.noteId}
              className={`note-list-item ${note.noteId === selectedNoteId ? "active" : ""}`}
              onClick={() => onSelectNote(note.noteId)}
            >
              <strong>{note.title}</strong>
              <span>{note.subject} · {new Date(note.updatedAt).toLocaleDateString("ko-KR")}</span>
            </button>
          ))
        )}
      </section>

      <section className="panel note-editor">
        <div className="editor-toolbar">
          <input
            value={noteDraft.title}
            onChange={(event) => onDraftChange({ ...noteDraft, title: event.target.value })}
            aria-label="노트 제목"
          />
          <select
            value={noteDraft.subject}
            onChange={(event) => onDraftChange({ ...noteDraft, subject: event.target.value })}
            aria-label="과목"
          >
            {subjects.map((subject) => (
              <option key={subject}>{subject}</option>
            ))}
          </select>
          <button className="primary-button" onClick={onSave}>
            <Save size={16} />
            저장
          </button>
        </div>
        <textarea
          className="markdown-input"
          value={noteDraft.markdownContent}
          onChange={(event) => onDraftChange({ ...noteDraft, markdownContent: event.target.value })}
          aria-label="마크다운 노트 내용"
        />
        <div className="inline-actions">
          <button className="secondary-button" disabled={!selectedNote} onClick={onSummarize}>
            <Bot size={16} />
            노트 요약
          </button>
          <button className="secondary-button" disabled={!selectedNote} onClick={onQuiz}>
            <Sparkles size={16} />
            문제 생성
          </button>
          {selectedNote && (
            <button className="danger-button" onClick={() => onDelete(selectedNote.noteId)}>
              <Trash2 size={16} />
              삭제
            </button>
          )}
        </div>
      </section>

      <section className="panel note-preview">
        <div className="section-heading">
          <h3>미리보기</h3>
          <span>Markdown</span>
        </div>
        <MarkdownPreview content={noteDraft.markdownContent} />
        <div className="quiz-box">
          <h4>복습 문제</h4>
          {quizzes.length === 0 ? (
            <p className="empty-text">문제를 생성하면 이곳에 표시됩니다.</p>
          ) : (
            quizzes.map((quiz) => (
              <details key={quiz.quizId}>
                <summary>{quiz.question}</summary>
                <p>{quiz.answer}</p>
              </details>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function TimerView({
  timerType,
  seconds,
  isRunning,
  subject,
  sessions,
  onTypeChange,
  onSubjectChange,
  onStart,
  onPause,
  onFinish,
  onReset
}: {
  timerType: TimerType;
  seconds: number;
  isRunning: boolean;
  subject: string;
  sessions: StudySession[];
  onTypeChange: (type: TimerType) => void;
  onSubjectChange: (subject: string) => void;
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  onReset: () => void;
}) {
  return (
    <div className="timer-layout">
      <section className="panel timer-panel">
        <div className="segmented">
          <button className={timerType === "STOPWATCH" ? "active" : ""} onClick={() => onTypeChange("STOPWATCH")}>
            스톱워치
          </button>
          <button className={timerType === "POMODORO" ? "active" : ""} onClick={() => onTypeChange("POMODORO")}>
            포모도로
          </button>
        </div>
        <select value={subject} onChange={(event) => onSubjectChange(event.target.value)} aria-label="타이머 과목">
          {subjects.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <div className="timer-face">{formatTimer(seconds)}</div>
        <div className="timer-actions">
          {isRunning ? (
            <button className="secondary-button" onClick={onPause}>
              <Pause size={17} />
              일시정지
            </button>
          ) : (
            <button className="primary-button" onClick={onStart}>
              <Play size={17} />
              시작
            </button>
          )}
          <button className="secondary-button" onClick={onFinish}>
            <Square size={17} />
            종료/기록
          </button>
          <button className="ghost-button" onClick={onReset}>
            <TimerReset size={17} />
            초기화
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h3>자동 기록</h3>
          <span>최근 8개</span>
        </div>
        <SessionList sessions={sessions.slice(0, 8)} />
      </section>
    </div>
  );
}

function StatsView({ sessions }: { sessions: StudySession[] }) {
  const days = recentDays(7);
  const dayTotals = days.map((day) => ({
    label: day.slice(5),
    value: sessions.filter((session) => session.endTime.slice(0, 10) === day).reduce((sum, session) => sum + session.durationMinutes, 0)
  }));
  const maxDay = Math.max(30, ...dayTotals.map((item) => item.value));
  const subjectTotals = subjects
    .map((subject) => ({
      subject,
      value: sessions.filter((session) => session.subject === subject).reduce((sum, session) => sum + session.durationMinutes, 0)
    }))
    .filter((item) => item.value > 0);
  const maxSubject = Math.max(30, ...subjectTotals.map((item) => item.value));
  const monthlyTotal = sessions
    .filter((session) => session.endTime.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((sum, session) => sum + session.durationMinutes, 0);

  return (
    <div className="stats-grid">
      <MetricCard title="이번 달 학습" value={formatMinutes(monthlyTotal)} detail="월간 누적" />
      <MetricCard title="세션 수" value={`${sessions.length}회`} detail="기록된 학습" />
      <section className="panel chart-panel">
        <div className="section-heading">
          <h3>최근 7일 학습 추이</h3>
          <span>분 단위</span>
        </div>
        <div className="bar-chart">
          {dayTotals.map((item) => (
            <div className="bar-item" key={item.label}>
              <div className="bar-track">
                <div style={{ height: `${Math.max(8, (item.value / maxDay) * 100)}%` }} />
              </div>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="section-heading">
          <h3>과목별 학습 시간</h3>
          <span>{subjectTotals.length}개 과목</span>
        </div>
        {subjectTotals.length === 0 ? (
          <p className="empty-text">학습 세션을 기록하면 과목별 분석이 표시됩니다.</p>
        ) : (
          <div className="subject-chart">
            {subjectTotals.map((item) => (
              <div className="subject-row" key={item.subject}>
                <span>{item.subject}</span>
                <div>
                  <i style={{ width: `${Math.max(10, (item.value / maxSubject) * 100)}%` }} />
                </div>
                <strong>{item.value}분</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <section className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}

function CharacterCard({ character }: { character: ReturnType<typeof calculateCharacter> }) {
  const progress = character.experiencePoint % 300;

  return (
    <div className="rumi">
      <div className="rumi-head"><span className="rumi-tag">{character.growthStage}</span></div>
      <div className="rumi-row">
        <div className="rumi-face" aria-label="성장 캐릭터 루미">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="15" fill="oklch(0.92 0.06 155)" stroke="oklch(0.65 0.14 155)" strokeWidth="1.5" />
            <circle cx="13" cy="16" r="1.6" fill="oklch(0.30 0.10 155)" />
            <circle cx="23" cy="16" r="1.6" fill="oklch(0.30 0.10 155)" />
            <path d="M13 22 Q18 25 23 22" stroke="oklch(0.30 0.10 155)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h3 className="rumi-name">{character.name} Lv.{character.level}</h3>
          <p className="rumi-desc">{character.status}</p>
        </div>
      </div>
      <div className="rumi-bar"><i style={{ width: `${(progress / 300) * 100}%` }} /></div>
      <div className="rumi-exp">{character.experiencePoint} EXP</div>
    </div>
  );
}

function SessionList({ sessions }: { sessions: StudySession[] }) {
  if (sessions.length === 0) {
    return <p className="empty-text">아직 기록된 학습 시간이 없습니다.</p>;
  }

  return (
    <div className="session-list">
      {sessions.map((session) => (
        <div className="session-row" key={session.sessionId}>
          <Clock3 size={17} />
          <div>
            <strong>{session.subject}</strong>
            <span>
              {session.timerType === "POMODORO" ? "포모도로" : "스톱워치"} · {new Date(session.endTime).toLocaleString("ko-KR")}
            </span>
          </div>
          <b>{formatMinutes(session.durationMinutes)}</b>
        </div>
      ))}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="markdown-preview">
      {lines.map((line, index) => {
        if (line.startsWith("# ")) return <h1 key={index}>{line.replace("# ", "")}</h1>;
        if (line.startsWith("## ")) return <h2 key={index}>{line.replace("## ", "")}</h2>;
        if (line.startsWith("### ")) return <h3 key={index}>{line.replace("### ", "")}</h3>;
        if (line.startsWith("- ")) return <p className="bullet-line" key={index}>{line.replace("- ", "")}</p>;
        if (line.startsWith("> ")) return <blockquote key={index}>{line.replace("> ", "")}</blockquote>;
        if (!line.trim()) return <br key={index} />;

        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function tabTitle(tabId: TabId) {
  const titles: Record<TabId, string> = {
    overview: "학습 대시보드",
    materials: "자료 업로드와 AI 요약",
    notes: "마크다운 노트와 복습",
    timer: "학습 시간 기록",
    stats: "학습 통계 분석",
    anki: "Anki 플래시카드 복습"
  };

  return titles[tabId];
}

function formatTimer(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

// ============================================================
// Anki components
// ============================================================

function AnkiView({
  anki, setAnki, deckId, setDeckId, subView, setSubView,
  search, setSearch, selNoteId, setSelNoteId, onStartReview
}: {
  anki: AnkiState;
  setAnki: React.Dispatch<React.SetStateAction<AnkiState>>;
  deckId: string;
  setDeckId: (id: string) => void;
  subView: "today" | "browse" | "stats" | "io";
  setSubView: (v: "today" | "browse" | "stats" | "io") => void;
  search: string;
  setSearch: (s: string) => void;
  selNoteId: string;
  setSelNoteId: (id: string) => void;
  onStartReview: (deckId: string) => void;
}) {
  const activeDeck = anki.decks.find(d => d.deckId === deckId) ?? anki.decks[0];

  function mutate(fn: (s: AnkiState) => AnkiState) {
    setAnki(prev => fn({ ...prev }));
  }

  function addDeck() {
    const name = prompt("새 덱 이름:");
    if (!name?.trim()) return;
    mutate(s => {
      const deck = { deckId: createAId("deck"), name: name.trim(), createdAt: Date.now() };
      return { ...s, decks: [...s.decks, deck] };
    });
  }

  function deleteDeck() {
    if (!activeDeck) return;
    if (anki.decks.length === 1) { alert("마지막 덱은 삭제할 수 없습니다."); return; }
    if (!confirm(`"${activeDeck.name}" 덱과 모든 카드를 삭제할까요?`)) return;
    mutate(s => {
      const noteIds = new Set(s.cards.filter(c => c.deckId === activeDeck.deckId).map(c => c.noteId));
      const newDecks = s.decks.filter(d => d.deckId !== activeDeck.deckId);
      setDeckId(newDecks[0]?.deckId ?? "");
      return {
        ...s,
        decks: newDecks,
        cards: s.cards.filter(c => c.deckId !== activeDeck.deckId),
        notes: s.notes.filter(n => !noteIds.has(n.noteId)),
      };
    });
  }

  function addCard() {
    if (!activeDeck) return;
    const type = confirm("OK = Basic (앞/뒤), 취소 = Cloze (빈칸)") ? "basic" : "cloze";
    if (type === "basic") {
      const front = prompt("앞면:");
      if (!front) return;
      const back = prompt("뒷면:");
      if (!back) return;
      mutate(s => { addBasicNote(s, activeDeck.deckId, front, back, []); return s; });
    } else {
      const text = prompt("Cloze 본문 (예: 수도는 {{c1::서울}}):");
      if (!text) return;
      mutate(s => { addClozeNote(s, activeDeck.deckId, text, "", []); return s; });
    }
  }

  async function aiGenerate() {
    if (!activeDeck) return;
    const userText = prompt("카드로 만들 학습 자료를 붙여넣으세요:");
    if (!userText) return;
    try {
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: activeDeck.name, content: userText })
      });
      const data = await res.json() as { quizzes: Array<{ question: string; answer: string }> };
      mutate(s => {
        for (const q of data.quizzes) addBasicNote(s, activeDeck.deckId, q.question, q.answer, []);
        return s;
      });
      alert(`${data.quizzes.length}장 추가 완료`);
    } catch {
      alert("AI 응답을 파싱하지 못했습니다.");
    }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(anki, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `anki-backup-${todayKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJSON(file: File) {
    try {
      const imported = JSON.parse(await file.text()) as AnkiState;
      mutate(s => {
        const idMap = new Map<string, string>();
        for (const d of imported.decks ?? []) {
          const existing = s.decks.find(x => x.name === d.name);
          const newId = existing?.deckId ?? createAId("deck");
          if (!existing) s.decks.push({ ...d, deckId: newId });
          idMap.set(d.deckId, newId);
        }
        for (const n of imported.notes ?? []) {
          const newId = createAId("note");
          idMap.set(n.noteId, newId);
          s.notes.push({ ...n, noteId: newId, deckId: idMap.get(n.deckId) ?? s.decks[0].deckId });
        }
        for (const c of imported.cards ?? []) {
          s.cards.push({ ...c, cardId: createAId("card"), noteId: idMap.get(c.noteId) ?? c.noteId, deckId: idMap.get(c.deckId) ?? c.deckId });
        }
        return s;
      });
      alert("가져오기 완료");
    } catch { alert("잘못된 JSON 파일입니다."); }
  }

  async function importCSV(file: File) {
    if (!activeDeck) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    let added = 0;
    mutate(s => {
      for (const line of lines) {
        const parts = line.includes("\t") ? line.split("\t") : line.split(",");
        if (parts.length >= 2 && parts[0] && parts[1]) {
          addBasicNote(s, activeDeck.deckId, parts[0].trim(), parts[1].trim(), []);
          added++;
        }
      }
      return s;
    });
    alert(`${added}장 추가 완료`);
  }

  function saveNote(noteId: string, fields: Record<string, string>, tags: string[]) {
    mutate(s => {
      const n = s.notes.find(x => x.noteId === noteId);
      if (!n) return s;
      if (n.type === "basic") {
        n.fields = { front: fields.front ?? "", back: fields.back ?? "" };
      } else {
        n.fields = { text: fields.text ?? "", extra: fields.extra ?? "" };
        const matches = [...(fields.text ?? "").matchAll(/\{\{c(\d+)::/g)];
        const ords = [...new Set(matches.map(m => parseInt(m[1], 10)))].sort((a, b) => a - b);
        const haveOrds = new Set(s.cards.filter(c => c.noteId === noteId).map(c => c.ord));
        for (const o of ords) if (!haveOrds.has(o)) {
          s.cards.push({ cardId: createAId("card"), noteId, deckId: n.deckId, ord: o, state: "new", ease: 2.5, interval: 0, reps: 0, lapses: 0, learnStep: 0, due: Date.now(), lastReview: null });
        }
        s.cards = s.cards.filter(c => c.noteId !== noteId || ords.includes(c.ord));
      }
      n.tags = tags;
      return s;
    });
  }

  function deleteNote(noteId: string) {
    if (!confirm("이 카드를 삭제할까요?")) return;
    mutate(s => ({
      ...s,
      notes: s.notes.filter(n => n.noteId !== noteId),
      cards: s.cards.filter(c => c.noteId !== noteId),
    }));
    setSelNoteId("");
  }

  function resetNote(noteId: string) {
    if (!confirm("이 노트의 진도를 초기화할까요?")) return;
    mutate(s => ({
      ...s,
      cards: s.cards.map(c => c.noteId !== noteId ? c : { ...c, state: "new", ease: 2.5, interval: 0, reps: 0, lapses: 0, learnStep: 0, due: Date.now(), lastReview: null }),
    }));
  }

  return (
    <div className="anki-shell">
      <aside className="anki-deck-rail">
        <div className="anki-rail-head">
          <span>덱</span>
          <button className="icon-button" onClick={addDeck} aria-label="덱 추가"><Plus size={15} /></button>
        </div>
        {anki.decks.map(d => {
          const c = getDeckCounts(anki, d.deckId);
          return (
            <button key={d.deckId} className={`deck-item ${d.deckId === deckId ? "active" : ""}`} onClick={() => { setDeckId(d.deckId); setSelNoteId(""); }}>
              <strong>{d.name}</strong>
              <span className="deck-counts">
                <em className="dc new">{c.new}</em>
                <em className="dc learn">{c.learn}</em>
                <em className="dc due">{c.review}</em>
              </span>
            </button>
          );
        })}
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <button className="ghost-button" style={{ fontSize: 11, flex: 1 }} onClick={deleteDeck}>삭제</button>
        </div>
      </aside>

      <div className="anki-main-area">
        <div className="anki-seg-wrap">
          <div className="segmented">
            {(["today", "browse", "stats", "io"] as const).map(v => (
              <button key={v} className={subView === v ? "active" : ""} onClick={() => setSubView(v)}>
                {{ today: "오늘", browse: "브라우저", stats: "통계", io: "가져오기/내보내기" }[v]}
              </button>
            ))}
          </div>
        </div>

        {subView === "today" && activeDeck && (
          <AnkiToday anki={anki} deck={activeDeck} onStartReview={onStartReview} onAddCard={addCard} />
        )}
        {subView === "browse" && activeDeck && (
          <AnkiBrowse
            anki={anki} deck={activeDeck}
            search={search} setSearch={setSearch}
            selNoteId={selNoteId} setSelNoteId={setSelNoteId}
            onAddCard={addCard} onAiGenerate={aiGenerate}
            onSaveNote={saveNote} onDeleteNote={deleteNote} onResetNote={resetNote}
          />
        )}
        {subView === "stats" && activeDeck && (
          <AnkiStats anki={anki} deck={activeDeck} />
        )}
        {subView === "io" && activeDeck && (
          <AnkiIO deck={activeDeck} onExport={exportJSON} onImportJSON={importJSON} onImportCSV={importCSV} />
        )}
      </div>
    </div>
  );
}

function AnkiToday({ anki, deck, onStartReview, onAddCard }: {
  anki: AnkiState;
  deck: { deckId: string; name: string };
  onStartReview: (id: string) => void;
  onAddCard: () => void;
}) {
  const c = getDeckCounts(anki, deck.deckId);
  const reviewed = anki.todayCounts.new + anki.todayCounts.learn + anki.todayCounts.review;
  const log = anki.reviewLog.slice(0, 12);
  const gradeLabels = ["다시", "어려움", "알맞음", "쉬움"];
  const gradeCls = ["again", "hard", "good", "easy"];

  return (
    <div className="anki-today">
      <header className="at-head">
        <div>
          <p className="eyebrow">덱</p>
          <h3 className="at-deck-name">{deck.name}</h3>
          <p className="at-sub">총 {c.total}장 · 오늘 {reviewed}장 학습</p>
        </div>
        <div className="at-actions">
          <button className="primary-button" onClick={() => onStartReview(deck.deckId)}>복습 시작 →</button>
          <button className="secondary-button" onClick={onAddCard}><Plus size={15} /> 카드 추가</button>
        </div>
      </header>
      <div className="at-cards">
        <div className="at-card new"><span className="lbl">신규</span><strong>{c.new}</strong><em>한도 {anki.settings.newPerDay}</em></div>
        <div className="at-card learn"><span className="lbl">학습 중</span><strong>{c.learn}</strong><em>분 단위 step</em></div>
        <div className="at-card due"><span className="lbl">복습</span><strong>{c.review}</strong><em>한도 {anki.settings.reviewPerDay}</em></div>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><h3>최근 평가</h3><span>최근 12회</span></div>
        {log.length === 0 ? <p className="empty-text">아직 평가 기록이 없습니다.</p> : (
          <div className="log-list">
            {log.map((l, i) => {
              const card = anki.cards.find(c => c.cardId === l.cardId);
              const note = card ? anki.notes.find(n => n.noteId === card.noteId) : null;
              const raw = note ? (note.type === "cloze" ? note.fields.text ?? "" : note.fields.front ?? "") : "(삭제됨)";
              const preview = raw.replace(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/g, "$1").slice(0, 60);
              return (
                <div className="log-row" key={i}>
                  <span className={`grade-badge ${gradeCls[l.grade]}`}>{gradeLabels[l.grade]}</span>
                  <div className="log-text">{preview}</div>
                  <span className="log-time">{timeAgo(l.ts)}</span>
                  <span className="log-int">{l.prevInterval}→{l.newInterval}일</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AnkiBrowse({ anki, deck, search, setSearch, selNoteId, setSelNoteId, onAddCard, onAiGenerate, onSaveNote, onDeleteNote, onResetNote }: {
  anki: AnkiState;
  deck: { deckId: string; name: string };
  search: string;
  setSearch: (s: string) => void;
  selNoteId: string;
  setSelNoteId: (id: string) => void;
  onAddCard: () => void;
  onAiGenerate: () => void;
  onSaveNote: (noteId: string, fields: Record<string, string>, tags: string[]) => void;
  onDeleteNote: (id: string) => void;
  onResetNote: (id: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const noteIds = [...new Set(anki.cards.filter(c => c.deckId === deck.deckId).map(c => c.noteId))];
  let notes = noteIds.map(id => anki.notes.find(n => n.noteId === id)).filter(Boolean) as typeof anki.notes;
  if (q) notes = notes.filter(n => {
    const text = (n.fields.front ?? "") + " " + (n.fields.back ?? "") + " " + (n.fields.text ?? "") + " " + (n.tags ?? []).join(" ");
    return text.toLowerCase().includes(q);
  });

  const selNote = anki.notes.find(n => n.noteId === selNoteId);
  const [draftFront, setDraftFront] = useState("");
  const [draftBack, setDraftBack] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftExtra, setDraftExtra] = useState("");
  const [draftTags, setDraftTags] = useState("");

  useEffect(() => {
    if (!selNote) return;
    setDraftFront(selNote.fields.front ?? "");
    setDraftBack(selNote.fields.back ?? "");
    setDraftText(selNote.fields.text ?? "");
    setDraftExtra(selNote.fields.extra ?? "");
    setDraftTags((selNote.tags ?? []).join(" "));
  }, [selNoteId]);

  function handleSave() {
    if (!selNote) return;
    onSaveNote(selNote.noteId, { front: draftFront, back: draftBack, text: draftText, extra: draftExtra }, draftTags.split(/\s+/).filter(Boolean));
  }

  const statePip = (nid: string) => {
    const cs = anki.cards.filter(c => c.noteId === nid);
    if (cs.some(c => c.state === "review")) return "due";
    if (cs.some(c => c.state === "learn")) return "learn";
    return "new";
  };

  return (
    <div className="anki-browse">
      <header className="ab-head">
        <input className="ab-search" type="search" placeholder="카드 검색…" value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ color: "var(--muted)", fontSize: 12 }}>{notes.length}/{noteIds.length}개</span>
        <div style={{ flex: 1 }} />
        <button className="secondary-button" onClick={onAiGenerate}><Sparkles size={14} /> AI 카드 생성</button>
        <button className="primary-button" onClick={onAddCard}><Plus size={14} /> 카드</button>
      </header>
      <div className="ab-body">
        <div className="ab-list">
          {notes.length === 0 ? <p className="empty-text">검색 결과 없음.</p> : notes.map(n => {
            const preview = n.type === "cloze" ? (n.fields.text ?? "").replace(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/g, "____") : (n.fields.front ?? "");
            const pip = statePip(n.noteId);
            return (
              <button key={n.noteId} className={`ab-item ${n.noteId === selNoteId ? "active" : ""}`} onClick={() => setSelNoteId(n.noteId)}>
                <div className="ab-item-row"><span className={`state-pip ${pip}`} /><strong>{preview.slice(0, 60)}</strong></div>
                <span className="ab-meta">{n.type === "cloze" ? `Cloze · ${anki.cards.filter(c => c.noteId === n.noteId).length}카드` : "Basic"}</span>
              </button>
            );
          })}
        </div>
        <div className="ab-editor">
          {!selNote ? (
            <div className="editor-empty">
              <p className="empty-text">왼쪽에서 카드를 선택하거나 새 카드를 추가하세요.</p>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button className="primary-button" onClick={onAddCard}><Plus size={14} /> 새 카드 추가</button>
              </div>
            </div>
          ) : selNote.type === "basic" ? (
            <>
              <div className="ae-field"><label>앞면</label><textarea rows={3} value={draftFront} onChange={e => setDraftFront(e.target.value)} /></div>
              <div className="ae-field"><label>뒷면</label><textarea rows={4} value={draftBack} onChange={e => setDraftBack(e.target.value)} /></div>
              <div className="ae-field"><label>태그</label><input value={draftTags} onChange={e => setDraftTags(e.target.value)} placeholder="공백으로 구분" /></div>
              <div className="ae-actions">
                <button className="primary-button" onClick={handleSave}><Save size={14} /> 저장</button>
                <button className="danger-button" onClick={() => onDeleteNote(selNote.noteId)}><Trash2 size={14} /> 삭제</button>
                <button className="ghost-button" onClick={() => onResetNote(selNote.noteId)}>진도 초기화</button>
              </div>
            </>
          ) : (
            <>
              <div className="ae-field"><label>본문 (Cloze: {"{{c1::정답}}"} 형식)</label><textarea rows={6} value={draftText} onChange={e => setDraftText(e.target.value)} /></div>
              <div className="ae-field"><label>참고</label><textarea rows={2} value={draftExtra} onChange={e => setDraftExtra(e.target.value)} /></div>
              <div className="ae-field"><label>태그</label><input value={draftTags} onChange={e => setDraftTags(e.target.value)} placeholder="공백으로 구분" /></div>
              <div className="ae-actions">
                <button className="primary-button" onClick={handleSave}><Save size={14} /> 저장</button>
                <button className="danger-button" onClick={() => onDeleteNote(selNote.noteId)}><Trash2 size={14} /> 삭제</button>
                <button className="ghost-button" onClick={() => onResetNote(selNote.noteId)}>진도 초기화</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AnkiStats({ anki, deck }: { anki: AnkiState; deck: { deckId: string; name: string } }) {
  const cards = anki.cards.filter(c => c.deckId === deck.deckId);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = Array(7).fill(0) as number[];
  for (const c of cards) {
    const d = Math.floor((c.due - today.getTime()) / 86400000);
    if (d <= 0) buckets[0]++;
    else if (d < 7) buckets[d]++;
  }
  const maxF = Math.max(1, ...buckets);
  const todayLog = anki.reviewLog.filter(l => l.ts >= today.getTime());
  const grades = [0, 0, 0, 0] as number[];
  for (const l of todayLog) grades[l.grade]++;
  const totalGraded = grades.reduce((a, b) => a + b, 0) || 1;
  const avgEase = cards.length ? (cards.reduce((a, c) => a + c.ease, 0) / cards.length).toFixed(2) : "—";
  const stateCounts = { new: 0, learn: 0, review: 0 } as Record<string, number>;
  for (const c of cards) stateCounts[c.state] = (stateCounts[c.state] ?? 0) + 1;
  const gradeInfo = [{ n: "다시", c: "again", v: grades[0] }, { n: "어려움", c: "hard", v: grades[1] }, { n: "알맞음", c: "good", v: grades[2] }, { n: "쉬움", c: "easy", v: grades[3] }];

  return (
    <div className="anki-stats">
      <div className="stats-metric-row">
        <div className="metric-card"><span>오늘 평가</span><strong>{todayLog.length}회</strong><p>{grades[2] + grades[3]}회 통과 · {grades[0]}회 다시</p></div>
        <div className="metric-card"><span>전체 카드</span><strong>{cards.length}장</strong><p>{stateCounts.review ?? 0} 복습 · {stateCounts.new ?? 0} 신규</p></div>
        <div className="metric-card"><span>평균 Ease</span><strong>{avgEase}</strong><p>2.5 = Anki 기본</p></div>
      </div>
      <section className="panel chart-panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><h3>7일 복습 예보</h3><span>due 카드 수</span></div>
        <div className="bar-chart" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
          {buckets.map((v, i) => (
            <div className="bar-item" key={i}>
              <div className="bar-track"><div style={{ height: `${Math.max(8, (v / maxF) * 100)}%` }} /></div>
              <span>{i === 0 ? "오늘" : `+${i}일`}</span>
              <em style={{ fontSize: 11, color: "var(--muted)" }}>{v}장</em>
            </div>
          ))}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><h3>오늘의 평가 분포</h3><span>{todayLog.length}회</span></div>
        <div className="grade-dist">
          {gradeInfo.map(g => (
            <div className="grade-row" key={g.c}>
              <span className={`grade-badge ${g.c}`}>{g.n}</span>
              <div className="grade-bar"><i className={g.c} style={{ width: `${(g.v / totalGraded) * 100}%` }} /></div>
              <strong>{g.v}회</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AnkiIO({ deck, onExport, onImportJSON, onImportCSV }: {
  deck: { name: string };
  onExport: () => void;
  onImportJSON: (f: File) => void;
  onImportCSV: (f: File) => void;
}) {
  return (
    <div className="anki-io">
      <section className="panel">
        <div className="section-heading"><h3>JSON 내보내기</h3></div>
        <p className="empty-text" style={{ textAlign: "left" }}>현재 모든 덱·카드·평가 로그를 JSON 파일로 다운로드합니다.</p>
        <button className="primary-button" onClick={onExport} style={{ marginTop: 8 }}>⬇ JSON 다운로드</button>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><h3>JSON 가져오기</h3></div>
        <p className="empty-text" style={{ textAlign: "left" }}>JSON 파일을 업로드하면 현재 데이터에 덱·카드를 병합합니다.</p>
        <label className="upload-zone" style={{ marginTop: 8 }}>
          <UploadCloud size={28} />
          <strong>JSON 파일 선택</strong>
          <span>.json 파일 (이전에 내보낸 백업)</span>
          <input type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f) onImportJSON(f); e.target.value = ""; }} />
        </label>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-heading"><h3>CSV 가져오기</h3></div>
        <p className="empty-text" style={{ textAlign: "left" }}>각 행이 <code>앞면,뒷면</code> 형식인 CSV. 현재 선택된 덱({deck.name})에 추가됩니다.</p>
        <label className="upload-zone" style={{ marginTop: 8 }}>
          <UploadCloud size={28} />
          <strong>CSV/TSV 파일 선택</strong>
          <span>탭 또는 쉼표 구분, 헤더 없이</span>
          <input type="file" accept=".csv,.tsv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) onImportCSV(f); e.target.value = ""; }} />
        </label>
      </section>
    </div>
  );
}

function ReviewModal({ queue, idx, backShown, anki, onReveal, onGrade, onClose }: {
  queue: AnkiCard[];
  idx: number;
  backShown: boolean;
  anki: AnkiState;
  onReveal: () => void;
  onGrade: (g: AnkiGrade) => void;
  onClose: () => void;
}) {
  const card = queue[idx];
  const isDone = !card;
  const fb = card ? getCardFB(anki, card) : null;
  const totalReviewed = anki.todayCounts.new + anki.todayCounts.learn + anki.todayCounts.review;
  const stateLabel = card?.state === "new" ? "신규" : card?.state === "learn" ? "학습 중" : "복습";
  const stateCls = card?.state === "new" ? "new" : card?.state === "learn" ? "learn" : "due";

  return (
    <div className="review-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="review-modal">
        <div className="review-header">
          {!isDone && <span className={`card-kind ${stateCls}`}>{stateLabel}</span>}
          <span className="card-counter">{!isDone ? `${idx + 1} / ${queue.length}` : ""}</span>
          {!isDone && <span className="card-deck-label">{fb?.deckName}</span>}
          <button className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>

        {isDone ? (
          <div className="session-done">
            <div style={{ fontSize: 48 }}>✓</div>
            <h3>오늘 학습 완료!</h3>
            <p>{totalReviewed}장 평가했습니다.</p>
            <button className="primary-button" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <>
            <div className="card-body">
              <div className="card-front" dangerouslySetInnerHTML={{ __html: fb?.front ?? "" }} />
              <div className={`card-back ${backShown ? "show" : ""}`} dangerouslySetInnerHTML={{ __html: fb?.back ?? "" }} />
            </div>
            <div className={`card-actions ${backShown ? "show-back" : ""}`}>
              {!backShown ? (
                <button className="primary-button" onClick={onReveal} style={{ width: "100%" }}>
                  답 보기 <span style={{ opacity: 0.5, fontSize: 11 }}>(Space)</span>
                </button>
              ) : (
                <div className="grade-buttons">
                  {([0, 1, 2, 3] as AnkiGrade[]).map(g => {
                    const labels = ["다시", "어려움", "알맞음", "쉬움"];
                    const cls = ["again", "hard", "good", "easy"];
                    const hint = ["1", "2", "3", "4"];
                    return (
                      <button key={g} className={`grade-btn ${cls[g]}`} onClick={() => onGrade(g)}>
                        <span>{labels[g]}</span>
                        <em>{peekLabel(card, g, anki.settings.learnSteps)}</em>
                        <small>{hint[g]}</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
