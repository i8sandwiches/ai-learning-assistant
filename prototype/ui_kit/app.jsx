/* ============================================================
   app.jsx — App root: auth gate, tab routing, Anki review flow
   ============================================================ */
const { useState, useMemo, useEffect } = React;

/* persist a value to localStorage under a namespaced key */
function usePersistent(key, initial) {
  const K = "studyapp." + key;
  const [val, setVal] = useState(() => {
    try { const raw = localStorage.getItem(K); return raw != null ? JSON.parse(raw) : initial; }
    catch (e) { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(K, JSON.stringify(val)); } catch (e) {}
  }, [val]);
  return [val, setVal];
}

/* hash-based routing — gives real back/forward + shareable URLs (#/anki)
   while keeping the whole kit in one file. Maps 1:1 to Next.js app/ routes. */
const TAB_ROUTES = ["overview", "materials", "notes", "anki", "timer", "stats"];
function parseHash(fallback) {
  const h = (location.hash || "").replace(/^#\/?/, "");
  return TAB_ROUTES.includes(h) ? h : fallback;
}
function useHashRoute(fallback) {
  const [tab, setTab] = useState(() => parseHash(fallback));
  useEffect(() => {
    const onHash = () => setTab(parseHash(fallback));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = (t) => {
    const next = "#/" + t;
    if (location.hash !== next) location.hash = next;   // pushes a history entry
    else setTab(t);
  };
  return [tab, navigate];
}

function App() {
  const [user, setUser] = usePersistent("user", null);
  const [tab, navigate] = useHashRoute("overview");
  const [sessions] = useState(() => buildSampleSessions());
  const [storageStatus] = useState("MongoDB 연결됨");

  const [selSummary, setSelSummary] = useState(SAMPLE_SUMMARIES[0].summaryId);
  const [selNote, setSelNote] = useState(SAMPLE_NOTES[0].noteId);
  const [uploadStatus, setUploadStatus] = useState("학습 자료를 업로드하면 AI 요약을 바로 생성합니다.");
  const [busy, setBusy] = useState(false);

  const [deckId, setDeckId] = useState(SAMPLE_ANKI.decks[0].deckId);
  const [anki, setAnki] = usePersistent("ankiV2", SAMPLE_ANKI);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [queue, setQueue] = useState([]);
  const [rIdx, setRIdx] = useState(0);
  const [rBack, setRBack] = useState(false);

  const character = useMemo(() => calculateCharacter(sessions), [sessions]);
  const attendance = useMemo(
    () => new Set(sessions.map((s) => s.endTime.slice(0, 10))).size,
    [sessions]
  );

  /* ---- Anki deck / card operations (mutates persisted state) ---- */
  const ankiApi = useMemo(() => ({
    addDeck(name) {
      const id = "d" + Date.now();
      setAnki((a) => ({
        ...a,
        decks: [...a.decks, { deckId: id, name }],
        counts: { ...a.counts, [id]: { new: 0, learn: 0, due: 0 } },
        cards: { ...a.cards, [id]: [] },
      }));
      return id;
    },
    renameDeck(id, name) {
      setAnki((a) => ({ ...a, decks: a.decks.map((d) => (d.deckId === id ? { ...d, name } : d)) }));
    },
    deleteDecks(ids) {
      setAnki((a) => {
        const decks = a.decks.filter((d) => !ids.includes(d.deckId));
        const counts = { ...a.counts }, cards = { ...a.cards };
        ids.forEach((id) => { delete counts[id]; delete cards[id]; });
        return { ...a, decks, counts, cards };
      });
      setDeckId((cur) => (ids.includes(cur) ? "" : cur));
    },
    addCards(did, newCards) {
      const stamped = newCards.map((c, i) => ({ cardId: "c" + Date.now() + i, state: "new", interval: 0, ...c }));
      setAnki((a) => ({
        ...a,
        cards: { ...a.cards, [did]: [...(a.cards[did] || []), ...stamped] },
        counts: { ...a.counts, [did]: { ...a.counts[did], new: (a.counts[did].new || 0) + stamped.length } },
      }));
    },
    updateCard(did, cardId, patch) {
      setAnki((a) => ({
        ...a,
        cards: { ...a.cards, [did]: a.cards[did].map((c) => (c.cardId === cardId ? { ...c, ...patch } : c)) },
      }));
    },
    deleteCard(did, cardId) {
      setAnki((a) => {
        const card = (a.cards[did] || []).find((c) => c.cardId === cardId);
        const st = card ? card.state : "new";
        const cnt = { ...a.counts[did] };
        if (cnt[st] > 0) cnt[st] -= 1;
        return { ...a, cards: { ...a.cards, [did]: a.cards[did].filter((c) => c.cardId !== cardId) }, counts: { ...a.counts, [did]: cnt } };
      });
    },
  }), [setAnki]);

  /* keep the active deck valid after deletions */
  useEffect(() => {
    if (!anki.decks.length) return;
    if (!anki.decks.some((d) => d.deckId === deckId)) setDeckId(anki.decks[0].deckId);
  }, [anki.decks, deckId]);

  function login(provider, nick) {
    const names = { GOOGLE: "Google", KAKAO: "Kakao", NAVER: "Naver" };
    setUser({ provider, nickname: nick && nick.trim() ? nick.trim() : `${names[provider]} 학습자` });
    if (!TAB_ROUTES.includes(parseHash(null))) location.hash = "#/overview";
  }

  function startReview(id) {
    setQueue(anki.cards[id] || []);
    setRIdx(0); setRBack(false); setReviewOpen(true); setDeckId(id);
  }
  function grade() { setRIdx((i) => i + 1); setRBack(false); }

  React.useEffect(() => {
    if (!reviewOpen) return;
    function onKey(e) {
      if (e.key === "Escape") return setReviewOpen(false);
      if (!rBack && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setRBack(true); }
      else if (rBack && ["1", "2", "3", "4", " ", "Enter"].includes(e.key)) { e.preventDefault(); grade(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewOpen, rBack]);

  function uploadDemo() {
    setBusy(true); setUploadStatus("파일을 읽고 AI 요약을 생성하는 중입니다.");
    setTimeout(() => { setBusy(false); setUploadStatus("요약이 생성되어 오른쪽에 저장되었습니다."); }, 1400);
  }

  if (!user) return <LoginScreen onLogin={login} />;

  return (
    <div className="app">
      <Sidebar activeTab={tab} onTab={navigate} user={user} attendance={attendance} onLogout={() => { setUser(null); location.hash = "#/overview"; }} />
      <main className="main">
        {tab === "overview" ? (
          <>
            <PageHeader><ActivityHeatmap sessions={sessions} /></PageHeader>
            <Overview sessions={sessions} character={character} anki={anki}
              onGoMaterials={() => navigate("materials")} onGoTimer={() => navigate("timer")}
              onGoAnki={() => { navigate("anki"); startReview(deckId); }} />
          </>
        ) : (
          <>
            <Topbar tab={tab} storageStatus={storageStatus} />
            {tab === "materials" && <MaterialsView summaries={SAMPLE_SUMMARIES} materials={SAMPLE_MATERIALS} selectedId={selSummary} onSelect={setSelSummary} onUploadDemo={uploadDemo} uploadStatus={uploadStatus} busy={busy} />}
            {tab === "notes" && <NotesView notes={SAMPLE_NOTES} selectedId={selNote} onSelect={setSelNote} quizzes={SAMPLE_QUIZZES} />}
            {tab === "anki" && <AnkiTab anki={anki} deckId={deckId} onDeck={setDeckId} onReview={startReview} api={ankiApi} />}
            {tab === "timer" && <TimerView sessions={sessions} />}
            {tab === "stats" && <StatsView sessions={sessions} />}
          </>
        )}
      </main>
      {reviewOpen && (
        <ReviewModal queue={queue} idx={rIdx} back={rBack} deckName={(anki.decks.find((d) => d.deckId === deckId) || {}).name || ""}
          onReveal={() => setRBack(true)} onGrade={grade} onClose={() => setReviewOpen(false)} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
