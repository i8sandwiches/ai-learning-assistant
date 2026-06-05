/* ============================================================
   views.jsx — Materials, Notes, Timer, Stats, SessionList
   ============================================================ */
const { useState: useStateV } = React;

function SessionList({ sessions, selected = [], onToggle }) {
  if (sessions.length === 0) return <p className="empty-text">아직 기록된 학습 시간이 없습니다.</p>;
  return (
    <div className="session-list">
      {sessions.map((s) =>
      <div className={`session-row ${selected.includes(s.sessionId) ? "is-selected" : ""}`} key={s.sessionId}>
          {onToggle && <input type="checkbox" className="row-check" checked={selected.includes(s.sessionId)} onChange={() => onToggle(s.sessionId)} aria-label={`${s.subject} 기록 선택`} />}
          <Icon name="clock" size={17} />
          <div>
            <strong>{s.subject}</strong>
            <span>{s.timerType === "POMODORO" ? "포모도로" : s.timerType === "TIMER" ? "타이머" : "스톱워치"} · {new Date(s.endTime).toLocaleString("ko-KR")}</span>
          </div>
          <b>{formatMinutes(s.durationMinutes)}</b>
        </div>
      )}
    </div>);
}

/* ===== Materials ===== */
function MaterialsView({ summaries, materials, categories, onManageCategories, selectedSummary, selectedSummaryId, uploadStatus, isSummarizing, onUpload, onSelectSummary, onDeleteSummary, pinnedMaterials = [], onTogglePinMaterial }) {
  const [selMats, setSelMats] = useStateV([]);
  const [selSums, setSelSums] = useStateV([]);
  const [pinned, setPinned] = useStateV([]);
  const [uploadCat, setUploadCat] = useStateV(categories[0] || "기타");
  const [filterCat, setFilterCat] = useStateV("all");
  const [openMCats, setOpenMCats] = useStateV(new Set());
  React.useEffect(() => {if (!categories.includes(uploadCat)) setUploadCat(categories[0] || "기타");}, [categories]);
  const toggleMat = (id) => setSelMats((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleMCat = (cat) => setOpenMCats(s => {const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n;});
  const toggleSum = (id) => setSelSums((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const togglePin = (id) => setPinned((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p);
  const canPin = selSums.length > 0 && (selSums.every((id) => pinned.includes(id)) || pinned.length < 5);
  const visibleSums = filterCat === "all" ? summaries : summaries.filter((s) => s.category === filterCat);
  const sortedSums = [...visibleSums.filter((s) => pinned.includes(s.summaryId)), ...visibleSums.filter((s) => !pinned.includes(s.summaryId))];
  const visibleMats = filterCat === "all" ? materials : materials.filter((m) => m.category === filterCat);
  return (
    <div className="two-column view-enter">
      <section className="panel">
        <div className="section-heading"><h3>학습 자료 업로드</h3><span>PDF · TXT · MD · CSV · JSON</span></div>
        <div className="upload-cat-row">
          <span className="upload-cat-label">카테고리</span>
          <CategoryField categories={categories} value={uploadCat} onChange={setUploadCat} onManage={onManageCategories} style={{ flex: 1 }} />
        </div>
        <label className={`upload-zone ${isSummarizing ? "busy" : ""}`}>
          <Icon name="upload-cloud" size={36} />
          <strong>{isSummarizing ? "요약 생성 중" : "파일 선택"}</strong>
          <span>{uploadStatus}</span>
          <span className="upload-cat-pill">{uploadCat} 카테고리로 저장</span>
          <input type="file" accept=".pdf,.txt,.md,.csv,.json,.py,.js,.ts,.html" onChange={(e) => onUpload(e, uploadCat)} disabled={isSummarizing} />
        </label>
        <div className="list-block-sep" />
        <div className="list-block">
          <div className="list-block-head">
            <h4>업로드 자료</h4>
            <div className="list-block-actions">
              {selMats.length > 0 && <button className="chip-button danger" onClick={() => setSelMats([])}><Icon name="trash-2" size={13} />삭제 ({selMats.length})</button>}
            </div>
          </div>
          {/* 즐겨찾기 */}
          {(() => {
            const favMats = materials.filter(m => pinnedMaterials.includes(m.materialId));
            return (
              <div className="mat-cat-group">
                <button className="mat-cat-header" onClick={() => toggleMCat("__fav__")}>
                  <span className="mat-cat-chevron" style={{transform: openMCats.has("__fav__") ? "rotate(90deg)" : "rotate(0deg)"}}><Icon name="star" size={13} /></span>
                  <span className="mat-cat-name" style={{color:"oklch(0.68 0.15 78)"}}>즐겨찾기</span>
                  <span className="mat-cat-count">{favMats.length}</span>
                </button>
                {openMCats.has("__fav__") && favMats.length === 0 && <p className="note-empty-cat" style={{paddingLeft:28}}>즐겨찾기한 자료가 없습니다</p>}
                {openMCats.has("__fav__") && favMats.map(m =>
                  <div className={`list-row mat-row mat-indent ${selMats.includes(m.materialId) ? "is-selected" : ""}`} key={m.materialId}>
                    <input type="checkbox" className="row-check" checked={selMats.includes(m.materialId)} onChange={() => toggleMat(m.materialId)} aria-label={`${m.fileName} 선택`} />
                    <Icon name="file-text" size={17} />
                    <div><strong>{m.fileName}</strong><span>{m.fileType} · {new Date(m.uploadedAt).toLocaleString("ko-KR")}</span></div>
                    <button className="note-ctx-btn" style={{opacity:1,color:"oklch(0.68 0.15 78)"}} onClick={() => onTogglePinMaterial(m.materialId)} aria-label="즐겨찾기 해제"><Icon name="star" size={13} /></button>
                  </div>
                )}
              </div>
            );
          })()}
          {materials.length === 0 ? <p className="empty-text">아직 업로드한 자료가 없습니다.</p> :
          (() => {
            const extraCats = [...new Set(materials.map(m => m.category || "기타"))].filter(c => !categories.includes(c));
            const allMatCats = [...categories, ...extraCats];
            const filteredCats = filterCat === "all" ? allMatCats : allMatCats.filter(c => c === filterCat);
            return filteredCats.map(cat => {
              const catMats = materials.filter(m => (m.category || "기타") === cat);
              const isOpen = openMCats.has(cat);
              return (
                <div key={cat} className="mat-cat-group">
                  <button className="mat-cat-header" onClick={() => toggleMCat(cat)}>
                    <span className="mat-cat-chevron" style={{transform: isOpen ? "rotate(90deg)" : "rotate(0deg)"}}><Icon name="chevron-right" size={13} /></span>
                    <span className="mat-cat-name">{cat}</span>
                    <span className="mat-cat-count">{catMats.length}</span>
                  </button>
                  {isOpen && catMats.length === 0 && <p className="note-empty-cat" style={{paddingLeft:28}}>자료가 없습니다</p>}
                  {isOpen && catMats.map(m =>
                    <div className={`list-row mat-row mat-indent ${selMats.includes(m.materialId) ? "is-selected" : ""}`} key={m.materialId}>
                      <input type="checkbox" className="row-check" checked={selMats.includes(m.materialId)} onChange={() => toggleMat(m.materialId)} aria-label={`${m.fileName} 선택`} />
                      <Icon name="file-text" size={17} />
                      <div><strong>{m.fileName}</strong><span>{m.fileType} · {new Date(m.uploadedAt).toLocaleString("ko-KR")}</span></div>
                      <button className="note-ctx-btn" style={{opacity: pinnedMaterials.includes(m.materialId) ? 1 : undefined, color: pinnedMaterials.includes(m.materialId) ? "oklch(0.68 0.15 78)" : undefined}} onClick={() => onTogglePinMaterial(m.materialId)} aria-label={pinnedMaterials.includes(m.materialId) ? "즐겨찾기 해제" : "즐겨찾기 추가"} title={pinnedMaterials.includes(m.materialId) ? "즐겨찾기 해제" : "즐겨찾기 추가"}><Icon name="star" size={13} /></button>
                    </div>
                  )}
                </div>
              );
            });
          })()
          }
        </div>
      </section>
      <section className="panel" data-comment-anchor="d0df4855a4-section-72-7">
        <div className="section-heading">
          <h3>저장된 요약</h3>
          <div className="sum-toolbar">
            {selSums.length > 0 && <>
              <button className="chip-button" disabled={!canPin} onClick={() => {selSums.forEach((id) => togglePin(id));setSelSums([]);}}>
                <Icon name="pin" size={13} />{selSums.every((id) => pinned.includes(id)) ? "고정 해제" : `고정 ${pinned.length}/5`}
              </button>
              <button className="chip-button danger" onClick={() => setSelSums([])}><Icon name="trash-2" size={13} />삭제 ({selSums.length})</button>
            </>}
            <select className="cat-filter" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="카테고리 필터">
              <option value="all">전체 카테고리</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="sum-count">{sortedSums.length}개</span>
          </div>
        </div>
        <div className="split-list">
          <div className="summary-list">
            {summaries.length === 0 ? <p className="empty-text">요약이 생성되면 이곳에 저장됩니다.</p> : sortedSums.map((s) =>
            <div key={s.summaryId} className={`sum-row ${selSums.includes(s.summaryId) ? "is-selected" : ""}`}>
                <input type="checkbox" className="row-check" checked={selSums.includes(s.summaryId)} onChange={() => toggleSum(s.summaryId)} aria-label={`${s.title} 선택`} />
                <button className={`summary-item ${s.summaryId === selectedSummaryId ? "active" : ""}`} onClick={() => onSelectSummary(s.summaryId)}>
                  {pinned.includes(s.summaryId) && <span className="pin-dot"><Icon name="pin" size={10} /></span>}
                  <strong>{s.title}</strong>
                  <span className="sum-meta">{s.category && <span className="cat-chip">{s.category}</span>}{s.sourceType === "material" ? "자료 요약" : "노트 요약"}</span>
                </button>
              </div>
            )}
          </div>
          <div className="split-divider" />
          <article className="summary-detail">
            {selectedSummary ? <>
              <div className="detail-title">
                <div><h4>{selectedSummary.title}</h4><span>{selectedSummary.category ? selectedSummary.category + " · " : ""}{new Date(selectedSummary.createdAt).toLocaleString("ko-KR")}</span></div>
                <button className="icon-button danger" aria-label="요약 삭제" onClick={() => onDeleteSummary(selectedSummary.summaryId)}><Icon name="trash-2" size={17} /></button>
              </div>
              <MarkdownPreview content={selectedSummary.content} />
            </> : <p className="empty-text">조회할 요약을 선택하세요.</p>}
          </article>
        </div>
      </section>
    </div>);

}

/* ===== Notes ===== */
function NotesView({ notes, categories, onManageCategories, selectedNote, selectedNoteId, noteDraft, quizzes, onSelectNote, onDraftChange, onSave, onNew, onDelete, onSummarize, onQuiz, onAddCategory, onRenameCategory, onDeleteCategory, onRenameNote, pinnedNotes = [], onTogglePinNote, summaries = [], onGoToSummary, onDeleteSummary }) {
  /* merge categories with any note subjects not already listed */
  const allCats = React.useMemo(() => {
    const extra = [...new Set(notes.map((n) => n.subject || "기타"))].filter((k) => !categories.includes(k));
    return [...categories, ...extra];
  }, [categories, notes]);

  const grouped = React.useMemo(() => {
    const map = {};
    notes.forEach((n) => {const k = n.subject || "기타";if (!map[k]) map[k] = [];map[k].push(n);});
    return map;
  }, [notes]);

  const summariesByCategory = React.useMemo(() => {
    const map = {};
    (summaries || []).forEach(s => {const k = s.category || "기타";if (!map[k]) map[k] = [];map[k].push(s);});
    return map;
  }, [summaries]);

  const pinnedNoteObjects = React.useMemo(() =>
    notes.filter(n => (pinnedNotes || []).includes(n.noteId)), [notes, pinnedNotes]);

  const [openCats, setOpenCats] = useStateV(() => new Set(["__fav__"]));
  const toggleCat = (cat) => setOpenCats((s) => {const n = new Set(s);n.has(cat) ? n.delete(cat) : n.add(cat);return n;});
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (selectedNote) setOpenCats((s) => {const n = new Set(s);n.add(selectedNote.subject || "기타");return n;});
  }, [selectedNoteId]);

  /* inline editing */
  const [editingCat, setEditingCat] = useStateV(null); // { name, value }
  const [editingNote, setEditingNote] = useStateV(null); // { noteId, value }
  const [openMenu, setOpenMenu] = useStateV(null); // "cat:X" | "note:X"
  const [addingCat, setAddingCat] = useStateV(false);
  const [newCatName, setNewCatName] = useStateV("");

  React.useEffect(() => {
    if (!openMenu) return;
    const close = (e) => {if (!e.target.closest(".note-ctx-wrap")) setOpenMenu(null);};
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  function commitCatRename() {
    if (editingCat?.value.trim()) onRenameCategory(editingCat.name, editingCat.value.trim());
    setEditingCat(null);
  }
  function commitNoteRename() {
    if (editingNote?.value.trim()) onRenameNote(editingNote.noteId, editingNote.value.trim());
    setEditingNote(null);
  }
  function commitAddCat() {
    if (newCatName.trim()) onAddCategory(newCatName.trim());
    setAddingCat(false);setNewCatName("");
  }

  return (
    <div className="notes-layout view-enter">
      <section className="panel note-index" data-comment-anchor="b9b5f1e8db-section-165-7">
        <div className="section-heading">
          <h3>노트 목록</h3>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-button" aria-label="카테고리 추가" title="카테고리 추가" onClick={() => {setAddingCat(true);setNewCatName("");}}><Icon name="folder-plus" size={15} /></button>
            <button className="icon-button" aria-label="새 노트" onClick={onNew}><Icon name="plus" size={17} /></button>
          </div>
        </div>

        {(
          <div className="note-cat-group">
            <div className={`note-cat-header ${pinnedNoteObjects.some(n => n.noteId === selectedNoteId) ? "has-active" : ""}`}>
              <button className="note-cat-toggle" onClick={() => toggleCat("__fav__")}>
                <span className="note-cat-chevron" style={{ transform: openCats.has("__fav__") ? "rotate(90deg)" : "rotate(0deg)" }}><Icon name="star" size={13} /></span>
              </button>
              <button className="note-cat-label-btn" onClick={() => toggleCat("__fav__")}>
                <span className="note-cat-name" style={{ color: "oklch(0.68 0.15 78)" }}>즐겨찾기</span>
                <span className="note-cat-count">{pinnedNoteObjects.length}</span>
              </button>
            </div>
            {openCats.has("__fav__") && pinnedNoteObjects.map(note => (
              <div key={note.noteId} className={`note-list-row ${note.noteId === selectedNoteId ? "active" : ""}`}>
                <button className="note-list-item" onClick={() => onSelectNote(note.noteId)}>
                  <strong>{note.title}</strong>
                  <span>{note.subject} · {new Date(note.updatedAt).toLocaleDateString("ko-KR")}</span>
                </button>
                <button className="note-ctx-btn" style={{ opacity: 1, color: "oklch(0.68 0.15 78)" }} onClick={() => onTogglePinNote && onTogglePinNote(note.noteId)} aria-label="즐겨찾기 해제" title="즐겨찾기 해제"><Icon name="star" size={13} /></button>
              </div>
            ))}
            {openCats.has("__fav__") && pinnedNoteObjects.length === 0 && <p className="note-empty-cat">즐겨찾기한 노트가 없습니다</p>}
          </div>
        )}

        {allCats.map((cat) => {
          const catNotes = grouped[cat] || [];
          const isOpen = openCats.has(cat);
          const hasActive = catNotes.some((n) => n.noteId === selectedNoteId);
          const isEditingCat = editingCat?.name === cat;
          const catMenuKey = `cat:${cat}`;
          return (
            <div key={cat} className="note-cat-group">
              <div className={`note-cat-header ${hasActive ? "has-active" : ""}`}>
                <button className="note-cat-toggle" onClick={() => toggleCat(cat)}>
                  <span className="note-cat-chevron" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}><Icon name="chevron-right" size={13} /></span>
                </button>
                {isEditingCat ?
                <input className="note-inline-input" autoFocus value={editingCat.value}
                onChange={(e) => setEditingCat({ ...editingCat, value: e.target.value })}
                onBlur={commitCatRename}
                onKeyDown={(e) => {if (e.key === "Enter") commitCatRename();if (e.key === "Escape") setEditingCat(null);}} /> :
                <button className="note-cat-label-btn" onClick={() => toggleCat(cat)}>
                      <span className="note-cat-name">{cat}</span>
                      <span className="note-cat-count">{catNotes.length}</span>
                    </button>
                }
                <div className="note-ctx-wrap">
                  <button className="note-ctx-btn" aria-label="카테고리 옵션" onClick={() => setOpenMenu(openMenu === catMenuKey ? null : catMenuKey)}><Icon name="more-horizontal" size={14} /></button>
                  {openMenu === catMenuKey &&
                  <div className="note-ctx-menu">
                      <button onClick={() => {setEditingCat({ name: cat, value: cat });setOpenMenu(null);}}><Icon name="pencil" size={13} />이름 변경</button>
                      <button className="danger" onClick={() => {onDeleteCategory(cat);setOpenMenu(null);}}><Icon name="trash-2" size={13} />삭제</button>
                    </div>
                  }
                </div>
              </div>
              {isOpen && catNotes.map((note) => {
                const isEditingNote = editingNote?.noteId === note.noteId;
                const noteMenuKey = `note:${note.noteId}`;
                return (
                  <div key={note.noteId} className={`note-list-row ${note.noteId === selectedNoteId ? "active" : ""}`}>
                    {isEditingNote ?
                    <input className="note-inline-input note-inline-note" autoFocus value={editingNote.value}
                    onChange={(e) => setEditingNote({ ...editingNote, value: e.target.value })}
                    onBlur={commitNoteRename}
                    onKeyDown={(e) => {if (e.key === "Enter") commitNoteRename();if (e.key === "Escape") setEditingNote(null);}} /> :
                    <button className="note-list-item" onClick={() => onSelectNote(note.noteId)}>
                          <strong>{note.title}</strong>
                          <span>{new Date(note.updatedAt).toLocaleDateString("ko-KR")}</span>
                        </button>
                    }
                    <div className="note-ctx-wrap">
                      <button className="note-ctx-btn" aria-label="노트 옵션" onClick={() => setOpenMenu(openMenu === noteMenuKey ? null : noteMenuKey)}><Icon name="more-horizontal" size={14} /></button>
                      {openMenu === noteMenuKey &&
                      <div className="note-ctx-menu">
                          <button onClick={() => {onTogglePinNote && onTogglePinNote(note.noteId);setOpenMenu(null);}}><Icon name="star" size={13} />{(pinnedNotes || []).includes(note.noteId) ? "즐겨찾기 해제" : "즐겨찾기 추가"}</button>
                          <button onClick={() => {setEditingNote({ noteId: note.noteId, value: note.title });setOpenMenu(null);}}><Icon name="pencil" size={13} />이름 변경</button>
                          <button className="danger" onClick={() => {onDelete(note.noteId);setOpenMenu(null);}}><Icon name="trash-2" size={13} />삭제</button>
                        </div>
                      }
                    </div>
                  </div>);

              })}
              {isOpen && catNotes.length === 0 && <p className="note-empty-cat">노트가 없습니다</p>}
              {isOpen && (summariesByCategory[cat] || []).map(sum => (
                <div key={sum.summaryId} className="note-sum-row">
                  <Icon name="scroll" size={13} />
                  <button className="note-sum-btn" onClick={() => onGoToSummary && onGoToSummary(sum.summaryId)}>
                    <strong>{sum.title}</strong>
                    <span>{sum.sourceType === "note" ? "노트 요약" : "자료 요약"}</span>
                  </button>
                  {onDeleteSummary && <button className="note-ctx-btn" onClick={() => onDeleteSummary(sum.summaryId)} aria-label="요약 삭제"><Icon name="trash-2" size={12} /></button>}
                </div>
              ))}
            </div>);

        })}

        {addingCat &&
        <div className="note-add-cat-row">
            <Icon name="folder-plus" size={14} />
            <input className="note-inline-input" autoFocus placeholder="새 카테고리 이름" value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          onBlur={commitAddCat}
          onKeyDown={(e) => {if (e.key === "Enter") commitAddCat();if (e.key === "Escape") {setAddingCat(false);setNewCatName("");}}} />
          </div>
        }

        {notes.length === 0 && allCats.length === 0 && <p className="empty-text">첫 학습 노트를 작성해 보세요.</p>}
      </section>
      <section className="panel note-editor">
        <div className="editor-toolbar">
          <input value={noteDraft.title} onChange={(e) => onDraftChange({ ...noteDraft, title: e.target.value })} aria-label="노트 제목" />
          <CategoryField categories={categories} value={noteDraft.subject} onChange={(v) => onDraftChange({ ...noteDraft, subject: v })} onManage={onManageCategories} style={{ minWidth: 140 }} />
          <button className="primary-button" onClick={onSave}><Icon name="save" size={16} color="#fff" /> 저장</button>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" disabled={!selectedNote} onClick={onSummarize}><Icon name="bot" size={16} /> 노트 요약</button>
          <button className="secondary-button" disabled={!selectedNote} onClick={onQuiz}><Icon name="sparkles" size={16} /> 문제 생성</button>
          {selectedNote && <button className="danger-button" onClick={() => onDelete(selectedNote.noteId)}><Icon name="trash-2" size={16} /> 삭제</button>}
        </div>
        <textarea className="markdown-input" value={noteDraft.markdownContent} onChange={(e) => onDraftChange({ ...noteDraft, markdownContent: e.target.value })} aria-label="마크다운 노트 내용" />
      </section>
      <section className="panel note-preview">
        <div className="section-heading"><h3>미리보기</h3><span>Markdown</span></div>
        <MarkdownPreview content={noteDraft.markdownContent} />
        <div className="quiz-box">
          <h4>복습 문제</h4>
          {quizzes.length === 0 ? <p className="empty-text">문제를 생성하면 이곳에 표시됩니다.</p> : quizzes.map((q) =>
          <details key={q.quizId}><summary>{q.question}</summary><p>{q.answer}</p></details>
          )}
        </div>
      </section>
    </div>);

}

/* ===== Timer ===== */
function SessionPanel({ sessions, onDeleteSession }) {
  const [selected, setSelected] = useStateV([]);
  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  return <>
    <div className="section-heading">
      <h3>자동 기록</h3>
      {selected.length > 0 ?
      <div style={{ display: "flex", gap: 6 }}>
            <button className="chip-button danger" onClick={() => {onDeleteSession(selected);setSelected([]);}}><Icon name="trash-2" size={13} />삭제 ({selected.length})</button>
            <button className="chip-button" onClick={() => setSelected([])}><Icon name="x" size={13} />취소</button>
          </div> :
      <span>{sessions.length}개</span>
      }
    </div>
    <SessionList sessions={sessions} selected={selected} onToggle={toggle} />
  </>;
}
function formatTimer(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor(safe % 3600 / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* one pomodoro clock — editable H:M:S when idle, live countdown when its phase is active */
function PomoClock({ kind, label, hms, totalSec, active, running, liveSeconds, totalSeconds, onSet }) {
  const R = 82,C = 2 * Math.PI * R;
  const showLive = running && active;
  const faceSec = showLive ? liveSeconds : totalSec;
  const pct = showLive && totalSeconds > 0 ? Math.min(1, 1 - liveSeconds / totalSeconds) : 0;
  const dash = C * (1 - pct);
  const editable = !running;
  const stateCls = running ? active ? "is-active" : "is-idle" : "";
  return (
    <div className={`pomo-clock ${kind} ${stateCls}`}>
      <div className="pomo-clock-label"><span className={`pomo-clock-dot ${kind}`} />{label}</div>
      <div className={`timer-ring pomo ${kind === "break" ? "break" : ""} ${showLive ? "running-ring" : ""}`}>
        <svg viewBox="0 0 200 200">
          <circle className="ring-track" cx="100" cy="100" r={R} />
          <circle className="ring-fill" cx="100" cy="100" r={R} strokeDasharray={C} strokeDashoffset={dash} />
        </svg>
        {editable ?
        <div className="timer-face timer-face-edit pomo-face">
            <div className="timer-hms">
              <input className="thms-input pomo-thms" type="number" min={0} max={99} value={hms.m}
            onChange={(e) => onSet("m", e.target.value, 99)} onFocus={(e) => e.target.select()} aria-label={`${label} 분`} />
              <span className="thms-sep">:</span>
              <input className="thms-input pomo-thms" type="number" min={0} max={59} value={hms.s}
            onChange={(e) => onSet("s", e.target.value, 59)} onFocus={(e) => e.target.select()} aria-label={`${label} 초`} />
            </div>
          </div> :

        <div className="timer-face pomo-face">{formatTimer(faceSec)}</div>
        }
      </div>
    </div>);

}

function TimerView({ timerType, seconds, isRunning, subject, categories, onManageCategories, sessions, totalSeconds, pomoPhase, onTypeChange, onSubjectChange, onStart, onPause, onFinish, onReset, onRecordLap, onStopAndReset, onDeleteSession, timerCfg, setTimerCfg }) {
  const [presets, setPresets] = useStateV(() => {
    try {return JSON.parse(localStorage.getItem("hak.presets") || "null") || [
      { id: "p1", name: "기본 25/5", study: 25, brk: 5, repeat: 4 },
      { id: "p2", name: "딥워크 50/10", study: 50, brk: 10, repeat: 3 }];
    } catch (e) {return [];}
  });
  React.useEffect(() => {try {localStorage.setItem("hak.presets", JSON.stringify(presets));} catch (e) {}}, [presets]);

  /* timer favorites (즐겨찾기) — saved H:M:S durations */
  const [timerFavs, setTimerFavs] = useStateV(() => {
    try {return JSON.parse(localStorage.getItem("hak.timerFavs") || "null") || [
      { id: "t1", name: "25분 집중", h: 0, m: 25, s: 0 },
      { id: "t2", name: "5분 휴식", h: 0, m: 5, s: 0 },
      { id: "t3", name: "50분 딜워크", h: 0, m: 50, s: 0 }];
    } catch (e) {return [];}
  });
  React.useEffect(() => {try {localStorage.setItem("hak.timerFavs", JSON.stringify(timerFavs));} catch (e) {}}, [timerFavs]);
  function applyFav(f) {setTimerCfg((c) => ({ ...c, timerH: f.h, timerM: f.m, timerS: f.s }));onReset();}
  function saveFav() {
    if (timerFavs.length >= 10) return;
    const h = timerCfg.timerH || 0,m = timerCfg.timerM || 0,s = timerCfg.timerS || 0;
    if (h + m + s === 0) return;
    const name = [h ? `${h}시간` : "", m ? `${m}분` : "", s ? `${s}초` : ""].filter(Boolean).join(" ");
    setTimerFavs((fs) => [...fs, { id: "t" + Date.now(), name, h, m, s }]);
  }
  const favSecs = (f) => f.h * 3600 + f.m * 60 + f.s;

  function applyPreset(p) {setTimerCfg((c) => ({ ...c, pomoStudySec: (p.study || 0) * 60, pomoBreakSec: (p.brk || 0) * 60, pomoRepeat: p.repeat }));onReset();}
  function savePreset() {if (presets.length >= 10) return;const sMin = Math.round(timerCfg.pomoStudySec / 60),bMin = Math.round(timerCfg.pomoBreakSec / 60);setPresets((ps) => [...ps, { id: "p" + Date.now(), name: `${sMin}분/${bMin}분×${timerCfg.pomoRepeat}`, study: sMin, brk: bMin, repeat: timerCfg.pomoRepeat }]);}

  /* pomodoro — set study/break time directly on each clock face (H:M:S) */
  const secToHMS = (t) => ({ h: Math.floor(t / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 });
  const pomoStudyHMS = secToHMS(timerCfg.pomoStudySec || 0);
  const pomoBreakHMS = secToHMS(timerCfg.pomoBreakSec || 0);
  const setPomoHMS = (key, part, val, max) => setTimerCfg((c) => {
    const cur = secToHMS(c[key] || 0);
    cur[part] = Math.max(0, Math.min(max, Math.floor(+val) || 0));
    return { ...c, [key]: Math.max(0, cur.h * 3600 + cur.m * 60 + cur.s) };
  });

  const POMO_FIELDS = [
  { key: "pomoStudy", label: "학습", min: 1, max: 90, step: 5 },
  { key: "pomoBreak", label: "휴게", min: 1, max: 30, step: 1 },
  { key: "pomoRepeat", label: "반복", min: 1, max: 12, step: 1, unit: "회" }];


  /* progress ring */
  const R = 110,C = 2 * Math.PI * R;
  const pct = totalSeconds > 0 ? Math.min(1, 1 - seconds / totalSeconds) : 0;
  const dashOffset = C * (1 - pct);
  const isCountdown = timerType === "POMODORO" || timerType === "TIMER";
  const editableTimer = timerType === "TIMER" && !isRunning;
  const setHMS = (key, val, max) => setTimerCfg((c) => ({ ...c, [key]: Math.max(0, Math.min(max, Math.floor(+val) || 0)) }));

  return (
    <div className="timer-layout view-enter">
      <section className={`panel timer-panel ${isRunning ? "timer-running" : ""}`}>
        <div className="segmented">
          <button className={timerType === "STOPWATCH" ? "active" : ""} onClick={() => onTypeChange("STOPWATCH")}>스톱워치</button>
          <button className={timerType === "TIMER" ? "active" : ""} onClick={() => onTypeChange("TIMER")}>타이머</button>
          <button className={timerType === "POMODORO" ? "active" : ""} onClick={() => onTypeChange("POMODORO")}>포모도로</button>
        </div>
        <CategoryField categories={categories} value={subject} onChange={onSubjectChange} onManage={onManageCategories} style={{ maxWidth: 260 }} />

        {timerType === "POMODORO" ?
        <div className="pomo-clocks">
            <div className="pomo-cycle-rep pomo-repeat-top">
              <button className="pomo-step" disabled={isRunning} onClick={() => setTimerCfg((c) => ({ ...c, pomoRepeat: Math.max(1, c.pomoRepeat - 1) }))}>−</button>
              <span className="pomo-cycle-text"><strong>{timerCfg.pomoRound}</strong> / {timerCfg.pomoRepeat} 회 반복</span>
              <button className="pomo-step" disabled={isRunning} onClick={() => setTimerCfg((c) => ({ ...c, pomoRepeat: Math.min(12, c.pomoRepeat + 1) }))}>+</button>
            </div>
            <div className="pomo-clocks-row">
              <PomoClock kind="study" label="학습시간" hms={pomoStudyHMS} totalSec={timerCfg.pomoStudySec}
            active={pomoPhase === "study"} running={isRunning} liveSeconds={seconds} totalSeconds={totalSeconds}
            onSet={(part, val, max) => setPomoHMS("pomoStudySec", part, val, max)} />
              <div className="pomo-cycle">
                <div className="pomo-divider" />
              </div>
              <PomoClock kind="break" label="휴게시간" hms={pomoBreakHMS} totalSec={timerCfg.pomoBreakSec}
            active={pomoPhase === "break"} running={isRunning} liveSeconds={seconds} totalSeconds={totalSeconds}
            onSet={(part, val, max) => setPomoHMS("pomoBreakSec", part, val, max)} />
            </div>
          </div> :

        <div className={`timer-ring ${editableTimer ? "editable" : ""}`}>
          <svg viewBox="0 0 240 240">
            <circle className="ring-track" cx="120" cy="120" r={R} data-comment-anchor="370b5c155d-circle-223-13" />
            {isCountdown && <circle className="ring-fill" cx="120" cy="120" r={R} strokeDasharray={C} strokeDashoffset={dashOffset} />}
          </svg>
          {editableTimer ?
          <div className="timer-face timer-face-edit">
              <div className="timer-hms">
                <input className="thms-input" type="number" min={0} max={23} value={timerCfg.timerH}
              onChange={(e) => setHMS("timerH", e.target.value, 23)} onFocus={(e) => e.target.select()} aria-label="시간" />
                <span className="thms-sep">:</span>
                <input className="thms-input" type="number" min={0} max={59} value={timerCfg.timerM}
              onChange={(e) => setHMS("timerM", e.target.value, 59)} onFocus={(e) => e.target.select()} aria-label="분" />
                <span className="thms-sep">:</span>
                <input className="thms-input" type="number" min={0} max={59} value={timerCfg.timerS}
              onChange={(e) => setHMS("timerS", e.target.value, 59)} onFocus={(e) => e.target.select()} aria-label="초" />
              </div>
            </div> :

          <div className="timer-face">{formatTimer(seconds)}</div>
          }
        </div>
        }

        <div className="timer-actions">
          {isRunning ?
          <button className="secondary-button" onClick={onPause}><Icon name="pause" size={17} /> 일시정지</button> :
          <button className="primary-button" onClick={onStart}><Icon name="play" size={17} color="#fff" /> 시작</button>}
          <button className="secondary-button" onClick={timerType === "STOPWATCH" ? onRecordLap : onFinish}><Icon name="bookmark-plus" size={17} /> 기록</button>
          <button className="ghost-button" onClick={timerType === "STOPWATCH" ? onStopAndReset : onReset}><Icon name="timer-reset" size={17} /> 종료/초기화</button>
        </div>
      </section>

      <div className="timer-right">
        {timerType === "POMODORO" &&
        <section className="panel">
            <div className="section-heading"><h3>포모도로 프리셋</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{presets.length}/10</span>
                <button className="chip-button" disabled={presets.length >= 10} onClick={savePreset}><Icon name="pin" size={13} />현재 고정</button>
              </div>
            </div>
            <div className="preset-list">
              {presets.length === 0 && <p className="empty-text">저장된 프리셋이 없습니다.</p>}
              {presets.map((p) =>
            <div key={p.id} className="preset-row">
                  <button className="preset-btn" onClick={() => applyPreset(p)}><strong>{p.name}</strong><span>{p.study}분 학습 · {p.brk}분 휴식 · {p.repeat}회</span></button>
                  <button className="icon-button" onClick={() => setPresets((ps) => ps.filter((x) => x.id !== p.id))} aria-label="삭제"><Icon name="x" size={14} /></button>
                </div>
            )}
            </div>
          </section>
        }
        {timerType === "TIMER" &&
        <section className="panel">
            <div className="section-heading"><h3>타이머 즐겨찾기</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{timerFavs.length}/10</span>
                <button className="chip-button" disabled={timerFavs.length >= 10 || (timerCfg.timerH || 0) + (timerCfg.timerM || 0) + (timerCfg.timerS || 0) === 0} onClick={saveFav}><Icon name="pin" size={13} />현재 시간 저장</button>
              </div>
            </div>
            <div className="preset-list">
              {timerFavs.length === 0 && <p className="empty-text">저장된 타이머가 없습니다.</p>}
              {timerFavs.map((f) =>
            <div key={f.id} className="preset-row">
                  <button className="preset-btn" onClick={() => applyFav(f)}><strong>{f.name}</strong><span>{formatTimer(favSecs(f))}</span></button>
                  <button className="icon-button" onClick={() => setTimerFavs((fs) => fs.filter((x) => x.id !== f.id))} aria-label="삭제"><Icon name="x" size={14} /></button>
                </div>
            )}
            </div>
          </section>
        }
        <section className="panel" data-comment-anchor="699dbd39eb-section-479-9">
          <SessionPanel sessions={sessions} onDeleteSession={onDeleteSession} />
        </section>
      </div>
    </div>);

}

/* ===== Stats ===== */
function StatsView({ sessions, categories }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);
  const monthly = sessions.filter((s) => s.endTime.slice(0, 7) === monthStr).reduce((a, s) => a + s.durationMinutes, 0);
  const todaySess = sessions.filter((s) => s.endTime.slice(0, 10) === todayStr);
  const pastSess = sessions.filter((s) => {const ago = (Date.now() - new Date(s.endTime).getTime()) / 86400000;return ago > 0 && ago <= 30;});
  const allSubs = [...new Set([...(categories || []), ...sessions.map((s) => s.subject)])];
  const subjectData = allSubs.map((sub) => {
    const todayMin = todaySess.filter((s) => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0);
    const avgMin = pastSess.filter((s) => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0) / 30;
    return { sub, todayMin, avgMin };
  }).filter((d) => d.todayMin > 0 || d.avgMin > 0.5);
  const maxMin = Math.max(30, ...subjectData.map((d) => Math.max(d.todayMin, d.avgMin)));
  const subjectTotals = allSubs.map((sub) => ({ subject: sub, value: sessions.filter((s) => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const maxSub = Math.max(30, ...subjectTotals.map((x) => x.value));
  return (
    <div className="stats-grid view-enter">
      <section className="metric-card"><span>이번 달 학습</span><strong>{formatMinutes(monthly)}</strong><p>월간 누적</p></section>
      <section className="metric-card"><span>세션 수</span><strong>{sessions.length}회</strong><p>기록된 학습</p></section>
      <section className="panel chart-panel">
        <div className="section-heading"><h3>오늘 vs 평균 비교</h3><span>30일 평균 기준</span></div>
        {subjectData.length === 0 ? <p className="empty-text">오늘 학습 기록이 없습니다.</p> :
        <div className="horiz-chart">
            {subjectData.map(({ sub, todayMin, avgMin }) => {
            const todayPct = todayMin / maxMin * 100,avgPct = avgMin / maxMin * 100;
            const aboveAvg = todayMin > avgMin && avgMin > 0;
            return (
              <div key={sub} className="hc-row">
                  <div className="hc-label">{sub}</div>
                  <div className="hc-track">
                    {avgMin > 0 && <div className="hc-avg-bar" style={{ width: `${avgPct}%` }} />}
                    {todayMin > 0 && <div className="hc-today-bar" style={{ width: `${todayPct}%` }}>{aboveAvg && <div className="hc-avg-marker" style={{ left: `${avgPct / todayPct * 100}%` }} />}</div>}
                  </div>
                  <div className="hc-value"><strong>{todayMin > 0 ? formatMinutes(todayMin) : "—"}</strong><span>평균 {formatMinutes(Math.round(avgMin))}</span></div>
                </div>);

          })}
          </div>
        }
      </section>
      <section className="panel chart-panel">
        <div className="section-heading"><h3>과목별 누적 학습</h3><span>{subjectTotals.length}개 과목</span></div>
        <div className="subject-chart">
          {subjectTotals.length === 0 ? <p className="empty-text">학습 세션을 기록하면 과목별 분석이 표시됩니다.</p> : subjectTotals.map((it) =>
          <div className="subject-row" key={it.subject}>
              <span>{it.subject}</span>
              <div><i style={{ width: `${Math.max(10, it.value / maxSub * 100)}%` }} /></div>
              <strong>{it.value}분</strong>
            </div>
          )}
        </div>
      </section>
    </div>);

}

/* ===== Timetable ===== */
function TimetableView() {
  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const HOURS = Array.from({length: 17}, (_, i) => i + 7);
  const COLORS = ["#e0533a", "#e8902f", "#d9b008", "#3fa45b", "#3b78d9", "#9a59c2"];
  const [blocks, setBlocks] = useStateV(() => { try { return JSON.parse(localStorage.getItem("hak.timetable") || "{}"); } catch (e) { return {}; } });
  React.useEffect(() => { try { localStorage.setItem("hak.timetable", JSON.stringify(blocks)); } catch (e) {} }, [blocks]);
  /* single-cell edit */
  const [editing, setEditing] = useStateV(null);
  const [editLabel, setEditLabel] = useStateV("");
  const [editColor, setEditColor] = useStateV(COLORS[3]);
  /* multi-cell select */
  const [selected, setSelected] = useStateV(new Set());
  const [bulkLabel, setBulkLabel] = useStateV("");
  const [bulkColor, setBulkColor] = useStateV(COLORS[3]);
  const [confirmReset, setConfirmReset] = useStateV(false);
  const cellKey = (d, h) => `${d}-${h}`;
  function clearAll() { setBlocks({}); setSelected(new Set()); setConfirmReset(false); }

  function handleCellClick(d, h) {
    const k = cellKey(d, h);
    const b = blocks[k];
    if (b) { setEditLabel(b.label); setEditColor(b.color); setEditing({ d, h, k, isNew: false }); }
    else { setSelected(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  }
  function saveBulk() {
    if (!bulkLabel.trim() || selected.size === 0) return;
    const updates = {};
    selected.forEach(k => { updates[k] = { label: bulkLabel.trim(), color: bulkColor }; });
    setBlocks(b => ({ ...b, ...updates }));
    setSelected(new Set()); setBulkLabel("");
  }
  function save() {
    if (!editing) return;
    if (editLabel.trim()) setBlocks(b => ({ ...b, [editing.k]: { label: editLabel.trim(), color: editColor } }));
    else setBlocks(b => { const n = { ...b }; delete n[editing.k]; return n; });
    setEditing(null);
  }
  return (
    <div className="timetable-layout view-enter">
      <section className="panel timetable-panel">
        <div>
          <div className="section-heading">
            <h3>주간 시간표</h3>
            {selected.size === 0 && <span style={{color:"var(--muted)",fontSize:11}}>빈 칸 클릭으로 선택 · 채워진 칸은 편집</span>}
            <button className="icon-button" title="시간표 초기화" aria-label="시간표 초기화" onClick={() => setConfirmReset(true)} style={{marginLeft:"auto", opacity: Object.keys(blocks).length > 0 ? 1 : 0.3, pointerEvents: Object.keys(blocks).length > 0 ? "auto" : "none"}}><Icon name="rotate-ccw" size={15} /></button>
          </div>
          {selected.size > 0 && (
            <div className="tt-bulk-bar">
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {COLORS.map(c => <button key={c} type="button" className={`cal-swatch${bulkColor===c?" active":""}`} style={{background:c,width:18,height:18,borderRadius:"50%"}} onClick={()=>setBulkColor(c)} />)}
              </div>
              <input className="cal-text-input" style={{height:30,fontSize:13,padding:"0 10px",flex:1,minWidth:0}} placeholder="일정 이름…" value={bulkLabel}
                autoFocus onChange={e => setBulkLabel(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter") saveBulk(); if (e.key==="Escape") setSelected(new Set()); }} />
              <button className="chip-button" style={{flexShrink:0}} disabled={!bulkLabel.trim()} onClick={saveBulk}><Icon name="check" size={13} />{selected.size}칸 추가</button>
              <button className="chip-button" style={{flexShrink:0}} onClick={() => setSelected(new Set())}><Icon name="x" size={13} />취소</button>
            </div>
          )}
        </div>
        <div className="tt-scroll">
          <div className="timetable-grid" style={{gridTemplateColumns:`44px repeat(7,1fr)`}}>
            <div className="tt-corner" />
            {DAYS.map(d => <div key={d} className="tt-day-head">{d}</div>)}
            {HOURS.map(h => (
              <React.Fragment key={h}>
                <div className="tt-hour"><div className="tt-hour-label"><span className="tt-hh">{h}</span><span className="tt-mm">:00</span></div></div>
                {DAYS.map((_, di) => { const k = cellKey(di, h); const b = blocks[k]; const isSel = selected.has(k); return (
                  <div key={k} className={`tt-cell ${b ? "has-block" : ""} ${isSel ? "tt-selected" : ""}`}
                    style={b ? {borderLeft:`3px solid ${b.color}`,background:b.color+"18"} : isSel ? {background:bulkColor+"28",borderLeft:`3px solid ${bulkColor}`} : {}}
                    onClick={() => handleCellClick(di, h)}>
                    {b && <span className="tt-block-label" style={{color:b.color}}>{b.label}</span>}
                  </div>
                ); })}
              </React.Fragment>
            ))}
            <div className="tt-hour tt-hour-end"><div className="tt-hour-label"><span className="tt-hh">24</span><span className="tt-mm">:00</span></div></div>
            {DAYS.map((_, di) => <div key={`end-${di}`} className="tt-cell tt-cell-end" />)}
          </div>
        </div>
      </section>
      {confirmReset && (
        <div className="cal-modal-overlay" onClick={() => setConfirmReset(false)}>
          <div className="cal-day-panel" onClick={e => e.stopPropagation()} style={{maxWidth:320}}>
            <div className="cal-day-header">
              <h4>시간표 초기화</h4>
              <button className="icon-button" onClick={() => setConfirmReset(false)} aria-label="닫기"><Icon name="x" size={14} /></button>
            </div>
            <p style={{margin:"12px 0",fontSize:13,color:"var(--ink-2)",lineHeight:1.55}}>시간표에 입력된 모든 일정이 삭제됩니다.<br />정말 초기화할까요?</p>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="ghost-button" onClick={() => setConfirmReset(false)}>취소</button>
              <button className="danger-button" onClick={clearAll}><Icon name="trash-2" size={15} />초기화</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div className="cal-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cal-day-panel" onClick={e => e.stopPropagation()}>
            <div className="cal-day-header">
              <h4>{DAYS[editing.d]}요일 {editing.h}:00</h4>
              <button className="icon-button" onClick={() => setEditing(null)} aria-label="닫기"><Icon name="x" size={14} /></button>
            </div>
            <div style={{padding:"12px 0",display:"flex",flexDirection:"column",gap:10}}>
              <div className="cal-color-swatches">
                {COLORS.map(c => <button key={c} type="button" className={`cal-swatch${editColor===c?" active":""}`} style={{background:c}} onClick={()=>setEditColor(c)} />)}
              </div>
              <input className="cal-text-input" autoFocus placeholder="수업/활동 이름…" value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter") save(); if (e.key==="Escape") setEditing(null); }} />
              <div style={{display:"flex",gap:8}}>
                <button className="primary-button" onClick={save}><Icon name="check" size={15} color="#fff" />저장</button>
                {!editing.isNew && <button className="danger-button" onClick={()=>{setBlocks(b=>{const n={...b};delete n[editing.k];return n;});setEditing(null);}}><Icon name="trash-2" size={15} />삭제</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SessionList, SessionPanel, MaterialsView, NotesView, TimerView, StatsView, TimetableView, formatTimer });