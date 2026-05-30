/* ============================================================
   views.jsx — Materials, Notes, Timer, Stats, Anki tab, ReviewModal
   ============================================================ */

function MaterialsView({ summaries, materials, selectedId, onSelect, onUploadDemo, uploadStatus, busy }) {
  const [selMats, setSelMats] = React.useState([]);
  const [selSums, setSelSums] = React.useState([]);
  const [pinned, setPinned] = React.useState([]);

  const selected = summaries.find((s) => s.summaryId === selectedId) || summaries[0];

  function toggleMat(id) { setSelMats((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }
  function toggleSum(id) { setSelSums((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }
  function togglePin(id) { setPinned((p) => p.includes(id) ? p.filter((x) => x !== id) : (p.length < 5 ? [...p, id] : p)); }

  const canPin = selSums.length > 0 && (selSums.every((id) => pinned.includes(id)) || pinned.length < 5);
  const sortedSums = [
    ...summaries.filter((s) => pinned.includes(s.summaryId)),
    ...summaries.filter((s) => !pinned.includes(s.summaryId)),
  ];

  return (
    <div className="two-column">
      <section className="panel">
        <div className="section-heading"><h3>학습 자료 업로드</h3><span>PDF · TXT · MD</span></div>
        <label className={`upload-zone ${busy ? "busy" : ""}`} onClick={(e) => { e.preventDefault(); onUploadDemo(); }}>
          <Icon name="upload-cloud" size={36} />
          <strong>{busy ? "요약 생성 중" : "파일 선택"}</strong>
          <span>{uploadStatus}</span>
        </label>
        <div className="list-block-sep" />
        <div className="list-block">
          <div className="list-block-head">
            <h4 data-comment-anchor="6b5f63fc63-h4-17-11">업로드 자료</h4>
            <div className="list-block-actions">
              {selMats.length > 0 && (
                <button className="chip-button danger" onClick={() => setSelMats([])}>
                  <Icon name="trash-2" size={13} />삭제 ({selMats.length})
                </button>
              )}
              <button className="chip-button" disabled={selMats.length === 0} onClick={() => {}}>
                <Icon name="sparkles" size={13} />정리하기
              </button>
            </div>
          </div>
          {materials.map((m) => (
            <div className={`list-row mat-row ${selMats.includes(m.materialId) ? "is-selected" : ""}`} key={m.materialId}>
              <input type="checkbox" className="row-check" checked={selMats.includes(m.materialId)}
                onChange={() => toggleMat(m.materialId)} aria-label={`${m.fileName} 선택`} />
              <Icon name="file-text" size={17} />
              <div><strong>{m.fileName}</strong><span>{m.fileType} · {new Date(m.uploadedAt).toLocaleString("ko-KR")}</span></div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h3>저장된 요약</h3>
          <div className="sum-toolbar">
            {selSums.length > 0 && (
              <>
                <button className="chip-button" disabled={!canPin}
                  onClick={() => { selSums.forEach((id) => togglePin(id)); setSelSums([]); }}>
                  <Icon name="pin" size={13} />{selSums.every((id) => pinned.includes(id)) ? "고정 해제" : `고정 ${pinned.length}/5`}
                </button>
                <button className="chip-button danger" onClick={() => setSelSums([])}>
                  <Icon name="trash-2" size={13} />삭제 ({selSums.length})
                </button>
              </>
            )}
            <span className="sum-count">{summaries.length}개</span>
          </div>
        </div>
        <div className="split-list">
          <div className="summary-list">
            {sortedSums.map((s) => (
              <div key={s.summaryId} className={`sum-row ${selSums.includes(s.summaryId) ? "is-selected" : ""}`}>
                <input type="checkbox" className="row-check" checked={selSums.includes(s.summaryId)}
                  onChange={() => toggleSum(s.summaryId)} aria-label={`${s.title} 선택`} />
                <button className={`summary-item ${selected && s.summaryId === selected.summaryId ? "active" : ""}`}
                  onClick={() => onSelect(s.summaryId)}>
                  {pinned.includes(s.summaryId) && <span className="pin-dot"><Icon name="pin" size={10} /></span>}
                  <strong>{s.title}</strong>
                  <span>{s.sourceType === "material" ? "자료 요약" : "노트 요약"}</span>
                </button>
              </div>
            ))}
          </div>
          <div className="split-divider" />
          <article className="summary-detail">
            {selected ? (
              <>
                <div className="detail-title">
                  <div><h4>{selected.title}</h4><span>{new Date(selected.createdAt).toLocaleString("ko-KR")}</span></div>
                  <button className="icon-button danger" aria-label="요약 삭제"><Icon name="trash-2" size={17} /></button>
                </div>
                <MarkdownPreview content={selected.content} />
              </>
            ) : <p className="empty-text">조회할 요약을 선택하세요.</p>}
          </article>
        </div>
      </section>
    </div>
  );
}

function NotesView({ notes, selectedId, onSelect, quizzes }) {
  const selected = notes.find((n) => n.noteId === selectedId) || notes[0];
  const noteQuizzes = quizzes.filter((q) => q.noteId === (selected && selected.noteId));
  const [draft, setDraft] = React.useState(selected ? selected.markdownContent : "");
  const [title, setTitle] = React.useState(selected ? selected.title : "");
  const [subject, setSubject] = React.useState(selected ? selected.subject : "기타");
  React.useEffect(() => { if (selected) { setDraft(selected.markdownContent); setTitle(selected.title); setSubject(selected.subject); } }, [selected && selected.noteId]);
  return (
    <div className="notes-layout">
      <section className="panel note-index">
        <div className="section-heading"><h3>노트 목록</h3><button className="icon-button" aria-label="새 노트"><Icon name="plus" size={17} /></button></div>
        {notes.map((n) => (
          <button key={n.noteId} className={`note-list-item ${(selected && n.noteId === selected.noteId) ? "active" : ""}`} onClick={() => onSelect(n.noteId)}>
            <strong>{n.title}</strong><span>{n.subject} · {new Date(n.updatedAt).toLocaleDateString("ko-KR")}</span>
          </button>
        ))}
      </section>
      <section className="panel note-editor">
        <div className="editor-toolbar">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="노트 제목" />
          <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목" style={{ maxWidth: 110 }}>
            {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="primary-button"><Icon name="save" size={16} /> 저장</button>
        </div>
        <textarea className="markdown-input" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="마크다운 노트 내용" />
        <div className="inline-actions">
          <button className="secondary-button"><Icon name="bot" size={16} /> 노트 요약</button>
          <button className="secondary-button"><Icon name="sparkles" size={16} /> 문제 생성</button>
          <button className="danger-button"><Icon name="trash-2" size={16} /> 삭제</button>
        </div>
      </section>
      <section className="panel note-preview">
        <div className="section-heading"><h3>미리보기</h3><span>Markdown</span></div>
        <MarkdownPreview content={draft} />
        <div className="quiz-box">
          <h4>복습 문제</h4>
          {noteQuizzes.length === 0 ? <p className="empty-text">문제를 생성하면 이곳에 표시됩니다.</p> :
            noteQuizzes.map((q) => (<details key={q.quizId}><summary>{q.question}</summary><p>{q.answer}</p></details>))}
        </div>
      </section>
    </div>
  );
}

function fmtTimer(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TimerView({ sessions }) {
  const [mode, setMode] = React.useState("STOPWATCH");
  const [subject, setSubject] = React.useState("전공");
  const [secs, setSecs] = React.useState(0);
  const [running, setRunning] = React.useState(false);

  // Countdown timer
  const [timerMin, setTimerMin] = React.useState(30);

  // Pomodoro
  const [pomoStudy, setPomoStudy]   = React.useState(25);
  const [pomoBreak, setPomoBreak]   = React.useState(5);
  const [pomoRepeat, setPomoRepeat] = React.useState(4);
  const [pomoRound, setPomoRound]   = React.useState(0);
  const [pomoPhase, setPomoPhase]   = React.useState("study");
  const [presets, setPresets] = React.useState([
    { id: "p1", name: "기본 25/5",    study: 25, brk: 5,  repeat: 4 },
    { id: "p2", name: "딥워크 50/10", study: 50, brk: 10, repeat: 3 },
  ]);

  // Tick
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecs((v) => mode === "STOPWATCH" ? v + 1 : Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [running, mode]);

  // Countdown / pomodoro end
  React.useEffect(() => {
    if (!running || mode === "STOPWATCH" || secs !== 0) return;
    if (mode === "TIMER") { setRunning(false); return; }
    if (pomoPhase === "study") {
      setPomoPhase("break"); setSecs(pomoBreak * 60);
    } else {
      const nr = pomoRound + 1;
      setPomoRound(nr); setPomoPhase("study");
      if (nr >= pomoRepeat) setRunning(false);
      setSecs(pomoStudy * 60);
    }
  }, [secs]); // intentional: reads current state values at transition time

  function reset() {
    setRunning(false);
    if (mode === "STOPWATCH") setSecs(0);
    else if (mode === "TIMER") setSecs(timerMin * 60);
    else { setSecs(pomoStudy * 60); setPomoRound(0); setPomoPhase("study"); }
  }
  function switchMode(m) {
    setMode(m); setRunning(false);
    if (m === "STOPWATCH") setSecs(0);
    else if (m === "TIMER") setSecs(timerMin * 60);
    else { setSecs(pomoStudy * 60); setPomoRound(0); setPomoPhase("study"); }
  }
  function applyPreset(p) {
    setPomoStudy(p.study); setPomoBreak(p.brk); setPomoRepeat(p.repeat);
    setRunning(false); setPomoRound(0); setPomoPhase("study"); setSecs(p.study * 60);
  }
  function savePreset() {
    if (presets.length >= 10) return;
    setPresets((ps) => [...ps, { id: "p" + Date.now(), name: `${pomoStudy}분/${pomoBreak}분×${pomoRepeat}`, study: pomoStudy, brk: pomoBreak, repeat: pomoRepeat }]);
  }

  const POMO_FIELDS = [
    { label: "학습", val: pomoStudy, set: setPomoStudy, min: 1, max: 90,  step: 5 },
    { label: "휴게", val: pomoBreak, set: setPomoBreak, min: 1, max: 30,  step: 1 },
    { label: "반복", val: pomoRepeat, set: setPomoRepeat, min: 1, max: 12, step: 1, unit: "회" },
  ];

  return (
    <div className="timer-layout">
      <section className="panel timer-panel">
        <div className="segmented">
          <button className={mode === "STOPWATCH" ? "active" : ""} onClick={() => switchMode("STOPWATCH")}>스톱워치</button>
          <button className={mode === "TIMER"     ? "active" : ""} onClick={() => switchMode("TIMER")}>타이머</button>
          <button className={mode === "POMODORO"  ? "active" : ""} onClick={() => switchMode("POMODORO")}>포모도로</button>
        </div>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목" style={{ maxWidth: 200 }}>
          {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
        </select>

        {mode === "TIMER" && (
          <div className="pomo-settings">
            <div className="pomo-row">
              <span>시간</span>
              <div className="pomo-input-group">
                <button className="pomo-step" onClick={() => { const v = Math.max(1, timerMin - 5); setTimerMin(v); if (!running) setSecs(v * 60); }}>−</button>
                <input type="number" min={1} max={180} value={timerMin}
                  onChange={(e) => { const v = Math.max(1, +e.target.value); setTimerMin(v); if (!running) setSecs(v * 60); }} />
                <button className="pomo-step" onClick={() => { const v = Math.min(180, timerMin + 5); setTimerMin(v); if (!running) setSecs(v * 60); }}>+</button>
                <span className="pomo-unit">분</span>
              </div>
            </div>
          </div>
        )}

        {mode === "POMODORO" && (
          <div className="pomo-settings">
            {POMO_FIELDS.map(({ label, val, set, min, max, step, unit }) => (
              <div key={label} className="pomo-row">
                <span>{label}</span>
                <div className="pomo-input-group">
                  <button className="pomo-step" onClick={() => set((v) => Math.max(min, v - step))}>−</button>
                  <input type="number" min={min} max={max} value={val}
                    onChange={(e) => set(Math.max(min, Math.min(max, +e.target.value)))} />
                  <button className="pomo-step" onClick={() => set((v) => Math.min(max, v + step))}>+</button>
                  <span className="pomo-unit">{unit || "분"}</span>
                </div>
              </div>
            ))}
            <div className="pomo-phase-bar">
              <span className={`pomo-badge ${pomoPhase}`}>{pomoPhase === "study" ? "학습 중" : "휴식 중"}</span>
              <span className="pomo-rounds-text">{pomoRound} / {pomoRepeat} 라운드</span>
            </div>
          </div>
        )}

        <div className="timer-face">{fmtTimer(secs)}</div>
        <div className="timer-actions">
          {running
            ? <button className="secondary-button" onClick={() => setRunning(false)}><Icon name="pause" size={17} /> 일시정지</button>
            : <button className="primary-button" onClick={() => setRunning(true)}><Icon name="play" size={17} /> 시작</button>}
          <button className="secondary-button" onClick={reset}><Icon name="square" size={17} /> 종료/기록</button>
          <button className="ghost-button" onClick={reset}><Icon name="timer-reset" size={17} /> 초기화</button>
        </div>
      </section>

      <div className="timer-right">
        {mode === "POMODORO" && (
          <section className="panel">
            <div className="section-heading">
              <h3>포모도로 프리셋</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{presets.length}/10</span>
                <button className="chip-button" disabled={presets.length >= 10} onClick={savePreset}>
                  <Icon name="pin" size={13} />현재 고정
                </button>
              </div>
            </div>
            <div className="preset-list">
              {presets.length === 0 && <p className="empty-text">저장된 프리셋이 없습니다.</p>}
              {presets.map((p) => (
                <div key={p.id} className="preset-row">
                  <button className="preset-btn" onClick={() => applyPreset(p)}>
                    <strong>{p.name}</strong>
                    <span>{p.study}분 학습 · {p.brk}분 휴식 · {p.repeat}회</span>
                  </button>
                  <button className="icon-button" onClick={() => setPresets((ps) => ps.filter((x) => x.id !== p.id))} aria-label="삭제">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="panel">
          <div className="section-heading"><h3>자동 기록</h3><span>최근 8개</span></div>
          <SessionList sessions={sessions.slice(0, 8)} />
        </section>
      </div>
    </div>
  );
}

function StatsView({ sessions }) {
  const days = recentDays(7);
  const dayTotals = days.map((d) => ({ label: d.slice(5), value: sessions.filter((s) => s.endTime.slice(0, 10) === d).reduce((a, s) => a + s.durationMinutes, 0) }));
  const maxDay = Math.max(30, ...dayTotals.map((x) => x.value));
  const subjectTotals = SUBJECTS.map((sub) => ({ subject: sub, value: sessions.filter((s) => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const maxSub = Math.max(30, ...subjectTotals.map((x) => x.value));
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthly = sessions.filter((s) => s.endTime.slice(0, 7) === monthKey).reduce((a, s) => a + s.durationMinutes, 0);
  return (
    <div className="stats-grid">
      <section className="metric-card"><span>이번 달 학습</span><strong>{formatMinutes(monthly)}</strong><p>월간 누적</p></section>
      <section className="metric-card"><span>세션 수</span><strong>{sessions.length}회</strong><p>기록된 학습</p></section>
      <section className="panel chart-panel">
        <div className="section-heading"><h3>최근 7일 학습 추이</h3><span>분 단위</span></div>
        <div className="bar-chart">
          {dayTotals.map((it) => (<div className="bar-item" key={it.label}><div className="bar-track"><div style={{ height: `${Math.max(8, (it.value / maxDay) * 100)}%` }} /></div><span>{it.label}</span></div>))}
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="section-heading"><h3>과목별 학습 시간</h3><span>{subjectTotals.length}개 과목</span></div>
        <div className="subject-chart">
          {subjectTotals.map((it) => (<div className="subject-row" key={it.subject}><span>{it.subject}</span><div><i style={{ width: `${Math.max(10, (it.value / maxSub) * 100)}%` }} /></div><strong>{it.value}분</strong></div>))}
        </div>
      </section>
    </div>
  );
}

/* ===== Anki tab lives in anki.jsx ===== */

function ReviewModal({ queue, idx, back, onReveal, onGrade, onClose, deckName }) {
  const card = queue[idx];
  if (!card) {
    return (
      <div className="review-overlay" onClick={onClose}>
        <div className="review-modal" onClick={(e) => e.stopPropagation()}>
          <div className="card-body" style={{ alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center" }}>
            <Icon name="check-circle-2" size={40} color="oklch(0.55 0.14 155)" />
            <h3 style={{ margin: "12px 0 0" }}>오늘 복습 완료</h3>
            <p style={{ margin: "6px 0 16px", color: "var(--muted)" }}>모든 카드를 복습했어요. 내일 또 만나요.</p>
            <button className="primary-button" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="review-overlay" onClick={onClose}>
      <div className="review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="review-header">
          <span className={`card-kind ${card.state}`}>{({new:"신규",learn:"학습 중",due:"복습"})[card.state]}</span>
          <span className="card-counter">{idx + 1} / {queue.length}</span>
          <span className="card-deck-label">{deckName}</span>
        </div>
        <div className="card-body">
          <div className="card-front">{card.type === "cloze" ? renderCloze(card.text, false) : card.front}</div>
          <div className={`card-back ${back ? "show" : ""}`}>{card.type === "cloze" ? renderCloze(card.text, true) : card.back}</div>
        </div>
        <div className="card-actions">
          {!back ? (
            <button className="primary-button" style={{ width: "100%", minHeight: 44 }} onClick={onReveal}>정답 보기 (Space)</button>
          ) : (
            <div className="grade-buttons">
              <button className="grade-btn again" onClick={() => onGrade(0)}>Again<em>다시</em><small>1</small></button>
              <button className="grade-btn hard" onClick={() => onGrade(1)}>Hard<em>어려움</em><small>2</small></button>
              <button className="grade-btn good" onClick={() => onGrade(2)}>Good<em>알맞음</em><small>3</small></button>
              <button className="grade-btn easy" onClick={() => onGrade(3)}>Easy<em>쉬움</em><small>4</small></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MaterialsView, NotesView, TimerView, StatsView, ReviewModal });
