/* ============================================================
   app.jsx — root: auth, routing, timer engine, anki flow, persist
   ============================================================ */
const { useState, useEffect, useMemo, useRef } = React;

const TAB_TITLES = { overview: "학습 대시보드", timetable: "시간표", materials: "자료 / 요약", notes: "학습 노트", anki: "Anki 스케줄러", timer: "포모도로", stats: "학습 통계" };
const TAB_ROUTES = ["overview", "timetable", "materials", "notes", "anki", "timer", "stats"];

function usePersistent(key, initial) {
  const K = "hak." + key;
  const [val, setVal] = useState(() => {
    try {const raw = localStorage.getItem(K);return raw != null ? JSON.parse(raw) : typeof initial === "function" ? initial() : initial;}
    catch (e) {return typeof initial === "function" ? initial() : initial;}
  });
  useEffect(() => {try {localStorage.setItem(K, JSON.stringify(val));} catch (e) {}}, [val]);
  return [val, setVal];
}
function parseHash(fb) {const h = (location.hash || "").replace(/^#\/?/, "");return TAB_ROUTES.includes(h) ? h : fb;}
function useHashRoute(fb) {
  const [tab, setTab] = useState(() => parseHash(fb));
  useEffect(() => {const onHash = () => setTab(parseHash(fb));window.addEventListener("hashchange", onHash);return () => window.removeEventListener("hashchange", onHash);}, []);
  const navigate = (t) => {const next = "#/" + t;if (location.hash !== next) location.hash = next;else setTab(t);};
  return [tab, navigate];
}

function App() {
  const [user, setUser] = usePersistent("user", null);
  const [tab, navigate] = useHashRoute("overview");

  /* ---- persisted app data (seeded with demo) ---- */
  const [sessions, setSessions] = usePersistent("sessions", () => buildSampleSessions());
  const [materials, setMaterials] = usePersistent("materials", SAMPLE_MATERIALS);
  const [summaries, setSummaries] = usePersistent("summaries", SAMPLE_SUMMARIES);
  const [notes, setNotes] = usePersistent("notes", SAMPLE_NOTES);
  const [quizzes, setQuizzes] = usePersistent("quizzes", SAMPLE_QUIZZES);
  const [categories, setCategories] = usePersistent("categories", () => [...SUBJECTS]);
  const [pinnedNotes, setPinnedNotes] = usePersistent("pinnedNotes", []);
  const [pinnedMaterials, setPinnedMaterials] = usePersistent("pinnedMaterials", []);
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  const [selSummary, setSelSummary] = useState(SAMPLE_SUMMARIES[0]?.summaryId || "");
  const [selNote, setSelNote] = useState(SAMPLE_NOTES[0]?.noteId || "");
  const [noteDraft, setNoteDraft] = useState(() => ({ title: SAMPLE_NOTES[0]?.title || "새 학습 노트", subject: SAMPLE_NOTES[0]?.subject || "기타", markdownContent: SAMPLE_NOTES[0]?.markdownContent || "## 오늘의 핵심\n- " }));
  const [uploadStatus, setUploadStatus] = useState("학습 자료를 업로드하면 AI 요약을 바로 생성합니다.");
  const [isSummarizing, setIsSummarizing] = useState(false);

  /* ---- timer engine ---- */
  const [timerType, setTimerType] = useState("STOPWATCH");
  const [timerSubject, setTimerSubject] = useState("전공");
  const [seconds, setSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [pomoPhase, setPomoPhase] = useState("study");
  const [timerCfg, setTimerCfg] = useState({ timerH: 0, timerM: 30, timerS: 0, pomoStudySec: 1500, pomoBreakSec: 300, pomoRepeat: 4, pomoRound: 0 });
  const timerTotalSecs = (c) => Math.max(0, (c.timerH || 0) * 3600 + (c.timerM || 0) * 60 + (c.timerS || 0));
  const startRef = useRef(null);

  /* ---- anki ---- */
  const [anki, setAnki] = useState(makeDefaultAnkiState);
  const [ankiLoaded, setAnkiLoaded] = useState(false);
  const [ankiDeckId, setAnkiDeckId] = useState("");
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewBack, setReviewBack] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {const loaded = loadAnkiFromStorage();setAnki(loaded);setAnkiDeckId(loaded.activeDeckId || loaded.decks[0]?.deckId || "");setAnkiLoaded(true);}, []);
  useEffect(() => { setSessions(s => s.slice(0, 10)); }, []);
  useEffect(() => {if (ankiLoaded) saveAnkiToStorage(anki);}, [anki, ankiLoaded]);

  const character = useMemo(() => calculateCharacter(user?.userId || "guest", sessions), [user, sessions]);
  const attendance = useMemo(() => new Set(sessions.map((s) => s.endTime.slice(0, 10))).size, [sessions]);
  const selectedSummary = summaries.find((s) => s.summaryId === selSummary) ?? summaries[0];
  const selectedNote = notes.find((n) => n.noteId === selNote) ?? notes[0];
  const noteQuizzes = quizzes.filter((q) => q.noteId === selectedNote?.noteId);

  useEffect(() => {if (selectedNote) setNoteDraft({ title: selectedNote.title, subject: selectedNote.subject, markdownContent: selectedNote.markdownContent });}, [selectedNote?.noteId]);

  /* timer tick */
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setSeconds((v) => timerType === "STOPWATCH" ? v + 1 : Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, timerType]);

  /* countdown reaching zero */
  useEffect(() => {
    if (!isRunning || timerType === "STOPWATCH" || seconds > 0) return;
    if (timerType === "TIMER") {const mins = Math.max(1, Math.round(totalSeconds / 60));recordSession(mins);pushToast(`타이머 ${formatMinutes(mins)}을 기록했어요`, { accent: true });resetTimer("TIMER");return;}
    // POMODORO
    if (pomoPhase === "study") {
      recordSession(Math.max(1, Math.round(timerCfg.pomoStudySec / 60)));
      const nextRound = timerCfg.pomoRound + 1;
      setTimerCfg((c) => ({ ...c, pomoRound: nextRound }));
      if (nextRound >= timerCfg.pomoRepeat) {pushToast(`포모도로 ${nextRound}라운드 완료! 수고했어요`, { accent: true, icon: "sparkles" });resetTimer("POMODORO");} else
      {setPomoPhase("break");const t = timerCfg.pomoBreakSec;setSeconds(t);setTotalSeconds(t);pushToast("휴식 시간이에요");}
    } else {
      setPomoPhase("study");const t = timerCfg.pomoStudySec;setSeconds(t);setTotalSeconds(t);pushToast("다시 학습을 시작해요");
    }
  }, [seconds, isRunning, timerType, pomoPhase]);

  /* anki review keyboard */
  useEffect(() => {
    if (!reviewOpen) return;
    function onKey(e) {
      if (e.key === "Escape") {setReviewOpen(false);return;}
      if (!reviewBack) {if (e.key === " " || e.key === "Enter") {e.preventDefault();setReviewBack(true);}} else
      {if (e.key === "1") ankiGrade(0);else if (e.key === "2") ankiGrade(1);else if (e.key === "3" || e.key === " " || e.key === "Enter") {e.preventDefault();ankiGrade(2);} else if (e.key === "4") ankiGrade(3);}
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewOpen, reviewBack, reviewIdx, reviewQueue]);

  function recordSession(durationMinutes) {
    const started = startRef.current ?? new Date(Date.now() - durationMinutes * 60000);
    const session = { sessionId: createId("session"), userId: user?.userId || "demo", subject: timerSubject, timerType, startTime: started.toISOString(), endTime: new Date().toISOString(), durationMinutes };
    setSessions((prev) => [session, ...prev].slice(0, 10));
  }
  function startTimer() {startRef.current = new Date();setIsRunning(true);}
  function pauseTimer() {setIsRunning(false);}
  function initialSecondsFor(type) {return type === "POMODORO" ? timerCfg.pomoStudySec : type === "TIMER" ? Math.max(1, timerTotalSecs(timerCfg)) : 0;}
  function resetTimer(type) {
    const t = type || timerType;setIsRunning(false);setPomoPhase("study");
    setTimerCfg((c) => ({ ...c, pomoRound: 0 }));
    const s = initialSecondsFor(t);setSeconds(s);setTotalSeconds(s);startRef.current = null;
  }
  function finishTimer() {
    const dur = timerType === "STOPWATCH" ? Math.max(1, Math.round(seconds / 60)) : Math.max(1, Math.round((totalSeconds - seconds) / 60));
    if (dur > 0) {recordSession(dur);pushToast(`학습 ${formatMinutes(dur)}을 기록했어요`, { accent: true });}
    resetTimer();
  }
  function recordLap() {
    const dur = Math.max(1, Math.round(seconds / 60));
    if (dur > 0) {recordSession(dur);pushToast(`학습 ${formatMinutes(dur)}을 기록했어요`, { accent: true });}
  }
  function stopAndReset() {
    if (isRunning && seconds > 0) {const dur = Math.max(1, Math.round(seconds / 60));recordSession(dur);pushToast(`학습 ${formatMinutes(dur)}을 기록했어요`, { accent: true });}
    resetTimer();
  }
  function deleteSession(ids) {
    setSessions((prev) => prev.filter((s) => !ids.includes(s.sessionId)));
    pushToast(`기록 ${ids.length}개를 삭제했어요`);
  }
  function switchTimerType(next) {setTimerType(next);setIsRunning(false);setPomoPhase("study");setTimerCfg((c) => ({ ...c, pomoRound: 0 }));const s = next === "POMODORO" ? timerCfg.pomoStudySec : next === "TIMER" ? Math.max(1, timerTotalSecs(timerCfg)) : 0;setSeconds(s);setTotalSeconds(s);}
  /* keep total/seconds synced when cfg changes while idle */
  useEffect(() => {if (isRunning) return;if (timerType === "TIMER") {const s = Math.max(1, timerTotalSecs(timerCfg));setSeconds(s);setTotalSeconds(s);}if (timerType === "POMODORO" && pomoPhase === "study") {const s = timerCfg.pomoStudySec;setSeconds(s);setTotalSeconds(s);}if (timerType === "POMODORO" && pomoPhase === "break") {const s = timerCfg.pomoBreakSec;setSeconds(s);setTotalSeconds(s);}}, [timerCfg.timerH, timerCfg.timerM, timerCfg.timerS, timerCfg.pomoStudySec, timerCfg.pomoBreakSec, timerType, pomoPhase]);

  /* anki review */
  function startReview(deckId) {const q = buildQueue(anki, deckId);setReviewQueue(q);setReviewIdx(0);setReviewBack(false);setReviewOpen(true);}
  function ankiGrade(grade) {
    const card = reviewQueue[reviewIdx];if (!card) return;
    const updated = schedule(card, grade, anki.settings.learnSteps);
    const nc = { ...anki.todayCounts };
    if (card.state === "new") nc.new += 1;else if (card.state === "review") nc.review += 1;else if (card.state === "learn") nc.learn += 1;
    const newLog = [{ ts: Date.now(), cardId: card.cardId, grade, prevInterval: card.interval, newInterval: updated.interval }, ...anki.reviewLog].slice(0, 1000);
    const newCards = anki.cards.map((c) => c.cardId === card.cardId ? updated : c);
    let nextQueue = reviewQueue;
    if (updated.state === "learn" && updated.due - Date.now() < 10 * 60000) nextQueue = [...reviewQueue, updated];
    setAnki((prev) => ({ ...prev, cards: newCards, reviewLog: newLog, todayCounts: nc }));
    setReviewQueue(nextQueue);setReviewIdx((i) => i + 1);setReviewBack(false);
  }

  /* ---- content actions ---- */
  function handleUpload(e, category) {
    const file = e.target.files?.[0];if (!file) return;
    const cat = category || categories[0] || "기타";
    setIsSummarizing(true);setUploadStatus("파일을 읽고 AI 요약을 생성하는 중입니다.");
    const ext = (file.name.split(".").pop() || "").toUpperCase();
    const material = { materialId: createId("material"), fileName: file.name, fileType: ext || "FILE", category: cat, uploadedAt: new Date().toISOString() };
    setMaterials((prev) => [material, ...prev]);
    setTimeout(() => {
      const title = file.name.replace(/\.[^.]+$/, "");
      const summary = { summaryId: createId("summary"), title, content: summarizeLocally(title), sourceType: "material", category: cat, createdAt: new Date().toISOString() };
      setSummaries((prev) => [summary, ...prev]);setSelSummary(summary.summaryId);
      setUploadStatus("요약이 생성되어 저장되었습니다.");setIsSummarizing(false);
      pushToast("AI 요약을 생성했어요", { accent: true, icon: "sparkles" });
    }, 1300);
    e.target.value = "";
  }
  function saveNote() {
    if (!noteDraft.title.trim()) return;
    const now = new Date().toISOString();
    if (selectedNote) {const upd = { ...selectedNote, ...noteDraft, title: noteDraft.title.trim(), updatedAt: now };setNotes((prev) => prev.map((n) => n.noteId === selectedNote.noteId ? upd : n));pushToast("노트를 저장했어요");return;}
    const note = { noteId: createId("note"), userId: user?.userId || "demo", title: noteDraft.title.trim(), subject: noteDraft.subject, markdownContent: noteDraft.markdownContent, updatedAt: now };
    setNotes((prev) => [note, ...prev]);setSelNote(note.noteId);pushToast("새 노트를 만들었어요");
  }
  function newNote() {setSelNote("");setNoteDraft({ title: "새 학습 노트", subject: categories[0] || "기타", markdownContent: "## 오늘의 핵심\n- " });}
  function deleteNote(noteId) {setNotes((prev) => prev.filter((n) => n.noteId !== noteId));setQuizzes((prev) => prev.filter((q) => q.noteId !== noteId));setSelNote("");pushToast("노트를 삭제했어요");}
  function renameNote(noteId, newTitle) {
    setNotes((prev) => prev.map((n) => n.noteId === noteId ? { ...n, title: newTitle } : n));
    if (selectedNote?.noteId === noteId) setNoteDraft((d) => ({ ...d, title: newTitle }));
    pushToast("노트 이름을 변경했어요");
  }
  function togglePinNote(noteId) { setPinnedNotes(prev => prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]); }
  function togglePinMaterial(matId) { setPinnedMaterials(prev => prev.includes(matId) ? prev.filter(id => id !== matId) : [...prev, matId]); }
  function summarizeNote() {
    if (!selectedNote) return;
    const summary = { summaryId: createId("summary"), title: `${selectedNote.title} 노트 요약`, content: summarizeLocally(selectedNote.title), sourceType: "note", category: selectedNote.subject || categories[0], createdAt: new Date().toISOString() };
    setSummaries((prev) => [summary, ...prev]);setSelSummary(summary.summaryId);navigate("materials");pushToast("노트를 요약했어요", { accent: true, icon: "bot" });
  }
  function generateQuiz() {
    if (!selectedNote) return;
    const pool = [
    { question: `${selectedNote.title}의 핵심 개념을 한 줄로 설명하면?`, answer: "노트의 '오늘의 핵심' 항목을 자신의 말로 정리해 보세요." },
    { question: "이 단원에서 가장 헷갈렸던 부분은?", answer: "복습 포인트로 표시하고 Anki 카드로 만들어 반복하세요." }];

    const gen = pool.map((q) => ({ quizId: createId("quiz"), noteId: selectedNote.noteId, question: q.question, answer: q.answer, createdAt: new Date().toISOString() }));
    setQuizzes((prev) => [...gen, ...prev]);pushToast("복습 문제를 생성했어요", { accent: true, icon: "sparkles" });
  }
  function deleteSummary(id) {setSummaries((prev) => prev.filter((s) => s.summaryId !== id));setSelSummary("");pushToast("요약을 삭제했어요");}

  /* ---- shared categories (관리: 추가/이름변경/삭제, 전 영역 연동) ---- */
  const categoryCounts = useMemo(() => {
    const m = {};
    const bump = (k) => { if (k) m[k] = (m[k] || 0) + 1; };
    sessions.forEach((s) => bump(s.subject));
    notes.forEach((n) => bump(n.subject));
    summaries.forEach((s) => bump(s.category));
    materials.forEach((x) => bump(x.category));
    anki.decks.forEach((d) => bump(d.category));
    return m;
  }, [sessions, notes, summaries, materials, anki.decks]);

  function addCategory(name) {
    const n = (name || "").trim();
    if (!n) return false;
    if (categories.some((c) => c.toLowerCase() === n.toLowerCase())) { pushToast("이미 있는 카테고리예요"); return false; }
    setCategories((prev) => [...prev, n]); pushToast(`'${n}' 카테고리를 추가했어요`, { accent: true }); return true;
  }
  function renameCategory(oldN, name) {
    const n = (name || "").trim();
    if (!n || n === oldN) return false;
    if (categories.some((c) => c.toLowerCase() === n.toLowerCase() && c !== oldN)) { pushToast("이미 있는 카테고리예요"); return false; }
    setCategories((prev) => prev.map((c) => c === oldN ? n : c));
    setSessions((prev) => prev.map((s) => s.subject === oldN ? { ...s, subject: n } : s));
    setNotes((prev) => prev.map((x) => x.subject === oldN ? { ...x, subject: n } : x));
    setSummaries((prev) => prev.map((x) => x.category === oldN ? { ...x, category: n } : x));
    setMaterials((prev) => prev.map((x) => x.category === oldN ? { ...x, category: n } : x));
    setAnki((prev) => ({ ...prev, decks: prev.decks.map((d) => d.category === oldN ? { ...d, category: n } : d) }));
    setNoteDraft((d) => d.subject === oldN ? { ...d, subject: n } : d);
    if (timerSubject === oldN) setTimerSubject(n);
    pushToast("카테고리 이름을 변경했어요"); return true;
  }
  function deleteCategory(name) {
    if (categories.length <= 1) { pushToast("최소 1개의 카테고리가 필요해요"); return; }
    const fallback = categories.find((c) => c === "기타" && c !== name) || categories.find((c) => c !== name);
    setCategories((prev) => prev.filter((c) => c !== name));
    setSessions((prev) => prev.map((s) => s.subject === name ? { ...s, subject: fallback } : s));
    setNotes((prev) => prev.map((x) => x.subject === name ? { ...x, subject: fallback } : x));
    setSummaries((prev) => prev.map((x) => x.category === name ? { ...x, category: fallback } : x));
    setMaterials((prev) => prev.map((x) => x.category === name ? { ...x, category: fallback } : x));
    setAnki((prev) => ({ ...prev, decks: prev.decks.map((d) => d.category === name ? { ...d, category: fallback } : d) }));
    setNoteDraft((d) => d.subject === name ? { ...d, subject: fallback } : d);
    if (timerSubject === name) setTimerSubject(fallback);
    pushToast(`'${name}' 카테고리를 삭제했어요`);
  }
  function setDeckCategory(deckId, category) { setAnki((prev) => ({ ...prev, decks: prev.decks.map((d) => d.deckId === deckId ? { ...d, category } : d) })); }

  function login(provider, nick) {
    const names = { GOOGLE: "Google", KAKAO: "Kakao", NAVER: "Naver" };
    const nickname = (nick || "").trim();
    const safe = (nickname || "demo").toLowerCase().replace(/\s+/g, "_");
    setUser({ userId: `${provider.toLowerCase()}_${safe}`, nickname: nickname || `${names[provider]} 학습자`, provider });
    if (!TAB_ROUTES.includes(parseHash(null))) location.hash = "#/overview";
  }
  function logout() {setIsRunning(false);setUser(null);location.hash = "#/overview";}

  if (!user) return <><LoginScreen onLogin={login} /><ToastHost /></>;

  return (
    <div className="app">
      <Sidebar activeTab={tab} onTab={navigate} user={user} attendance={attendance} onLogout={logout} />
      <main className="main">
        {tab === "overview" ?
        <>
            <header className="page-header">
              <div className="title-wrap">
                <p className="eyebrow">Personal learning dashboard</p>
                <h1 className="page-title">학습 대시보드</h1>
                <SessionClock sessions={sessions} />
              </div>
              <ActivityHeatmap sessions={sessions} />
            </header>
            <Overview character={character} sessions={sessions} anki={anki} onGoAnki={() => {navigate("anki");startReview(ankiDeckId);}} />
          </> :

        <header className="topbar">
            <div><p className="eyebrow">Personal learning cockpit</p><h2>{TAB_TITLES[tab]}</h2></div>
          </header>
        }

        {tab === "materials" && <MaterialsView summaries={summaries} materials={materials} categories={categories} onManageCategories={() => setCatManagerOpen(true)} selectedSummary={selectedSummary} selectedSummaryId={selSummary} uploadStatus={uploadStatus} isSummarizing={isSummarizing} onUpload={handleUpload} onSelectSummary={setSelSummary} onDeleteSummary={deleteSummary} pinnedMaterials={pinnedMaterials} onTogglePinMaterial={togglePinMaterial} />}
        {tab === "notes" && <NotesView notes={notes} categories={categories} onManageCategories={() => setCatManagerOpen(true)} selectedNote={selectedNote} selectedNoteId={selNote} noteDraft={noteDraft} quizzes={noteQuizzes} onSelectNote={setSelNote} onDraftChange={setNoteDraft} onSave={saveNote} onNew={newNote} onDelete={deleteNote} onSummarize={summarizeNote} onQuiz={generateQuiz} onAddCategory={addCategory} onRenameCategory={renameCategory} onDeleteCategory={deleteCategory} onRenameNote={renameNote} pinnedNotes={pinnedNotes} onTogglePinNote={togglePinNote} summaries={summaries} onGoToSummary={(id) => {setSelSummary(id);navigate("materials");}} onDeleteSummary={deleteSummary} />}
        {tab === "timer" && <TimerView timerType={timerType} seconds={seconds} totalSeconds={totalSeconds} isRunning={isRunning} subject={timerSubject} categories={categories} onManageCategories={() => setCatManagerOpen(true)} sessions={sessions} pomoPhase={pomoPhase} timerCfg={timerCfg} setTimerCfg={setTimerCfg} onTypeChange={switchTimerType} onSubjectChange={setTimerSubject} onStart={startTimer} onPause={pauseTimer} onFinish={finishTimer} onReset={() => resetTimer()} onRecordLap={recordLap} onStopAndReset={stopAndReset} onDeleteSession={deleteSession} />}
        {tab === "stats" && <StatsView sessions={sessions} categories={categories} />}
        {tab === "timetable" && <TimetableView />}
        {tab === "anki" && <AnkiView anki={anki} setAnki={setAnki} deckId={ankiDeckId} setDeckId={setAnkiDeckId} categories={categories} onManageCategories={() => setCatManagerOpen(true)} onSetDeckCategory={setDeckCategory} onStartReview={startReview} />}
      </main>

      {catManagerOpen && <CategoryManager categories={categories} counts={categoryCounts} onAdd={addCategory} onRename={renameCategory} onDelete={deleteCategory} onClose={() => setCatManagerOpen(false)} />}

      {reviewOpen && <ReviewModal queue={reviewQueue} idx={reviewIdx} backShown={reviewBack} anki={anki} onReveal={() => setReviewBack(true)} onGrade={ankiGrade} onClose={() => setReviewOpen(false)} />}
      <ToastHost />
    </div>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);