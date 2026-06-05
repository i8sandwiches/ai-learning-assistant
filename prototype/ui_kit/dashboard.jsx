/* ============================================================
   dashboard.jsx — Overview, heatmap, calendar, Lumi character,
   session clock, anki widget
   ============================================================ */
const { useState: useStateDash, useEffect: useEffectDash, useMemo: useMemoDash, useRef: useRefDash } = React;

const MIN_WAGE = 10030;
const SCHED_COLORS = ["#e0533a", "#e8902f", "#d9b008", "#3fa45b", "#3b78d9", "#9a59c2"];

/* ---- heatmap helpers ---- */
function buildHeatDates(view, refDate) {
  if (view === "year") {
    const start = new Date(refDate.getFullYear(), 0, 1),end = new Date(refDate.getFullYear(), 11, 31);
    const dates = Array.from({ length: start.getDay() }, () => null);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    return dates;
  }
  if (view === "month") {
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1),end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
    const dates = Array.from({ length: start.getDay() }, () => null);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    return dates;
  }
  const start = new Date(refDate);start.setDate(refDate.getDate() - refDate.getDay());
  return Array.from({ length: 7 }, (_, i) => {const d = new Date(start);d.setDate(start.getDate() + i);return d;});
}
function dateKey(d) {return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;}
function heatTitle(view, date) {
  if (view === "year") return `${date.getFullYear()}`;
  if (view === "month") return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  const start = new Date(date);start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}.${start.getDate()}-${end.getMonth() + 1}.${end.getDate()}`;
}
function heatLevel(m) {if (m >= 180) return "l4";if (m >= 120) return "l3";if (m >= 60) return "l2";if (m > 0) return "l1";return "";}
function isSameDay(a, b) {return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();}

function ActivityHeatmap({ sessions }) {
  const [view, setView] = useStateDash("year");
  const [refDate, setRefDate] = useStateDash(() => new Date());
  const minutesByDate = useMemoDash(() => {
    const map = new Map();
    sessions.forEach((s) => {const k = s.endTime.slice(0, 10);map.set(k, (map.get(k) ?? 0) + s.durationMinutes);});
    return map;
  }, [sessions]);
  const visibleDates = useMemoDash(() => buildHeatDates(view, refDate), [view, refDate]);
  const totalVisible = visibleDates.reduce((sum, it) => sum + (it ? minutesByDate.get(dateKey(it)) ?? 0 : 0), 0);
  function moveHeat(delta) {
    setRefDate((cur) => {const n = new Date(cur);
      if (view === "year") n.setFullYear(cur.getFullYear() + delta);
      if (view === "month") n.setMonth(cur.getMonth() + delta);
      if (view === "week") n.setDate(cur.getDate() + delta * 7);
      return n;});
  }
  const cycleView = () => setView((c) => c === "year" ? "month" : c === "month" ? "week" : "year");
  return (
    <section className="header-heatmap" aria-label="학습 활동">
      <div className="hh-head">
        <div className="hh-nav">
          <button className="hh-arrow" aria-label="이전" onClick={() => moveHeat(-1)}>‹</button>
          <button className="hh-title-btn" title="클릭해서 연·월·주 전환" onClick={cycleView}>{heatTitle(view, refDate)}</button>
          <button className="hh-arrow" aria-label="다음" onClick={() => moveHeat(1)}>›</button>
        </div>
        <div className="hh-title"><span className="dot" />학습 활동</div>
      </div>
      <div className={`hh-body is-${view}`}>
        <div className="heat-days">{["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className={`heat-grid view-${view}`}>
          {visibleDates.map((it, idx) => {
            if (!it) return <div key={`e${idx}`} className="heat-cell empty" />;
            const k = dateKey(it),minutes = minutesByDate.get(k) ?? 0;
            return (
              <div key={k} className={`heat-cell ${heatLevel(minutes)} ${isSameDay(it, new Date()) ? "today" : ""}`} data-date={k} title={`${k} · ${formatMinutes(minutes)}`}>
                {view === "month" && <><span className="hc-d">{it.getDate()}</span><span className="hc-m">{minutes > 0 ? formatMinutes(minutes) : ""}</span></>}
                {view === "week" && <><span className="hc-dow">{["일", "월", "화", "수", "목", "금", "토"][it.getDay()]}</span><span className="hc-d">{it.getMonth() + 1}/{it.getDate()}</span><span className="hc-m">{formatMinutes(minutes)}</span></>}
              </div>);

          })}
        </div>
      </div>
      <div className="heat-legend">
        <span>{formatMinutes(totalVisible)}</span><span className="heat-sep">·</span><span>적음</span>
        <span className="swatch s0" /><span className="swatch s1" /><span className="swatch s2" /><span className="swatch s3" /><span className="swatch s4" />
        <span>많음</span>
      </div>
    </section>);

}

/* ---- Session clock (live, persisted) ---- */
function SessionClock({ sessions }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const SK = "hak.sessStart." + todayStr;
  const [startMs] = useStateDash(() => {
    const v = localStorage.getItem(SK);
    if (v) return parseInt(v, 10);
    const t = Date.now();localStorage.setItem(SK, String(t));return t;
  });
  const [, setTick] = useStateDash(0);
  useEffectDash(() => {const id = setInterval(() => setTick((n) => n + 1), 1000);return () => clearInterval(id);}, []);

  /* 누적가치 — 회원가입 이후 계속 누적. 로그인/로그아웃·날짜 변경에도 초기화되지 않음. */
  const [acc, setAcc] = useStateDash(() => {
    const existing = localStorage.getItem("hak.accKRW");
    if (existing != null) return parseInt(existing, 10) || 0;
    const totalMin = (sessions || []).reduce((a, s) => a + s.durationMinutes, 0);
    const seed = Math.floor(totalMin / 60) * MIN_WAGE;
    localStorage.setItem("hak.accKRW", String(seed));
    return seed;
  });

  const elapsedMs = Date.now() - startMs;
  const totalSec = Math.floor(elapsedMs / 1000);
  const hh = Math.floor(totalSec / 3600),mm = Math.floor(totalSec % 3600 / 60),ss = totalSec % 60;
  const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const todayValue = Math.floor(elapsedMs / 3600000) * MIN_WAGE;

  /* 오늘 늘어난 만큼만 누적에 합산 (중복 합산 방지) */
  useEffectDash(() => {
    const creditedKey = "hak.accCredited." + todayStr;
    const credited = parseInt(localStorage.getItem(creditedKey) || "0", 10);
    if (todayValue > credited) {
      const base = parseInt(localStorage.getItem("hak.accKRW") || "0", 10);
      const next = base + (todayValue - credited);
      localStorage.setItem("hak.accKRW", String(next));
      localStorage.setItem(creditedKey, String(todayValue));
      setAcc(next);
    }
  }, [todayValue, todayStr]);

  return (
    <div className="session-clock">
      <div className="sc-timer">{timeStr}</div>
      <div className="sc-value">오늘 학습가치 <strong>{todayValue > 0 ? todayValue.toLocaleString("ko-KR") + "원" : "집계 중"}</strong></div>
      <div className="sc-acc" data-comment-anchor="623b027840-div-112-7">누적 {acc.toLocaleString("ko-KR")}원</div>
    </div>);

}

/* ---- Lumi face by level ---- */
function CharacterFace({ level }) {
  const happy = level >= 6,vhappy = level >= 11;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="rgba(255,255,255,.65)" stroke="rgba(0,0,0,.08)" strokeWidth="1.5" />
      {vhappy ? <>
        <path d="M11 14 l2-2 2 2" stroke="rgba(0,0,0,.5)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M21 14 l2-2 2 2" stroke="rgba(0,0,0,.5)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M11 22 Q18 28 25 22" stroke="rgba(0,0,0,.5)" strokeWidth="1.9" fill="none" strokeLinecap="round" />
      </> : happy ? <>
        <circle cx="13" cy="16" r="1.9" fill="rgba(0,0,0,.45)" />
        <circle cx="23" cy="16" r="1.9" fill="rgba(0,0,0,.45)" />
        <path d="M12 22 Q18 26 24 22" stroke="rgba(0,0,0,.45)" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      </> : <>
        <circle cx="13" cy="16" r="1.6" fill="rgba(0,0,0,.4)" />
        <circle cx="23" cy="16" r="1.6" fill="rgba(0,0,0,.4)" />
        <path d="M13 23 Q18 21 23 23" stroke="rgba(0,0,0,.4)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </>}
    </svg>);

}

function CharacterCard({ character }) {
  const prevLevel = usePrevious(character.level);
  const [celebrate, setCelebrate] = useStateDash(false);
  useEffectDash(() => {
    if (prevLevel != null && character.level > prevLevel) {
      setCelebrate(true);
      pushToast(`루미가 레벨 ${character.level} · ${character.rankName}(으)로 성장했어요!`, { accent: true, icon: "sparkles" });
      const t = setTimeout(() => setCelebrate(false), 1500);
      return () => clearTimeout(t);
    }
  }, [character.level]);
  return (
    <div className={`rumi ${celebrate ? "levelup" : ""}`}>
      <div className="rumi-spark">{Array.from({ length: 8 }).map((_, i) =>
        <span key={i} style={{ left: `${10 + i * 11}%`, top: "60%", animationDelay: `${i * 0.05}s`, background: i % 2 ? "oklch(0.78 0.14 50)" : "oklch(0.85 0.15 95)" }} />
        )}</div>
      <div className="rumi-head">
        <span className="rumi-tag">Lv.{character.level} · {character.rankName}</span>
        <span className="rumi-atd">{character.attendanceDays}일 출석</span>
      </div>
      <div className="rumi-row">
        <div className="rumi-face"><CharacterFace level={character.level} /></div>
        <div>
          <h3 className="rumi-name">루미</h3>
          <p className="rumi-desc">{character.desc}</p>
        </div>
      </div>
      <div className="rumi-bar"><i style={{ width: `${character.progress}%` }} /></div>
      <div className="rumi-exp">{character.progress}%{character.nextInfo ? <span data-comment-anchor="03ee0f7c15-span-191-76"> · 다음 계급 ?</span> : null}</div>
    </div>);

}

/* ---- Anki widget ---- */
function AnkiWidget({ anki, onStart }) {
  const totalNew = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).new, 0);
  const totalLearn = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).learn, 0);
  const totalDue = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).review, 0);
  const done = anki.todayCounts.new + anki.todayCounts.learn + anki.todayCounts.review;
  const total = totalNew + totalLearn + totalDue + done;
  const pct = total ? Math.round(done / total * 100) : 0;
  return (
    <section className="anki" aria-label="Anki 스케줄러">
      <div className="anki-head">
        <div className="anki-title"><span className="dot" />ANKI 스케줄러</div>
        <div className="anki-due">오늘 마감 · 23:59</div>
      </div>
      <div className="anki-stats-row">
        <div className="anki-stat new"><span className="n">{totalNew}</span><span className="l">신규</span></div>
        <div className="anki-stat learn"><span className="n">{totalLearn}</span><span className="l">학습 중</span></div>
        <div className="anki-stat due"><span className="n">{totalDue}</span><span className="l">복습</span></div>
      </div>
      <div className="anki-foot">
        <div className="anki-progress"><i style={{ width: `${pct}%` }} /></div>
        <button className="anki-cta" onClick={onStart}>복습 시작 →</button>
      </div>
    </section>);

}

/* ---- Calendar ---- */
/* one calendar day cell — measures how many schedule bars fit; shows +N only on real overflow */
function CalDayCell({ day, isToday, isSel, hasSession, scheds, onClick }) {
  const cellRef = useRefDash(null);
  const [fit, setFit] = useStateDash(scheds.length);
  useEffectDash(() => {
    const el = cellRef.current;
    if (!el) return;
    const BAR = 8,GAP = 3,HEADER = 30; // bar height + gap; HEADER = date number + paddings
    const measure = () => {
      const avail = el.clientHeight - HEADER;
      if (avail <= 0) return;
      setFit(Math.max(1, Math.floor((avail + GAP) / (BAR + GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const overflow = scheds.length > fit;
  const shown = overflow ? Math.max(1, fit - 1) : scheds.length; // reserve a slot for +N chip
  return (
    <div ref={cellRef} className={`cal-cell ${isToday ? "today" : ""} ${isSel ? "cal-sel" : ""}`} onClick={onClick}>
      <span className="cal-date">{day}</span>
      {hasSession && <span className="cal-session-dot" title="학습 기록" />}
      <div className="cal-bars">
        {scheds.slice(0, shown).map((sc) => <span key={sc.id} className="cal-bar" style={{ background: sc.color }} title={sc.text} />)}
        {overflow && <span className="cal-bar-more">+{scheds.length - shown}</span>}
      </div>
    </div>);

}

function CalendarWidget({ sessions }) {
  const [cal, setCal] = useStateDash(() => new Date());
  const [selDay, setSelDay] = useStateDash(null);
  const [schedules, setScheds] = useStateDash(() => {
    try {return JSON.parse(localStorage.getItem("hak.scheds") || "{}");} catch (e) {return {};}
  });
  const [newText, setNewText] = useStateDash("");
  const [newColor, setNewColor] = useStateDash(SCHED_COLORS[3]);
  useEffectDash(() => {try {localStorage.setItem("hak.scheds", JSON.stringify(schedules));} catch (e) {}}, [schedules]);

  const year = cal.getFullYear(),month = cal.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const today = new Date();
  const sessionDays = new Set(sessions.filter((s) => s.endTime.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`).map((s) => parseInt(s.endTime.slice(8, 10), 10)));
  const dayKey = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  function selectDay(d) {const k = dayKey(d);setSelDay((cur) => cur === k ? null : k);setNewText("");}
  function addSchedule() {if (!newText.trim() || !selDay) return;setScheds((s) => ({ ...s, [selDay]: [...(s[selDay] || []), { id: String(Date.now()), text: newText.trim(), color: newColor }] }));setNewText("");}
  function removeSchedule(day, id) {setScheds((s) => ({ ...s, [day]: (s[day] || []).filter((x) => x.id !== id) }));}
  function getDayStats(dateStr) {const ds = sessions.filter((s) => s.endTime.slice(0, 10) === dateStr);return { totalMin: ds.reduce((a, s) => a + s.durationMinutes, 0), count: ds.length };}

  /* one calendar day cell — measures how many schedule bars fit, shows +N only on overflow */
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const k = dayKey(d),isSel = selDay === k,daySched = schedules[k] || [];
    cells.push(
      <CalDayCell key={d} day={d} isToday={isToday} isSel={isSel} hasSession={sessionDays.has(d)} scheds={daySched} onClick={() => selectDay(d)} />
    );
  }
  const trailing = (7 - (firstDow + daysInMonth) % 7) % 7;
  for (let i = 0; i < trailing; i++) cells.push(<div key={`t${i}`} className="cal-cell empty" />);
  const dayScheds = selDay ? schedules[selDay] || [] : [];
  const dayStats = selDay ? getDayStats(selDay) : null;

  return <>
    <section className="panel">
      <div className="cal-head">
        <h3 className="panel-title">{year}년 {month + 1}월</h3>
        <div className="cal-nav">
          <button className="cal-btn" aria-label="이전 달" onClick={() => setCal((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
          <button className="cal-btn" onClick={() => setCal(new Date())}>오늘</button>
          <button className="cal-btn" aria-label="다음 달" onClick={() => setCal((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
        </div>
      </div>
      <div className="cal">
        {["월", "화", "수", "목", "금", "토", "일"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells}
      </div>
    </section>
    {selDay &&
    <div className="cal-modal-overlay" onClick={() => setSelDay(null)}>
        <div className="cal-day-panel" onClick={(e) => e.stopPropagation()}>
          <div className="cal-day-header">
            <h4>{selDay}</h4>
            <button className="icon-button" onClick={() => setSelDay(null)} aria-label="닫기"><Icon name="x" size={14} /></button>
          </div>
          <div className="cal-day-stats">
            <div className="cal-stat-item"><span>타이머</span><b>{dayStats ? formatMinutes(dayStats.totalMin) : "0분"}</b></div>
            <div className="cal-stat-item"><span>세션</span><b>{dayStats?.count ?? 0}회</b></div>
            <div className="cal-stat-item"><span>노트</span><b>0건</b></div>
            <div className="cal-stat-item"><span>Anki</span><b>0개</b></div>
          </div>
          <div className="cal-schedule-section">
            <h5>스케줄</h5>
            {dayScheds.length === 0 && <p className="empty-text" style={{ padding: "8px 0" }}>등록된 스케줄이 없습니다.</p>}
            {dayScheds.map((sc) =>
          <div key={sc.id} className="cal-schedule-row">
                <span className="cal-mark" style={{ background: sc.color }} />
                <span className="cal-sc-text">{sc.text}</span>
                <button className="cal-sc-del" onClick={() => removeSchedule(selDay, sc.id)} aria-label="삭제"><Icon name="x" size={12} /></button>
              </div>
          )}
            <div className="cal-schedule-add">
              <div className="cal-color-swatches">
                {SCHED_COLORS.map((c) => <button key={c} type="button" className={`cal-swatch${newColor === c ? " active" : ""}`} style={{ background: c }} onClick={() => setNewColor(c)} aria-label={c} />)}
              </div>
              <input type="text" className="cal-text-input" placeholder="스케줄 추가…" value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => {if (e.key === "Enter") addSchedule();}} />
              <button className="chip-button" disabled={!newText.trim()} onClick={addSchedule}><Icon name="plus" size={13} />추가</button>
            </div>
          </div>
        </div>
      </div>
    }
  </>;
}

/* ---- Overview ---- */
function Overview({ character, sessions, anki, onGoAnki }) {
  const total = sessions.reduce((a, s) => a + s.durationMinutes, 0);
  const todayKey2 = new Date().toISOString().slice(0, 10);
  const todayMin = sessions.filter((s) => s.endTime.slice(0, 10) === todayKey2).reduce((a, s) => a + s.durationMinutes, 0);
  const weekStart = recentDays(7)[0];
  const weekMin = sessions.filter((s) => s.endTime.slice(0, 10) >= weekStart).reduce((a, s) => a + s.durationMinutes, 0);
  const dates = new Set(sessions.map((s) => s.endTime.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 365; i++) {const d = new Date();d.setDate(d.getDate() - i);const k = d.toISOString().slice(0, 10);if (dates.has(k)) streak++;else if (i > 0) break;}
  return (
    <div className="overview-grid">
      <div className="overview-main"><CalendarWidget sessions={sessions} /></div>
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
    </div>);

}

Object.assign(window, { ActivityHeatmap, SessionClock, CharacterCard, CharacterFace, AnkiWidget, CalendarWidget, Overview });