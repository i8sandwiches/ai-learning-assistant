/* ============================================================
   anki.jsx — Anki tab: deck management (select / rename / delete),
   card add / edit / delete, plus today / browse / stats sub-views.
   Mirrors the desktop Anki workflow (deck list + browse + add note).
   ============================================================ */

/* ---- shared dialog shell ---- */
function AnkiDialogShell({ title, children, onClose }) {
  React.useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="anki-dialog-overlay" onClick={onClose}>
      <div className="anki-dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---- single text field dialog (add deck / rename deck) ---- */
function AnkiTextDialog({ title, label, initial, placeholder, confirmLabel, onConfirm, onClose }) {
  const [val, setVal] = React.useState(initial || "");
  const ok = val.trim().length > 0;
  return (
    <AnkiDialogShell title={title} onClose={onClose}>
      <label className="dialog-field">
        <span>{label}</span>
        <input autoFocus type="text" value={val} placeholder={placeholder} maxLength={60}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ok) onConfirm(val.trim()); }} />
      </label>
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onClose}>취소</button>
        <button className="primary-button" disabled={!ok} onClick={() => onConfirm(val.trim())}>{confirmLabel}</button>
      </div>
    </AnkiDialogShell>
  );
}

/* ---- confirm / destructive dialog ---- */
function AnkiConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }) {
  return (
    <AnkiDialogShell title={title} onClose={onClose}>
      <p className="dialog-message">{message}</p>
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onClose}>취소</button>
        <button className={danger ? "danger-button" : "primary-button"} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </AnkiDialogShell>
  );
}

/* ---- card add / edit dialog (type / front / back or cloze) ---- */
function AnkiCardDialog({ title, card, decks, deckId, showDeck, allowReversed, confirmLabel, onConfirm, onClose }) {
  const init = card || {};
  const [type, setType] = React.useState(init.type === "cloze" ? "cloze" : (init.reversed ? "reversed" : "basic"));
  const [front, setFront] = React.useState(init.type === "cloze" ? "" : (init.front || ""));
  const [back, setBack] = React.useState(init.type === "cloze" ? "" : (init.back || ""));
  const [text, setText] = React.useState(init.type === "cloze" ? (init.text || "") : "");
  const [dk, setDk] = React.useState(deckId);
  const textRef = React.useRef(null);

  const types = [["basic", "기본"]];
  if (allowReversed) types.push(["reversed", "기본 + 역방향"]);
  types.push(["cloze", "빈칸 (Cloze)"]);

  const ok = type === "cloze" ? hasCloze(text) : (front.trim() && back.trim());

  function makeCloze() {
    const el = textRef.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const n = nextClozeNum(text);
    const sel = text.slice(s, e) || "정답";
    const next = text.slice(0, s) + `{{c${n}::${sel}}}` + text.slice(e);
    setText(next);
    requestAnimationFrame(() => { el.focus(); const caret = s + `{{c${n}::${sel}}}`.length; el.setSelectionRange(caret, caret); });
  }

  function submit() {
    if (!ok) return;
    if (type === "cloze") {
      onConfirm(dk, [{ type: "cloze", text: text.trim() }]);
    } else if (type === "reversed") {
      onConfirm(dk, [
        { type: "basic", front: front.trim(), back: back.trim() },
        { type: "basic", reversed: true, front: back.trim(), back: front.trim() },
      ]);
    } else {
      onConfirm(dk, [{ type: "basic", front: front.trim(), back: back.trim() }]);
    }
  }

  return (
    <AnkiDialogShell title={title} onClose={onClose}>
      <label className="dialog-field">
        <span>유형</span>
        <div className="type-seg">
          {types.map(([id, lbl]) => (
            <button key={id} type="button" className={type === id ? "active" : ""} onClick={() => setType(id)}>{lbl}</button>
          ))}
        </div>
      </label>
      {showDeck && (
        <label className="dialog-field">
          <span>덱</span>
          <select value={dk} onChange={(e) => setDk(e.target.value)}>
            {decks.map((d) => <option key={d.deckId} value={d.deckId}>{d.name}</option>)}
          </select>
        </label>
      )}
      {type === "cloze" ? (
        <label className="dialog-field">
          <span>본문</span>
          <textarea ref={textRef} autoFocus rows={4} value={text}
            placeholder="예: 대한민국의 수도는 서울이다." onChange={(e) => setText(e.target.value)} />
          <div className="cloze-tools">
            <button type="button" className="chip-button" onClick={makeCloze}>
              <Icon name="square-dashed" size={13} />빈칸 만들기 [...]
            </button>
            <span className="cloze-help">텍스트를 선택하고 누르면 <code>{"{{c1::정답}}"}</code> 형식의 빈칸이 됩니다.</span>
          </div>
          {hasCloze(text) && (
            <div className="cloze-preview">
              <span className="cpv-label">미리보기</span>
              <p className="cpv-front">{renderCloze(text, false)}</p>
            </div>
          )}
        </label>
      ) : (
        <>
          <label className="dialog-field">
            <span>앞면 (질문)</span>
            <textarea autoFocus rows={2} value={front} placeholder="앞면에 표시할 내용" onChange={(e) => setFront(e.target.value)} />
          </label>
          <label className="dialog-field">
            <span>뒷면 (정답)</span>
            <textarea rows={3} value={back} placeholder="뒷면에 표시할 내용" onChange={(e) => setBack(e.target.value)} />
          </label>
          {type === "reversed" && <p className="dialog-message" style={{ margin: "0 0 4px" }}>앞·뒤를 바꾼 카드까지 2장이 함께 생성됩니다.</p>}
        </>
      )}
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onClose}>취소</button>
        <button className="primary-button" disabled={!ok} onClick={submit}>{confirmLabel}</button>
      </div>
    </AnkiDialogShell>
  );
}

