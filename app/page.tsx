"use client";

import {
  BarChart3,
  Bell,
  BookOpenText,
  Bot,
  CheckCircle2,
  Clock,
  Flame,
  LayersIcon,
  LogOut,
  Menu,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  TimerReset,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import {
  AnkiCard,
  AnkiGrade,
  AnkiState,
  AppState,
  AuthProvider,
  LearningMaterial,
  Quiz,
  StudyNote,
  StudySession,
  Summary,
  TimerType,
  User,
} from "@/lib/types";
import {
  addBasicNote,
  addClozeNote,
  buildQueue,
  createAId,
  getDeckCounts,
  getCardFB,
  loadAnkiFromStorage,
  makeDefaultAnkiState,
  saveAnkiToStorage,
  schedule,
} from "@/lib/anki";
import {
  calculateCharacter,
  createId,
  formatMinutes,
  recentDays,
  summarizeLocally,
  validateUpload,
} from "@/lib/study";

/* ============================================================
   Constants
   ============================================================ */
const MIN_WAGE = 10030;
const SCHED_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];
const STAT_PALETTE = [
  "oklch(0.70 0.13 200)", "oklch(0.70 0.13 150)", "oklch(0.72 0.13 70)",
  "oklch(0.68 0.14 25)", "oklch(0.66 0.13 285)", "oklch(0.70 0.13 330)",
];
const RANK_COLORS = [
  "oklch(0.93 0.06 155)",
  "oklch(0.93 0.07 55)",
  "oklch(0.93 0.06 240)",
  "oklch(0.92 0.07 295)",
  "oklch(0.92 0.08 30)",
  "oklch(0.88 0.10 70)",
];
function rankColorIdx(lv: number) {
  if (lv <= 2) return 0;
  if (lv <= 5) return 1;
  if (lv <= 9) return 2;
  if (lv <= 12) return 3;
  if (lv === 13) return 4;
  return 5;
}

const NOTIFICATIONS = [
  { id: "n1", icon: <LayersIcon size={16} />, title: "오늘 복습할 Anki 카드가 기다리고 있어요.", time: "방금 전", unread: true },
  { id: "n2", icon: <Flame size={16} />, title: "어제 학습으로 연속 출석이 이어졌어요.", time: "어제", unread: true },
  { id: "n3", icon: <Sparkles size={16} />, title: "루미가 새로운 단계에 도달했어요.", time: "2일 전", unread: false },
  { id: "n4", icon: <CheckCircle2 size={16} />, title: "지난주 학습 요약 리포트가 준비되었습니다.", time: "3일 전", unread: false },
];

const subjects = ["국어", "영어", "수학", "과학", "사회", "전공", "자격증", "기타"];

const NAV_ITEMS = [
  { id: "overview",  icon: <BarChart3 size={18} />,    label: "대시보드" },
  { id: "timer",     icon: <Clock size={18} />,        label: "포모도로" },
  { id: "notes",     icon: <BookOpenText size={18} />, label: "학습 노트" },
  { id: "materials", icon: <UploadCloud size={18} />,  label: "자료/요약" },
  { id: "anki",      icon: <LayersIcon size={18} />,   label: "Anki" },
  { id: "stats",     icon: <Flame size={18} />,        label: "통계" },
] as const;

const TAB_TITLES: Record<string, string> = {
  overview: "학습 대시보드",
  materials: "자료 / 요약",
  notes: "학습 노트",
  anki: "Anki 스케줄러",
  timer: "포모도로",
  stats: "학습 통계",
};

type TabId = "overview" | "materials" | "notes" | "timer" | "stats" | "anki";
type HeatView = "year" | "month" | "week";
type SessionUser = {
  email?: string | null;
  name?: string | null;
  provider?: string;
  providerAccountId?: string;
};

const initialState: AppState = {
  user: null,
  materials: [],
  summaries: [],
  notes: [],
  quizzes: [],
  sessions: [],
};

const GUEST_USER_STORAGE_KEY = "studyapp.guestUser";

/* ============================================================
   SessionClock
   ============================================================ */
function SessionClock() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const SK = "studyapp.sessStart." + todayStr;
  const AK = "studyapp.accKRW";
  const [startMs] = useState(() => {
    if (typeof window === "undefined") return Date.now();
    const v = localStorage.getItem(SK);
    if (v) return parseInt(v, 10);
    const t = Date.now();
    localStorage.setItem(SK, String(t));
    return t;
  });
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = Date.now() - startMs;
  const totalSec = Math.floor(elapsedMs / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const todayValue = Math.floor(elapsedMs / 3600000) * MIN_WAGE;
  const accBase = typeof window !== "undefined" ? parseInt(localStorage.getItem(AK) || "0", 10) : 0;
  const totalAcc = accBase + todayValue;
  return (
    <div className="session-clock">
      <div className="sc-timer">{timeStr}</div>
      <div className="sc-value">오늘 학습가치 <strong>{todayValue > 0 ? todayValue.toLocaleString("ko-KR") + "원" : "집계 중"}</strong></div>
      <div className="sc-acc">누적 {totalAcc.toLocaleString("ko-KR")}원</div>
    </div>
  );
}

/* ============================================================
   Sidebar
   ============================================================ */
