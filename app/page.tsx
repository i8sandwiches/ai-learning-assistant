"use client";

import {
  BarChart3,
  BookOpenText,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  LogOut,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  TimerReset,
  Trash2,
  UploadCloud
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import { AppState, AuthProvider, LearningMaterial, Quiz, StudyNote, StudySession, Summary, TimerType, User } from "@/lib/types";
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

type TabId = "overview" | "materials" | "notes" | "timer" | "stats";

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

  useEffect(() => {
    void syncGoogleSession();
  }, []);

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

        {activeTab === "overview" && (
          <Overview
            character={character}
            totalMinutes={totalMinutes}
            todayMinutes={todayMinutes}
            summaryCount={state.summaries.length}
            noteCount={state.notes.length}
            sessions={userSessions}
            onGoMaterials={() => setActiveTab("materials")}
            onGoTimer={() => setActiveTab("timer")}
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
      </section>
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

function Overview({
  character,
  totalMinutes,
  todayMinutes,
  summaryCount,
  noteCount,
  sessions,
  onGoMaterials,
  onGoTimer
}: {
  character: ReturnType<typeof calculateCharacter>;
  totalMinutes: number;
  todayMinutes: number;
  summaryCount: number;
  noteCount: number;
  sessions: StudySession[];
  onGoMaterials: () => void;
  onGoTimer: () => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="hero-band">
        <div>
          <p className="eyebrow">학습 흐름</p>
          <h3>업로드, 요약, 복습, 기록을 한 번에 이어갑니다.</h3>
          <p>요약 자료와 노트를 만들고 타이머로 학습을 마치면 캐릭터와 통계가 자동으로 갱신됩니다.</p>
          <div className="inline-actions">
            <button className="primary-button" onClick={onGoMaterials}>
              <UploadCloud size={17} />
              자료 업로드
            </button>
            <button className="secondary-button" onClick={onGoTimer}>
              <Clock3 size={17} />
              타이머 시작
            </button>
          </div>
        </div>
        <CharacterCard character={character} />
      </section>

      <MetricCard title="누적 학습" value={formatMinutes(totalMinutes)} detail="타이머 기록 기준" />
      <MetricCard title="오늘 학습" value={formatMinutes(todayMinutes)} detail="오늘 종료된 세션" />
      <MetricCard title="저장 요약" value={`${summaryCount}개`} detail="자료/노트 기반" />
      <MetricCard title="학습 노트" value={`${noteCount}개`} detail="마크다운 노트" />

      <section className="wide-panel">
        <div className="section-heading">
          <h3>최근 학습 기록</h3>
          <span>{sessions.length}개 세션</span>
        </div>
        <SessionList sessions={sessions.slice(0, 5)} />
      </section>
    </div>
  );
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
    <div className="character-card">
      <div className="character-visual" aria-label="성장 캐릭터 루미">
        <div className="character-face">
          <span />
          <span />
        </div>
      </div>
      <div>
        <p className="eyebrow">{character.growthStage}</p>
        <h4>{character.name} Lv.{character.level}</h4>
        <p>{character.status}</p>
        <div className="progress-line">
          <i style={{ width: `${(progress / 300) * 100}%` }} />
        </div>
        <span className="small-muted">{character.experiencePoint} EXP</span>
      </div>
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
    stats: "학습 통계 분석"
  };

  return titles[tabId];
}

function formatTimer(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}
