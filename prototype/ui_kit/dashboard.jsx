/* ============================================================
   dashboard.jsx — Overview tab: heatmap, character, anki widget,
   today/total stats, calendar, recent-session list
   ============================================================ */

function SessionList({ sessions, interactive = false }) {
  const [sel, setSel]       = React.useState([]);
  const [pinned, setPinned] = React.useState([]);
  const [hidden, setHidden] = React.useState([]);

  const toggle  = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const pinSel  = () => { sel.forEach((id) => setPinned((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); setSel([]); };
  const delSel  = () => { setHidden((h) => [...h, ...sel]); setSel([]); };

  const visible = sessions.filter((s) => !hidden.includes(s.sessionId));
  const sorted  = [...visible.filter((s) => pinned.includes(s.sessionId)), ...visible.filter((s) => !pinned.includes(s.sessionId))];

  if (sorted.length === 0)
    return <p className="empty-text">아직 기록된 학습 시간이 없습니다.</p>;

  const allPinned = sel.length > 0 && sel.every((id) => pinned.includes(id));

  return (
    <div>
      {interactive && sel.length > 0 && (
        <div className="list-block-actions" style={{ marginBottom: 8 }}>
          <button className="chip-button" onClick={pinSel}>
            <Icon name="pin" size={13} />{allPinned ? "고정 해제" : "고정"}
          </button>
          <button className="chip-button danger" onClick={delSel}>
            <Icon name="trash-2" size={13} />삭제 ({sel.length})
          </button>
        </div>
      )}
      <div className="session-list">
        {sorted.map((s) => (
          <div className={`session-row ${interactive && sel.includes(s.sessionId) ? "is-selected" : ""}`} key={s.sessionId}>
            {interactive && (
              <input type="checkbox" className="row-check" checked={sel.includes(s.sessionId)}
                onChange={() => toggle(s.sessionId)} aria-label={`${s.subject} 선택`} />
            )}
            {pinned.includes(s.sessionId) && <Icon name="pin" size={12} color="var(--accent-ink)" />}
            <Icon name="clock" size={17} />
            <div style={{ flex: 1, minWidth: 0 }}><strong>{s.subject}</strong></div>
            <b>{formatMinutes(s.durationMinutes)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function heatLevel(m) {
  if (m >= 180) return "l4";
  if (m >= 120) return "l3";
  if (m >= 60) return "l2";
  if (m > 0) return "l1";
  return "";
}
function dKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ActivityHeatmap({ sessions }) {
  const [view, setView] = React.useState("year");
  const [ref, setRef] = React.useState(() => new Date());
  const minutesByDate = React.useMemo(() => {
    const m = new Map();
    sessions.forEach((s) => {
      const k = s.endTime.slice(0, 10);
      m.set(k, (m.get(k) || 0) + s.durationMinutes);
    });
    return m;
  }, [sessions]);

  const dates = React.useMemo(() => {
    if (view === "year") {
      const start = new Date(ref.getFullYear(), 0, 1);
      const end = new Date(ref.getFullYear(), 11, 31);
      const arr = Array.from({ length: start.getDay() }, () => null);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) arr.push(new Date(d));
      return arr;
    }
    if (view === "month") {
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      const arr = Array.from({ length: start.getDay() }, () => null);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) arr.push(new Date(d));
      return arr;
    }
    const start = new Date(ref);
    start.setDate(ref.getDate() - ref.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view, ref]);

  const total = dates.reduce((s, it) => s + (it ? minutesByDate.get(dKey(it)) || 0 : 0), 0);

  function move(delta) {
    setRef((c) => {
      const n = new Date(c);
      if (view === "year") n.setFullYear(c.getFullYear() + delta);
      if (view === "month") n.setMonth(c.getMonth() + delta);
      if (view === "week") n.setDate(c.getDate() + delta * 7);
      return n;
    });
  }
  function cycle() { setView((c) => (c === "year" ? "month" : c === "month" ? "week" : "year")); }
  function title() {
    if (view === "year") return `${ref.getFullYear()}`;
    if (view === "month") return `${ref.getFullYear()}.${String(ref.getMonth() + 1).padStart(2, "0")}`;
    const s = new Date(ref); s.setDate(ref.getDate() - ref.getDay());
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return `${s.getMonth() + 1}.${s.getDate()}-${e.getMonth() + 1}.${e.getDate()}`;
  }
  const today = new Date();

  return (
    <section className="header-heatmap" aria-label="학습 활동">
      <div className="hh-head">
        <div className="hh-nav">
          <button className="hh-arrow" type="button" onClick={() => move(-1)}>‹</button>
          <button className="hh-title-btn" type="button" title="클릭해서 연, 월, 주 전환" onClick={cycle}>{title()}</button>
          <button className="hh-arrow" type="button" onClick={() => move(1)}>›</button>
        </div>
        <div className="hh-title"><span className="dot" />학습 활동</div>
      </div>
      <div className={`hh-body is-${view}`}>
        <div className="heat-days">{["일","월","화","수","목","금","토"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className={`heat-grid view-${view}`}>
          {dates.map((it, i) => {
            if (!it) return <div key={`e${i}`} className="heat-cell empty" />;
            const k = dKey(it);
            const m = minutesByDate.get(k) || 0;
            return (
              <div key={k} className={`heat-cell ${heatLevel(m)} ${sameDay(it, today) ? "today" : ""}`} data-date={k} title={`${k} · ${formatMinutes(m)}`}>
                {view === "month" && (<><span className="hc-d">{it.getDate()}</span><span className="hc-m">{m > 0 ? formatMinutes(m) : ""}</span></>)}
                {view === "week" && (<><span className="hc-dow">{["일","월","화","수","목","금","토"][it.getDay()]}</span><span className="hc-d">{it.getMonth()+1}/{it.getDate()}</span><span className="hc-m">{formatMinutes(m)}</span></>)}
              </div>
            );
          })}
        </div>
      </div>
      <div className="heat-legend">
        <span>{formatMinutes(total)}</span><span className="heat-sep">·</span><span>적음</span>
        <span className="swatch s0" /><span className="swatch s1" /><span className="swatch s2" /><span className="swatch s3" /><span className="swatch s4" /><span>많음</span>
      </div>
    </section>
  );
}

function CharacterCard({ character }) {
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

function AnkiWidget({ anki, onStart }) {
  const tot = (k) => anki.decks.reduce((a, d) => a + anki.counts[d.deckId][k], 0);
  const nw = tot("new"), lr = tot("learn"), rv = tot("due");
  const due = nw + lr + rv;
  const done = 18;
  const pct = Math.round((done / (due + done)) * 100);
  return (
    <section className="anki" aria-label="Anki 스케줄러">
      <div className="anki-head">
        <div className="anki-title"><span className="dot" />ANKI 스케줄러</div>
        <div className="anki-due">오늘 마감 · 23:59</div>
      </div>
      <div className="anki-stats-row">
        <div className="anki-stat new"><span className="n">{nw}</span><span className="l">신규</span></div>
        <div className="anki-stat learn"><span className="n">{lr}</span><span className="l">학습 중</span></div>
        <div className="anki-stat due"><span className="n">{rv}</span><span className="l">복습</span></div>
      </div>
      <div className="anki-foot">
        <div className="anki-progress"><i style={{ width: `${pct}%` }} /></div>
        <button className="anki-cta" type="button" onClick={onStart}>복습 시작 →</button>
      </div>
    </section>
  );
}

function CalendarWidget({ sessions }) {
  const [cal, setCal]         = React.useState(() => new Date());
  const [selDay, setSelDay]   = React.useState(null);
  const [schedules, setScheds] = React.useState({});
  const [newText, setNewText] = React.useState("");
  const [newTime, setNewTime] = React.useState("");

  const year = cal.getFullYear(), month = cal.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const today = new Date();

  const sessionDays = new Set(
    sessions
      .filter((s) => s.endTime.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`)
      .map((s) => parseInt(s.endTime.slice(8, 10), 10))
  );

  function dayKey(d) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function selectDay(d) {
    const k = dayKey(d);
    setSelDay((cur) => (cur === k ? null : k));
    setNewText(""); setNewTime("");
  }
  function addSchedule() {
    if (!newText.trim() || !selDay) return;
    setScheds((s) => ({ ...s, [selDay]: [...(s[selDay] || []), { id: String(Date.now()), text: newText.trim(), time: newTime }] }));
    setNewText(""); setNewTime("");
  }
  function removeSchedule(day, id) {
    setScheds((s) => ({ ...s, [day]: (s[day] || []).filter((x) => x.id !== id) }));
  }
  function getDayStats(dateStr) {
    const ds = sessions.filter((s) => s.endTime.slice(0, 10) === dateStr);
    return { totalMin: ds.reduce((a, s) => a + s.durationMinutes, 0), count: ds.length };
  }

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const k = dayKey(d);
    const isSel = selDay === k;
    const hasSched = (schedules[k] || []).length > 0;
    cells.push(
      <div key={d} className={`cal-cell ${isToday ? "today" : ""} ${isSel ? "cal-sel" : ""}`}
        style={{ cursor: "pointer" }} onClick={() => selectDay(d)}>
        <div className="d">{d}</div>
        {(sessionDays.has(d) || hasSched) && <div className={`cal-mark ${hasSched ? "sched" : ""}`} />}
      </div>
    );
  }
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(<div key={`t${i}`} className="cal-cell empty" />);

  const dayScheds = selDay ? (schedules[selDay] || []) : [];
  const dayStats  = selDay ? getDayStats(selDay) : null;

  return (
    <>
    <section className="panel">
      <div className="cal-head">
        <h3 className="panel-title">{year}년 {month + 1}월</h3>
        <div className="cal-nav">
          <button className="cal-btn" onClick={() => setCal((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
          <button className="cal-btn" onClick={() => setCal(new Date())}>오늘</button>
          <button className="cal-btn" onClick={() => setCal((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
        </div>
      </div>
      <div className="cal">
        {["월","화","수","목","금","토","일"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells}
      </div>

    </section>

      {selDay && (
        <div className="cal-modal-overlay" onClick={() => setSelDay(null)}>
          <div className="cal-day-panel" onClick={(e) => e.stopPropagation()}>
            <div className="cal-day-header">
              <h4>{selDay}</h4>
              <button className="icon-button" onClick={() => setSelDay(null)} aria-label="닫기"><Icon name="x" size={14} /></button>
            </div>
            <div className="cal-day-stats">
              <div className="cal-stat-item"><span>타이머</span><b>{formatMinutes(dayStats.totalMin)}</b></div>
              <div className="cal-stat-item"><span>자료요약</span><b>0건</b></div>
              <div className="cal-stat-item"><span>학습노트</span><b>0건</b></div>
              <div className="cal-stat-item"><span>Anki</span><b>0개</b></div>
            </div>
            <div className="cal-schedule-section">
              <h5>스케줄</h5>
              {dayScheds.length === 0 && <p className="empty-text" style={{ padding: "8px 0" }}>등록된 스케줄이 없습니다.</p>}
              {dayScheds.map((sc) => (
                <div key={sc.id} className="cal-schedule-row">
                  {sc.time && <span className="cal-sc-time">{sc.time}</span>}
                  <span className="cal-sc-text">{sc.text}</span>
                  <button className="cal-sc-del" onClick={() => removeSchedule(selDay, sc.id)} aria-label="삭제"><Icon name="x" size={12} /></button>
                </div>
              ))}
              <div className="cal-schedule-add">
                <input type="time" className="cal-time-input" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                <input type="text" className="cal-text-input" placeholder="스케줄 추가…" value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addSchedule(); }} />
                <button className="chip-button" disabled={!newText.trim()} onClick={addSchedule}>
                  <Icon name="plus" size={13} />추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Overview({ sessions, character, anki, onGoMaterials, onGoTimer, onGoAnki }) {
  const total = sessions.reduce((a, s) => a + s.durationMinutes, 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMin = sessions.filter((s) => s.endTime.slice(0, 10) === todayKey).reduce((a, s) => a + s.durationMinutes, 0);
  const weekStart = recentDays(7)[0];
  const weekMin = sessions.filter((s) => s.endTime.slice(0, 10) >= weekStart).reduce((a, s) => a + s.durationMinutes, 0);
  const dates = new Set(sessions.map((s) => s.endTime.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 365; i++) { const d = new Date(); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); if (dates.has(k)) streak++; else if (i > 0) break; }
  return (
    <div className="overview-grid">
      <div className="overview-main">
        <CalendarWidget sessions={sessions} />
      </div>
      <aside className="rail">
        <CharacterCard character={character} />
        <section className="today-stats">
          <h4>오늘 / 누적</h4>
          <div className="ts-row"><span>오늘 학습</span><span className="v">{formatMinutes(todayMin)}</span></div>
          <div className="ts-row"><span>이번 주</span><span className="v">{formatMinutes(weekMin)}</span></div>
          <div className="ts-row"><span>총 학습 시간</span><span className="v">{formatMinutes(total)}</span></div>
          <div className="ts-row"><span>연속 학습</span><span className="v">{streak}일</span></div>
        </section>
        <AnkiWidget anki={anki} onStart={onGoAnki} />
      </aside>
    </div>
  );
}

Object.assign(window, { Overview, ActivityHeatmap, CharacterCard, AnkiWidget, CalendarWidget, SessionList });