function Sidebar({
  activeTab, onTab, user, onLogout, attendance
}: {
  activeTab: TabId;
  onTab: (t: TabId) => void;
  user: User;
  onLogout: () => void;
  attendance: number;
}) {
  const [open, setOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notes, setNotes] = useState(NOTIFICATIONS);
  const unread = notes.filter(n => n.unread).length;
  const activeLabel = NAV_ITEMS.find(it => it.id === activeTab)?.label ?? "대시보드";

  function pick(id: TabId) { onTab(id); setOpen(false); }
  function markAllRead() { setNotes(ns => ns.map(n => ({ ...n, unread: false }))); }

  return (
    <>
      {/* Mobile top bar */}
      <header className="mobile-bar">
        <div className="mobile-left">
          <button className="hamburger" aria-label="메뉴 열기" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="mobile-title">{activeLabel}</span>
        </div>
        <div className="mobile-actions">
          <span className="attend-badge">
            <strong>{user.nickname}</strong>님 {attendance}번째 출석!
          </span>
          <div className="notify-wrap">
            <button className="topbar-icon-btn" aria-label="알림" title="알림"
              aria-expanded={notifyOpen} onClick={() => setNotifyOpen(o => !o)}>
              <Bell size={18} />
              {unread > 0 && <span className="notify-dot" />}
            </button>
            {notifyOpen && (
              <>
                <div className="notify-scrim" onClick={() => setNotifyOpen(false)} />
                <div className="notify-panel" role="dialog" aria-label="알림">
                  <div className="notify-head">
                    <span className="notify-title">알림{unread > 0 ? ` · ${unread}` : ""}</span>
                    <button className="notify-readall" onClick={markAllRead} disabled={unread === 0}>모두 읽음</button>
                  </div>
                  <ul className="notify-list">
                    {notes.map(n => (
                      <li key={n.id} className={`notify-item ${n.unread ? "is-unread" : ""}`}>
                        <span className="notify-ico">{n.icon}</span>
                        <div className="notify-body">
                          <p className="notify-text">{n.title}</p>
                          <span className="notify-time">{n.time}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
          <button className="topbar-icon-btn" aria-label="로그아웃" title="로그아웃" onClick={onLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {open && <div className="drawer-scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div>
          <div className="brand">
            <span className="brand-mark"><Sparkles size={22} /></span>
            <span>AI 학습 어시스턴트</span>
            <button className="drawer-close" aria-label="메뉴 닫기" onClick={() => setOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <nav className="nav">
            {NAV_ITEMS.map(it => (
              <button key={it.id} className={`nav-button ${activeTab === it.id ? "active" : ""}`} onClick={() => pick(it.id as TabId)}>
                {it.icon}
                {it.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="user">
          <span className="user-avatar">{user.nickname.slice(0, 1).toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{user.nickname}</div>
            <div className="user-sub">{user.provider} 로그인</div>
          </div>
          <button className="user-logout" title="로그아웃" aria-label="로그아웃" onClick={onLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

/* ============================================================
   CharacterFace SVG
   ============================================================ */
function CharacterFace({ level }: { level: number }) {
  const happy = level >= 6;
  const vhappy = level >= 13;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="rgba(255,255,255,.55)" stroke="rgba(0,0,0,.08)" strokeWidth="1.5" />
      {vhappy ? (
        <>
          <path d="M11 14 l2-2 2 2" stroke="rgba(0,0,0,.45)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M21 14 l2-2 2 2" stroke="rgba(0,0,0,.45)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M11 22 Q18 28 25 22" stroke="rgba(0,0,0,.45)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : happy ? (
        <>
          <circle cx="13" cy="16" r="1.8" fill="rgba(0,0,0,.4)" />
          <circle cx="23" cy="16" r="1.8" fill="rgba(0,0,0,.4)" />
          <path d="M12 22 Q18 26 24 22" stroke="rgba(0,0,0,.4)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="13" cy="16" r="1.6" fill="rgba(0,0,0,.4)" />
          <circle cx="23" cy="16" r="1.6" fill="rgba(0,0,0,.4)" />
          <path d="M13 23 Q18 21 23 23" stroke="rgba(0,0,0,.4)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/* ============================================================
   CharacterCard
   ============================================================ */
function CharacterCard({ character }: { character: ReturnType<typeof calculateCharacter> }) {
  const bg = RANK_COLORS[rankColorIdx(character.level)];
  const prevLevelRef = useRef(character.level);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (character.level > prevLevelRef.current) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 1400);
      prevLevelRef.current = character.level;
      return () => clearTimeout(t);
    }
    prevLevelRef.current = character.level;
  }, [character.level]);

  return (
    <div className={`rumi${celebrate ? " levelup" : ""}`} style={{ background: bg }}>
      <div className="rumi-spark">
        {celebrate && Array.from({ length: 8 }).map((_, i) => (
          <span key={i} style={{ left: `${10 + i * 11}%`, animationDelay: `${i * 0.07}s` }} />
        ))}
      </div>
      <div className="rumi-head">
        <span className="rumi-tag">Lv.{character.level}</span>
        <span className="rumi-atd">{character.attendanceDays}일 출석</span>
      </div>
      <div className="rumi-row">
        <div className="rumi-face"><CharacterFace level={character.level} /></div>
        <div>
          <h3 className="rumi-name">{character.name}</h3>
          <p className="rumi-desc">{character.desc}</p>
        </div>
      </div>
      <div className="rumi-bar"><i style={{ width: `${character.progress}%` }} /></div>
      <div className="rumi-exp">
        {character.progress}%{character.nextInfo ? <span> · {character.nextInfo}</span> : null}
      </div>
    </div>
  );
}

/* ============================================================
   AnkiWidget (Overview)
   ============================================================ */
function AnkiWidget({ anki, onStart }: {
  anki: AnkiState;
  onStart: () => void;
}) {
  const totalNew = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).new, 0);
  const totalLearn = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).learn, 0);
  const totalDue = anki.decks.reduce((a, d) => a + getDeckCounts(anki, d.deckId).review, 0);
  const done = anki.todayCounts.new + anki.todayCounts.learn + anki.todayCounts.review;
  const total = totalNew + totalLearn + totalDue + done;
  const pct = total ? Math.round((done / total) * 100) : 0;
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
        <button className="anki-cta" type="button" onClick={onStart}>복습 시작 →</button>
      </div>
    </section>
  );
}

/* ============================================================
   CalendarWidget
   ============================================================ */
function CalendarWidget({ sessions }: { sessions: StudySession[] }) {
  const [cal, setCal] = useState(() => new Date());
  const [selDay, setSelDay] = useState<string | null>(null);
  const [schedules, setScheds] = useState<Record<string, { id: string; text: string; color: string }[]>>({});
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState(SCHED_COLORS[4]);

  const year = cal.getFullYear(), month = cal.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const today = new Date();

  const sessionDays = new Set(
    sessions
      .filter(s => s.endTime.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`)
      .map(s => parseInt(s.endTime.slice(8, 10), 10))
  );

  function dayKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function selectDay(d: number) {
    const k = dayKey(d);
    setSelDay(cur => cur === k ? null : k);
    setNewText("");
  }
  function addSchedule() {
    if (!newText.trim() || !selDay) return;
    setScheds(s => ({ ...s, [selDay]: [...(s[selDay] || []), { id: String(Date.now()), text: newText.trim(), color: newColor }] }));
    setNewText("");
  }
  function removeSchedule(day: string, id: string) {
    setScheds(s => ({ ...s, [day]: (s[day] || []).filter(x => x.id !== id) }));
  }
  function getDayStats(dateStr: string) {
    const ds = sessions.filter(s => s.endTime.slice(0, 10) === dateStr);
    return { totalMin: ds.reduce((a, s) => a + s.durationMinutes, 0), count: ds.length };
  }

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const k = dayKey(d);
    const isSel = selDay === k;
    const daySched = schedules[k] || [];
    const fit = 2;
    const overflow = daySched.length > fit;
    const shown = overflow ? Math.max(1, fit - 1) : daySched.length;
    cells.push(
      <div key={d} className={`cal-cell ${isToday ? "today" : ""} ${isSel ? "cal-sel" : ""}`}
        onClick={() => selectDay(d)}>
        <span className="cal-date">{d}</span>
        {sessionDays.has(d) && <span className="cal-session-dot" title="학습 기록" />}
        {daySched.length > 0 && (
          <div className="cal-bars">
            {daySched.slice(0, shown).map(sc => (
              <span key={sc.id} className="cal-bar" style={{ background: sc.color }} title={sc.text} />
            ))}
            {overflow && <span className="cal-bar-more">+{daySched.length - shown}</span>}
          </div>
        )}
      </div>
    );
  }
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(<div key={`t${i}`} className="cal-cell empty" />);

  const dayScheds = selDay ? (schedules[selDay] || []) : [];
  const dayStats = selDay ? getDayStats(selDay) : null;

  return (
    <>
      <section className="panel">
        <div className="cal-head">
          <h3 className="panel-title">{year}년 {month + 1}월</h3>
          <div className="cal-nav">
            <button className="cal-btn" aria-label="이전 달" onClick={() => setCal(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
            <button className="cal-btn" onClick={() => setCal(new Date())}>오늘</button>
            <button className="cal-btn" aria-label="다음 달" onClick={() => setCal(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
          </div>
        </div>
        <div className="cal">
          {["월", "화", "수", "목", "금", "토", "일"].map(d => <div key={d} className="cal-dow">{d}</div>)}
          {cells}
        </div>
      </section>

      {selDay && (
        <div className="cal-modal-overlay" onClick={() => setSelDay(null)}>
          <div className="cal-day-panel" onClick={e => e.stopPropagation()}>
            <div className="cal-day-header">
              <h4>{selDay}</h4>
              <button className="icon-button" onClick={() => setSelDay(null)} aria-label="닫기"><X size={14} /></button>
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
              {dayScheds.map(sc => (
                <div key={sc.id} className="cal-schedule-row">
                  <span className="cal-mark sched" style={{ background: sc.color }} />
                  <span className="cal-sc-text">{sc.text}</span>
                  <button className="cal-sc-del" onClick={() => removeSchedule(selDay, sc.id)} aria-label="삭제"><X size={12} /></button>
                </div>
              ))}
              <div className="cal-schedule-add">
                <div className="cal-color-swatches">
                  {SCHED_COLORS.map(c => (
                    <button key={c} type="button" className={`cal-swatch${newColor === c ? " active" : ""}`} style={{ background: c }}
                      onClick={() => setNewColor(c)} aria-label={c} />
                  ))}
                </div>
                <input type="text" className="cal-text-input" placeholder="스케줄 추가…" value={newText}
                  onChange={e => setNewText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addSchedule(); }} />
                <button className="chip-button" disabled={!newText.trim()} onClick={addSchedule}>
                  <Plus size={13} />추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   ActivityHeatmap
   ============================================================ */
function ActivityHeatmap({ sessions }: { sessions: StudySession[] }) {
  const [view, setView] = useState<HeatView>("year");
  const [refDate, setRefDate] = useState(() => new Date());

  const minutesByDate = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach(s => {
      const key = s.endTime.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + s.durationMinutes);
    });
    return map;
  }, [sessions]);

  const visibleDates = useMemo(() => buildHeatDates(view, refDate), [view, refDate]);
  const totalVisibleMinutes = visibleDates.reduce((sum, item) => sum + (item ? minutesByDate.get(dateKey(item)) ?? 0 : 0), 0);

  function moveHeat(delta: number) {
    setRefDate(current => {
      const next = new Date(current);
      if (view === "year") next.setFullYear(current.getFullYear() + delta);
      if (view === "month") next.setMonth(current.getMonth() + delta);
      if (view === "week") next.setDate(current.getDate() + delta * 7);
      return next;
    });
  }
  function cycleView() {
    setView(current => current === "year" ? "month" : current === "month" ? "week" : "year");
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
          {["일", "월", "화", "수", "목", "금", "토"].map(day => <span key={day}>{day}</span>)}
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
                {view === "month" && (<>
                  <span className="hc-d">{item.getDate()}</span>
                  <span className="hc-m">{minutes > 0 ? formatMinutes(minutes) : ""}</span>
                </>)}
                {view === "week" && (<>
                  <span className="hc-dow">{["일", "월", "화", "수", "목", "금", "토"][item.getDay()]}</span>
                  <span className="hc-d">{item.getMonth() + 1}/{item.getDate()}</span>
                  <span className="hc-m">{formatMinutes(minutes)}</span>
                </>)}
              </div>
            );
          })}
        </div>
      </div>
      <div className="heat-legend">
        <span>{formatMinutes(totalVisibleMinutes)}</span>
        <span className="heat-sep">·</span>
        <span>적음</span>
        <span className="swatch s0" /><span className="swatch s1" /><span className="swatch s2" /><span className="swatch s3" /><span className="swatch s4" />
        <span>많음</span>
      </div>
    </section>
  );
}

/* ============================================================
   Overview
   ============================================================ */
function Overview({
  character, sessions, anki, onGoAnki
}: {
  character: ReturnType<typeof calculateCharacter>;
  sessions: StudySession[];
  anki: AnkiState;
  onGoAnki: () => void;
}) {
  const total = sessions.reduce((a, s) => a + s.durationMinutes, 0);
  const todayKey2 = new Date().toISOString().slice(0, 10);
  const todayMin = sessions.filter(s => s.endTime.slice(0, 10) === todayKey2).reduce((a, s) => a + s.durationMinutes, 0);
  const weekStart = recentDays(7)[0];
  const weekMin = sessions.filter(s => s.endTime.slice(0, 10) >= weekStart).reduce((a, s) => a + s.durationMinutes, 0);
  const dates = new Set(sessions.map(s => s.endTime.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    if (dates.has(k)) streak++;
    else if (i > 0) break;
  }

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

/* ============================================================
   SessionList
   ============================================================ */
function SessionList({ sessions }: { sessions: StudySession[] }) {
  if (sessions.length === 0) return <p className="empty-text">아직 기록된 학습 시간이 없습니다.</p>;
  return (
    <div className="session-list">
      {sessions.map(session => (
        <div className="session-row" key={session.sessionId}>
          <Clock size={17} />
          <div>
            <strong>{session.subject}</strong>
            <span>{session.timerType === "POMODORO" ? "포모도로" : session.timerType === "TIMER" ? "타이머" : "스톱워치"} · {new Date(session.endTime).toLocaleString("ko-KR")}</span>
          </div>
          <b>{formatMinutes(session.durationMinutes)}</b>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   MaterialsView
   ============================================================ */
function MaterialsView({
  summaries, materials, selectedSummary, selectedSummaryId,
  uploadStatus, isSummarizing, onUpload, onSelectSummary, onDeleteSummary
}: {
  summaries: Summary[];
  materials: LearningMaterial[];
  selectedSummary?: Summary;
  selectedSummaryId: string;
  uploadStatus: string;
  isSummarizing: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectSummary: (id: string) => void;
  onDeleteSummary: (id: string) => void;
}) {
  const [selMats, setSelMats] = useState<string[]>([]);
  const [selSums, setSelSums] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);

  function toggleMat(id: string) { setSelMats(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function toggleSum(id: string) { setSelSums(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function togglePin(id: string) { setPinned(p => p.includes(id) ? p.filter(x => x !== id) : (p.length < 5 ? [...p, id] : p)); }

  const canPin = selSums.length > 0 && (selSums.every(id => pinned.includes(id)) || pinned.length < 5);
  const sortedSums = [
    ...summaries.filter(s => pinned.includes(s.summaryId)),
    ...summaries.filter(s => !pinned.includes(s.summaryId)),
  ];

  return (
    <div className="two-column view-enter">
      <section className="panel">
        <div className="section-heading"><h3>학습 자료 업로드</h3><span>PDF · 이미지 · TXT · MD</span></div>
        <label className={`upload-zone ${isSummarizing ? "busy" : ""}`}>
          <UploadCloud size={36} />
          <strong>{isSummarizing ? "요약 생성 중" : "파일 선택"}</strong>
          <span>{uploadStatus}</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md" onChange={onUpload} disabled={isSummarizing} />
        </label>
        <div className="list-block-sep" />
        <div className="list-block">
          <div className="list-block-head">
            <h4>업로드 자료</h4>
            <div className="list-block-actions">
              {selMats.length > 0 && (
                <button className="chip-button danger" onClick={() => setSelMats([])}>
                  <Trash2 size={13} />삭제 ({selMats.length})
                </button>
              )}
            </div>
          </div>
          {materials.length === 0
            ? <p className="empty-text">아직 업로드한 자료가 없습니다.</p>
            : materials.map(m => (
              <div className={`list-row mat-row ${selMats.includes(m.materialId) ? "is-selected" : ""}`} key={m.materialId}>
                <input type="checkbox" className="row-check" checked={selMats.includes(m.materialId)}
                  onChange={() => toggleMat(m.materialId)} aria-label={`${m.fileName} 선택`} />
                <UploadCloud size={17} />
                <div><strong>{m.fileName}</strong><span>{m.fileType} · {new Date(m.uploadedAt).toLocaleString("ko-KR")}</span></div>
              </div>
            ))
          }
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h3>저장된 요약</h3>
          <div className="sum-toolbar">
            {selSums.length > 0 && (
              <>
                <button className="chip-button" disabled={!canPin}
                  onClick={() => { selSums.forEach(id => togglePin(id)); setSelSums([]); }}>
                  <Pin size={13} />{selSums.every(id => pinned.includes(id)) ? "고정 해제" : `고정 ${pinned.length}/5`}
                </button>
                <button className="chip-button danger" onClick={() => setSelSums([])}>
                  <Trash2 size={13} />삭제 ({selSums.length})
                </button>
              </>
            )}
            <span className="sum-count">{summaries.length}개</span>
          </div>
        </div>
        <div className="split-list">
          <div className="summary-list">
            {summaries.length === 0
              ? <p className="empty-text">요약이 생성되면 이곳에 저장됩니다.</p>
              : sortedSums.map(s => (
                <div key={s.summaryId} className={`sum-row ${selSums.includes(s.summaryId) ? "is-selected" : ""}`}>
                  <input type="checkbox" className="row-check" checked={selSums.includes(s.summaryId)}
                    onChange={() => toggleSum(s.summaryId)} aria-label={`${s.title} 선택`} />
                  <button className={`summary-item ${s.summaryId === selectedSummaryId ? "active" : ""}`}
                    onClick={() => onSelectSummary(s.summaryId)}>
                    {pinned.includes(s.summaryId) && <span className="pin-dot"><Pin size={10} /></span>}
                    <strong>{s.title}</strong>
                    <span>{s.sourceType === "material" ? "자료 요약" : "노트 요약"}</span>
                  </button>
                </div>
              ))
            }
          </div>
          <div className="split-divider" />
          <article className="summary-detail">
            {selectedSummary ? (
              <>
                <div className="detail-title">
                  <div><h4>{selectedSummary.title}</h4><span>{new Date(selectedSummary.createdAt).toLocaleString("ko-KR")}</span></div>
                  <button className="icon-button danger" aria-label="요약 삭제" onClick={() => onDeleteSummary(selectedSummary.summaryId)}>
                    <Trash2 size={17} />
                  </button>
                </div>
                <MarkdownPreview content={selectedSummary.content} />
              </>
            ) : <p className="empty-text">조회할 요약을 선택하세요.</p>}
          </article>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   NotesView
   ============================================================ */
function NotesView({
  notes, selectedNote, selectedNoteId, noteDraft, quizzes,
  onSelectNote, onDraftChange, onSave, onNew, onDelete, onSummarize, onQuiz
}: {
  notes: StudyNote[];
  selectedNote?: StudyNote;
  selectedNoteId: string;
  noteDraft: { title: string; subject: string; markdownContent: string };
  quizzes: Quiz[];
  onSelectNote: (id: string) => void;
  onDraftChange: (d: { title: string; subject: string; markdownContent: string }) => void;
  onSave: () => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onSummarize: () => void;
  onQuiz: () => void;
}) {
  return (
    <div className="notes-layout view-enter">
      <section className="panel note-index">
        <div className="section-heading">
          <h3>노트 목록</h3>
          <button className="icon-button" aria-label="새 노트" onClick={onNew}><Plus size={17} /></button>
        </div>
        {notes.length === 0
          ? <p className="empty-text">첫 학습 노트를 작성해 보세요.</p>
          : notes.map(note => (
            <button key={note.noteId} className={`note-list-item ${note.noteId === selectedNoteId ? "active" : ""}`}
              onClick={() => onSelectNote(note.noteId)}>
              <strong>{note.title}</strong>
              <span>{note.subject} · {new Date(note.updatedAt).toLocaleDateString("ko-KR")}</span>
            </button>
          ))
        }
      </section>

      <section className="panel note-editor">
        <div className="editor-toolbar">
          <input value={noteDraft.title} onChange={e => onDraftChange({ ...noteDraft, title: e.target.value })} aria-label="노트 제목" />
          <select value={noteDraft.subject} onChange={e => onDraftChange({ ...noteDraft, subject: e.target.value })} aria-label="과목" style={{ maxWidth: 110 }}>
            {subjects.map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="primary-button" onClick={onSave}><Save size={16} /> 저장</button>
        </div>
        <textarea className="markdown-input" value={noteDraft.markdownContent}
          onChange={e => onDraftChange({ ...noteDraft, markdownContent: e.target.value })} aria-label="마크다운 노트 내용" />
        <div className="inline-actions">
          <button className="secondary-button" disabled={!selectedNote} onClick={onSummarize}><Bot size={16} /> 노트 요약</button>
          <button className="secondary-button" disabled={!selectedNote} onClick={onQuiz}><Sparkles size={16} /> 문제 생성</button>
          {selectedNote && (
            <button className="danger-button" onClick={() => onDelete(selectedNote.noteId)}><Trash2 size={16} /> 삭제</button>
          )}
        </div>
      </section>

      <section className="panel note-preview">
        <div className="section-heading"><h3>미리보기</h3><span>Markdown</span></div>
        <MarkdownPreview content={noteDraft.markdownContent} />
        <div className="quiz-box">
          <h4>복습 문제</h4>
          {quizzes.length === 0
            ? <p className="empty-text">문제를 생성하면 이곳에 표시됩니다.</p>
            : quizzes.map(q => (
              <details key={q.quizId}><summary>{q.question}</summary><p>{q.answer}</p></details>
            ))
          }
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   TimerView — Stopwatch / Timer / Pomodoro
   ============================================================ */
function TimerView({
  timerType, seconds, isRunning, subject, sessions,
  onTypeChange, onSubjectChange, onStart, onPause, onFinish, onReset
}: {
  timerType: TimerType;
  seconds: number;
  isRunning: boolean;
  subject: string;
  sessions: StudySession[];
  onTypeChange: (t: TimerType) => void;
  onSubjectChange: (s: string) => void;
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  onReset: () => void;
}) {
  const [timerMin, setTimerMin] = useState(30);
  const [pomoStudy, setPomoStudy] = useState(25);
  const [pomoBreak, setPomoBreak] = useState(5);
  const [pomoRepeat, setPomoRepeat] = useState(4);
  const [pomoPhase, setPomoPhase] = useState<"study" | "break">("study");
  const [pomoRound, setPomoRound] = useState(0);
  const [presets, setPresets] = useState([
    { id: "p1", name: "기본 25/5", study: 25, brk: 5, repeat: 4 },
    { id: "p2", name: "딥워크 50/10", study: 50, brk: 10, repeat: 3 },
  ]);

  function switchMode(m: TimerType) {
    onTypeChange(m);
    if (m === "STOPWATCH") onReset();
    else if (m === "TIMER") { onReset(); }
    else { onReset(); setPomoRound(0); setPomoPhase("study"); }
  }
  function applyPreset(p: typeof presets[0]) {
    setPomoStudy(p.study); setPomoBreak(p.brk); setPomoRepeat(p.repeat);
    setPomoRound(0); setPomoPhase("study"); onReset();
  }
  function savePreset() {
    if (presets.length >= 10) return;
    setPresets(ps => [...ps, { id: "p" + Date.now(), name: `${pomoStudy}분/${pomoBreak}분×${pomoRepeat}`, study: pomoStudy, brk: pomoBreak, repeat: pomoRepeat }]);
  }

  const POMO_FIELDS = [
    { label: "학습", val: pomoStudy, set: setPomoStudy, min: 1, max: 90, step: 5 },
    { label: "휴게", val: pomoBreak, set: setPomoBreak, min: 1, max: 30, step: 1 },
    { label: "반복", val: pomoRepeat, set: setPomoRepeat, min: 1, max: 12, step: 1, unit: "회" },
  ];

  return (
    <div className="timer-layout view-enter">
      <section className={`panel timer-panel${isRunning ? " timer-running" : ""}`}>
        <div className="segmented">
          <button className={timerType === "STOPWATCH" ? "active" : ""} onClick={() => switchMode("STOPWATCH")}>스톱워치</button>
          <button className={timerType === "TIMER" ? "active" : ""} onClick={() => switchMode("TIMER")}>타이머</button>
          <button className={timerType === "POMODORO" ? "active" : ""} onClick={() => switchMode("POMODORO")}>포모도로</button>
        </div>
        <select value={subject} onChange={e => onSubjectChange(e.target.value)} aria-label="과목" style={{ maxWidth: 200 }}>
          {subjects.map(s => <option key={s}>{s}</option>)}
        </select>

        {timerType === "TIMER" && (
          <div className="pomo-settings">
            <div className="pomo-row">
              <span>시간</span>
              <div className="pomo-input-group">
                <button className="pomo-step" onClick={() => setTimerMin(v => Math.max(1, v - 5))}>−</button>
                <input type="number" min={1} max={180} value={timerMin}
                  onChange={e => setTimerMin(Math.max(1, +e.target.value))} />
                <button className="pomo-step" onClick={() => setTimerMin(v => Math.min(180, v + 5))}>+</button>
                <span className="pomo-unit">분</span>
              </div>
            </div>
          </div>
        )}

        {timerType === "POMODORO" && (
          <div className="pomo-settings">
            {POMO_FIELDS.map(({ label, val, set, min, max, step, unit }) => (
              <div key={label} className="pomo-row">
                <span>{label}</span>
                <div className="pomo-input-group">
                  <button className="pomo-step" onClick={() => set(v => Math.max(min, v - step))}>−</button>
                  <input type="number" min={min} max={max} value={val}
                    onChange={e => set(Math.max(min, Math.min(max, +e.target.value)))} />
                  <button className="pomo-step" onClick={() => set(v => Math.min(max, v + step))}>+</button>
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

        {(() => {
          const R = 110, C = 2 * Math.PI * R;
          const totalSec = timerType === "TIMER" ? timerMin * 60
            : timerType === "POMODORO" ? (pomoPhase === "study" ? pomoStudy : pomoBreak) * 60
            : 0;
          const pct = totalSec > 0 ? Math.min(1, seconds / totalSec) : 0;
          const dashOffset = C * (1 - pct);
          return (
            <div className={`timer-ring${timerType === "POMODORO" && pomoPhase === "break" ? " break" : ""}`}>
              <svg viewBox="0 0 240 240">
                <circle className="ring-track" cx="120" cy="120" r={R} />
                {timerType !== "STOPWATCH" && (
                  <circle className="ring-fill" cx="120" cy="120" r={R}
                    strokeDasharray={C} strokeDashoffset={dashOffset} />
                )}
              </svg>
              <div className="timer-face">{formatTimer(seconds)}</div>
            </div>
          );
        })()}
        <div className="timer-actions">
          {isRunning
            ? <button className="secondary-button" onClick={onPause}><Pause size={17} /> 일시정지</button>
            : <button className="primary-button" onClick={onStart}><Play size={17} /> 시작</button>}
          <button className="secondary-button" onClick={onFinish}><Square size={17} /> 종료/기록</button>
          <button className="ghost-button" onClick={onReset}><TimerReset size={17} /> 초기화</button>
        </div>
      </section>

      <div className="timer-right">
        {timerType === "POMODORO" && (
          <section className="panel">
            <div className="section-heading">
              <h3>포모도로 프리셋</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{presets.length}/10</span>
                <button className="chip-button" disabled={presets.length >= 10} onClick={savePreset}>
                  <Pin size={13} />현재 고정
                </button>
              </div>
            </div>
            <div className="preset-list">
              {presets.length === 0 && <p className="empty-text">저장된 프리셋이 없습니다.</p>}
              {presets.map(p => (
                <div key={p.id} className="preset-row">
                  <button className="preset-btn" onClick={() => applyPreset(p)}>
                    <strong>{p.name}</strong>
                    <span>{p.study}분 학습 · {p.brk}분 휴식 · {p.repeat}회</span>
                  </button>
                  <button className="icon-button" onClick={() => setPresets(ps => ps.filter(x => x.id !== p.id))} aria-label="삭제">
                    <X size={14} />
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

/* ============================================================
   StatsView
   ============================================================ */
function StatsView({ sessions }: { sessions: StudySession[] }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);
  const monthly = sessions.filter(s => s.endTime.slice(0, 7) === monthStr).reduce((a, s) => a + s.durationMinutes, 0);

  const todaySess = sessions.filter(s => s.endTime.slice(0, 10) === todayStr);
  const pastSess = sessions.filter(s => {
    const ago = (Date.now() - new Date(s.endTime).getTime()) / 86400000;
    return ago > 0 && ago <= 30;
  });
  const subjectData = subjects.map(sub => {
    const todayMin = todaySess.filter(s => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0);
    const avgMin = pastSess.filter(s => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0) / 30;
    return { sub, todayMin, avgMin };
  }).filter(d => d.todayMin > 0 || d.avgMin > 0.5);

  const maxMin = Math.max(30, ...subjectData.map(d => Math.max(d.todayMin, d.avgMin)));

  const subjectTotals = subjects.map(sub => ({
    subject: sub,
    value: sessions.filter(s => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0),
  })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const maxSub = Math.max(30, ...subjectTotals.map(x => x.value));

  return (
    <div className="stats-grid view-enter">
      <section className="metric-card"><span>이번 달 학습</span><strong>{formatMinutes(monthly)}</strong><p>월간 누적</p></section>
      <section className="metric-card"><span>세션 수</span><strong>{sessions.length}회</strong><p>기록된 학습</p></section>

      <section className="panel chart-panel">
        <div className="section-heading"><h3>오늘 vs 평균 비교</h3><span>30일 평균 기준</span></div>
        {subjectData.length === 0
          ? <p className="empty-text">오늘 학습 기록이 없습니다.</p>
          : (
            <div className="horiz-chart">
              {subjectData.map(({ sub, todayMin, avgMin }) => {
                const todayPct = (todayMin / maxMin) * 100;
                const avgPct = (avgMin / maxMin) * 100;
                const aboveAvg = todayMin > avgMin && avgMin > 0;
                return (
                  <div key={sub} className="hc-row">
                    <div className="hc-label">{sub}</div>
                    <div className="hc-track">
                      {avgMin > 0 && <div className="hc-avg-bar" style={{ width: `${avgPct}%` }} />}
                      {todayMin > 0 && (
                        <div className="hc-today-bar" style={{ width: `${todayPct}%` }}>
                          {aboveAvg && <div className="hc-avg-marker" style={{ left: `${(avgPct / todayPct) * 100}%` }} />}
                        </div>
                      )}
                    </div>
                    <div className="hc-value">
                      <strong>{todayMin > 0 ? formatMinutes(todayMin) : "—"}</strong>
                      <span>평균 {formatMinutes(Math.round(avgMin))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </section>

      <section className="panel chart-panel">
        <div className="section-heading"><h3>과목별 누적 학습</h3><span>{subjectTotals.length}개 과목</span></div>
        <div className="subject-chart">
          {subjectTotals.length === 0
            ? <p className="empty-text">학습 세션을 기록하면 과목별 분석이 표시됩니다.</p>
            : subjectTotals.map(it => (
              <div className="subject-row" key={it.subject}>
                <span>{it.subject}</span>
                <div><i style={{ width: `${Math.max(10, (it.value / maxSub) * 100)}%` }} /></div>
                <strong>{it.value}분</strong>
              </div>
            ))
          }
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   MarkdownPreview
   ============================================================ */
function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="markdown-preview">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i}>{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i}>{line.slice(4)}</h3>;
        if (line.startsWith("- ")) return <p className="bullet-line" key={i}>{line.slice(2)}</p>;
        if (line.startsWith("> ")) return <blockquote key={i}>{line.slice(2)}</blockquote>;
        if (!line.trim()) return <br key={i} />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

/* ============================================================
   Anki dialog components
   ============================================================ */
function AnkiDialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="anki-dialog-overlay" onClick={onClose}>
      <div className="anki-dialog" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function AnkiTextDialog({ title, label, initial, placeholder, confirmLabel, onConfirm, onClose }: {
  title: string; label: string; initial?: string; placeholder?: string; confirmLabel: string;
  onConfirm: (v: string) => void; onClose: () => void;
}) {
  const [val, setVal] = useState(initial || "");
  const ok = val.trim().length > 0;
  return (
    <AnkiDialogShell title={title} onClose={onClose}>
      <label className="dialog-field">
        <span>{label}</span>
        <input autoFocus type="text" value={val} placeholder={placeholder} maxLength={60}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && ok) onConfirm(val.trim()); }} />
      </label>
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onClose}>취소</button>
        <button className="primary-button" disabled={!ok} onClick={() => onConfirm(val.trim())}>{confirmLabel}</button>
      </div>
    </AnkiDialogShell>
  );
}

function AnkiConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
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

function AnkiCardDialog({ title, deckId, decks, initial, confirmLabel, onConfirm, onClose }: {
  title: string;
  deckId: string;
  decks: { deckId: string; name: string }[];
  initial?: { type: "basic" | "cloze"; front?: string; back?: string; text?: string };
  confirmLabel: string;
  onConfirm: (deckId: string, type: "basic" | "cloze", front: string, back: string, text: string) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<"basic" | "cloze">(initial?.type || "basic");
  const [front, setFront] = useState(initial?.front || "");
  const [back, setBack] = useState(initial?.back || "");
  const [text, setText] = useState(initial?.text || "");
  const [dk, setDk] = useState(deckId);

  const ok = type === "cloze" ? /\{\{c\d+::/.test(text) : (front.trim() && back.trim());

  function submit() {
    if (!ok) return;
    onConfirm(dk, type, front.trim(), back.trim(), text.trim());
  }

  return (
    <AnkiDialogShell title={title} onClose={onClose}>
      <label className="dialog-field">
        <span>유형</span>
        <div className="type-seg">
          <button type="button" className={type === "basic" ? "active" : ""} onClick={() => setType("basic")}>기본</button>
          <button type="button" className={type === "cloze" ? "active" : ""} onClick={() => setType("cloze")}>빈칸 (Cloze)</button>
        </div>
      </label>
      {decks.length > 1 && (
        <label className="dialog-field">
          <span>덱</span>
          <select value={dk} onChange={e => setDk(e.target.value)}>
            {decks.map(d => <option key={d.deckId} value={d.deckId}>{d.name}</option>)}
          </select>
        </label>
      )}
      {type === "cloze" ? (
        <label className="dialog-field">
          <span>본문 ({"{{c1::정답}}"} 형식)</span>
          <textarea autoFocus rows={4} value={text} placeholder="예: 대한민국의 수도는 {{c1::서울}}이다."
            onChange={e => setText(e.target.value)} />
        </label>
      ) : (
        <>
          <label className="dialog-field">
            <span>앞면 (질문)</span>
            <textarea autoFocus rows={2} value={front} placeholder="앞면에 표시할 내용" onChange={e => setFront(e.target.value)} />
          </label>
          <label className="dialog-field">
            <span>뒷면 (정답)</span>
            <textarea rows={3} value={back} placeholder="뒷면에 표시할 내용" onChange={e => setBack(e.target.value)} />
          </label>
        </>
      )}
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onClose}>취소</button>
        <button className="primary-button" disabled={!ok} onClick={submit}>{confirmLabel}</button>
      </div>
    </AnkiDialogShell>
  );
}

/* ============================================================
   AnkiStats donut + review chart
   ============================================================ */
function AnkiStatsPanel({ anki }: { anki: AnkiState }) {
  const totals = anki.decks.map(d => {
    const cards = anki.cards.filter(c => c.deckId === d.deckId);
    const c = getDeckCounts(anki, d.deckId);
    return { id: d.deckId, name: d.name, new: c.new, learn: c.learn, due: c.review, total: cards.length };
  });
  const grand = totals.reduce((s, d) => s + d.total, 0);

  let acc = 0;
  const stops = totals.filter(d => d.total > 0).map((d, i) => {
    const start = (acc / (grand || 1)) * 100; acc += d.total;
    const end = (acc / (grand || 1)) * 100;
    return `${STAT_PALETTE[i % STAT_PALETTE.length]} ${start}% ${end}%`;
  }).join(", ");
  const conic = grand > 0 ? `conic-gradient(${stops})` : "var(--surface-2)";

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayLog = anki.reviewLog.filter(l => l.ts >= today.getTime());
  const gradeCounts = [0, 0, 0, 0];
  for (const l of todayLog) gradeCounts[l.grade]++;
  const totalGraded = gradeCounts.reduce((a, b) => a + b, 0) || 1;
  const gradeInfo = [
    { n: "Again", cls: "again", v: gradeCounts[0], color: "oklch(0.64 0.13 25)" },
    { n: "Hard",  cls: "hard",  v: gradeCounts[1], color: "oklch(0.72 0.13 70)" },
    { n: "Good",  cls: "good",  v: gradeCounts[2], color: "oklch(0.66 0.13 150)" },
    { n: "Easy",  cls: "easy",  v: gradeCounts[3], color: "oklch(0.62 0.13 240)" },
  ];

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
          <h3 className="panel-title">오늘의 복습 분포</h3>
          <span className="panel-meta">총 {todayLog.length}회</span>
        </div>
        <div style={{ padding: "20px 0" }}>
          <div className="grade-dist">
            {gradeInfo.map(g => (
              <div className="grade-row" key={g.cls}>
                <span className={`grade-badge ${g.cls}`}>{g.n}</span>
                <div className="grade-bar"><i className={g.cls} style={{ width: `${(g.v / totalGraded) * 100}%`, background: g.color }} /></div>
                <strong>{g.v}회</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   AnkiView — full redesign with dialogs (keeps real SRS)
   ============================================================ */
type AnkiDialog =
  | { kind: "addDeck" }
  | { kind: "renameDeck"; id: string; name: string }
  | { kind: "deleteDecks"; ids: string[] }
  | { kind: "addCard" }
  | { kind: "editCard"; noteId: string }
  | { kind: "deleteCard"; noteId: string };

function AnkiView({
  anki, setAnki, deckId, setDeckId, onStartReview
}: {
  anki: AnkiState;
  setAnki: React.Dispatch<React.SetStateAction<AnkiState>>;
  deckId: string;
  setDeckId: (id: string) => void;
  onStartReview: (id: string) => void;
}) {
  const [sub, setSub] = useState<"today" | "browse" | "stats">("today");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<AnkiDialog | null>(null);
  const close = () => setDialog(null);

  function mutate(fn: (s: AnkiState) => AnkiState) { setAnki(prev => fn({ ...prev })); }

  function doAddDeck(name: string) {
    const id = createAId("deck");
    mutate(s => ({ ...s, decks: [...s.decks, { deckId: id, name, createdAt: Date.now() }] }));
    setDeckId(id);
    close();
  }
  function doRenameDeck(id: string, name: string) {
    mutate(s => ({ ...s, decks: s.decks.map(d => d.deckId === id ? { ...d, name } : d) }));
    setSelected([]);
    close();
  }
  function doDeleteDecks(ids: string[]) {
    mutate(s => {
      const noteIds = new Set(s.cards.filter(c => ids.includes(c.deckId)).map(c => c.noteId));
      const newDecks = s.decks.filter(d => !ids.includes(d.deckId));
      const newId = newDecks[0]?.deckId ?? "";
      if (ids.includes(deckId)) setDeckId(newId);
      return {
        ...s,
        decks: newDecks,
        cards: s.cards.filter(c => !ids.includes(c.deckId)),
        notes: s.notes.filter(n => !noteIds.has(n.noteId)),
      };
    });
    setSelected([]);
    close();
  }
  function doAddCard(dk: string, type: "basic" | "cloze", front: string, back: string, text: string) {
    mutate(s => {
      if (type === "cloze") addClozeNote(s, dk, text, "", []);
      else addBasicNote(s, dk, front, back, []);
      return s;
    });
    close();
  }
  function doEditCard(noteId: string, type: "basic" | "cloze", front: string, back: string, text: string) {
    mutate(s => {
      const n = s.notes.find(x => x.noteId === noteId);
      if (!n) return s;
      if (type === "cloze") n.fields = { text, extra: "" };
      else n.fields = { front, back };
      return s;
    });
    close();
  }
  function doDeleteCard(noteId: string) {
    mutate(s => ({
      ...s,
      notes: s.notes.filter(n => n.noteId !== noteId),
      cards: s.cards.filter(c => c.noteId !== noteId),
    }));
    close();
  }

  const activeId = anki.decks.some(d => d.deckId === deckId) ? deckId : anki.decks[0]?.deckId ?? "";
  const activeDeck = anki.decks.find(d => d.deckId === activeId);
  const counts = activeDeck ? getDeckCounts(anki, activeId) : { new: 0, learn: 0, review: 0, total: 0 };
  const deckCards = anki.cards.filter(c => c.deckId === activeId);
  const deckNoteIds = [...new Set(deckCards.map(c => c.noteId))];
  const deckNotes = deckNoteIds.map(id => anki.notes.find(n => n.noteId === id)).filter(Boolean) as typeof anki.notes;

  function toggle(id: string) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }

  if (!anki.decks.length) {
    return (
      <>
        <div className="anki-empty">
          <LayersIcon size={36} color="var(--muted)" />
          <h2>덱이 없습니다</h2>
          <p>새 덱을 만들어 카드를 추가해 보세요.</p>
          <button className="primary-button" onClick={() => setDialog({ kind: "addDeck" })}>
            <Plus size={15} />새 덱 만들기
          </button>
        </div>
        {dialog?.kind === "addDeck" && (
          <AnkiTextDialog title="새 덱" label="덱 이름" placeholder="예: 전공 - 자료구조" confirmLabel="만들기"
            onClose={close} onConfirm={doAddDeck} />
        )}
      </>
    );
  }

  return (
    <div className="anki-page view-enter">
      <AnkiStatsPanel anki={anki} />

      <div className="anki-main-full">
        <div className="anki-seg-wrap">
          <div className="segmented">
            {(["today", "browse", "stats"] as const).map(v => (
              <button key={v} className={sub === v ? "active" : ""} onClick={() => setSub(v)}>
                {{ today: "덱", browse: "탐색", stats: "통계" }[v]}
              </button>
            ))}
            <button onClick={() => setDialog({ kind: "addCard" })}>추가</button>
          </div>
        </div>

        {sub === "today" && (
          <div className="anki-today">
            <div className="at-cards">
              <div className="at-card new"><span className="lbl">신규</span><strong>{counts.new}</strong><em>처음 보는 카드</em></div>
              <div className="at-card learn"><span className="lbl">학습 중</span><strong>{counts.learn}</strong><em>익히는 중</em></div>
              <div className="at-card due"><span className="lbl">복습</span><strong>{counts.review}</strong><em>기한 도래</em></div>
            </div>
            <section className="panel deck-panel" style={{ marginTop: 12 }}>
              <div className="panel-head">
                <h3 className="panel-title">덱</h3>
                <div className="panel-head-actions">
                  {selected.length === 1 && (
                    <button className="chip-button" onClick={() => {
                      const d = anki.decks.find(x => x.deckId === selected[0]);
                      if (d) setDialog({ kind: "renameDeck", id: d.deckId, name: d.name });
                    }}>
                      <Pencil size={13} />이름 변경
                    </button>
                  )}
                  {selected.length > 0 && (
                    <button className="chip-button danger" onClick={() => setDialog({ kind: "deleteDecks", ids: selected })}>
                      <Trash2 size={13} />삭제 ({selected.length})
                    </button>
                  )}
                  <button className="chip-button" onClick={() => setDialog({ kind: "addDeck" })}>
                    <Plus size={14} />덱 추가
                  </button>
                </div>
              </div>
              {selected.length > 0 && (
                <div className="deck-select-bar" style={{ marginBottom: 8 }}>
                  <span className="dsb-count">{selected.length}개 선택됨</span>
                  <div className="dsb-actions">
                    <button className="dsb-btn" onClick={() => setSelected([])}>선택 해제</button>
                    {selected.length === 1 && (
                      <button className="dsb-btn" onClick={() => {
                        const d = anki.decks.find(x => x.deckId === selected[0]);
                        if (d) setDialog({ kind: "renameDeck", id: d.deckId, name: d.name });
                      }}>이름 변경</button>
                    )}
                    <button className="dsb-btn danger" onClick={() => setDialog({ kind: "deleteDecks", ids: selected })}>삭제</button>
                  </div>
                </div>
              )}
              <div className="deck-rows">
                {anki.decks.map(d => {
                  const c = getDeckCounts(anki, d.deckId);
                  const isSel = selected.includes(d.deckId);
                  const dueTotal = c.new + c.learn + c.review;
                  return (
                    <div key={d.deckId} className={`deck-item ${d.deckId === activeId ? "active" : ""} ${isSel ? "selected" : ""}`}>
                      <input type="checkbox" className="deck-check" checked={isSel}
                        aria-label={`${d.name} 선택`} onChange={() => toggle(d.deckId)} />
                      <button className="deck-main" onClick={() => setDeckId(d.deckId)}>
                        <strong>{d.name}</strong>
                        <span className="deck-counts">
                          <i className="dc new">{c.new}</i>
                          <i className="dc learn">{c.learn}</i>
                          <i className="dc due">{c.review}</i>
                        </span>
                      </button>
                      <button className="deck-study" disabled={dueTotal === 0} onClick={() => onStartReview(d.deckId)}>학습</button>
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
                <select value={activeId} aria-label="덱 선택" onChange={e => setDeckId(e.target.value)}>
                  {anki.decks.map(d => (
                    <option key={d.deckId} value={d.deckId}>{d.name} ({anki.cards.filter(c => c.deckId === d.deckId).length}장)</option>
                  ))}
                </select>
              </div>
              <div className="panel-head-actions">
                <span className="panel-meta">{deckNotes.length}장</span>
                <button className="chip-button" onClick={() => setDialog({ kind: "addCard" })}>
                  <Plus size={14} />카드 추가
                </button>
              </div>
            </div>
            {deckNotes.length === 0
              ? <p className="empty-line">아직 카드가 없습니다. '추가'로 첫 카드를 만들어 보세요.</p>
              : (
                <div className="card-rows">
                  {deckNotes.map(n => {
                    const frontText = n.type === "cloze"
                      ? (n.fields.text || "").replace(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/g, "____")
                      : (n.fields.front || "");
                    const backText = n.type === "cloze" ? n.fields.extra || "" : (n.fields.back || "");
                    const cs = anki.cards.filter(c => c.noteId === n.noteId);
                    const pip = cs.some(c => c.state === "review") ? "due" : cs.some(c => c.state === "learn") ? "learn" : "new";
                    const interval = cs[0]?.interval ?? 0;
                    return (
                      <div className="card-row" key={n.noteId}>
                        <span className={`state-pip ${pip}`} />
                        <div className="card-row-text">
                          <span className="card-row-front">{frontText.slice(0, 80)}</span>
                          <span className="card-row-back">{backText.slice(0, 60)}</span>
                        </div>
                        <span className={`card-kind-tag ${n.type === "cloze" ? "cloze" : "basic"}`}>
                          {n.type === "cloze" ? "빈칸" : "기본"}
                        </span>
                        <span className="log-int">{interval}일</span>
                        <div className="card-row-actions">
                          <button aria-label="카드 편집" title="편집" onClick={() => setDialog({ kind: "editCard", noteId: n.noteId })}>
                            <Pencil size={14} />
                          </button>
                          <button aria-label="카드 삭제" title="삭제" onClick={() => setDialog({ kind: "deleteCard", noteId: n.noteId })}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </section>
        )}

        {sub === "stats" && (
          <section className="panel">
            <div className="panel-head"><h3 className="panel-title">복습 분포</h3><span className="panel-meta">최근 30일</span></div>
            {(() => {
              const thirtyDaysAgo = Date.now() - 30 * 86400000;
              const recentLog = anki.reviewLog.filter(l => l.ts >= thirtyDaysAgo);
              const grades = [0, 0, 0, 0];
              for (const l of recentLog) grades[l.grade]++;
              const totalG = grades.reduce((a, b) => a + b, 0) || 1;
              return (
                <div className="grade-dist">
                  {[["Again", "again", grades[0]], ["Hard", "hard", grades[1]], ["Good", "good", grades[2]], ["Easy", "easy", grades[3]]].map(([lbl, cls, v]) => (
                    <div className="grade-row" key={cls as string}>
                      <span className={`grade-badge ${cls}`}>{lbl}</span>
                      <div className="grade-bar"><i className={cls as string} style={{ width: `${(+v / totalG) * 100}%` }} /></div>
                      <strong>{v}회</strong>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        )}
      </div>

      {/* Dialogs */}
      {dialog?.kind === "addDeck" && (
        <AnkiTextDialog title="새 덱" label="덱 이름" placeholder="예: 전공 - 자료구조" confirmLabel="만들기"
          onClose={close} onConfirm={doAddDeck} />
      )}
      {dialog?.kind === "renameDeck" && (
        <AnkiTextDialog title="덱 이름 변경" label="덱 이름" initial={dialog.name} confirmLabel="저장"
          onClose={close} onConfirm={name => doRenameDeck(dialog.id, name)} />
      )}
      {dialog?.kind === "deleteDecks" && (
        <AnkiConfirmDialog title="덱 삭제" danger confirmLabel="삭제"
          message={`선택한 ${dialog.ids.length}개 덱과 모든 카드가 삭제됩니다. 되돌릴 수 없습니다.`}
          onClose={close} onConfirm={() => doDeleteDecks(dialog.ids)} />
      )}
      {dialog?.kind === "addCard" && (
        <AnkiCardDialog title="카드 추가" deckId={activeId} decks={anki.decks} confirmLabel="추가"
          onClose={close} onConfirm={doAddCard} />
      )}
      {dialog?.kind === "editCard" && (() => {
        const n = anki.notes.find(x => x.noteId === dialog.noteId);
        if (!n) return null;
        return (
          <AnkiCardDialog title="카드 편집" deckId={activeId} decks={anki.decks}
            initial={{ type: n.type, front: n.fields.front, back: n.fields.back, text: n.fields.text }}
            confirmLabel="저장"
            onClose={close} onConfirm={(dk, type, front, back, text) => doEditCard(dialog.noteId, type, front, back, text)} />
        );
      })()}
      {dialog?.kind === "deleteCard" && (
        <AnkiConfirmDialog title="카드 삭제" danger confirmLabel="삭제"
          message="이 카드를 삭제합니다. 되돌릴 수 없습니다."
          onClose={close} onConfirm={() => doDeleteCard(dialog.noteId)} />
      )}
    </div>
  );
}

/* ============================================================
   ReviewModal
   ============================================================ */
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
            <CheckCircle2 size={48} color="oklch(0.55 0.14 155)" />
            <h3>오늘 복습 완료!</h3>
            <p>{totalReviewed}장 평가했습니다. 내일 또 만나요.</p>
            <button className="primary-button" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <>
            <div className="card-body">
              <div className="card-front" dangerouslySetInnerHTML={{ __html: fb?.front ?? "" }} />
              <div className={`card-back ${backShown ? "show" : ""}`} dangerouslySetInnerHTML={{ __html: fb?.back ?? "" }} />
            </div>
            <div className="card-actions">
              {!backShown ? (
                <button className="primary-button" onClick={onReveal} style={{ width: "100%", minHeight: 44 }}>
                  정답 보기 <span style={{ opacity: 0.5, fontSize: 11 }}>(Space)</span>
                </button>
              ) : (
                <div className="grade-buttons">
                  {([0, 1, 2, 3] as AnkiGrade[]).map(g => {
                    const labels = ["Again", "Hard", "Good", "Easy"];
                    const subs = ["다시", "어려움", "알맞음", "쉬움"];
                    const cls = ["again", "hard", "good", "easy"];
                    return (
                      <button key={g} className={`grade-btn ${cls[g]}`} onClick={() => onGrade(g)}>
                        {labels[g]}
                        <em>{subs[g]}</em>
                        <small>{g + 1}</small>
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

/* ============================================================
   Helper functions
   ============================================================ */
function buildHeatDates(view: HeatView, refDate: Date): Array<Date | null> {
  if (view === "year") {
    const start = new Date(refDate.getFullYear(), 0, 1);
    const end = new Date(refDate.getFullYear(), 11, 31);
    const dates: Array<Date | null> = Array.from({ length: start.getDay() }, () => null);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    return dates;
  }
  if (view === "month") {
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
    const dates: Array<Date | null> = Array.from({ length: start.getDay() }, () => null);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    return dates;
  }
  const start = new Date(refDate);
  start.setDate(refDate.getDate() - refDate.getDay());
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
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

function formatTimer(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

/* ============================================================
   Main App
   ============================================================ */
export default function Home() {
  const [state, setState] = useState<AppState>(initialState);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedSummaryId, setSelectedSummaryId] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [noteDraft, setNoteDraft] = useState({ title: "새 학습 노트", subject: "기타", markdownContent: "## 오늘의 핵심\n- " });
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [uploadStatus, setUploadStatus] = useState("학습 자료를 업로드하면 AI 요약을 바로 생성합니다.");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [timerType, setTimerType] = useState<TimerType>("STOPWATCH");
  const [timerSubject, setTimerSubject] = useState("전공");
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const timerStartRef = useRef<Date | null>(null);

  // Anki state
  const [anki, setAnki] = useState<AnkiState>(makeDefaultAnkiState);
  const [ankiLoaded, setAnkiLoaded] = useState(false);
  const [ankiUserId, setAnkiUserId] = useState<string | null>(null);
  const [ankiDeckId, setAnkiDeckId] = useState("");
  const [reviewQueue, setReviewQueue] = useState<AnkiCard[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewBack, setReviewBack] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const currentUser = state.user;

  useEffect(() => { void syncAuthSession(); }, []);

  useEffect(() => {
    if (!currentUser) {
      setAnki(makeDefaultAnkiState());
      setAnkiDeckId("");
      setAnkiUserId(null);
      setAnkiLoaded(false);
      return;
    }

    setAnkiLoaded(false);
    const loaded = loadAnkiFromStorage(currentUser.userId);
    setAnki(loaded);
    setAnkiDeckId(loaded.activeDeckId || (loaded.decks[0]?.deckId ?? ""));
    setAnkiUserId(currentUser.userId);
    setAnkiLoaded(true);
  }, [currentUser?.userId]);

  useEffect(() => {
    if (!ankiLoaded || !currentUser || ankiUserId !== currentUser.userId) return;
    saveAnkiToStorage(anki, currentUser.userId);
  }, [anki, ankiLoaded, ankiUserId, currentUser?.userId]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setSeconds(v => timerType === "POMODORO" || timerType === "TIMER" ? Math.max(0, v - 1) : v + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, timerType]);

  useEffect(() => {
    if ((timerType === "POMODORO" || timerType === "TIMER") && isRunning && seconds === 0) {
      finishTimer();
    }
  }, [seconds, isRunning, timerType]);

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

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function loadRemoteState() {
      try {
        const response = await fetch(`/api/store?userId=${encodeURIComponent(currentUser!.userId)}`);
        if (!response.ok) throw new Error("Remote state request failed");
        const data = (await response.json()) as Omit<AppState, "user">;
        if (!cancelled) {
          setState(prev => prev.user?.userId === currentUser!.userId ? { ...prev, ...data } : prev);
        }
      } catch {
        // connection failed — swallow silently
      }
    }
    void loadRemoteState();
    return () => { cancelled = true; };
  }, [currentUser?.userId]);

  const userSessions = useMemo(
    () => state.sessions.filter(s => s.userId === currentUser?.userId),
    [state.sessions, currentUser?.userId]
  );
  const userMaterials = useMemo(
    () => state.materials.filter(m => m.userId === currentUser?.userId),
    [state.materials, currentUser?.userId]
  );
  const userSummaries = useMemo(
    () => state.summaries.filter(s => s.userId === currentUser?.userId),
    [state.summaries, currentUser?.userId]
  );
  const userNotes = useMemo(
    () => state.notes.filter(n => n.userId === currentUser?.userId),
    [state.notes, currentUser?.userId]
  );
  const userQuizzes = useMemo(
    () => state.quizzes.filter(q => q.userId === currentUser?.userId),
    [state.quizzes, currentUser?.userId]
  );
  const character = useMemo(
    () => calculateCharacter(currentUser?.userId ?? "guest", userSessions),
    [currentUser?.userId, userSessions]
  );
  const attendance = useMemo(
    () => new Set(userSessions.map(s => s.endTime.slice(0, 10))).size,
    [userSessions]
  );
  const selectedSummary = userSummaries.find(s => s.summaryId === selectedSummaryId) ?? userSummaries[0];
  const selectedNote = userNotes.find(n => n.noteId === selectedNoteId) ?? userNotes[0];
  const noteQuizzes = userQuizzes.filter(q => q.noteId === selectedNote?.noteId);

  useEffect(() => {
    if (selectedNote) {
      setNoteDraft({ title: selectedNote.title, subject: selectedNote.subject, markdownContent: selectedNote.markdownContent });
    }
  }, [selectedNote?.noteId]);

  async function syncAuthSession() {
    const session = await getSession();
    const sessionUser = session?.user as SessionUser | undefined;
    const provider = sessionUser?.provider?.toUpperCase() as AuthProvider | undefined;

    if (!sessionUser) {
      const guestUser = readStoredGuestUser();
      if (guestUser) setState({ ...initialState, user: guestUser });
      return;
    }

    if (provider !== "GOOGLE" && provider !== "KAKAO" && provider !== "NAVER") return;

    const providerAccountId = sessionUser?.providerAccountId ?? sessionUser?.email ?? sessionUser?.name;
    if (!providerAccountId) return;

    const email = sessionUser?.email ?? `${providerAccountId}@${provider.toLowerCase()}.local`;
    const user: User = {
      userId: `${provider.toLowerCase()}_${providerAccountId}`,
      email,
      nickname: sessionUser?.name ?? email.split("@")[0],
      provider,
      createdAt: new Date().toISOString(),
    };

    setState({ ...initialState, user });
    await persistStore({ operation: "login", user });
  }

  async function login(provider: AuthProvider) {
    if (provider === "GUEST") {
      const user = buildGuestUser(nicknameDraft);
      saveStoredGuestUser(user);
      setState({ ...initialState, user });
      await persistStore({ operation: "login", user });
      return;
    }

    await signIn(provider.toLowerCase(), { callbackUrl: "/" });
  }

  function readStoredGuestUser() {
    const storage = getGuestStorage();
    if (!storage) return null;

    try {
      const raw = storage.getItem(GUEST_USER_STORAGE_KEY);
      if (!raw) return null;

      const user = JSON.parse(raw) as Partial<User>;
      if (
        user.provider === "GUEST" &&
        user.userId &&
        user.email &&
        user.nickname &&
        user.createdAt
      ) {
        return user as User;
      }
    } catch {
      // Ignore malformed local guest data.
    }

    return null;
  }

  function buildGuestUser(nickname: string): User {
    const trimmedNickname = nickname.trim();
    const storedGuestUser = readStoredGuestUser();

    if (storedGuestUser) {
      return {
        ...storedGuestUser,
        nickname: trimmedNickname || storedGuestUser.nickname,
      };
    }

    const guestId = globalThis.crypto?.randomUUID?.() ?? createId("guest");

    return {
      userId: `guest_${guestId}`,
      email: `${guestId}@guest.local`,
      nickname: trimmedNickname || "Guest",
      provider: "GUEST",
      createdAt: new Date().toISOString(),
    };
  }

  function saveStoredGuestUser(user: User) {
    const storage = getGuestStorage();
    if (!storage) return;
    storage.setItem(GUEST_USER_STORAGE_KEY, JSON.stringify(user));
  }

  function getGuestStorage() {
    if (typeof window === "undefined") return null;

    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  }

  async function logout() {
    setIsRunning(false);
    if (currentUser?.provider === "GUEST") getGuestStorage()?.removeItem(GUEST_USER_STORAGE_KEY);
    setState(initialState);
    const session = await getSession();
    if (session) await signOut({ callbackUrl: "/" });
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;
    const validation = validateUpload(file);
    if (!validation.ok) { setUploadStatus(validation.message); event.target.value = ""; return; }
    setIsSummarizing(true);
    setUploadStatus("파일을 읽고 AI 요약을 생성하는 중입니다.");
    const extractedText = await readFileForSummary(file, validation.fileType);
    const material: LearningMaterial = {
      materialId: createId("material"), userId: currentUser.userId, fileName: file.name,
      fileType: validation.fileType, extractedText, uploadedAt: new Date().toISOString(),
    };
    const content = await requestSummary(file.name, extractedText);
    const summary: Summary = {
      summaryId: createId("summary"), userId: currentUser.userId, materialId: material.materialId,
      title: file.name.replace(/\.[^.]+$/, ""), content, sourceType: "material", createdAt: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, materials: [material, ...prev.materials], summaries: [summary, ...prev.summaries] }));
    setSelectedSummaryId(summary.summaryId);
    setUploadStatus("요약이 생성되어 저장되었습니다.");
    setIsSummarizing(false);
    void persistStore({ operation: "saveMaterialSummary", userId: currentUser.userId, material, summary });
    event.target.value = "";
  }

  async function readFileForSummary(file: File, fileType: LearningMaterial["fileType"]) {
    if (fileType === "TXT" || fileType === "MD") return file.text();
    if (fileType === "IMAGE") return `이미지 학습 자료: ${file.name}.`;
    return `PDF 학습 자료: ${file.name}.`;
  }

  async function requestSummary(title: string, content: string) {
    try {
      const res = await fetch("/api/ai/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content }) });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { summary: string };
      return data.summary;
    } catch {
      return summarizeLocally(title, content);
    }
  }

  async function persistStore(payload: Record<string, unknown>) {
    try {
      const res = await fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      
    } catch {
      // store failed — swallow silently
    }
  }

  async function saveNote() {
    if (!currentUser || !noteDraft.title.trim()) return;
    const now = new Date().toISOString();
    if (selectedNote) {
      const updatedNote: StudyNote = { ...selectedNote, ...noteDraft, title: noteDraft.title.trim(), updatedAt: now };
      setState(prev => ({ ...prev, notes: prev.notes.map(n => n.noteId === selectedNote.noteId ? updatedNote : n) }));
      void persistStore({ operation: "upsertNote", userId: currentUser.userId, note: updatedNote });
      return;
    }
    const note: StudyNote = {
      noteId: createId("note"), userId: currentUser.userId, title: noteDraft.title.trim(),
      subject: noteDraft.subject, markdownContent: noteDraft.markdownContent, updatedAt: now,
    };
    setState(prev => ({ ...prev, notes: [note, ...prev.notes] }));
    setSelectedNoteId(note.noteId);
    void persistStore({ operation: "upsertNote", userId: currentUser.userId, note });
  }

  function newNote() {
    setSelectedNoteId("");
    setNoteDraft({ title: "새 학습 노트", subject: "기타", markdownContent: "## 오늘의 핵심\n- " });
  }

  function deleteNote(noteId: string) {
    if (!currentUser) return;
    setState(prev => ({ ...prev, notes: prev.notes.filter(n => n.noteId !== noteId), quizzes: prev.quizzes.filter(q => q.noteId !== noteId), summaries: prev.summaries.filter(s => s.noteId !== noteId) }));
    setSelectedNoteId("");
    void persistStore({ operation: "deleteNote", userId: currentUser.userId, noteId });
  }

  async function summarizeNote() {
    if (!currentUser || !selectedNote) return;
    const content = await requestSummary(selectedNote.title, selectedNote.markdownContent);
    const summary: Summary = {
      summaryId: createId("summary"), userId: currentUser.userId, noteId: selectedNote.noteId,
      title: `${selectedNote.title} 노트 요약`, content, sourceType: "note", createdAt: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, summaries: [summary, ...prev.summaries] }));
    setSelectedSummaryId(summary.summaryId);
    setActiveTab("materials");
    void persistStore({ operation: "addSummary", userId: currentUser.userId, summary });
  }

  async function generateQuiz() {
    if (!currentUser || !selectedNote) return;
    const res = await fetch("/api/ai/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: selectedNote.title, content: selectedNote.markdownContent }) });
    const data = (await res.json()) as { quizzes: Array<{ question: string; answer: string }> };
    const generated: Quiz[] = data.quizzes.map(q => ({ quizId: createId("quiz"), userId: currentUser.userId, noteId: selectedNote.noteId, question: q.question, answer: q.answer, createdAt: new Date().toISOString() }));
    setState(prev => ({ ...prev, quizzes: [...generated, ...prev.quizzes] }));
    void persistStore({ operation: "addQuizzes", userId: currentUser.userId, quizzes: generated });
  }

  function deleteSummary(summaryId: string) {
    if (!currentUser) return;
    setState(prev => ({ ...prev, summaries: prev.summaries.filter(s => s.summaryId !== summaryId) }));
    setSelectedSummaryId("");
    void persistStore({ operation: "deleteSummary", userId: currentUser.userId, summaryId });
  }

  function startTimer() { timerStartRef.current = new Date(); setIsRunning(true); }
  function pauseTimer() { setIsRunning(false); }
  function resetTimer() {
    setIsRunning(false);
    setSeconds(timerType === "POMODORO" || timerType === "TIMER" ? 25 * 60 : 0);
    timerStartRef.current = null;
  }
  function finishTimer() {
    if (!currentUser) return;
    const started = timerStartRef.current ?? new Date(Date.now() - seconds * 1000);
    const durationMinutes = (timerType === "POMODORO" || timerType === "TIMER") ? 25 : Math.max(1, Math.round(seconds / 60));
    const session: StudySession = {
      sessionId: createId("session"), userId: currentUser.userId, subject: timerSubject,
      timerType, startTime: started.toISOString(), endTime: new Date().toISOString(), durationMinutes,
    };
    setState(prev => ({ ...prev, sessions: [session, ...prev.sessions] }));
    void persistStore({ operation: "addSession", userId: currentUser.userId, session });
    resetTimer();
  }
  function switchTimerType(nextType: TimerType) {
    setTimerType(nextType);
    setIsRunning(false);
    setSeconds(nextType === "POMODORO" || nextType === "TIMER" ? 25 * 60 : 0);
  }

  /* ---- Login screen ---- */
  if (!currentUser) {
    return (
      <main className="auth-shell">
        <div className="auth-aurora" />
        <section className="auth-panel">
          <div className="brand-mark"><Sparkles size={28} /></div>
          <h1>AI 학습 어시스턴트</h1>
          <p>자료 요약, 노트 복습, Anki 카드, 타이머 기록, 캐릭터 성장까지 한 흐름으로 관리합니다.</p>
          <div className="nickname-row">
            <label htmlFor="nickname">닉네임</label>
            <input id="nickname" type="text" placeholder="화면에 표시할 이름" maxLength={20} autoComplete="nickname"
              value={nicknameDraft} onChange={e => setNicknameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void login("GUEST"); }} />
            <span className="nickname-hint">비우고 진행하면 기본 이름이 사용됩니다.</span>
          </div>
          <div className="auth-actions">
            <button className="provider-button guest" onClick={() => void login("GUEST")}>
              <Sparkles size={16} />
              게스트로 시작
            </button>
            <button className="provider-button google" onClick={() => void login("GOOGLE")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M21.35 11.1H12v3.8h5.32c-.23 1.49-1.7 4.36-5.32 4.36-3.2 0-5.81-2.65-5.81-5.92s2.61-5.92 5.81-5.92c1.82 0 3.04.78 3.74 1.44l2.55-2.46C16.78 4.74 14.62 3.7 12 3.7c-4.79 0-8.67 3.88-8.67 8.67S7.21 21.04 12 21.04c5 0 8.32-3.51 8.32-8.46 0-.57-.06-1-.13-1.48z" /></svg>
              Google로 시작
            </button>
            <button className="provider-button kakao" onClick={() => void login("KAKAO")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#2c2100"><path d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.84 5.32 4.6 6.74-.2.71-.73 2.57-.83 2.97-.13.5.18.5.39.36.16-.1 2.55-1.73 3.58-2.43.74.11 1.5.16 2.26.16 5.52 0 10-3.58 10-8s-4.48-7.8-10-7.8z" /></svg>
              Kakao로 시작
            </button>
            <button className="provider-button naver" onClick={() => void login("NAVER")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M16.273 12.845 7.376 0H0v24h7.726V11.155L16.624 24H24V0h-7.727z" /></svg>
              Naver로 시작
            </button>
          </div>
          <p className="footer-note">로그인 정보는 이 브라우저에만 저장됩니다 (데모용).<br />실제 OAuth 연동은 백엔드 설정 후 가능합니다.</p>
        </section>
      </main>
    );
  }

  /* ---- Main app ---- */
  return (
    <div className="app">
      <Sidebar activeTab={activeTab} onTab={setActiveTab} user={currentUser} attendance={attendance} onLogout={logout} />

      <main className="main">
        {activeTab === "overview" ? (
          <>
            <header className="page-header">
              <div className="title-wrap">
                <p className="eyebrow">Personal learning dashboard</p>
                <h1 className="page-title">학습 대시보드</h1>
                <SessionClock />
              </div>
              <ActivityHeatmap sessions={userSessions} />
            </header>
            <Overview
              character={character}
              sessions={userSessions}
              anki={anki}
              onGoAnki={() => { setActiveTab("anki"); startReview(ankiDeckId); }}
            />
          </>
        ) : (
          <header className="topbar">
            <div>
              <p className="eyebrow">Personal learning cockpit</p>
              <h2>{TAB_TITLES[activeTab]}</h2>
            </div>
            <SessionClock />
          </header>
        )}

        {activeTab === "materials" && (
          <MaterialsView
            summaries={userSummaries} materials={userMaterials}
            selectedSummary={selectedSummary} selectedSummaryId={selectedSummaryId}
            uploadStatus={uploadStatus} isSummarizing={isSummarizing}
            onUpload={handleUpload} onSelectSummary={setSelectedSummaryId} onDeleteSummary={deleteSummary}
          />
        )}

        {activeTab === "notes" && (
          <NotesView
            notes={userNotes} selectedNote={selectedNote} selectedNoteId={selectedNoteId}
            noteDraft={noteDraft} quizzes={noteQuizzes}
            onSelectNote={setSelectedNoteId} onDraftChange={setNoteDraft}
            onSave={saveNote} onNew={newNote} onDelete={deleteNote}
            onSummarize={summarizeNote} onQuiz={generateQuiz}
          />
        )}

        {activeTab === "timer" && (
          <TimerView
            timerType={timerType} seconds={seconds} isRunning={isRunning}
            subject={timerSubject} sessions={userSessions}
            onTypeChange={switchTimerType} onSubjectChange={setTimerSubject}
            onStart={startTimer} onPause={pauseTimer} onFinish={finishTimer} onReset={resetTimer}
          />
        )}

        {activeTab === "stats" && <StatsView sessions={userSessions} />}

        {activeTab === "anki" && (
          <AnkiView
            anki={anki} setAnki={setAnki}
            deckId={ankiDeckId} setDeckId={setAnkiDeckId}
            onStartReview={startReview}
          />
        )}
      </main>

      {reviewOpen && (
        <ReviewModal
          queue={reviewQueue} idx={reviewIdx} backShown={reviewBack} anki={anki}
          onReveal={() => setReviewBack(true)} onGrade={ankiGrade} onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}