/* ---- statistics: deck composition donut + per-deck study bars ---- */
const STAT_PALETTE = [
  "oklch(0.70 0.13 200)", "oklch(0.70 0.13 150)", "oklch(0.72 0.13 70)",
  "oklch(0.68 0.14 25)", "oklch(0.66 0.13 285)", "oklch(0.70 0.13 330)",
];

/* Anki "Reviews" graph — stacked daily bars (mature/young/learning) +
   gray cumulative line, mirroring the desktop Anki statistics chart. */
const ANKI_COLORS = { mature: "#356e3c", young: "#7bc043", learn: "#e8a33d", cum: "#9aa0a6" };

function AnkiReviewChart({ hist, name }) {
  const W = 300, H = 168, padL = 30, padR = 28, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const rawPts = hist.points;
  const rawN = rawPts.length;

  // aggregate daily points into ~weekly buckets (keeps the Anki year-scale
  // look while drawing far fewer bars — lighter first paint)
  const BUCKET = 7;
  const pts = [];
  for (let i = 0; i < rawN; i += BUCKET) {
    let learn = 0, young = 0, mature = 0;
    for (let j = i; j < Math.min(i + BUCKET, rawN); j++) {
      learn += rawPts[j].learn; young += rawPts[j].young; mature += rawPts[j].mature;
    }
    pts.push({ learn, young, mature });
  }
  const n = pts.length;

  const dayMax = niceMax(Math.max(1, ...pts.map((p) => p.learn + p.young + p.mature)));
  const cumMax = niceMax(Math.max(1, hist.total));
  const barW = Math.max(1.5, (plotW / n) * 0.82);

  // cumulative line points
  let run = 0;
  const cumPath = pts.map((p, i) => {
    run += p.learn + p.young + p.mature;
    const x = padL + ((i + 0.5) / n) * plotW;
    const y = padT + plotH - (run / cumMax) * plotH;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const cumArea = `${cumPath} L${(padL + plotW).toFixed(1)},${(padT + plotH).toFixed(1)} L${padL.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const baseY = padT + plotH;

  // build one filled path per series (instead of thousands of <rect>) for perf
  let pM = "", pY = "", pL = "";
  const bw = barW.toFixed(2);
  pts.forEach((p, i) => {
    const x = (padL + ((i + 0.5) / n) * plotW - barW / 2).toFixed(2);
    let y = baseY;
    const hM = (p.mature / dayMax) * plotH;
    const hY = (p.young / dayMax) * plotH;
    const hL = (p.learn / dayMax) * plotH;
    if (hM > 0) { y -= hM; pM += `M${x} ${y.toFixed(2)}h${bw}v${hM.toFixed(2)}h-${bw}Z`; }
    if (hY > 0) { const yy = y - hY; pY += `M${x} ${yy.toFixed(2)}h${bw}v${hY.toFixed(2)}h-${bw}Z`; y = yy; }
    if (hL > 0) { const yy = y - hL; pL += `M${x} ${yy.toFixed(2)}h${bw}v${hL.toFixed(2)}h-${bw}Z`; }
  });

  return (
    <div className="arc">
      <div className="arc-title">{name}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="arc-svg" preserveAspectRatio="xMidYMid meet">
        {/* horizontal gridlines + left axis labels */}
        {yTicks.map((t, i) => {
          const y = baseY - t * plotH;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="var(--line-2)" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" className="arc-axis">{Math.round(t * dayMax)}</text>
              <text x={padL + plotW + 5} y={y + 3} textAnchor="start" className="arc-axis">{Math.round(t * cumMax)}</text>
            </g>
          );
        })}
        {/* stacked bars (one path per series) */}
        <path d={pM} fill={ANKI_COLORS.mature} />
        <path d={pY} fill={ANKI_COLORS.young} />
        <path d={pL} fill={ANKI_COLORS.learn} />
        {/* cumulative area + line */}
        <path d={cumArea} fill={ANKI_COLORS.cum} opacity="0.16" />
        <path d={cumPath} fill="none" stroke={ANKI_COLORS.cum} strokeWidth="1.4" />
        {/* axes */}
        <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="var(--ink-2)" strokeWidth="1" />
        {/* bottom day labels — Anki basis: -350 … 0 */}
        {[-350, -300, -250, -200, -150, -100, -50, 0].map((t) => {
          const x = padL + ((rawN + t) / rawN) * plotW;
          return (
            <g key={t}>
              <line x1={x} y1={baseY} x2={x} y2={baseY + 3} stroke="var(--ink-2)" strokeWidth="1" />
              <text x={x} y={H - 5} textAnchor="middle" className="arc-axis">{t}</text>
            </g>
          );
        })}
      </svg>
      <div className="arc-stats">
        <p>공부한 날: <b>{hist.pct}%</b> <span>({hist.daysStudied}/{hist.totalDays}일)</span></p>
        <p>합계: <b>{hist.total.toLocaleString()}회</b> 복습</p>
        <p>공부일 평균: <b>{hist.avgStudied}장/일</b> · 전체 평균: <b>{hist.avgPeriod}장/일</b></p>
      </div>
    </div>
  );
}

function AnkiStats({ anki }) {
  const totals = anki.decks.map((d) => {
    const c = anki.counts[d.deckId] || { new: 0, learn: 0, due: 0 };
    return { id: d.deckId, name: d.name, new: c.new || 0, learn: c.learn || 0, due: c.due || 0, total: (c.new || 0) + (c.learn || 0) + (c.due || 0) };
  });
  const grand = totals.reduce((s, d) => s + d.total, 0);

  let acc = 0;
  const stops = totals.filter((d) => d.total > 0).map((d, i) => {
    const start = (acc / (grand || 1)) * 100; acc += d.total;
    const end = (acc / (grand || 1)) * 100;
    return `${STAT_PALETTE[totals.indexOf(d) % STAT_PALETTE.length]} ${start}% ${end}%`;
  }).join(", ");
  const conic = grand > 0 ? `conic-gradient(${stops})` : "var(--surface-2)";

  const recent = totals.slice(-4);
  const history = React.useMemo(
    () => buildAnkiReviewHistory(recent.map((d) => d.id), 365),
    [recent.map((d) => d.id).join(",")]
  );

  return (
    <div className="anki-stats">
      <section className="panel">
        <div className="panel-head"><h3 className="panel-title">덱별 카드 비율</h3><span className="panel-meta">전체 {grand}장</span></div>
        <div className="pie-wrap">
          <div className="donut" style={{ background: conic }}>
            <div className="donut-hole"><strong>{grand}</strong><span>전체 카드</span></div>
          </div>
          <ul className="pie-legend">
            {totals.map((d, i) => (
              <li key={d.id}>
                <span className="lg-dot" style={{ background: STAT_PALETTE[i % STAT_PALETTE.length] }} />
                <span className="lg-name">{d.name}</span>
                <span className="lg-val">{d.total}<em>{grand ? Math.round((d.total / grand) * 100) : 0}%</em></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3 className="panel-title">덱별 학습 데이터</h3>
          <div className="arc-legend">
            <span><i style={{ background: ANKI_COLORS.mature }} />성숙</span>
            <span><i style={{ background: ANKI_COLORS.young }} />학습 완료</span>
            <span><i style={{ background: ANKI_COLORS.learn }} />학습 중</span>
            <span><i className="line" style={{ background: ANKI_COLORS.cum }} />누적</span>
          </div>
        </div>
        <div className="arc-grid">
          {recent.map((d) => <AnkiReviewChart key={d.id} hist={history[d.id]} name={d.name} />)}
          {recent.length === 0 && <p className="empty-line">덱이 없습니다.</p>}
        </div>
      </section>
    </div>
  );
}

/* ============================================================ */
function AnkiTab({ anki, deckId, onDeck, onReview, api }) {
  const [sub, setSub] = React.useState("today");
  const [selected, setSelected] = React.useState([]);
  const [dialog, setDialog] = React.useState(null);

  const decks = anki.decks;
  const close = () => setDialog(null);

  /* empty state — no decks at all */
  if (!decks.length) {
    return (
      <div className="anki-empty">
        <Icon name="layers" size={36} color="var(--muted)" />
        <h2>덱이 없습니다</h2>
        <p>새 덱을 만들어 카드를 추가해 보세요.</p>
        <button className="primary-button" onClick={() => setDialog({ kind: "addDeck" })}>
          <Icon name="plus" size={15} />새 덱 만들기
        </button>
        {dialog && dialog.kind === "addDeck" && (
          <AnkiTextDialog title="새 덱" label="덱 이름" placeholder="예: 전공 - 자료구조" confirmLabel="만들기"
            onClose={close} onConfirm={(name) => { const id = api.addDeck(name); onDeck(id); close(); }} />
        )}
      </div>
    );
  }

  const activeId = decks.some((d) => d.deckId === deckId) ? deckId : decks[0].deckId;
  const deck = decks.find((d) => d.deckId === activeId);
  const counts = anki.counts[activeId] || { new: 0, learn: 0, due: 0 };
  const cards = anki.cards[activeId] || [];

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="anki-page">
      <AnkiStats anki={anki} />
      <div className="anki-main-full">
        <div className="anki-seg-wrap">
          <div className="segmented">
            {[["today", "덱"], ["add", "추가"], ["browse", "탐색"], ["stats", "통계"]].map(([id, lbl]) => (
              <button key={id} className={sub === id ? "active" : ""}
                onClick={() => (id === "add" ? setDialog({ kind: "addCard" }) : setSub(id))}>{lbl}</button>
            ))}
          </div>
        </div>

        {sub === "today" && (
          <div className="anki-today">
            <div className="at-cards">
              <div className="at-card new"><span className="lbl">신규</span><strong>{counts.new}</strong><em>처음 보는 카드</em></div>
              <div className="at-card learn"><span className="lbl">학습 중</span><strong>{counts.learn}</strong><em>익히는 중</em></div>
              <div className="at-card due"><span className="lbl">복습</span><strong>{counts.due}</strong><em>기한 도래</em></div>
            </div>
            <section className="panel deck-panel" style={{ marginTop: 12 }}>
              <div className="panel-head">
                <h3 className="panel-title">덱</h3>
                <div className="panel-head-actions">
                  {selected.length === 1 && (
                    <button className="chip-button" onClick={() => {
                      const d = decks.find((x) => x.deckId === selected[0]);
                      setDialog({ kind: "renameDeck", id: d.deckId, name: d.name });
                    }}>
                      <Icon name="pencil" size={13} />이름 변경
                    </button>
                  )}
                  {selected.length > 0 && (
                    <button className="chip-button danger" onClick={() => setDialog({ kind: "deleteDecks", ids: selected })}>
                      <Icon name="trash-2" size={13} />삭제 ({selected.length})
                    </button>
                  )}
                  <button className="chip-button" onClick={() => setDialog({ kind: "addDeck" })}>
                    <Icon name="plus" size={14} />덱 추가
                  </button>
                </div>
              </div>
              <div className="deck-rows">
                {decks.map((d) => {
                  const c = anki.counts[d.deckId] || { new: 0, learn: 0, due: 0 };
                  const isSel = selected.includes(d.deckId);
                  const dueTotal = (c.new || 0) + (c.learn || 0) + (c.due || 0);
                  return (
                    <div key={d.deckId} className={`deck-item ${d.deckId === activeId ? "active" : ""} ${isSel ? "selected" : ""}`}>
                      <input type="checkbox" className="deck-check" checked={isSel}
                        aria-label={`${d.name} 선택`} onChange={() => toggle(d.deckId)} />
                      <button className="deck-main" onClick={() => onDeck(d.deckId)}>
                        <strong>{d.name}</strong>
                        <span className="deck-counts"><i className="dc new">{c.new}</i><i className="dc learn">{c.learn}</i><i className="dc due">{c.due}</i></span>
                      </button>
                      <button className="deck-study" disabled={dueTotal === 0} onClick={() => onReview(d.deckId)}>학습</button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {sub === "browse" && (
          <section className="panel">
            <div className="panel-head">
              <div className="browse-deck-select">
                <select id="browse-deck" value={activeId} aria-label="덱 선택"
                  onChange={(e) => onDeck(e.target.value)}>
                  {decks.map((d) => {
                    const c = anki.counts[d.deckId] || { new: 0, learn: 0, due: 0 };
                    const t = (anki.cards[d.deckId] || []).length;
                    return <option key={d.deckId} value={d.deckId}>{d.name} ({t}장)</option>;
                  })}
                </select>
              </div>
              <div className="panel-head-actions">
                <span className="panel-meta">{cards.length}장</span>
                <button className="chip-button" onClick={() => setDialog({ kind: "addCard" })}>
                  <Icon name="plus" size={14} />카드 추가
                </button>
              </div>
            </div>
            {cards.length === 0 ? (
              <p className="empty-line">아직 카드가 없습니다. ‘카드 추가’로 첫 카드를 만들어 보세요.</p>
            ) : (
              <div className="card-rows">
                {cards.map((c) => (
                  <div className="card-row" key={c.cardId}>
                    <span className={`state-pip ${c.state}`} />
                    <div className="card-row-text">
                      <span className="card-row-front">{cardFace(c, "front")}</span>
                      <span className="card-row-back">{cardFace(c, "back")}</span>
                    </div>
                    <span className={`card-kind-tag ${c.type === "cloze" ? "cloze" : c.reversed ? "rev" : "basic"}`}>{cardKindLabel(c)}</span>
                    <span className="log-int">{c.interval}일</span>
                    <div className="card-row-actions">
                      <button aria-label="카드 편집" title="편집" onClick={() => setDialog({ kind: "editCard", card: c })}>
                        <Icon name="pencil" size={14} />
                      </button>
                      <button aria-label="카드 삭제" title="삭제" onClick={() => setDialog({ kind: "deleteCard", card: c })}>
                        <Icon name="trash-2" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {sub === "stats" && (
          <section className="panel">
            <div className="panel-head"><h3 className="panel-title">복습 분포</h3><span className="panel-meta">최근 30일</span></div>
            <div className="subject-chart">
              {[["Again", "again", 6, "oklch(0.64 0.13 25)"], ["Hard", "hard", 11, "oklch(0.72 0.13 70)"], ["Good", "good", 58, "oklch(0.66 0.13 150)"], ["Easy", "easy", 25, "oklch(0.62 0.13 240)"]].map(([lbl, cls, pct, color]) => (
                <div className="subject-row" key={cls}><span>{lbl}</span><div><i className={cls} style={{ width: `${pct}%`, background: color }} /></div><strong>{pct}%</strong></div>
              ))}
            </div>
          </section>
        )}

      {/* ---- dialogs ---- */}
      {dialog && dialog.kind === "addDeck" && (
        <AnkiTextDialog title="새 덱" label="덱 이름" placeholder="예: 전공 - 자료구조" confirmLabel="만들기"
          onClose={close} onConfirm={(name) => { const id = api.addDeck(name); onDeck(id); close(); }} />
      )}
      {dialog && dialog.kind === "renameDeck" && (
        <AnkiTextDialog title="덱 이름 변경" label="덱 이름" initial={dialog.name} confirmLabel="저장"
          onClose={close} onConfirm={(name) => { api.renameDeck(dialog.id, name); setSelected([]); close(); }} />
      )}
      {dialog && dialog.kind === "deleteDecks" && (
        <AnkiConfirmDialog title="덱 삭제" danger confirmLabel="삭제"
          message={`선택한 ${dialog.ids.length}개 덱과 포함된 모든 카드가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
          onClose={close} onConfirm={() => { api.deleteDecks(dialog.ids); setSelected([]); close(); }} />
      )}
      {dialog && dialog.kind === "addCard" && (
        <AnkiCardDialog title="카드 추가" decks={decks} deckId={activeId} showDeck allowReversed confirmLabel="추가"
          onClose={close} onConfirm={(dk, cards) => { api.addCards(dk, cards); close(); }} />
      )}
      {dialog && dialog.kind === "editCard" && (
        <AnkiCardDialog title="카드 편집" card={dialog.card} confirmLabel="저장"
          onClose={close} onConfirm={(dk, cards) => { api.updateCard(activeId, dialog.card.cardId, cards[0]); close(); }} />
      )}
      {dialog && dialog.kind === "deleteCard" && (
        <AnkiConfirmDialog title="카드 삭제" danger confirmLabel="삭제"
          message="이 카드를 삭제합니다. 이 작업은 되돌릴 수 없습니다."
          onClose={close} onConfirm={() => { api.deleteCard(activeId, dialog.card.cardId); close(); }} />
      )}
      </div>
    </div>
  );
}

Object.assign(window, { AnkiTab, AnkiStats, AnkiTextDialog, AnkiConfirmDialog, AnkiCardDialog });
