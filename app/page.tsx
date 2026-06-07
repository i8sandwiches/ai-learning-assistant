"use client";

import {
  ArrowLeft,
  BarChart3,
  Bell,
  BookmarkPlus,
  BookOpenText,
  Bot,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Code,
  Copy,
  Download,
  FileText,
  Flame,
  Folder,
  FolderInput,
  FolderPlus,
  LayersIcon,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Save,
  Scroll,
  Send,
  Settings,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  TimerReset,
  Trash2,
  UploadCloud,
  X,
  type LucideProps,
} from "lucide-react";
import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import {
  AnkiCard,
  AnkiGrade,
  AnkiState,
  AppState,
  AuthProvider,
  CharacterState,
  LearningMaterial,
  StudyClock,
  StudyNote,
  StudySession,
  Summary,
  TimerType,
  TimerFav,
  TimerPreset,
  TimetableBlock,
  User,
  UserPreferences,
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
} from "@/lib/study";

/* ============================================================
   Icon — maps prototype string names to lucide-react components
   ============================================================ */
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  "arrow-left": ArrowLeft, "bar-chart-3": BarChart3, bell: Bell, "bookmark-plus": BookmarkPlus,
  "book-open-text": BookOpenText, bot: Bot, "calendar-days": CalendarDays, camera: Camera,
  check: Check, "check-circle-2": CheckCircle2, "chevron-down": ChevronDown, "chevron-right": ChevronRight,
  "circle-dot": CircleDot, clock: Clock, code: Code, copy: Copy, download: Download, "file-text": FileText,
  flame: Flame, folder: Folder, "folder-input": FolderInput, "folder-plus": FolderPlus, layers: LayersIcon,
  loader: Loader2, "loader-2": Loader2, "log-out": LogOut, menu: Menu, "message-square": MessageSquare,
  "more-horizontal": MoreHorizontal, paperclip: Paperclip, pause: Pause, pencil: Pencil, pin: Pin,
  play: Play, plus: Plus, "rotate-ccw": RotateCcw, save: Save, scroll: Scroll, send: Send,
  settings: Settings, "settings-2": Settings2, "shield-check": ShieldCheck, sparkles: Sparkles,
  square: Square, star: Star, "timer-reset": TimerReset, "trash-2": Trash2, "upload-cloud": UploadCloud, x: X,
};
function Icon({ name, size = 16, color, style, className }: {
  name: string; size?: number; color?: string; style?: React.CSSProperties; className?: string;
}) {
  const Cmp = ICONS[name] ?? Square;
  return <span className={`lucide-host${className ? " " + className : ""}`} style={{ display: "inline-flex", ...style }}><Cmp size={size} color={color} /></span>;
}
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => { ref.current = value; });
  return ref.current;
}

/* ============================================================
   Toast host
   ============================================================ */
type ToastItem = { id: string; message: string; icon: string; accent: boolean; out?: boolean };
let _toastPush: ((message: string, opts?: { icon?: string; accent?: boolean }) => void) | null = null;
function pushToast(message: string, opts: { icon?: string; accent?: boolean } = {}) { _toastPush?.(message, opts); }
function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    _toastPush = (message, opts = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(t => [...t, { id, message, icon: opts.icon || "check-circle-2", accent: !!opts.accent }]);
      setTimeout(() => setToasts(t => t.map(x => x.id === id ? { ...x, out: true } : x)), 2600);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2900);
    };
    return () => { _toastPush = null; };
  }, []);
  return (
    <div className="toast-host">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.accent ? "accent" : ""} ${t.out ? "out" : ""}`}>
          <span className="t-ico"><Icon name={t.icon} size={17} /></span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Constants
   ============================================================ */
const MIN_WAGE = 10030;
const SCHED_COLORS = ["#e0533a", "#e8902f", "#d9b008", "#3fa45b", "#3b78d9", "#9a59c2"];
const STAT_PALETTE = [
  "oklch(0.70 0.13 200)", "oklch(0.70 0.13 150)", "oklch(0.72 0.13 70)",
  "oklch(0.68 0.14 25)", "oklch(0.66 0.13 285)", "oklch(0.70 0.13 330)",
];
const NOTIFICATIONS = [
  { id: "n1", icon: "layers", title: "오늘 복습할 Anki 카드가 기다리고 있어요.", time: "방금 전", unread: true },
  { id: "n2", icon: "flame", title: "어제 학습으로 연속 출석이 이어졌어요.", time: "어제", unread: true },
  { id: "n3", icon: "sparkles", title: "루미가 새로운 단계에 도달했어요.", time: "2일 전", unread: false },
  { id: "n4", icon: "check-circle-2", title: "지난주 학습 요약 리포트가 준비되었습니다.", time: "3일 전", unread: false },
];

const DEFAULT_CATEGORIES = ["국어", "영어", "수학", "과학", "사회", "전공", "자격증", "기타"];
const DEFAULT_PRESETS: TimerPreset[] = [
  { id: "p1", name: "기본 25/5", study: 25, brk: 5, repeat: 4 },
  { id: "p2", name: "딥워크 50/10", study: 50, brk: 10, repeat: 3 },
];
const DEFAULT_TIMER_FAVS: TimerFav[] = [
  { id: "t1", name: "25분 집중", h: 0, m: 25, s: 0 },
  { id: "t2", name: "5분 휴식", h: 0, m: 5, s: 0 },
];
const makeDefaultPreferences = (): UserPreferences => ({
  timetable: {},
  scheds: {},
  categories: DEFAULT_CATEGORIES,
  presets: DEFAULT_PRESETS,
  timerFavs: DEFAULT_TIMER_FAVS,
});

const NAV_ITEMS = [
  { id: "overview",   icon: "bar-chart-3",    label: "대시보드" },
  { id: "timetable",  icon: "calendar-days",  label: "시간표" },
  { id: "timer",      icon: "clock",          label: "포모도로" },
  { id: "notes",      icon: "book-open-text", label: "학습 노트" },
  { id: "materials",  icon: "upload-cloud",   label: "자료/요약" },
  { id: "tutor",      icon: "bot",            label: "AI 튜터" },
  { id: "anki",       icon: "layers",         label: "Anki" },
  { id: "stats",      icon: "flame",          label: "통계" },
] as const;

const TAB_TITLES: Record<string, string> = {
  overview: "학습 대시보드",
  timetable: "시간표",
  materials: "자료 / 요약",
  notes: "학습 노트",
  tutor: "AI 튜터",
  anki: "Anki 스케줄러",
  timer: "포모도로",
  stats: "학습 통계",
};

type TabId = "overview" | "timetable" | "materials" | "notes" | "tutor" | "timer" | "stats" | "anki";
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
   CategoryManager
   ============================================================ */
function CategoryManager({ categories, counts, onAdd, onRename, onDelete, onClose }: {
  categories: string[]; counts: Record<string, number>;
  onAdd: (n: string) => boolean; onRename: (o: string, n: string) => void;
  onDelete: (n: string) => void; onClose: () => void;
}) {
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDel) setConfirmDel(null);
        else if (editing) setEditing(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmDel, editing]);
  return (
    <div className="anki-dialog-overlay" onClick={onClose}>
      <div className="anki-dialog cat-manager" role="dialog" aria-label="카테고리 관리" onClick={e => e.stopPropagation()}>
        <div className="cat-manager-head">
          <h3 className="dialog-title" style={{ margin: 0 }}>카테고리 관리</h3>
          <button className="icon-button" aria-label="닫기" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="dialog-hint">여기서 만든 카테고리는 포모도로 · 학습 노트 · 자료/요약 · Anki 덱에서 함께 사용됩니다.</p>
        <div className="cat-list">
          {categories.map(name => {
            const used = counts?.[name] || 0;
            const isEditing = editing === name;
            return (
              <div className={`cat-row${isEditing ? " editing" : ""}`} key={name}>
                {isEditing
                  ? <input className="cat-edit-input" autoFocus value={editVal} maxLength={20}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { onRename(editing!, editVal); setEditing(null); }
                        if (e.key === "Escape") setEditing(null);
                      }} />
                  : <span className="cat-name"><span className="cat-dot" />{name}</span>
                }
                {!isEditing && <span className="cat-count">{used > 0 ? `${used}곳 사용` : "사용 안 함"}</span>}
                {isEditing
                  ? <div className="cat-row-actions">
                      <button className="chip-button" onClick={() => { onRename(editing!, editVal); setEditing(null); }}><Check size={13} />저장</button>
                      <button className="icon-button" onClick={() => setEditing(null)}><X size={14} /></button>
                    </div>
                  : <div className="cat-row-actions">
                      <button className="icon-button" onClick={() => { setEditing(name); setEditVal(name); }}><Pencil size={14} /></button>
                      <button className="icon-button danger" disabled={categories.length <= 1} onClick={() => setConfirmDel(name)}><Trash2 size={14} /></button>
                    </div>
                }
              </div>
            );
          })}
        </div>
        <div className="cat-add-row">
          <input className="cat-edit-input" placeholder="새 카테고리 이름" maxLength={20} value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && onAdd(adding)) setAdding(""); }} />
          <button className="primary-button" disabled={!adding.trim()} onClick={() => { if (onAdd(adding)) setAdding(""); }}>
            <Plus size={15} />추가
          </button>
        </div>
        {confirmDel && (
          <div className="cat-confirm" onClick={e => e.stopPropagation()}>
            <p><strong>{confirmDel}</strong> 카테고리를 삭제할까요?<br />이 카테고리를 쓰던 항목은 다른 카테고리로 옮겨집니다.</p>
            <div className="dialog-actions">
              <button className="ghost-button" onClick={() => setConfirmDel(null)}>취소</button>
              <button className="danger-button" onClick={() => { onDelete(confirmDel!); setConfirmDel(null); }}>삭제</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CategoryField
   ============================================================ */
function CategoryField({ categories, value, onChange, onManage, label = "과목", style }: {
  categories: string[]; value: string; onChange: (v: string) => void;
  onManage: () => void; label?: string; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const allOpts = [...categories, ...(value && !categories.includes(value) ? [value] : [])];
  return (
    <div className="cat-field" style={style} ref={wrapRef}>
      <div className="cat-field-select-wrap note-ctx-wrap">
        <button type="button" className="cat-field-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <span>{value || allOpts[0] || label}</span>
          <Icon name="chevron-down" size={11} style={{ transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
        </button>
        {open && (
          <div className="note-ctx-menu cat-field-menu">
            {allOpts.map(c => (
              <button key={c} className={c === value ? "is-active" : ""} onClick={() => { onChange(c); setOpen(false); }}>{c}</button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="cat-manage-btn" title="카테고리 관리" aria-label="카테고리 관리" onClick={onManage}>
        <Icon name="settings-2" size={15} />
      </button>
    </div>
  );
}

/* ============================================================
   SessionClock
   ============================================================ */
function SessionClock({ userId }: { userId: string }) {
  // Per-account, DB-synced study clock (follows the account across devices).
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [accBase, setAccBase] = useState(0);
  const [, setTick] = useState(0);
  const savedHourRef = useRef<number>(-1);

  const persist = (start: number, acc: number, todayKRW: number) => {
    void fetch("/api/study-clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date: todayStr, startMs: start, accKRW: acc, todayKRW }),
    }).catch(() => {});
  };

  // Load the account's clock from the DB (per-account, cross-device).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      let resolvedStart = Date.now();
      let resolvedAcc = 0;
      try {
        const res = await fetch(`/api/study-clock?userId=${encodeURIComponent(userId)}`);
        if (res.ok) {
          const { clock } = (await res.json()) as { clock: StudyClock | null };
          if (clock) {
            if (clock.date === todayStr) {
              resolvedStart = clock.startMs;
              resolvedAcc = clock.accKRW;
            } else {
              // New day: fold the previous day's value into the accumulated total.
              resolvedAcc = clock.accKRW + (clock.todayKRW || 0);
              resolvedStart = Date.now();
            }
          }
        }
      } catch {
        // offline — start a fresh local baseline; will sync on next success.
      }
      if (cancelled) return;
      savedHourRef.current = Math.floor((Date.now() - resolvedStart) / 3600000);
      setStartMs(resolvedStart);
      setAccBase(resolvedAcc);
      persist(resolvedStart, resolvedAcc, savedHourRef.current * MIN_WAGE);
    }
    void load();
    return () => { cancelled = true; };
  }, [userId, todayStr]);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedMs = startMs != null ? Date.now() - startMs : 0;
  const totalSec = Math.floor(elapsedMs / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const todayValue = Math.floor(elapsedMs / 3600000) * MIN_WAGE;
  const totalAcc = accBase + todayValue;

  // Checkpoint to the DB when the hour (and thus today's value) advances.
  useEffect(() => {
    if (startMs == null) return;
    const hours = Math.floor(elapsedMs / 3600000);
    if (hours !== savedHourRef.current) {
      savedHourRef.current = hours;
      persist(startMs, accBase, hours * MIN_WAGE);
    }
  });

  return (
    <div className="session-clock">
      <div className="sc-timer">{timeStr}</div>
      <div className="sc-value">오늘 학습가치 <strong>{todayValue > 0 ? todayValue.toLocaleString("ko-KR") + "원" : "집계 중"}</strong></div>
      <div className="sc-acc">누적 {totalAcc.toLocaleString("ko-KR")}원</div>
    </div>
  );
}

/* ============================================================
   NotifyButton
   ============================================================ */
function NotifyButton() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(NOTIFICATIONS);
  const unread = notes.filter(n => n.unread).length;
  return (
    <div className="notify-wrap">
      <button className="topbar-icon-btn" aria-label="알림" title="알림" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name="bell" size={18} />{unread > 0 && <span className="notify-dot notify-count">{unread}</span>}
      </button>
      {open && <>
        <div className="notify-scrim" onClick={() => setOpen(false)} />
        <div className="notify-panel" role="dialog" aria-label="알림">
          <div className="notify-head">
            <span className="notify-title">알림{unread > 0 ? ` · ${unread}` : ""}</span>
            <button className="notify-readall" onClick={() => setNotes(ns => ns.map(n => ({ ...n, unread: false })))} disabled={unread === 0}>모두 읽음</button>
          </div>
          <ul className="notify-list">
            {notes.map(n => (
              <li key={n.id} className={`notify-item ${n.unread ? "is-unread" : ""}`}>
                <span className="notify-ico"><Icon name={n.icon} size={16} /></span>
                <div className="notify-body"><p className="notify-text">{n.title}</p><span className="notify-time">{n.time}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </>}
    </div>
  );
}

/* ============================================================
   AccountManager
   ============================================================ */
function AccountManager({ user, setUser, onLogout, onClose }: {
  user: User; setUser: (u: User) => void; onLogout: () => void; onClose: () => void;
}) {
  const [nick, setNick] = useState(user.nickname);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const joinedDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString("ko-KR") : new Date().toLocaleDateString("ko-KR");
  const providerName = ({ GOOGLE: "Google", KAKAO: "Kakao", NAVER: "Naver", GUEST: "게스트" } as Record<string, string>)[user.provider] || user.provider;

  function save() {
    const n = nick.trim() || user.nickname;
    if (n !== user.nickname) setUser({ ...user, nickname: n });
    onClose();
  }
  function wipeAll() {
    try { Object.keys(localStorage).forEach(k => { if (k.startsWith("hak.")) localStorage.removeItem(k); }); } catch {}
    location.reload();
  }
  function exportData() {
    const data: Record<string, string | null> = {};
    try { Object.keys(localStorage).forEach(k => { data[k] = localStorage.getItem(k); }); } catch {}
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `학습데이터_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="cal-modal-overlay" onClick={onClose}>
      <div className="account-modal" onClick={e => e.stopPropagation()}>
        <div className="account-head">
          <h3>계정 관리</h3>
          <button className="icon-button" onClick={onClose} aria-label="닫기"><Icon name="x" size={16} /></button>
        </div>
        <div className="account-profile">
          <span className="account-avatar">{user.nickname.slice(0, 1).toUpperCase()}</span>
          <div className="account-profile-meta">
            <div className="account-provider-badge"><Icon name="shield-check" size={12} />{providerName} 계정</div>
            <div className="account-joined">가입 · {joinedDate}</div>
          </div>
        </div>
        <section className="account-section">
          <h4>프로필</h4>
          <label className="account-field">
            <span>닉네임</span>
            <input type="text" maxLength={20} value={nick} onChange={e => setNick(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }} />
          </label>
          <label className="account-field">
            <span>사용자 ID</span>
            <input type="text" value={user.userId} disabled />
          </label>
        </section>
        <section className="account-section">
          <h4>데이터 관리</h4>
          <button className="account-row-btn" onClick={exportData}>
            <Icon name="download" size={15} />
            <div><strong>학습 데이터 내보내기</strong><span>모든 노트·기록을 JSON 파일로 저장</span></div>
          </button>
          {!confirmWipe ? (
            <button className="account-row-btn danger" onClick={() => setConfirmWipe(true)}>
              <Icon name="trash-2" size={15} />
              <div><strong>모든 학습 데이터 삭제</strong><span>노트, 자료, Anki, 세션 등 전체 초기화</span></div>
            </button>
          ) : (
            <div className="account-confirm">
              <p><strong>정말 삭제하시겠어요?</strong> 모든 학습 데이터가 영구히 사라집니다.</p>
              <div className="account-confirm-actions">
                <button className="chip-button" onClick={() => setConfirmWipe(false)}>취소</button>
                <button className="chip-button danger" onClick={wipeAll}><Icon name="trash-2" size={13} />삭제</button>
              </div>
            </div>
          )}
        </section>
        <section className="account-section">
          <h4>세션</h4>
          <button className="account-row-btn" onClick={() => { onLogout(); onClose(); }}>
            <Icon name="log-out" size={15} />
            <div><strong>로그아웃</strong><span>로그인 화면으로 돌아갑니다</span></div>
          </button>
        </section>
        <footer className="account-foot">
          <button className="ghost-button" onClick={onClose}>닫기</button>
          <button className="primary-button" onClick={save}><Icon name="check" size={14} color="#fff" />저장</button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   Sidebar
   ============================================================ */
function Sidebar({
  activeTab, onTab, user, setUser, onLogout, attendance,
  timerSeconds = 0, timerTotalSeconds = 0, timerIsRunning = false, timerType = "STOPWATCH",
}: {
  activeTab: TabId;
  onTab: (t: TabId) => void;
  user: User;
  setUser: (u: User) => void;
  onLogout: () => void;
  attendance: number;
  timerSeconds?: number;
  timerTotalSeconds?: number;
  timerIsRunning?: boolean;
  timerType?: TimerType;
}) {
  function fmtSecs(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  const showTimer = timerIsRunning ||
    (timerType === "STOPWATCH" && timerSeconds > 0) ||
    ((timerType === "TIMER" || timerType === "POMODORO") && timerTotalSeconds > 0 && timerSeconds < timerTotalSeconds);
  const timerLabel = timerType === "POMODORO" ? "포모도로" : timerType === "TIMER" ? "타이머" : "스톱워치";
  const [open, setOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const activeLabel = NAV_ITEMS.find(it => it.id === activeTab)?.label ?? "대시보드";
  const pick = (id: TabId) => { onTab(id); setOpen(false); };
  const fmtNow = () => {
    const d = new Date();
    return {
      date: d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }),
      time: d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    };
  };
  const [nowTime, setNowTime] = useState(fmtNow);
  useEffect(() => {
    const id = setInterval(() => setNowTime(fmtNow()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header className="mobile-bar">
        <div className="mobile-left">
          <button className="hamburger" aria-label="메뉴 열기" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
          <span className="mobile-title">{activeLabel}</span>
          {showTimer && (
            <button className="mobile-timer-pill" onClick={() => pick("timer")} title="타이머로 이동">
              <span className={`sidebar-timer-dot ${timerIsRunning ? "running" : "paused"}`} />
              <span style={{ opacity: .75, fontSize: 11 }}>{timerLabel}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 13 }}>{fmtSecs(timerSeconds)}</span>
            </button>
          )}
        </div>
        <div className="mobile-bar-clock">
          <span className="mobile-bar-date">{nowTime.date}</span>
          <span className="mobile-bar-sep" aria-hidden="true" />
          <span className="mobile-bar-time">{nowTime.time}</span>
        </div>
        <div className="mobile-actions">
          <span className="attend-badge"><strong>{user.nickname}</strong>님 {attendance}번째 출석!</span>
          <NotifyButton />
          <button className="topbar-icon-btn" aria-label="로그아웃" title="로그아웃" onClick={onLogout}><Icon name="log-out" size={18} /></button>
        </div>
      </header>

      {open && <div className="drawer-scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div>
          <div className="brand">
            <span className="brand-mark"><Sparkles size={22} /></span>
            <span>AI 학습 어시스턴트</span>
            <button className="drawer-close" aria-label="메뉴 닫기" onClick={() => setOpen(false)}><Icon name="x" size={20} /></button>
          </div>
          <nav className="nav">
            {NAV_ITEMS.map(it => (
              <button key={it.id} className={`nav-button ${activeTab === it.id ? "active" : ""}`} onClick={() => pick(it.id as TabId)}>
                <Icon name={it.icon} size={18} />{it.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-foot">
          <div className="sidebar-clock">
            <div className="sidebar-clock-time">{nowTime.time}</div>
            <div className="sidebar-clock-date">{nowTime.date}</div>
          </div>
          {showTimer && (
            <button className={`sidebar-timer-card ${timerIsRunning ? "is-running" : "is-paused"}`} onClick={() => pick("timer")} title="타이머로 이동">
              <div className="sidebar-timer-card-head">
                <span className={`sidebar-timer-dot ${timerIsRunning ? "running" : "paused"}`} />
                <span className="sidebar-timer-card-label">{timerLabel}</span>
                <span className="sidebar-timer-card-state">{timerIsRunning ? "진행 중" : "일시정지"}</span>
              </div>
              <div className="sidebar-timer-card-val">{fmtSecs(timerSeconds)}</div>
              {(timerType === "TIMER" || timerType === "POMODORO") && timerTotalSeconds > 0 && (
                <div className="sidebar-timer-card-bar">
                  <i style={{ width: `${Math.min(100, Math.max(0, (1 - timerSeconds / timerTotalSeconds) * 100))}%` }} />
                </div>
              )}
            </button>
          )}
        </div>
        <div className="user">
          <button className="user-main" onClick={() => setAcctOpen(true)} aria-label="계정 관리">
            <span className="user-avatar">{user.nickname.slice(0, 1).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div className="user-name">{user.nickname}</div>
              <div className="user-sub">{user.email || `${user.provider} 로그인`}</div>
            </div>
            <Icon name="settings" size={15} />
          </button>
          <button className="user-logout" title="로그아웃" aria-label="로그아웃" onClick={onLogout}><Icon name="log-out" size={16} /></button>
        </div>
      </aside>
      {acctOpen && <AccountManager user={user} setUser={setUser} onLogout={onLogout} onClose={() => setAcctOpen(false)} />}
    </>
  );
}

/* ============================================================
   CharacterFace SVG
   ============================================================ */
function CharacterFace({ level }: { level: number }) {
  const happy = level >= 6;
  const vhappy = level >= 11;
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
function CharacterCard({ character }: { character: CharacterState & { nickname?: string } }) {
  const prevLevel = usePrevious(character.level);
  const [celebrate, setCelebrate] = useState(false);
  const [profileImg, setProfileImg] = useState<string | null>(() => {
    try { return typeof window !== "undefined" ? localStorage.getItem("hak.profileImg") : null; } catch { return null; }
  });
  const fileRef = useRef<HTMLInputElement>(null);

  function handleProfileFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const raw = ev.target?.result as string;
      const isGif = (file.type || "").includes("gif");
      if (isGif) {
        try { localStorage.setItem("hak.profileImg", raw); setProfileImg(raw); } catch { pushToast("이미지가 너무 큽니다 (5MB 이하 권장)"); }
        return;
      }
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")?.drawImage(img, 0, 0, w, h);
        const out = c.toDataURL("image/jpeg", 0.85);
        try { localStorage.setItem("hak.profileImg", out); setProfileImg(out); } catch { pushToast("이미지 저장 실패"); }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  useEffect(() => {
    if (prevLevel != null && character.level > prevLevel) {
      setCelebrate(true);
      pushToast(`${character.nickname || "루미"}님이 레벨 ${character.level} · ${character.rankName}(으)로 성장했어요!`, { accent: true, icon: "sparkles" });
      const t = setTimeout(() => setCelebrate(false), 1500);
      return () => clearTimeout(t);
    }
  }, [character.level]);

  return (
    <div className={`rumi ${celebrate ? "levelup" : ""}`}>
      <div className="rumi-spark">{Array.from({ length: 8 }).map((_, i) => (
        <span key={i} style={{ left: `${10 + i * 11}%`, top: "60%", animationDelay: `${i * 0.05}s`, background: i % 2 ? "oklch(0.78 0.14 50)" : "oklch(0.85 0.15 95)" }} />
      ))}</div>
      <div className="rumi-head">
        <span className="rumi-tag">Lv.{character.level} · {character.rankName}</span>
        <span className="rumi-atd">{character.attendanceDays}일 출석</span>
      </div>
      <div className="rumi-row">
        <div className="rumi-face" onClick={() => fileRef.current?.click()} title="클릭하여 프로필 이미지 변경">
          {profileImg
            ? <img src={profileImg} alt="프로필" />
            : <CharacterFace level={character.level} />}
          <div className="rumi-face-overlay"><Icon name="camera" size={13} /></div>
        </div>
        <input ref={fileRef} type="file" accept="image/*,.gif" style={{ display: "none" }} onChange={handleProfileFile} />
        <div>
          <h3 className="rumi-name">{character.nickname ? `${character.nickname} ${character.rankName}님` : "루미"}</h3>
          <p className="rumi-desc">{character.desc}</p>
        </div>
      </div>
      <div className="rumi-bar"><i style={{ width: `${character.progress}%` }} /></div>
      <div className="rumi-exp">{character.progress}%{character.nextInfo ? <span> · 다음 계급 ?</span> : character.level >= 14 ? <span> · 최고 계급 달성!</span> : null}</div>
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
   CalDayCell (ResizeObserver-adaptive bar count)
   ============================================================ */
interface Sched { id: string; text: string; color: string; }
function CalDayCell({ day, isToday, isSel, hasSession, scheds, onClick }: {
  day: number; isToday: boolean; isSel: boolean; hasSession: boolean; scheds: Sched[]; onClick: () => void;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(scheds.length);
  useEffect(() => {
    const el = cellRef.current; if (!el) return;
    const BAR = 8, GAP = 3, HEADER = 30;
    const measure = () => { const avail = el.clientHeight - HEADER; if (avail <= 0) return; setFit(Math.max(1, Math.floor((avail + GAP) / (BAR + GAP)))); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const overflow = scheds.length > fit;
  const shown = overflow ? Math.max(1, fit - 1) : scheds.length;
  return (
    <div ref={cellRef} className={`cal-cell ${isToday ? "today" : ""} ${isSel ? "cal-sel" : ""}`} onClick={onClick}>
      <span className="cal-date">{day}</span>
      {hasSession && <span className="cal-session-dot" title="학습 기록" />}
      <div className="cal-bars">
        {scheds.slice(0, shown).map(sc => <span key={sc.id} className="cal-bar" style={{ background: sc.color }} title={sc.text} />)}
        {overflow && <span className="cal-bar-more">+{scheds.length - shown}</span>}
      </div>
    </div>
  );
}

/* ============================================================
   CalendarWidget
   ============================================================ */
function CalendarWidget({ sessions, schedules, setScheds }: {
  sessions: StudySession[];
  schedules: Record<string, Sched[]>;
  setScheds: React.Dispatch<React.SetStateAction<Record<string, Sched[]>>>;
}) {
  const [cal, setCal] = useState(() => new Date());
  const [selDay, setSelDay] = useState<string | null>(null);
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
    cells.push(
      <CalDayCell key={d} day={d} isToday={isToday} isSel={selDay === k}
        hasSession={sessionDays.has(d)} scheds={schedules[k] || []} onClick={() => selectDay(d)} />
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
  character, sessions, anki, onGoAnki, schedules, setScheds
}: {
  character: ReturnType<typeof calculateCharacter>;
  sessions: StudySession[];
  anki: AnkiState;
  onGoAnki: () => void;
  schedules: Record<string, Sched[]>;
  setScheds: React.Dispatch<React.SetStateAction<Record<string, Sched[]>>>;
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
        <CalendarWidget sessions={sessions} schedules={schedules} setScheds={setScheds} />
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
  summaries, materials, categories, onManageCategories, selectedSummary, selectedSummaryId,
  uploadStatus, onUpload, onSelectSummary, onDeleteSummary,
  pinnedMaterials = [], onTogglePinMaterial, onDeleteMaterial, onDeleteMaterials, onRenameMaterial,
  onMoveMaterial, onSummarizeMaterial, summarizingMatId, onCopySummaryToFolder, onMoveSummaryToFolder, onUpdateSummary,
}: {
  summaries: Summary[];
  materials: LearningMaterial[];
  categories: string[];
  onManageCategories: () => void;
  selectedSummary?: Summary;
  selectedSummaryId: string;
  uploadStatus: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>, category: string) => void;
  onSelectSummary: (id: string) => void;
  onDeleteSummary: (id: string) => void;
  pinnedMaterials?: string[];
  onTogglePinMaterial: (id: string) => void;
  onDeleteMaterial: (id: string) => void;
  onDeleteMaterials: (ids: string[]) => void;
  onRenameMaterial: (id: string, name: string) => void;
  onMoveMaterial: (id: string, category: string) => void;
  onSummarizeMaterial: (id: string) => void;
  summarizingMatId: string | null;
  onCopySummaryToFolder: (id: string, category: string) => void;
  onMoveSummaryToFolder: (id: string, category: string) => void;
  onUpdateSummary: (id: string, patch: Partial<Summary>) => void;
}) {
  const [selMats, setSelMats] = useState<string[]>([]);
  const [selSums, setSelSums] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [uploadCat, setUploadCat] = useState(categories[0] || "기타");
  const [filterCat, setFilterCat] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [openMCats, setOpenMCats] = useState<Set<string>>(new Set());
  const [matMenu, setMatMenu] = useState<string | null>(null);
  const [editingMat, setEditingMat] = useState<{ materialId: string; value: string } | null>(null);
  const [sumMenu, setSumMenu] = useState<string | null>(null);
  const [sumSub, setSumSub] = useState<"copy" | "move" | null>(null);
  const [editSel, setEditSel] = useState<{ title: string; content: string; category: string } | null>(null);
  const [editingSum, setEditingSum] = useState<{ summaryId: string; value: string } | null>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".cat-filter-wrap")) setFilterOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);
  useEffect(() => { setEditSel(null); }, [selectedSummaryId]);
  useEffect(() => {
    if (!matMenu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".note-ctx-wrap")) setMatMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [matMenu]);
  useEffect(() => {
    if (!sumMenu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".note-ctx-wrap")) { setSumMenu(null); setSumSub(null); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [sumMenu]);
  useEffect(() => { if (!categories.includes(uploadCat)) setUploadCat(categories[0] || "기타"); }, [categories]);

  function startEditSel() {
    if (!selectedSummary) return;
    setEditSel({ title: selectedSummary.title, content: selectedSummary.content, category: selectedSummary.category || categories[0] || "기타" });
  }
  function saveEditSel() {
    if (!editSel || !selectedSummary) return;
    onUpdateSummary(selectedSummary.summaryId, { title: editSel.title.trim() || selectedSummary.title, content: editSel.content, category: editSel.category });
    setEditSel(null);
  }
  function commitMatRename() {
    if (editingMat?.value.trim()) onRenameMaterial(editingMat.materialId, editingMat.value.trim());
    setEditingMat(null);
  }
  function commitSumRename() {
    if (editingSum?.value.trim()) onUpdateSummary(editingSum.summaryId, { title: editingSum.value.trim() });
    setEditingSum(null);
  }

  const matAllCats = useMemo(() => {
    const extra = [...new Set(materials.map(m => m.category || "기타"))].filter(c => !categories.includes(c));
    return [...categories, ...extra];
  }, [categories, materials]);

  const toggleMat = (id: string) => setSelMats(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleMCat = (cat: string) => setOpenMCats(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  const toggleSum = (id: string) => setSelSums(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const togglePin = (id: string) => setPinned(p => p.includes(id) ? p.filter(x => x !== id) : (p.length < 5 ? [...p, id] : p));
  const canPin = selSums.length > 0 && (selSums.every(id => pinned.includes(id)) || pinned.length < 5);
  const visibleSums = filterCat === "all" ? summaries : summaries.filter(s => s.category === filterCat);
  const sortedSums = [...visibleSums.filter(s => pinned.includes(s.summaryId)), ...visibleSums.filter(s => !pinned.includes(s.summaryId))];

  function renderMatRow(m: LearningMaterial, section = "cat") {
    const isFav = pinnedMaterials.includes(m.materialId);
    const menuKey = section + "-mat-" + m.materialId;
    const matSummaries = summaries.filter(s => s.materialId === m.materialId);
    const isBusy = summarizingMatId === m.materialId;
    if (editingMat?.materialId === m.materialId) {
      return (
        <div className="list-row mat-row mat-indent is-editing" key={m.materialId}>
          <Icon name="file-text" size={17} />
          <input className="note-inline-input" autoFocus value={editingMat.value}
            onChange={e => setEditingMat({ ...editingMat, value: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") commitMatRename(); if (e.key === "Escape") setEditingMat(null); }}
            onBlur={commitMatRename} aria-label="자료 이름 변경" />
          <button className="note-ctx-btn" onMouseDown={e => e.preventDefault()} onClick={commitMatRename} aria-label="저장"><Icon name="check" size={14} /></button>
        </div>
      );
    }
    return (
      <div className={`list-row mat-row mat-indent ${selMats.includes(m.materialId) ? "is-selected" : ""}`} key={m.materialId}>
        <input type="checkbox" className="row-check" checked={selMats.includes(m.materialId)} onChange={() => toggleMat(m.materialId)} aria-label={`${m.fileName} 선택`} />
        <Icon name="file-text" size={17} />
        <div className="mat-file-info">
          <strong title={m.fileName}>{m.fileName}</strong>
          <span>{m.fileType} · {new Date(m.uploadedAt).toLocaleString("ko-KR")}{matSummaries.length > 0 && <span className="mat-sum-tag"><Icon name="sparkles" size={10} />요약 {matSummaries.length}</span>}</span>
        </div>
        <button className={`mat-ai-btn ${isBusy ? "busy" : ""}`} disabled={!!summarizingMatId} onClick={() => onSummarizeMaterial(m.materialId)} title="이 자료를 AI로 요약·정리">
          <Icon name={isBusy ? "loader" : "sparkles"} size={13} /><span className="mat-ai-label">{isBusy ? "요약 중…" : "AI 요약"}</span>
        </button>
        <div className="mat-actions">
          <button className={`row-act-btn ${isFav ? "is-fav" : ""}`} onClick={() => onTogglePinMaterial(m.materialId)} aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"} title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}><Icon name="star" size={14} /></button>
          <button className="row-act-btn" onClick={() => setEditingMat({ materialId: m.materialId, value: m.fileName })} aria-label="이름 변경" title="이름 변경"><Icon name="pencil" size={14} /></button>
          {matAllCats.filter(c => c !== (m.category || "기타")).length > 0 && (
            <div className="note-ctx-wrap">
              <button className="row-act-btn" onClick={() => setMatMenu(matMenu === menuKey ? null : menuKey)} aria-label="폴더 이동" title="폴더 이동"><Icon name="folder-input" size={14} /></button>
              {matMenu === menuKey && (
                <div className="note-ctx-menu">
                  <div className="note-ctx-head">폴더 이동</div>
                  {matAllCats.filter(c => c !== (m.category || "기타")).map(c => (
                    <button key={c} onClick={() => { onMoveMaterial(m.materialId, c); setMatMenu(null); }}><Icon name="folder" size={12} />{c}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="row-act-btn danger" onClick={() => onDeleteMaterial(m.materialId)} aria-label="삭제" title="삭제"><Icon name="trash-2" size={14} /></button>
        </div>
      </div>
    );
  }

  const extraCats = [...new Set(materials.map(m => m.category || "기타"))].filter(c => !categories.includes(c));
  const allMatCats = [...categories, ...extraCats];
  const filteredCats = filterCat === "all" ? allMatCats : allMatCats.filter(c => c === filterCat);
  const favMats = materials.filter(m => pinnedMaterials.includes(m.materialId));

  return (
    <div className="two-column view-enter">
      <section className="panel">
        <div className="section-heading"><h3>학습 자료 업로드</h3><span>PDF · TXT · MD · CSV · JSON</span></div>
        <div className="upload-cat-row">
          <span className="upload-cat-label">카테고리</span>
          <CategoryField categories={categories} value={uploadCat} onChange={setUploadCat} onManage={onManageCategories} style={{ flex: 1 }} />
        </div>
        <label className="upload-zone">
          <Icon name="upload-cloud" size={36} />
          <strong>파일 선택</strong>
          <span>{uploadStatus}</span>
          <span className="upload-cat-pill">{uploadCat} 카테고리로 저장</span>
          <input type="file" accept=".pdf,.txt,.md" onChange={e => onUpload(e, uploadCat)} />
        </label>
        <div className="list-block-sep" />
        <div className="list-block">
          <div className="list-block-head">
            <h4>업로드 자료</h4>
            <div className="list-block-actions">
              {selMats.length > 0 && <button className="chip-button danger" onClick={() => { onDeleteMaterials(selMats); setSelMats([]); }}><Icon name="trash-2" size={13} />삭제 ({selMats.length})</button>}
            </div>
          </div>
          <div className="mat-cat-group">
            <button className="mat-cat-header" onClick={() => toggleMCat("__fav__")}>
              <span className="mat-cat-chevron" style={{ transform: openMCats.has("__fav__") ? "rotate(90deg)" : "rotate(0deg)" }}><Icon name="star" size={13} /></span>
              <span className="mat-cat-name" style={{ color: "oklch(0.68 0.15 78)" }}>즐겨찾기</span>
              <span className="mat-cat-count">{favMats.length}</span>
            </button>
            {openMCats.has("__fav__") && favMats.length === 0 && <p className="note-empty-cat" style={{ paddingLeft: 28 }}>즐겨찾기한 자료가 없습니다</p>}
            {openMCats.has("__fav__") && favMats.map(m => renderMatRow(m, "fav"))}
          </div>
          {materials.length === 0
            ? <p className="empty-text">아직 업로드한 자료가 없습니다.</p>
            : filteredCats.map(cat => {
              const catMats = materials.filter(m => (m.category || "기타") === cat);
              const isOpen = openMCats.has(cat);
              return (
                <div key={cat} className="mat-cat-group">
                  <button className="mat-cat-header" onClick={() => toggleMCat(cat)}>
                    <span className="mat-cat-chevron" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}><Icon name="chevron-right" size={13} /></span>
                    <span className="mat-cat-name">{cat}</span>
                    <span className="mat-cat-count">{catMats.length}</span>
                  </button>
                  {isOpen && catMats.length === 0 && <p className="note-empty-cat" style={{ paddingLeft: 28 }}>자료가 없습니다</p>}
                  {isOpen && catMats.map(m => renderMatRow(m, cat))}
                </div>
              );
            })
          }
        </div>
      </section>
      <section className="panel">
        <div className="section-heading sum-heading-aligned">
          <div className="sum-heading-left">
            <h3>저장된 요약</h3>
            <button className="chip-button sum-pin-always" style={{ marginLeft: "auto", flexShrink: 0 }}
              disabled={selSums.length === 0 || (!selSums.every(id => pinned.includes(id)) && !canPin)}
              onClick={() => { selSums.forEach(id => togglePin(id)); setSelSums([]); }}
              title={selSums.length > 0 ? "선택한 요약 고정/해제" : "요약을 선택하면 고정할 수 있습니다"}>
              <Icon name="pin" size={13} />
              {selSums.length > 0 && selSums.every(id => pinned.includes(id)) ? "고정 해제" : `고정 ${pinned.length}/5`}
            </button>
          </div>
          <div />
          <div className="sum-heading-col3">
            <div className="cat-filter-wrap note-ctx-wrap">
              <button className="cat-filter cat-filter-btn" onClick={() => setFilterOpen(o => !o)} aria-label="카테고리 필터" aria-expanded={filterOpen}>
                <span>{filterCat === "all" ? "전체 카테고리" : filterCat}</span>
                <Icon name="chevron-down" size={12} style={{ transition: "transform .15s", transform: filterOpen ? "rotate(180deg)" : "none", flexShrink: 0 }} />
              </button>
              {filterOpen && (
                <div className="note-ctx-menu cat-filter-menu">
                  <button className={filterCat === "all" ? "is-active" : ""} onClick={() => { setFilterCat("all"); setFilterOpen(false); }}>전체 카테고리</button>
                  {categories.map(c => <button key={c} className={filterCat === c ? "is-active" : ""} onClick={() => { setFilterCat(c); setFilterOpen(false); }}>{c}</button>)}
                </div>
              )}
            </div>
            <span className="sum-count">{sortedSums.length}개</span>
          </div>
        </div>
        <div className="split-list">
          <div className={`summary-list ${sumMenu ? "menu-open" : ""}`}>
            {summaries.length === 0 ? <p className="empty-text">요약이 생성되면 이곳에 저장됩니다.</p> : sortedSums.map(s => {
              if (editingSum?.summaryId === s.summaryId) {
                return (
                  <div key={s.summaryId} className="sum-row sum-row-editing">
                    <Icon name="scroll" size={15} style={{ color: "var(--muted)", flexShrink: 0, marginLeft: 4 }} />
                    <input className="note-inline-input" autoFocus value={editingSum.value}
                      onChange={e => setEditingSum({ ...editingSum, value: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") commitSumRename(); if (e.key === "Escape") setEditingSum(null); }}
                      onBlur={commitSumRename} aria-label="요약 이름 변경" />
                    <button className="note-ctx-btn" onMouseDown={e => e.preventDefault()} onClick={commitSumRename} aria-label="저장"><Icon name="check" size={14} /></button>
                  </div>
                );
              }
              return (
                <div key={s.summaryId} className={`sum-row ${selSums.includes(s.summaryId) ? "is-selected" : ""}`}>
                  <input type="checkbox" className="row-check" checked={selSums.includes(s.summaryId)} onChange={() => toggleSum(s.summaryId)} aria-label={`${s.title} 선택`} />
                  <button className={`summary-item ${s.summaryId === selectedSummaryId ? "active" : ""}`} onClick={() => onSelectSummary(s.summaryId)}>
                    {pinned.includes(s.summaryId) && <span className="pin-dot"><Icon name="pin" size={10} /></span>}
                    <strong>{s.title}</strong>
                    <span className="sum-meta">{s.category && <span className="cat-chip">{s.category}</span>}{s.sourceType === "material" ? "자료 요약" : "노트 요약"}</span>
                  </button>
                  <div className="note-ctx-wrap">
                    <button className="note-ctx-btn" aria-label="요약 옵션" onClick={() => { setSumMenu(sumMenu === s.summaryId ? null : s.summaryId); setSumSub(null); }}><Icon name="more-horizontal" size={14} /></button>
                    {sumMenu === s.summaryId && (
                      <div className="note-ctx-menu">
                        <button onClick={() => { setEditingSum({ summaryId: s.summaryId, value: s.title }); setSumMenu(null); }}><Icon name="pencil" size={13} />이름 변경</button>
                        <button className={sumSub === "copy" ? "is-expanded" : ""} onClick={e => { e.stopPropagation(); setSumSub(sumSub === "copy" ? null : "copy"); }}>
                          <Icon name="copy" size={13} />폴더로 복사
                          <Icon name="chevron-right" size={11} style={{ marginLeft: "auto", transition: "transform .12s", transform: sumSub === "copy" ? "rotate(90deg)" : "none" }} />
                        </button>
                        {sumSub === "copy" && (
                          <div className="note-ctx-submenu">
                            {categories.map(c => (
                              <button key={c} onClick={() => { onCopySummaryToFolder(s.summaryId, c); setSumMenu(null); setSumSub(null); }}>
                                <Icon name="folder" size={12} />{c}{c === s.category && <span className="ctx-cur">현재</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        <button className={sumSub === "move" ? "is-expanded" : ""} onClick={e => { e.stopPropagation(); setSumSub(sumSub === "move" ? null : "move"); }}>
                          <Icon name="folder-input" size={13} />다른 폴더로 이동
                          <Icon name="chevron-right" size={11} style={{ marginLeft: "auto", transition: "transform .12s", transform: sumSub === "move" ? "rotate(90deg)" : "none" }} />
                        </button>
                        {sumSub === "move" && (
                          <div className="note-ctx-submenu">
                            {categories.filter(c => c !== s.category).map(c => (
                              <button key={c} onClick={() => { onMoveSummaryToFolder(s.summaryId, c); setSumMenu(null); setSumSub(null); }}>
                                <Icon name="folder" size={12} />{c}
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={() => { togglePin(s.summaryId); setSumMenu(null); }}><Icon name="pin" size={13} />{pinned.includes(s.summaryId) ? "고정 해제" : "고정"}</button>
                        <button className="danger" onClick={() => { onDeleteSummary(s.summaryId); setSumMenu(null); }}><Icon name="trash-2" size={13} />삭제</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="split-divider" />
          <article className="summary-detail">
            {selectedSummary ? (editSel ? (
              <div className="summary-edit">
                <div className="detail-title">
                  <input className="sum-edit-title" value={editSel.title} onChange={e => setEditSel({ ...editSel, title: e.target.value })} aria-label="요약 제목" placeholder="요약 제목" />
                </div>
                <div className="sum-edit-row">
                  <CategoryField categories={categories} value={editSel.category} onChange={v => setEditSel({ ...editSel, category: v })} onManage={onManageCategories} style={{ minWidth: 130 }} />
                  <div className="sum-edit-actions">
                    <button className="chip-button" onClick={() => setEditSel(null)}><Icon name="x" size={13} />취소</button>
                    <button className="chip-button primary" onClick={saveEditSel}><Icon name="check" size={13} />저장</button>
                  </div>
                </div>
                <textarea className="markdown-input sum-edit-text" value={editSel.content} onChange={e => setEditSel({ ...editSel, content: e.target.value })} aria-label="요약 내용" />
              </div>
            ) : (() => {
              const lines = (selectedSummary.content || "").split("\n");
              const attrIdx = lines.findIndex(l => /^>\s.*(API|생성된 요약|로컬 요약)/i.test(l));
              let attribution: string | null = null, body = selectedSummary.content;
              if (attrIdx !== -1) {
                let st = attrIdx, en = attrIdx + 1;
                while (st > 0 && lines[st - 1].trim() === "") st--;
                while (en < lines.length && lines[en].trim() === "") en++;
                attribution = lines[attrIdx].replace(/^>\s*/, "").trim();
                body = [...lines.slice(0, st), ...lines.slice(en)].join("\n").replace(/^\n+/, "");
              }
              return (
                <>
                  <div className="detail-title">
                    <div><h4>{selectedSummary.title}</h4><span>{selectedSummary.category ? selectedSummary.category + " · " : ""}{new Date(selectedSummary.createdAt).toLocaleString("ko-KR")}</span></div>
                    <div className="detail-actions">
                      <button className="icon-button" aria-label="요약 수정" title="수정" onClick={startEditSel}><Icon name="pencil" size={16} /></button>
                      <button className="icon-button danger" aria-label="요약 삭제" title="삭제" onClick={() => onDeleteSummary(selectedSummary.summaryId)}><Icon name="trash-2" size={17} /></button>
                    </div>
                  </div>
                  {attribution && <div className="summary-attribution"><Icon name="sparkles" size={13} /><span>{attribution}</span></div>}
                  <MarkdownPreview content={body} />
                </>
              );
            })()) : <p className="empty-text">조회할 요약을 선택하세요.</p>}
          </article>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   NotesView
   ============================================================ */
type NoteDraft = { title: string; subject: string; markdownContent: string };
type SummaryDraft = { title: string; content: string; category: string };
function NotesView({
  notes, categories, onManageCategories, selectedNote, selectedNoteId, noteDraft,
  onSelectNote, onDraftChange, onSave, onNew, onDelete, onAddCategory, onRenameCategory, onDeleteCategory,
  onRenameNote, onMoveNote, pinnedNotes = [], onTogglePinNote, summaries = [], onGoToSummary, onDeleteSummary,
  editingSummary, editingSummaryId, summaryDraft, onSummaryDraftChange, onSaveSummary, onCloseSummary, onDirtyChange,
}: {
  notes: StudyNote[];
  categories: string[];
  onManageCategories: () => void;
  selectedNote?: StudyNote;
  selectedNoteId: string;
  noteDraft: NoteDraft;
  onSelectNote: (id: string) => void;
  onDraftChange: (d: NoteDraft) => void;
  onSave: () => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onAddCategory: (n: string) => boolean;
  onRenameCategory: (o: string, n: string) => void;
  onDeleteCategory: (n: string) => void;
  onRenameNote: (id: string, title: string) => void;
  onMoveNote: (id: string, category: string) => void;
  pinnedNotes?: string[];
  onTogglePinNote: (id: string) => void;
  summaries?: Summary[];
  onGoToSummary: (id: string) => void;
  onDeleteSummary: (id: string) => void;
  editingSummary?: Summary | null;
  editingSummaryId: string | null;
  summaryDraft: SummaryDraft;
  onSummaryDraftChange: (d: SummaryDraft) => void;
  onSaveSummary: () => void;
  onCloseSummary: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const allCats = useMemo(() => {
    const extra = [...new Set(notes.map(n => n.subject || "기타"))].filter(k => !categories.includes(k));
    return [...categories, ...extra];
  }, [categories, notes]);

  const grouped = useMemo(() => {
    const map: Record<string, StudyNote[]> = {};
    notes.forEach(n => { const k = n.subject || "기타"; (map[k] ||= []).push(n); });
    return map;
  }, [notes]);

  const summariesByCategory = useMemo(() => {
    const map: Record<string, Summary[]> = {};
    (summaries || []).forEach(s => { const k = s.category || "기타"; (map[k] ||= []).push(s); });
    return map;
  }, [summaries]);

  const pinnedNoteObjects = useMemo(() => notes.filter(n => (pinnedNotes || []).includes(n.noteId)), [notes, pinnedNotes]);

  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set(["__fav__"]));
  const toggleCat = (cat: string) => setOpenCats(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (selectedNote) setOpenCats(s => { const n = new Set(s); n.add(selectedNote.subject || "기타"); return n; });
  }, [selectedNoteId]);

  const [editingCat, setEditingCat] = useState<{ name: string; value: string } | null>(null);
  const [editingNote, setEditingNote] = useState<{ noteId: string; value: string } | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [moveSubMenu, setMoveSubMenu] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<{ kind: "select" | "new" | "summary"; id?: string } | null>(null);

  const isDirty = useMemo(() => {
    if (editingSummaryId) return false;
    const c = (noteDraft.markdownContent || "").trim();
    const t = (noteDraft.title || "").trim();
    if (!c && !t) return false;
    if (!selectedNote) return true;
    return c !== (selectedNote.markdownContent || "").trim() ||
      t !== (selectedNote.title || "").trim() ||
      (noteDraft.subject || "") !== (selectedNote.subject || "");
  }, [noteDraft, selectedNote, editingSummaryId]);

  useEffect(() => { onDirtyChange(isDirty); }, [isDirty]);
  useEffect(() => () => onDirtyChange(false), []);

  function trySelect(id: string) { if (isDirty && id !== selectedNoteId) setPendingNav({ kind: "select", id }); else onSelectNote(id); }
  function tryNew() { if (isDirty) setPendingNav({ kind: "new" }); else onNew(); }
  function tryGoToSummary(id: string) { if (isDirty) setPendingNav({ kind: "summary", id }); else onGoToSummary(id); }

  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  function discardAndNav() {
    const p = pendingNav; setPendingNav(null);
    if (!p) return;
    if (p.kind === "select" && p.id) onSelectNote(p.id);
    else if (p.kind === "new") onNew();
    else if (p.kind === "summary" && p.id) onGoToSummary(p.id);
  }
  function saveAndNav() {
    onSave();
    const p = pendingNav; setPendingNav(null);
    if (!p) return;
    setTimeout(() => {
      if (p.kind === "select" && p.id) onSelectNote(p.id);
      else if (p.kind === "new") onNew();
      else if (p.kind === "summary" && p.id) onGoToSummary(p.id);
    }, 30);
  }

  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".note-ctx-wrap")) { setOpenMenu(null); setMoveSubMenu(null); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  function commitCatRename() { if (editingCat?.value.trim()) onRenameCategory(editingCat.name, editingCat.value.trim()); setEditingCat(null); }
  function commitNoteRename() { if (editingNote?.value.trim()) onRenameNote(editingNote.noteId, editingNote.value.trim()); setEditingNote(null); }
  function commitAddCat() { if (newCatName.trim()) onAddCategory(newCatName.trim()); setAddingCat(false); setNewCatName(""); }

  return (
    <div className="notes-layout view-enter">
      <section className="panel note-index">
        <div className="section-heading">
          <h3>노트 목록</h3>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-button" aria-label="카테고리 추가" title="카테고리 추가" onClick={() => { setAddingCat(true); setNewCatName(""); }}><Icon name="folder-plus" size={15} /></button>
            <button className="icon-button" aria-label="새 노트" onClick={tryNew}><Icon name="plus" size={17} /></button>
          </div>
        </div>

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
              <button className="note-list-item" onClick={() => trySelect(note.noteId)}>
                <strong>{note.title}</strong>
                <span>{note.subject} · {new Date(note.updatedAt).toLocaleDateString("ko-KR")}</span>
              </button>
              <button className="note-ctx-btn" style={{ opacity: 1, color: "oklch(0.68 0.15 78)" }} onClick={() => onTogglePinNote(note.noteId)} aria-label="즐겨찾기 해제" title="즐겨찾기 해제"><Icon name="star" size={13} /></button>
            </div>
          ))}
          {openCats.has("__fav__") && pinnedNoteObjects.length === 0 && <p className="note-empty-cat">즐겨찾기한 노트가 없습니다</p>}
        </div>

        {allCats.map(cat => {
          const catNotes = grouped[cat] || [];
          const isOpen = openCats.has(cat);
          const hasActive = catNotes.some(n => n.noteId === selectedNoteId);
          const isEditingCat = editingCat?.name === cat;
          const catMenuKey = `cat:${cat}`;
          return (
            <div key={cat} className="note-cat-group">
              <div className={`note-cat-header ${hasActive ? "has-active" : ""}`}>
                <button className="note-cat-toggle" onClick={() => toggleCat(cat)}>
                  <span className="note-cat-chevron" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}><Icon name="chevron-right" size={13} /></span>
                </button>
                {isEditingCat
                  ? <input className="note-inline-input" autoFocus value={editingCat.value}
                      onChange={e => setEditingCat({ ...editingCat, value: e.target.value })}
                      onBlur={commitCatRename}
                      onKeyDown={e => { if (e.key === "Enter") commitCatRename(); if (e.key === "Escape") setEditingCat(null); }} />
                  : <button className="note-cat-label-btn" onClick={() => toggleCat(cat)}>
                      <span className="note-cat-name">{cat}</span>
                      <span className="note-cat-count">{catNotes.length}</span>
                    </button>
                }
                <div className="note-ctx-wrap">
                  <button className="note-ctx-btn" aria-label="카테고리 옵션" onClick={() => setOpenMenu(openMenu === catMenuKey ? null : catMenuKey)}><Icon name="more-horizontal" size={14} /></button>
                  {openMenu === catMenuKey && (
                    <div className="note-ctx-menu">
                      <button onClick={() => { setEditingCat({ name: cat, value: cat }); setOpenMenu(null); }}><Icon name="pencil" size={13} />이름 변경</button>
                      <button className="danger" onClick={() => { onDeleteCategory(cat); setOpenMenu(null); }}><Icon name="trash-2" size={13} />삭제</button>
                    </div>
                  )}
                </div>
              </div>
              {isOpen && catNotes.map(note => {
                const isEditingNote = editingNote?.noteId === note.noteId;
                const noteMenuKey = `note:${note.noteId}`;
                return (
                  <div key={note.noteId} className={`note-list-row ${note.noteId === selectedNoteId ? "active" : ""}`}>
                    {isEditingNote
                      ? <input className="note-inline-input note-inline-note" autoFocus value={editingNote.value}
                          onChange={e => setEditingNote({ ...editingNote, value: e.target.value })}
                          onBlur={commitNoteRename}
                          onKeyDown={e => { if (e.key === "Enter") commitNoteRename(); if (e.key === "Escape") setEditingNote(null); }} />
                      : <button className="note-list-item" onClick={() => trySelect(note.noteId)}>
                          <strong>{note.title}</strong>
                          <span>{new Date(note.updatedAt).toLocaleDateString("ko-KR")}</span>
                        </button>
                    }
                    <div className="note-ctx-wrap">
                      <button className="note-ctx-btn" aria-label="노트 옵션" onClick={() => setOpenMenu(openMenu === noteMenuKey ? null : noteMenuKey)}><Icon name="more-horizontal" size={14} /></button>
                      {openMenu === noteMenuKey && (
                        <div className="note-ctx-menu">
                          <button onClick={() => { onTogglePinNote(note.noteId); setOpenMenu(null); }}><Icon name="star" size={13} />{(pinnedNotes || []).includes(note.noteId) ? "즐겨찾기 해제" : "즐겨찾기 추가"}</button>
                          <button onClick={() => { setEditingNote({ noteId: note.noteId, value: note.title }); setOpenMenu(null); }}><Icon name="pencil" size={13} />이름 변경</button>
                          {allCats.filter(c => c !== (note.subject || "기타")).length > 0 && (
                            <button className={moveSubMenu === note.noteId ? "is-expanded" : ""} onClick={e => { e.stopPropagation(); setMoveSubMenu(moveSubMenu === note.noteId ? null : note.noteId); }}>
                              <Icon name="folder-input" size={13} />다른 폴더로 이동
                              <Icon name="chevron-right" size={11} style={{ marginLeft: "auto", transition: "transform .12s", transform: moveSubMenu === note.noteId ? "rotate(90deg)" : "none" }} />
                            </button>
                          )}
                          {moveSubMenu === note.noteId && (
                            <div className="note-ctx-submenu">
                              {allCats.filter(c => c !== (note.subject || "기타")).map(c => (
                                <button key={c} onClick={() => { onMoveNote(note.noteId, c); setOpenMenu(null); setMoveSubMenu(null); }}>
                                  <Icon name="folder" size={12} />{c}
                                </button>
                              ))}
                            </div>
                          )}
                          <button className="danger" onClick={() => { onDelete(note.noteId); setOpenMenu(null); }}><Icon name="trash-2" size={13} />삭제</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isOpen && catNotes.length === 0 && <p className="note-empty-cat">노트가 없습니다</p>}
              {isOpen && (summariesByCategory[cat] || []).map(sum => (
                <div key={sum.summaryId} className="note-sum-row">
                  <Icon name="scroll" size={13} />
                  <button className="note-sum-btn" onClick={() => tryGoToSummary(sum.summaryId)} style={editingSummaryId === sum.summaryId ? { color: "var(--accent-ink)", fontWeight: 600 } : undefined}>
                    <strong>{sum.title}</strong>
                    <span>{sum.sourceType === "note" ? "노트 요약" : "자료 요약"}</span>
                  </button>
                  <button className="note-ctx-btn" onClick={() => onDeleteSummary(sum.summaryId)} aria-label="요약 삭제"><Icon name="trash-2" size={12} /></button>
                </div>
              ))}
            </div>
          );
        })}

        {addingCat && (
          <div className="note-add-cat-row">
            <Icon name="folder-plus" size={14} />
            <input className="note-inline-input" autoFocus placeholder="새 카테고리 이름" value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onBlur={commitAddCat}
              onKeyDown={e => { if (e.key === "Enter") commitAddCat(); if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); } }} />
          </div>
        )}

        {notes.length === 0 && allCats.length === 0 && <p className="empty-text">첫 학습 노트를 작성해 보세요.</p>}
      </section>

      <section className="panel note-editor">
        {editingSummary ? (
          <>
            <div className="summary-badge-row">
              <span className="summary-mode-badge"><Icon name="scroll" size={13} />AI 요약 문서</span>
              <button className="ghost-button" onClick={onCloseSummary}><Icon name="arrow-left" size={14} />노트로 돌아가기</button>
            </div>
            <div className="editor-toolbar">
              <input value={summaryDraft.title} onChange={e => onSummaryDraftChange({ ...summaryDraft, title: e.target.value })} aria-label="요약 제목" />
              <CategoryField categories={categories} value={summaryDraft.category} onChange={v => onSummaryDraftChange({ ...summaryDraft, category: v })} onManage={onManageCategories} style={{ minWidth: 140 }} />
              <button className="primary-button" onClick={onSaveSummary}><Icon name="save" size={16} color="#fff" /> 저장</button>
            </div>
            <div className="inline-actions">
              <button className="danger-button" onClick={() => { if (editingSummaryId) onDeleteSummary(editingSummaryId); onCloseSummary(); }}><Icon name="trash-2" size={16} /> 요약 삭제</button>
              <span className="editor-meta">원본: {editingSummary.sourceType === "note" ? "노트 요약" : "자료 요약"} · {new Date(editingSummary.createdAt || Date.now()).toLocaleDateString("ko-KR")}</span>
            </div>
            <textarea className="markdown-input" value={summaryDraft.content} onChange={e => onSummaryDraftChange({ ...summaryDraft, content: e.target.value })} aria-label="요약 내용" />
          </>
        ) : (
          <>
            <div className="editor-toolbar">
              <input value={noteDraft.title} onChange={e => onDraftChange({ ...noteDraft, title: e.target.value })} aria-label="노트 제목" />
              <CategoryField categories={categories} value={noteDraft.subject} onChange={v => onDraftChange({ ...noteDraft, subject: v })} onManage={onManageCategories} style={{ minWidth: 140 }} />
              <button className="primary-button" onClick={onSave}><Icon name="save" size={16} color="#fff" /> 저장</button>
            </div>
            <div className="inline-actions">
              {isDirty && <span className="editor-meta"><span className="unsaved-pill"><Icon name="circle-dot" size={11} />{selectedNote ? "저장되지 않은 변경사항" : "새 노트 작성 중"}</span></span>}
            </div>
            <textarea className="markdown-input" value={noteDraft.markdownContent} onChange={e => onDraftChange({ ...noteDraft, markdownContent: e.target.value })} aria-label="마크다운 노트 내용" />
          </>
        )}
      </section>
      {pendingNav && (
        <div className="cal-modal-overlay" onClick={() => setPendingNav(null)}>
          <div className="cal-day-panel unsaved-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-day-header">
              <h4>저장하지 않고 나갈까요?</h4>
              <button className="icon-button" onClick={() => setPendingNav(null)} aria-label="닫기"><Icon name="x" size={14} /></button>
            </div>
            <p className="unsaved-body">작성 중인 내용이 있습니다.<br />저장하지 않고 이동하면 변경사항이 사라집니다.</p>
            <div className="unsaved-actions">
              <button className="ghost-button" onClick={() => setPendingNav(null)}>취소</button>
              <button className="danger-button" onClick={discardAndNav}><Icon name="trash-2" size={14} />저장 안 함</button>
              <button className="primary-button" onClick={saveAndNav}><Icon name="save" size={14} color="#fff" />저장하고 이동</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TimerView — Stopwatch / Timer / Pomodoro
   ============================================================ */
interface TimerCfg {
  timerH: number; timerM: number; timerS: number;
  pomoStudySec: number; pomoBreakSec: number;
  pomoRepeat: number; pomoRound: number;
}

function PomoClock({ kind, label, hms, totalSec, active, running, started, liveSeconds, totalSeconds, onSet }: {
  kind: string; label: string; hms: { m: number; s: number }; totalSec: number;
  active: boolean; running: boolean; started: boolean; liveSeconds: number; totalSeconds: number;
  onSet: (part: string, val: string, max: number) => void;
}) {
  const R = 82, C = 2 * Math.PI * R;
  // Show the live remaining time for the active phase while running OR paused
  // mid-session, so pausing doesn't revert the face to the configured value.
  const showLive = active && (running || started);
  const faceSec = showLive ? liveSeconds : totalSec;
  const pct = showLive && totalSeconds > 0 ? Math.min(1, 1 - liveSeconds / totalSeconds) : 0;
  const dash = C * (1 - pct);
  const editable = !running && !started;
  const stateCls = running ? (active ? "is-active" : "is-idle") : "";
  return (
    <div className={`pomo-clock ${kind} ${stateCls}`}>
      <div className="pomo-clock-label"><span className={`pomo-clock-dot ${kind}`} />{label}</div>
      <div className={`timer-ring pomo ${kind === "break" ? "break" : ""} ${showLive ? "running-ring" : ""}`}>
        <svg viewBox="0 0 200 200">
          <circle className="ring-track" cx="100" cy="100" r={R} />
          <circle className="ring-fill" cx="100" cy="100" r={R} strokeDasharray={C} strokeDashoffset={dash} />
        </svg>
        {editable
          ? <div className="timer-face timer-face-edit pomo-face">
              <div className="timer-hms">
                <input className="thms-input pomo-thms" type="number" min={0} max={99} value={hms.m}
                  onChange={e => onSet("m", e.target.value, 99)} onFocus={e => e.target.select()} aria-label={`${label} 분`} />
                <span className="thms-sep">:</span>
                <input className="thms-input pomo-thms" type="number" min={0} max={59} value={hms.s}
                  onChange={e => onSet("s", e.target.value, 59)} onFocus={e => e.target.select()} aria-label={`${label} 초`} />
              </div>
            </div>
          : <div className="timer-face pomo-face">{formatTimer(faceSec)}</div>
        }
      </div>
    </div>
  );
}

function TimerView({
  timerType, seconds, totalSeconds, isRunning, started, subject, sessions, pomoPhase,
  timerCfg, setTimerCfg, onTypeChange, onSubjectChange, onStart, onPause, onFinish, onReset, onRecordLap, onDeleteSession,
  categories, onManageCategories, presets, setPresets, timerFavs, setTimerFavs,
}: {
  timerType: TimerType; seconds: number; totalSeconds: number; isRunning: boolean; started: boolean;
  subject: string; sessions: StudySession[]; pomoPhase: string;
  timerCfg: TimerCfg; setTimerCfg: React.Dispatch<React.SetStateAction<TimerCfg>>;
  onTypeChange: (t: TimerType) => void; onSubjectChange: (s: string) => void;
  onStart: () => void; onPause: () => void; onFinish: () => void; onReset: () => void;
  onRecordLap: () => void; onDeleteSession: (ids: string[]) => void;
  categories: string[]; onManageCategories: () => void;
  presets: TimerPreset[]; setPresets: React.Dispatch<React.SetStateAction<TimerPreset[]>>;
  timerFavs: TimerFav[]; setTimerFavs: React.Dispatch<React.SetStateAction<TimerFav[]>>;
}) {

  const secToHMS = (t: number) => ({ h: Math.floor(t / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 });
  const pomoStudyHMS = secToHMS(timerCfg.pomoStudySec || 0);
  const pomoBreakHMS = secToHMS(timerCfg.pomoBreakSec || 0);

  const setPomoHMS = (key: "pomoStudySec" | "pomoBreakSec", part: string, val: string, max: number) =>
    setTimerCfg(c => {
      const cur = secToHMS(c[key] || 0) as Record<string, number>;
      cur[part] = Math.max(0, Math.min(max, Math.floor(+val) || 0));
      return { ...c, [key]: Math.max(0, cur.h * 3600 + cur.m * 60 + cur.s) };
    });

  const setHMS = (key: string, val: string, max: number) =>
    setTimerCfg(c => ({ ...c, [key]: Math.max(0, Math.min(max, Math.floor(+val) || 0)) }));

  function applyPreset(p: typeof presets[0]) {
    setTimerCfg(c => ({ ...c, pomoStudySec: p.study * 60, pomoBreakSec: p.brk * 60, pomoRepeat: p.repeat }));
    onReset();
  }
  function savePreset() {
    if (presets.length >= 10) return;
    const sMin = Math.round(timerCfg.pomoStudySec / 60), bMin = Math.round(timerCfg.pomoBreakSec / 60);
    setPresets(ps => [...ps, { id: "p" + Date.now(), name: `${sMin}분/${bMin}분×${timerCfg.pomoRepeat}`, study: sMin, brk: bMin, repeat: timerCfg.pomoRepeat }]);
  }
  function applyFav(f: typeof timerFavs[0]) {
    setTimerCfg(c => ({ ...c, timerH: f.h, timerM: f.m, timerS: f.s }));
    onReset();
  }
  function saveFav() {
    if (timerFavs.length >= 10) return;
    const { timerH: h, timerM: m, timerS: s } = timerCfg;
    if (h + m + s === 0) return;
    const name = [h ? `${h}시간` : "", m ? `${m}분` : "", s ? `${s}초` : ""].filter(Boolean).join(" ");
    setTimerFavs(fs => [...fs, { id: "t" + Date.now(), name, h, m, s }]);
  }
  const favSecs = (f: typeof timerFavs[0]) => f.h * 3600 + f.m * 60 + f.s;

  const R = 110, C = 2 * Math.PI * R;
  const pct = totalSeconds > 0 ? Math.min(1, 1 - seconds / totalSeconds) : 0;
  const dashOffset = C * (1 - pct);
  const editableTimer = timerType === "TIMER" && !isRunning && !started;

  return (
    <div className="timer-layout view-enter">
      <section className={`panel timer-panel${isRunning ? " timer-running" : ""}`}>
        <div className="segmented">
          <button className={timerType === "STOPWATCH" ? "active" : ""} onClick={() => onTypeChange("STOPWATCH")}>스톱워치</button>
          <button className={timerType === "TIMER" ? "active" : ""} onClick={() => onTypeChange("TIMER")}>타이머</button>
          <button className={timerType === "POMODORO" ? "active" : ""} onClick={() => onTypeChange("POMODORO")}>포모도로</button>
        </div>
        <CategoryField categories={categories} value={subject} onChange={onSubjectChange}
          onManage={onManageCategories} style={{ maxWidth: 260 }} />

        {timerType === "POMODORO"
          ? <div className="pomo-clocks">
              <div className="pomo-cycle-rep pomo-repeat-top">
                <button className="pomo-step" disabled={isRunning} onClick={() => setTimerCfg(c => ({ ...c, pomoRepeat: Math.max(1, c.pomoRepeat - 1) }))}>−</button>
                <span className="pomo-cycle-text"><strong>{timerCfg.pomoRound}</strong> / {timerCfg.pomoRepeat} 회 반복</span>
                <button className="pomo-step" disabled={isRunning} onClick={() => setTimerCfg(c => ({ ...c, pomoRepeat: Math.min(12, c.pomoRepeat + 1) }))}>+</button>
              </div>
              <div className="pomo-clocks-row">
                <PomoClock kind="study" label="학습시간" hms={pomoStudyHMS} totalSec={timerCfg.pomoStudySec}
                  active={pomoPhase === "study"} running={isRunning} started={started} liveSeconds={seconds} totalSeconds={totalSeconds}
                  onSet={(p, v, mx) => setPomoHMS("pomoStudySec", p, v, mx)} />
                <div className="pomo-cycle"><div className="pomo-divider" /></div>
                <PomoClock kind="break" label="휴게시간" hms={pomoBreakHMS} totalSec={timerCfg.pomoBreakSec}
                  active={pomoPhase === "break"} running={isRunning} started={started} liveSeconds={seconds} totalSeconds={totalSeconds}
                  onSet={(p, v, mx) => setPomoHMS("pomoBreakSec", p, v, mx)} />
              </div>
            </div>
          : <div className={`timer-ring${editableTimer ? " editable" : ""}`}>
              <svg viewBox="0 0 240 240">
                <circle className="ring-track" cx="120" cy="120" r={R} />
                {timerType !== "STOPWATCH" && (
                  <circle className="ring-fill" cx="120" cy="120" r={R} strokeDasharray={C} strokeDashoffset={dashOffset} />
                )}
              </svg>
              {editableTimer
                ? <div className="timer-face timer-face-edit">
                    <div className="timer-hms">
                      <input className="thms-input" type="number" min={0} max={23} value={timerCfg.timerH}
                        onChange={e => setHMS("timerH", e.target.value, 23)} onFocus={e => e.target.select()} aria-label="시간" />
                      <span className="thms-sep">:</span>
                      <input className="thms-input" type="number" min={0} max={59} value={timerCfg.timerM}
                        onChange={e => setHMS("timerM", e.target.value, 59)} onFocus={e => e.target.select()} aria-label="분" />
                      <span className="thms-sep">:</span>
                      <input className="thms-input" type="number" min={0} max={59} value={timerCfg.timerS}
                        onChange={e => setHMS("timerS", e.target.value, 59)} onFocus={e => e.target.select()} aria-label="초" />
                    </div>
                  </div>
                : <div className="timer-face">{formatTimer(seconds)}</div>
              }
            </div>
        }

        <div className="timer-actions">
          {isRunning
            ? <button className="secondary-button" onClick={onPause}><Pause size={17} /> 일시정지</button>
            : <button className="primary-button" onClick={onStart}><Play size={17} /> 시작</button>}
          <button className="secondary-button" onClick={timerType === "STOPWATCH" ? onRecordLap : onFinish}>
            <BookmarkPlus size={17} /> 기록
          </button>
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
                <button className="chip-button" disabled={presets.length >= 10} onClick={savePreset}><Pin size={13} />현재 고정</button>
              </div>
            </div>
            <div className="preset-list">
              {presets.length === 0 && <p className="empty-text">저장된 프리셋이 없습니다.</p>}
              {presets.map(p => (
                <div key={p.id} className="preset-row">
                  <button className="preset-btn" onClick={() => applyPreset(p)}>
                    <strong>{p.name}</strong><span>{p.study}분 학습 · {p.brk}분 휴식 · {p.repeat}회</span>
                  </button>
                  <button className="icon-button" onClick={() => setPresets(ps => ps.filter(x => x.id !== p.id))} aria-label="삭제"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        )}
        {timerType === "TIMER" && (
          <section className="panel">
            <div className="section-heading">
              <h3>타이머 즐겨찾기</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{timerFavs.length}/10</span>
                <button className="chip-button"
                  disabled={timerFavs.length >= 10 || (timerCfg.timerH || 0) + (timerCfg.timerM || 0) + (timerCfg.timerS || 0) === 0}
                  onClick={saveFav}><Pin size={13} />현재 시간 저장</button>
              </div>
            </div>
            <div className="preset-list">
              {timerFavs.length === 0 && <p className="empty-text">저장된 타이머가 없습니다.</p>}
              {timerFavs.map(f => (
                <div key={f.id} className="preset-row">
                  <button className="preset-btn" onClick={() => applyFav(f)}>
                    <strong>{f.name}</strong><span>{formatTimer(favSecs(f))}</span>
                  </button>
                  <button className="icon-button" onClick={() => setTimerFavs(fs => fs.filter(x => x.id !== f.id))} aria-label="삭제"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="panel">
          <div className="section-heading"><h3>자동 기록</h3><span>{sessions.length}개</span></div>
          <SessionList sessions={sessions.slice(0, 8)} />
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   StatsView
   ============================================================ */
function StatsView({ sessions, categories }: { sessions: StudySession[]; categories: string[] }) {
  const allSubs = [...new Set([...categories, ...sessions.map(s => s.subject)])];
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);
  const monthly = sessions.filter(s => s.endTime.slice(0, 7) === monthStr).reduce((a, s) => a + s.durationMinutes, 0);

  const todaySess = sessions.filter(s => s.endTime.slice(0, 10) === todayStr);
  const pastSess = sessions.filter(s => {
    const ago = (Date.now() - new Date(s.endTime).getTime()) / 86400000;
    return ago > 0 && ago <= 30;
  });
  const subjectData = allSubs.map(sub => {
    const todayMin = todaySess.filter(s => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0);
    const avgMin = pastSess.filter(s => s.subject === sub).reduce((a, s) => a + s.durationMinutes, 0) / 30;
    return { sub, todayMin, avgMin };
  }).filter(d => d.todayMin > 0 || d.avgMin > 0.5);

  const maxMin = Math.max(30, ...subjectData.map(d => Math.max(d.todayMin, d.avgMin)));

  const subjectTotals = allSubs.map(sub => ({
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
   TimetableView
   ============================================================ */
function TimetableView({ blocks, setBlocks }: {
  blocks: Record<string, TimetableBlock>;
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, TimetableBlock>>>;
}) {
  const DAYS = ["월","화","수","목","금","토","일"];
  const HOURS = Array.from({ length: 17 }, (_, i) => i + 7);
  const COLORS = ["#e0533a","#e8902f","#d9b008","#3fa45b","#3b78d9","#9a59c2"];
  const [editing, setEditing] = useState<{ d: number; h: number; k: string; isNew: boolean } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState(COLORS[3]);
  const [selected, setSelected] = useState(new Set<string>());
  const [bulkLabel, setBulkLabel] = useState("");
  const [bulkColor, setBulkColor] = useState(COLORS[3]);
  const [confirmReset, setConfirmReset] = useState(false);
  const cellKey = (d: number, h: number) => `${d}-${h}`;
  const clearAll = () => { setBlocks({}); setSelected(new Set()); setConfirmReset(false); };
  const handleCellClick = (d: number, h: number) => {
    const k = cellKey(d, h), b = blocks[k];
    if (b) { setEditLabel(b.label); setEditColor(b.color); setEditing({ d, h, k, isNew: false }); }
    else { setSelected(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  };
  const saveBulk = () => {
    if (!bulkLabel.trim() || selected.size === 0) return;
    const upd: Record<string, { label: string; color: string }> = {};
    selected.forEach(k => { upd[k] = { label: bulkLabel.trim(), color: bulkColor }; });
    setBlocks(b => ({ ...b, ...upd })); setSelected(new Set()); setBulkLabel("");
  };
  const save = () => {
    if (!editing) return;
    if (editLabel.trim()) setBlocks(b => ({ ...b, [editing.k]: { label: editLabel.trim(), color: editColor } }));
    else setBlocks(b => { const n = { ...b }; delete n[editing.k]; return n; });
    setEditing(null);
  };
  return (
    <div className="timetable-layout view-enter">
      <section className="panel timetable-panel">
        <div>
          <div className="section-heading">
            <h3>주간 시간표</h3>
            {selected.size === 0 && <span style={{ color: "var(--muted)", fontSize: 11 }}>빈 칸 클릭으로 선택 · 채워진 칸은 편집</span>}
            <button className="icon-button" title="시간표 초기화" aria-label="시간표 초기화" onClick={() => setConfirmReset(true)}
              style={{ marginLeft: "auto", opacity: Object.keys(blocks).length > 0 ? 1 : 0.3, pointerEvents: Object.keys(blocks).length > 0 ? "auto" : "none" }}>
              <RotateCcw size={15} />
            </button>
          </div>
          {selected.size > 0 && (
            <div className="tt-bulk-bar">
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {COLORS.map(c => <button key={c} type="button" className={`cal-swatch${bulkColor === c ? " active" : ""}`} style={{ background: c, width: 18, height: 18, borderRadius: "50%" }} onClick={() => setBulkColor(c)} />)}
              </div>
              <input className="cal-text-input" style={{ height: 30, fontSize: 13, padding: "0 10px", flex: 1, minWidth: 0 }} placeholder="일정 이름…" value={bulkLabel}
                autoFocus onChange={e => setBulkLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveBulk(); if (e.key === "Escape") setSelected(new Set()); }} />
              <button className="chip-button" style={{ flexShrink: 0 }} disabled={!bulkLabel.trim()} onClick={saveBulk}><Check size={13} />{selected.size}칸 추가</button>
              <button className="chip-button" style={{ flexShrink: 0 }} onClick={() => setSelected(new Set())}><X size={13} />취소</button>
            </div>
          )}
        </div>
        <div className="tt-scroll">
          <div className="timetable-grid" style={{ gridTemplateColumns: "44px repeat(7,1fr)" }}>
            <div className="tt-corner" />
            {DAYS.map(d => <div key={d} className="tt-day-head">{d}</div>)}
            {HOURS.map(h => (
              <React.Fragment key={h}>
                <div className="tt-hour">
                  <div className="tt-hour-label"><span className="tt-hh">{h}</span><span className="tt-mm">:00</span></div>
                </div>
                {DAYS.map((_, di) => {
                  const k = cellKey(di, h), b = blocks[k], isSel = selected.has(k);
                  return (
                    <div key={k} className={`tt-cell ${b ? "has-block" : ""} ${isSel ? "tt-selected" : ""}`}
                      style={b ? { borderLeft: `3px solid ${b.color}`, background: b.color + "18" } : isSel ? { background: bulkColor + "28", borderLeft: `3px solid ${bulkColor}` } : {}}
                      onClick={() => handleCellClick(di, h)}>
                      {b && <span className="tt-block-label" style={{ color: b.color }}>{b.label}</span>}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            <div className="tt-hour tt-hour-end">
              <div className="tt-hour-label"><span className="tt-hh">24</span><span className="tt-mm">:00</span></div>
            </div>
            {DAYS.map((_, di) => <div key={`end-${di}`} className="tt-cell tt-cell-end" />)}
          </div>
        </div>
      </section>

      {confirmReset && (
        <div className="cal-modal-overlay" onClick={() => setConfirmReset(false)}>
          <div className="cal-day-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 320 }}>
            <div className="cal-day-header">
              <h4>시간표 초기화</h4>
              <button className="icon-button" onClick={() => setConfirmReset(false)} aria-label="닫기"><X size={14} /></button>
            </div>
            <p style={{ margin: "12px 0", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>시간표에 입력된 모든 일정이 삭제됩니다.<br />정말 초기화할까요?</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ghost-button" onClick={() => setConfirmReset(false)}>취소</button>
              <button className="danger-button" onClick={clearAll}><Trash2 size={15} />초기화</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="cal-modal-overlay" onClick={() => setEditing(null)}>
          <div className="cal-day-panel" onClick={e => e.stopPropagation()}>
            <div className="cal-day-header">
              <h4>{DAYS[editing.d]}요일 {editing.h}:00</h4>
              <button className="icon-button" onClick={() => setEditing(null)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="cal-color-swatches">
                {COLORS.map(c => <button key={c} type="button" className={`cal-swatch${editColor === c ? " active" : ""}`} style={{ background: c }} onClick={() => setEditColor(c)} />)}
              </div>
              <input className="cal-text-input" autoFocus placeholder="수업/활동 이름…" value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(null); }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary-button" onClick={save}><Check size={15} color="#fff" />저장</button>
                {!editing.isNew && <button className="danger-button" onClick={() => { setBlocks(b => { const n = { ...b }; delete n[editing!.k]; return n; }); setEditing(null); }}><Trash2 size={15} />삭제</button>}
              </div>
            </div>
          </div>
        </div>
      )}
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
   AI Tutor
   ============================================================
   Gemini API 연동: 아래 apiKey에 https://aistudio.google.com/apikey 에서
   발급받은 키만 넣으면 됩니다. (endpoint/model/provider는 그대로)
   ============================================================ */
const TUTOR_API = {
  provider: "gemini" as "gemini" | "openai" | "claude" | "custom",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
  apiKey: "",
  model: "gemini-2.0-flash",
  systemPrompt: "당신은 친절하고 침착한 AI 학습 튜터입니다. 한국어로 답변하되, 코드 예제와 단계별 설명을 적극적으로 사용하세요. 답변은 학생이 직접 추론할 수 있도록 가이드하는 방향으로 작성하며, 지나치게 길지 않게 핵심을 짚어주세요.",
};

type TutorMsg = { role: "user" | "assistant"; content: string; ts: number; isError?: boolean };
type TutorSession = { id: string; title: string; messages: TutorMsg[]; createdAt: number };

async function callTutorAPI(messages: { role: string; content: string }[]) {
  const { endpoint, apiKey, model, provider, systemPrompt } = TUTOR_API;
  if (!endpoint || !apiKey) {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    const last = messages[messages.length - 1]?.content || "";
    return `**(데모 모드)** 실제 응답을 받으려면 \`page.tsx\`의 \`TUTOR_API\` 객체에 endpoint와 apiKey를 입력하세요.\n\n질문: "${last.slice(0, 80)}${last.length > 80 ? "…" : ""}"\n\n좋은 질문입니다. 이 주제를 이해하려면 세 가지를 살펴보면 좋습니다:\n\n1. **기본 개념** — 가장 단순한 형태부터 시작\n2. **핵심 패턴** — 반복되는 구조 파악\n3. **응용** — 실제 문제에 적용\n\n\`\`\`python\ndef example(n):\n    if n <= 1:\n        return n\n    return example(n - 1) + example(n - 2)\n\`\`\`\n\n어느 부분부터 더 깊이 살펴볼까요?`;
  }
  let url: string, headers: Record<string, string>, body: string;
  if (provider === "claude") {
    url = endpoint;
    headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
    body = JSON.stringify({ model: model || "claude-sonnet-4-5", max_tokens: 2048, system: systemPrompt, messages });
  } else if (provider === "openai") {
    url = endpoint;
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
    body = JSON.stringify({ model: model || "gpt-4o", messages: [{ role: "system", content: systemPrompt }, ...messages] });
  } else if (provider === "gemini") {
    const cleaned = messages.filter(m => m.content?.trim());
    url = `${endpoint}?key=${apiKey}`;
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: cleaned.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });
  } else {
    url = endpoint;
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
    body = JSON.stringify({ model, messages });
  }
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`API 오류 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (provider === "claude") return data.content?.[0]?.text || "";
  if (provider === "openai") return data.choices?.[0]?.message?.content || "";
  if (provider === "gemini") return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return data.content || data.text || data.message || JSON.stringify(data);
}

function loadTutorSessions(): TutorSession[] {
  try { return JSON.parse(localStorage.getItem("hak.tutor.sessions") || "[]"); } catch { return []; }
}
function saveTutorSessions(s: TutorSession[]) {
  try { localStorage.setItem("hak.tutor.sessions", JSON.stringify(s.slice(0, 20))); } catch {}
}

function renderTutorMsg(text: string): Array<{ type: "text" | "code"; content: string; lang?: string; key: number }> {
  const blocks: Array<{ type: "text" | "code"; content: string; lang?: string; key: number }> = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0, m: RegExpExecArray | null, idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) blocks.push({ type: "text", content: text.slice(last, m.index), key: idx++ });
    blocks.push({ type: "code", lang: m[1] || "text", content: m[2], key: idx++ });
    last = re.lastIndex;
  }
  if (last < text.length) blocks.push({ type: "text", content: text.slice(last), key: idx++ });
  return blocks.length ? blocks : [{ type: "text", content: text, key: 0 }];
}

function TutorInlineText({ children }: { children: string }) {
  const html = String(children)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, '<code class="tutor-inline-code">$1</code>')
    .replace(/\n/g, "<br/>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function tokenize(src: string) {
  const out: { cls: string; text: string }[] = [];
  const KW = /\b(def|return|if|else|elif|for|while|in|is|not|and|or|class|import|from|as|with|try|except|finally|raise|lambda|None|True|False|function|const|let|var|new|this|null|undefined|true|false|async|await|export|default)\b/;
  const pat = /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("[^"\n]*"|'[^'\n]*'|`[^`\n]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][A-Za-z0-9_$]*)|([(){}[\];,:.+\-*/=<>!&|?^%~]+)|(\s+)|([\s\S])/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(src)) !== null) {
    if (m[1]) out.push({ cls: "tk-comment", text: m[1] });
    else if (m[2]) out.push({ cls: "tk-string", text: m[2] });
    else if (m[3]) out.push({ cls: "tk-number", text: m[3] });
    else if (m[4]) out.push({ cls: KW.test(m[4]) ? "tk-keyword" : "tk-ident", text: m[4] });
    else if (m[5]) out.push({ cls: "tk-op", text: m[5] });
    else out.push({ cls: "", text: m[0] });
  }
  return out;
}

function TutorCodeBlock({ lang, content }: { lang?: string; content: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  const tokens = useMemo(() => tokenize(content), [content]);
  return (
    <div className="tutor-code">
      <div className="tutor-code-head">
        <span className="tutor-code-lang">{lang || "text"}</span>
        <button className="tutor-code-copy" onClick={copy} aria-label="복사"><Icon name={copied ? "check" : "copy"} size={12} />{copied ? "복사됨" : "COPY"}</button>
      </div>
      <pre className="tutor-code-body"><code>{tokens.map((t, i) => <span key={i} className={t.cls}>{t.text}</span>)}</code></pre>
    </div>
  );
}

function TutorView() {
  const [sessions, setSessions] = useState<TutorSession[]>(() => (typeof window !== "undefined" ? loadTutorSessions() : []));
  const [activeId, setActiveId] = useState<string | null>(() => (typeof window !== "undefined" ? loadTutorSessions()[0]?.id || null : null));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveTutorSessions(sessions); }, [sessions]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [activeId, sessions]);

  const active = sessions.find(s => s.id === activeId);
  const isConfigured = !!(TUTOR_API.endpoint && TUTOR_API.apiKey);

  function newSession() {
    const id = createId("tutor");
    setSessions(prev => [{ id, title: "새 세션", messages: [], createdAt: Date.now() }, ...prev]);
    setActiveId(id);
    setDraft("");
  }
  function deleteSession(id: string) {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) setActiveId(sessions.find(s => s.id !== id)?.id || null);
  }

  async function send(prompt?: string) {
    const text = (prompt ?? draft).trim();
    if (!text || busy) return;
    let sessionId = activeId;
    let isFirst = false;
    if (!sessionId) {
      sessionId = createId("tutor");
      setSessions(prev => [{ id: sessionId!, title: text.slice(0, 24), messages: [], createdAt: Date.now() }, ...prev]);
      setActiveId(sessionId);
      isFirst = true;
    }
    const userMsg: TutorMsg = { role: "user", content: text, ts: Date.now() };
    setSessions(prev => prev.map(s => s.id === sessionId ? {
      ...s,
      title: isFirst || s.messages.length === 0 ? text.slice(0, 24) : s.title,
      messages: [...s.messages, userMsg],
    } : s));
    setDraft("");
    setBusy(true);
    try {
      const cur = (sessions.find(s => s.id === sessionId)?.messages || []).concat(userMsg);
      const reply = await callTutorAPI(cur.map(m => ({ role: m.role, content: m.content })));
      const aiMsg: TutorMsg = { role: "assistant", content: reply, ts: Date.now() };
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, aiMsg] } : s));
    } catch (err) {
      const errMsg: TutorMsg = { role: "assistant", content: `⚠️ 오류: ${(err as Error).message}`, ts: Date.now(), isError: true };
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, errMsg] } : s));
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="tutor-layout view-enter">
      <aside className="tutor-rail">
        <button className="primary-button tutor-new-btn" onClick={newSession}>
          <Icon name="plus" size={15} color="#fff" />새 세션 시작
        </button>
        <div className="tutor-rail-section">
          <h4 className="tutor-rail-head">최근 세션</h4>
          {sessions.length === 0 && <p className="tutor-rail-empty">아직 세션이 없어요</p>}
          {sessions.map(s => (
            <div key={s.id} className={`tutor-session-row ${s.id === activeId ? "active" : ""}`}>
              <button className="tutor-session-btn" onClick={() => setActiveId(s.id)}>
                <Icon name="message-square" size={14} />
                <span>{s.title || "이름 없음"}</span>
              </button>
              <button className="tutor-session-del" onClick={() => deleteSession(s.id)} aria-label="삭제"><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      </aside>

      <section className="tutor-chat-panel">
        <header className="tutor-chat-head">
          <div>
            <h3 className="tutor-chat-title">{active?.title || "AI 튜터"}</h3>
            <span className={`tutor-status ${isConfigured ? "ok" : "warn"}`}>
              <span className="tutor-status-dot" />
              {isConfigured ? "AI Tutor Active" : "데모 모드 (API 미설정)"}
            </span>
          </div>
          <div className="tutor-chat-actions">
            <button className="icon-button" title="대화 내보내기" aria-label="대화 내보내기"
              onClick={() => {
                if (!active) return;
                const txt = active.messages.map(m => `## ${m.role === "user" ? "사용자" : "AI 튜터"}\n${m.content}`).join("\n\n");
                const blob = new Blob([txt], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `${active.title || "tutor"}.md`; a.click();
                URL.revokeObjectURL(url);
              }}><Icon name="download" size={15} /></button>
          </div>
        </header>

        <div className="tutor-chat-scroll" ref={scrollRef}>
          {!active || active.messages.length === 0 ? (
            <div className="tutor-empty">
              <div className="tutor-empty-mark"><Icon name="sparkles" size={28} /></div>
              <h4>무엇을 배워볼까요?</h4>
              <p>모르는 내용이나 영단어를 자유롭게 질문해 보세요.</p>
            </div>
          ) : (
            active.messages.map((m, i) => (
              <div key={i} className={`tutor-msg ${m.role}`}>
                {m.role === "assistant" && (
                  <div className="tutor-msg-head"><span className="tutor-avatar"><Icon name="bot" size={14} /></span><strong>AI 튜터</strong></div>
                )}
                {m.role === "user" && <div className="tutor-msg-head"><strong>나</strong></div>}
                <div className={`tutor-bubble ${m.role}${m.isError ? " is-error" : ""}`}>
                  {renderTutorMsg(m.content).map(b =>
                    b.type === "code"
                      ? <TutorCodeBlock key={b.key} lang={b.lang} content={b.content} />
                      : <p key={b.key} className="tutor-para"><TutorInlineText>{b.content}</TutorInlineText></p>
                  )}
                </div>
              </div>
            ))
          )}
          {busy && (
            <div className="tutor-msg assistant">
              <div className="tutor-msg-head"><span className="tutor-avatar"><Icon name="bot" size={14} /></span><strong>AI 튜터</strong></div>
              <div className="tutor-bubble assistant tutor-typing"><span className="tutor-dot" /><span className="tutor-dot" /><span className="tutor-dot" /></div>
            </div>
          )}
        </div>

        <div className="tutor-input-wrap">
          <textarea className="tutor-input" rows={1} placeholder="질문을 입력하세요..." value={draft} disabled={busy}
            onChange={e => setDraft(e.target.value)} onKeyDown={onKey} />
          <div className="tutor-input-foot">
            <div className="tutor-input-tools">
              <button className="tutor-tool-btn" title="첨부 (준비 중)" disabled aria-label="첨부"><Icon name="paperclip" size={14} /></button>
              <button className="tutor-tool-btn" title="코드 블록" aria-label="코드 블록" onClick={() => setDraft(d => d + "\n```\n\n```")}><Icon name="code" size={14} /></button>
            </div>
            <button className="tutor-send" disabled={busy || !draft.trim()} onClick={() => send()} aria-label="보내기"><Icon name={busy ? "loader-2" : "send"} size={16} color="#fff" /></button>
          </div>
          <p className="tutor-disclaimer">AI는 실수를 할 수 있습니다. 중요한 정보는 확인하세요.</p>
        </div>
      </section>
    </div>
  );
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
  const [uploadStatus, setUploadStatus] = useState("파일을 선택해 폴더에 자료를 업로드하세요.");
  // User preferences (timetable, calendar, categories, timer presets) — synced per-user via DB.
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [timetable, setTimetable] = useState<Record<string, TimetableBlock>>({});
  const [scheds, setScheds] = useState<Record<string, Sched[]>>({});
  const [presets, setPresets] = useState<TimerPreset[]>(DEFAULT_PRESETS);
  const [timerFavs, setTimerFavs] = useState<TimerFav[]>(DEFAULT_TIMER_FAVS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsUserId, setPrefsUserId] = useState<string | null>(null);
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  // Favorites (pinned) — persisted
  const [pinnedNotes, setPinnedNotes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("hak.pinnedNotes") || "[]"); } catch { return []; }
  });
  const [pinnedMaterials, setPinnedMaterials] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("hak.pinnedMaterials") || "[]"); } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("hak.pinnedNotes", JSON.stringify(pinnedNotes)); } catch {} }, [pinnedNotes]);
  useEffect(() => { try { localStorage.setItem("hak.pinnedMaterials", JSON.stringify(pinnedMaterials)); } catch {} }, [pinnedMaterials]);

  // Per-material AI summary in-flight
  const [summarizingMatId, setSummarizingMatId] = useState<string | null>(null);

  // Inline summary editor (within Notes view)
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<SummaryDraft>({ title: "", content: "", category: "" });

  // Unsaved-note guard for sidebar tab switches
  const [noteDirty, setNoteDirty] = useState(false);
  const [pendingTabNav, setPendingTabNav] = useState<TabId | null>(null);

  function addCategory(name: string): boolean {
    const n = name.trim();
    if (!n) return false;
    if (categories.some(c => c.toLowerCase() === n.toLowerCase())) { pushToast("이미 있는 카테고리예요"); return false; }
    setCategories(cs => [...cs, n]);
    pushToast(`'${n}' 카테고리를 추가했어요`, { accent: true });
    return true;
  }
  function renameCategory(oldName: string, newName: string) {
    const n = newName.trim();
    if (!n || n === oldName) return;
    if (categories.some(c => c.toLowerCase() === n.toLowerCase() && c !== oldName)) { pushToast("이미 있는 카테고리예요"); return; }
    setCategories(cs => cs.map(c => c === oldName ? n : c));
    setState(prev => ({
      ...prev,
      notes: prev.notes.map(x => x.subject === oldName ? { ...x, subject: n } : x),
      materials: prev.materials.map(x => x.category === oldName ? { ...x, category: n } : x),
      summaries: prev.summaries.map(x => x.category === oldName ? { ...x, category: n } : x),
      sessions: prev.sessions.map(x => x.subject === oldName ? { ...x, subject: n } : x),
    }));
    setNoteDraft(d => d.subject === oldName ? { ...d, subject: n } : d);
    setTimerSubject(s => s === oldName ? n : s);
    pushToast("카테고리 이름을 변경했어요");
  }
  function deleteCategory(name: string) {
    if (categories.length <= 1) { pushToast("최소 1개의 카테고리가 필요해요"); return; }
    const fallback = categories.find(c => c === "기타" && c !== name) || categories.find(c => c !== name) || "기타";
    setCategories(cs => cs.filter(c => c !== name));
    setState(prev => ({
      ...prev,
      notes: prev.notes.map(x => x.subject === name ? { ...x, subject: fallback } : x),
      materials: prev.materials.map(x => x.category === name ? { ...x, category: fallback } : x),
      summaries: prev.summaries.map(x => x.category === name ? { ...x, category: fallback } : x),
      sessions: prev.sessions.map(x => x.subject === name ? { ...x, subject: fallback } : x),
    }));
    setNoteDraft(d => d.subject === name ? { ...d, subject: fallback } : d);
    setTimerSubject(s => s === name ? fallback : s);
    pushToast(`'${name}' 카테고리를 삭제했어요`);
  }

  const [timerType, setTimerType] = useState<TimerType>("STOPWATCH");
  const [timerSubject, setTimerSubject] = useState(() => categories[0] || "기타");
  const [seconds, setSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [pomoPhase, setPomoPhase] = useState<"study" | "break">("study");
  const [timerCfg, setTimerCfg] = useState<TimerCfg>({
    timerH: 0, timerM: 30, timerS: 0,
    pomoStudySec: 1500, pomoBreakSec: 300,
    pomoRepeat: 4, pomoRound: 0,
  });
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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const uid = currentUser?.userId;
    const userNotes = uid ? (state.notes?.filter(n => n.userId === uid) ?? []) : [];
    const userMats = uid ? (state.materials?.filter(m => m.userId === uid) ?? []) : [];
    for (const n of userNotes) if (n.subject) counts[n.subject] = (counts[n.subject] || 0) + 1;
    for (const m of userMats) if (m.category) counts[m.category] = (counts[m.category] || 0) + 1;
    return counts;
  }, [state.notes, state.materials, currentUser]);

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

  // Persist preferences (timetable, calendar, categories, timer presets) to the DB so
  // they sync across devices. Debounced; only after the current user's prefs have loaded.
  useEffect(() => {
    if (!prefsLoaded || !currentUser || prefsUserId !== currentUser.userId) return;
    const handle = window.setTimeout(() => {
      void persistStore({
        operation: "savePreferences",
        userId: currentUser.userId,
        preferences: { timetable, scheds, categories, presets, timerFavs },
      });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [timetable, scheds, categories, presets, timerFavs, prefsLoaded, prefsUserId, currentUser?.userId]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setSeconds(v => timerType === "POMODORO" || timerType === "TIMER" ? Math.max(0, v - 1) : v + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, timerType]);

  /* sync seconds/totalSeconds when cfg changes while idle */
  useEffect(() => {
    if (isRunning) return;
    // Mid-session pause (started, not yet reset/finished): keep the remaining
    // time so pausing doesn't reset the countdown.
    if (timerStartRef.current) return;
    if (timerType === "TIMER") {
      const s = Math.max(1, (timerCfg.timerH || 0) * 3600 + (timerCfg.timerM || 0) * 60 + (timerCfg.timerS || 0));
      setSeconds(s); setTotalSeconds(s);
    } else if (timerType === "POMODORO") {
      const s = pomoPhase === "study" ? timerCfg.pomoStudySec : timerCfg.pomoBreakSec;
      setSeconds(s); setTotalSeconds(s);
    }
  }, [timerCfg.timerH, timerCfg.timerM, timerCfg.timerS, timerCfg.pomoStudySec, timerCfg.pomoBreakSec, timerType, pomoPhase, isRunning]);

  useEffect(() => {
    if (timerType === "TIMER" && isRunning && seconds === 0) {
      finishTimer();
    } else if (timerType === "POMODORO" && isRunning && seconds === 0) {
      if (pomoPhase === "study") {
        recordSession(Math.max(1, Math.round(timerCfg.pomoStudySec / 60)));
        const nextRound = timerCfg.pomoRound + 1;
        setTimerCfg(c => ({ ...c, pomoRound: nextRound }));
        if (nextRound >= timerCfg.pomoRepeat) {
          resetTimer();
        } else {
          setPomoPhase("break");
          const t = timerCfg.pomoBreakSec;
          setSeconds(t); setTotalSeconds(t);
        }
      } else {
        setPomoPhase("study");
        const t = timerCfg.pomoStudySec;
        setSeconds(t); setTotalSeconds(t);
      }
    }
  }, [seconds, isRunning, timerType, pomoPhase]);

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
    if (!currentUser) {
      // Reset preferences to defaults on logout so the next account starts clean.
      setTimetable({}); setScheds({}); setCategories(DEFAULT_CATEGORIES);
      setPresets(DEFAULT_PRESETS); setTimerFavs(DEFAULT_TIMER_FAVS);
      setPrefsLoaded(false); setPrefsUserId(null);
      return;
    }
    let cancelled = false;
    setPrefsLoaded(false);
    async function loadRemoteState() {
      const userId = currentUser!.userId;
      try {
        const response = await fetch(`/api/store?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error("Remote state request failed");
        const data = (await response.json()) as Omit<AppState, "user"> & { preferences: UserPreferences | null };
        if (cancelled) return;
        const { preferences, ...appData } = data;
        setState(prev => prev.user?.userId === userId ? { ...prev, ...appData } : prev);
        const defaults = makeDefaultPreferences();
        setTimetable(preferences?.timetable ?? defaults.timetable);
        setScheds(preferences?.scheds ?? defaults.scheds);
        setCategories(preferences?.categories ?? defaults.categories);
        setPresets(preferences?.presets ?? defaults.presets);
        setTimerFavs(preferences?.timerFavs ?? defaults.timerFavs);
        setPrefsUserId(userId);
        setPrefsLoaded(true);
      } catch {
        // connection failed — keep current in-memory prefs, but don't persist stale data.
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
  const character = useMemo(
    () => ({ ...calculateCharacter(currentUser?.userId ?? "guest", userSessions), nickname: currentUser?.nickname ?? "" }),
    [currentUser?.userId, currentUser?.nickname, userSessions]
  );
  const attendance = useMemo(
    () => new Set(userSessions.map(s => s.endTime.slice(0, 10))).size,
    [userSessions]
  );
  const selectedSummary = userSummaries.find(s => s.summaryId === selectedSummaryId) ?? userSummaries[0];
  const selectedNote = userNotes.find(n => n.noteId === selectedNoteId) ?? userNotes[0];

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

  async function handleUpload(event: ChangeEvent<HTMLInputElement>, category: string) {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;
    const cat = category || categories[0] || "기타";
    setUploadStatus("파일을 업로드하고 텍스트를 추출하는 중입니다.");
    try {
      // Upload via the server so real text (incl. PDF) is extracted and stored in the DB.
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", currentUser.userId);
      const uploadRes = await fetch("/api/materials/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = (await uploadRes.json().catch(() => ({}))) as { error?: string };
        setUploadStatus(err.error || "업로드에 실패했습니다.");
        return;
      }
      const { material } = (await uploadRes.json()) as { material: LearningMaterial };
      // 폴더 저장만 — AI 요약은 자료별 "AI 요약" 버튼에서 생성합니다.
      const withCat: LearningMaterial = { ...material, category: cat };
      setState(prev => ({ ...prev, materials: [withCat, ...prev.materials] }));
      setUploadStatus(`'${material.fileName}' 자료를 ${cat} 폴더에 저장했습니다.`);
      pushToast(`'${cat}' 폴더에 자료를 업로드했어요`, { icon: "upload-cloud" });
    } catch {
      setUploadStatus("업로드 중 오류가 발생했습니다.");
    } finally {
      event.target.value = "";
    }
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

  function deleteSummary(summaryId: string) {
    if (!currentUser) return;
    setState(prev => ({ ...prev, summaries: prev.summaries.filter(s => s.summaryId !== summaryId) }));
    setSelectedSummaryId("");
    void persistStore({ operation: "deleteSummary", userId: currentUser.userId, summaryId });
    pushToast("요약을 삭제했어요");
  }

  /* ---- Notes: rename / move / pin ---- */
  function renameNote(noteId: string, newTitle: string) {
    if (!currentUser) return;
    setState(prev => ({ ...prev, notes: prev.notes.map(n => n.noteId === noteId ? { ...n, title: newTitle } : n) }));
    if (selectedNote?.noteId === noteId) setNoteDraft(d => ({ ...d, title: newTitle }));
    pushToast("노트 이름을 변경했어요");
  }
  function moveNote(noteId: string, newCategory: string) {
    if (!currentUser) return;
    const now = new Date().toISOString();
    setState(prev => ({ ...prev, notes: prev.notes.map(n => n.noteId === noteId ? { ...n, subject: newCategory, updatedAt: now } : n) }));
    if (selectedNote?.noteId === noteId) setNoteDraft(d => ({ ...d, subject: newCategory }));
    pushToast(`'${newCategory}' 폴더로 이동했어요`);
  }
  function togglePinNote(noteId: string) {
    setPinnedNotes(p => p.includes(noteId) ? p.filter(id => id !== noteId) : [...p, noteId]);
  }

  /* ---- Materials: pin / delete / rename / move / summarize ---- */
  function togglePinMaterial(matId: string) {
    setPinnedMaterials(p => p.includes(matId) ? p.filter(id => id !== matId) : [...p, matId]);
  }
  function deleteMaterial(matId: string) {
    if (!currentUser) return;
    setState(prev => ({ ...prev, materials: prev.materials.filter(m => m.materialId !== matId) }));
    setPinnedMaterials(p => p.filter(id => id !== matId));
    void persistStore({ operation: "deleteMaterial", userId: currentUser.userId, materialId: matId });
    pushToast("자료를 삭제했어요");
  }
  function deleteMaterials(ids: string[]) {
    if (!currentUser) return;
    const set = new Set(ids);
    setState(prev => ({ ...prev, materials: prev.materials.filter(m => !set.has(m.materialId)) }));
    setPinnedMaterials(p => p.filter(id => !set.has(id)));
    ids.forEach(id => void persistStore({ operation: "deleteMaterial", userId: currentUser.userId, materialId: id }));
    pushToast(`자료 ${ids.length}개를 삭제했어요`);
  }
  function renameMaterial(matId: string, newName: string) {
    const nm = newName.trim();
    if (!nm) return;
    setState(prev => ({ ...prev, materials: prev.materials.map(m => m.materialId === matId ? { ...m, fileName: nm } : m) }));
    pushToast("자료 이름을 변경했어요");
  }
  function moveMaterial(matId: string, newCategory: string) {
    setState(prev => ({ ...prev, materials: prev.materials.map(m => m.materialId === matId ? { ...m, category: newCategory } : m) }));
    pushToast(`'${newCategory}' 폴더로 이동했어요`);
  }
  async function summarizeMaterial(materialId: string) {
    if (!currentUser || summarizingMatId) return;
    const mat = userMaterials.find(m => m.materialId === materialId);
    if (!mat) return;
    setSummarizingMatId(materialId);
    try {
      const title = mat.fileName.replace(/\.[^.]+$/, "");
      const content = await requestSummary(mat.fileName, mat.extractedText || mat.fileName);
      const summary: Summary = {
        summaryId: createId("summary"), userId: currentUser.userId, materialId,
        title, content, sourceType: "material", category: mat.category || categories[0],
        createdAt: new Date().toISOString(),
      };
      setState(prev => ({ ...prev, summaries: [summary, ...prev.summaries] }));
      setSelectedSummaryId(summary.summaryId);
      void persistStore({ operation: "addSummary", userId: currentUser.userId, summary });
      pushToast(`'${mat.fileName}' AI 요약을 생성했어요`, { accent: true, icon: "sparkles" });
    } finally {
      setSummarizingMatId(null);
    }
  }

  /* ---- Summary: update / copy / move folder ---- */
  function updateSummary(id: string, patch: Partial<Summary>) {
    if (!currentUser) return;
    let updated: Summary | undefined;
    setState(prev => ({
      ...prev,
      summaries: prev.summaries.map(s => {
        if (s.summaryId !== id) return s;
        updated = { ...s, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }),
    }));
    if (updated) void persistStore({ operation: "addSummary", userId: currentUser.userId, summary: updated });
    pushToast("요약을 수정했어요");
  }
  function copySummaryToFolder(id: string, category: string) {
    if (!currentUser) return;
    const src = userSummaries.find(s => s.summaryId === id);
    if (!src) return;
    const copy: Summary = { ...src, summaryId: createId("summary"), category, createdAt: new Date().toISOString() };
    setState(prev => ({ ...prev, summaries: [copy, ...prev.summaries] }));
    setSelectedSummaryId(copy.summaryId);
    void persistStore({ operation: "addSummary", userId: currentUser.userId, summary: copy });
    pushToast(`'${category}' 폴더로 요약을 복사했어요`, { icon: "copy" });
  }
  function moveSummaryToFolder(id: string, category: string) {
    setState(prev => ({ ...prev, summaries: prev.summaries.map(s => s.summaryId === id ? { ...s, category } : s) }));
    pushToast(`'${category}' 폴더로 요약을 이동했어요`, { icon: "folder-input" });
  }

  /* ---- Inline summary editor (in Notes view) ---- */
  const editingSummary = editingSummaryId ? userSummaries.find(s => s.summaryId === editingSummaryId) ?? null : null;
  useEffect(() => {
    if (editingSummary) setSummaryDraft({ title: editingSummary.title || "", content: editingSummary.content || "", category: editingSummary.category || "" });
  }, [editingSummaryId]);
  function saveSummary() {
    if (!editingSummaryId) return;
    updateSummary(editingSummaryId, {
      title: (summaryDraft.title || "").trim() || (editingSummary?.title ?? ""),
      content: summaryDraft.content,
      category: summaryDraft.category || editingSummary?.category,
    });
  }

  /* ---- Account ---- */
  function updateUser(next: User) {
    setState(prev => ({ ...prev, user: next }));
    if (next.provider === "GUEST") saveStoredGuestUser(next);
    void persistStore({ operation: "login", user: next });
  }

  /* ---- Unsaved-note guard for sidebar tab switches ---- */
  function guardedSetTab(tab: TabId) {
    if (activeTab === "notes" && noteDirty && !editingSummaryId && tab !== "notes") {
      setPendingTabNav(tab);
      return;
    }
    setActiveTab(tab);
  }
  function discardTabNav() {
    const t = pendingTabNav; setPendingTabNav(null);
    if (selectedNote) setNoteDraft({ title: selectedNote.title, subject: selectedNote.subject, markdownContent: selectedNote.markdownContent });
    if (t) setActiveTab(t);
  }
  function saveTabNav() {
    const t = pendingTabNav; setPendingTabNav(null);
    void saveNote();
    if (t) setTimeout(() => setActiveTab(t), 0);
  }

  function initialSecsFor(type: TimerType, phase?: string) {
    if (type === "TIMER") return Math.max(1, (timerCfg.timerH || 0) * 3600 + (timerCfg.timerM || 0) * 60 + (timerCfg.timerS || 0));
    if (type === "POMODORO") return (phase ?? pomoPhase) === "study" ? timerCfg.pomoStudySec : timerCfg.pomoBreakSec;
    return 0;
  }
  function startTimer() {
    if (timerType !== "STOPWATCH" && seconds === 0) {
      const s = initialSecsFor(timerType);
      setSeconds(s); setTotalSeconds(s);
    }
    timerStartRef.current = new Date(); setIsRunning(true);
  }
  function pauseTimer() { setIsRunning(false); }
  function resetTimer() {
    setIsRunning(false); setPomoPhase("study");
    setTimerCfg(c => ({ ...c, pomoRound: 0 }));
    const s = initialSecsFor(timerType, "study");
    setSeconds(s); setTotalSeconds(s);
    timerStartRef.current = null;
  }
  function recordSession(durationMinutes: number) {
    if (!currentUser) return;
    const started = timerStartRef.current ?? new Date(Date.now() - durationMinutes * 60000);
    const session: StudySession = {
      sessionId: createId("session"), userId: currentUser.userId, subject: timerSubject,
      timerType, startTime: started.toISOString(), endTime: new Date().toISOString(), durationMinutes,
    };
    setState(prev => ({ ...prev, sessions: [session, ...prev.sessions] }));
    void persistStore({ operation: "addSession", userId: currentUser.userId, session });
  }
  function finishTimer() {
    const dur = timerType === "STOPWATCH"
      ? Math.max(1, Math.round(seconds / 60))
      : Math.max(1, Math.round((totalSeconds - seconds) / 60));
    recordSession(dur);
    resetTimer();
  }
  function recordLap() {
    const dur = Math.max(1, Math.round(seconds / 60));
    recordSession(dur);
  }
  function switchTimerType(nextType: TimerType) {
    setTimerType(nextType); setIsRunning(false); setPomoPhase("study");
    setTimerCfg(c => ({ ...c, pomoRound: 0 }));
    const s = nextType === "STOPWATCH" ? 0 : initialSecsFor(nextType, "study");
    setSeconds(s); setTotalSeconds(s);
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
      <Sidebar
        activeTab={activeTab} onTab={guardedSetTab} user={currentUser} setUser={updateUser}
        attendance={attendance} onLogout={logout}
        timerSeconds={seconds} timerTotalSeconds={totalSeconds} timerIsRunning={isRunning} timerType={timerType}
      />

      <main className="main">
        {activeTab === "overview" ? (
          <>
            <header className="page-header">
              <div className="title-wrap">
                <p className="eyebrow">Personal learning dashboard</p>
                <h1 className="page-title">학습 대시보드</h1>
                <SessionClock userId={currentUser.userId} />
              </div>
              <ActivityHeatmap sessions={userSessions} />
            </header>
            <Overview
              character={character}
              sessions={userSessions}
              anki={anki}
              onGoAnki={() => { setActiveTab("anki"); startReview(ankiDeckId); }}
              schedules={scheds}
              setScheds={setScheds}
            />
          </>
        ) : (
          <header className="topbar">
            <div>
              <p className="eyebrow">Personal learning cockpit</p>
              <h2>{TAB_TITLES[activeTab]}{activeTab === "tutor" && <span className="tab-subtitle">모르는 내용이나, 영단어를 질문해 보세요!</span>}</h2>
            </div>
          </header>
        )}

        {activeTab === "materials" && (
          <MaterialsView
            summaries={userSummaries} materials={userMaterials}
            categories={categories} onManageCategories={() => setCatManagerOpen(true)}
            selectedSummary={selectedSummary} selectedSummaryId={selectedSummaryId}
            uploadStatus={uploadStatus}
            onUpload={handleUpload} onSelectSummary={setSelectedSummaryId} onDeleteSummary={deleteSummary}
            pinnedMaterials={pinnedMaterials} onTogglePinMaterial={togglePinMaterial}
            onDeleteMaterial={deleteMaterial} onDeleteMaterials={deleteMaterials}
            onRenameMaterial={renameMaterial} onMoveMaterial={moveMaterial}
            onSummarizeMaterial={summarizeMaterial} summarizingMatId={summarizingMatId}
            onCopySummaryToFolder={copySummaryToFolder} onMoveSummaryToFolder={moveSummaryToFolder}
            onUpdateSummary={updateSummary}
          />
        )}

        {activeTab === "notes" && (
          <NotesView
            notes={userNotes} categories={categories} onManageCategories={() => setCatManagerOpen(true)}
            selectedNote={selectedNote} selectedNoteId={selectedNoteId} noteDraft={noteDraft}
            onSelectNote={setSelectedNoteId} onDraftChange={setNoteDraft}
            onSave={saveNote} onNew={newNote} onDelete={deleteNote}
            onAddCategory={addCategory} onRenameCategory={renameCategory} onDeleteCategory={deleteCategory}
            onRenameNote={renameNote} onMoveNote={moveNote}
            pinnedNotes={pinnedNotes} onTogglePinNote={togglePinNote}
            summaries={userSummaries} onGoToSummary={setEditingSummaryId}
            onDeleteSummary={id => { deleteSummary(id); if (id === editingSummaryId) setEditingSummaryId(null); }}
            editingSummary={editingSummary} editingSummaryId={editingSummaryId}
            summaryDraft={summaryDraft} onSummaryDraftChange={setSummaryDraft}
            onSaveSummary={saveSummary} onCloseSummary={() => setEditingSummaryId(null)}
            onDirtyChange={setNoteDirty}
          />
        )}

        {activeTab === "tutor" && <TutorView />}

        {activeTab === "timer" && (
          <TimerView
            timerType={timerType} seconds={seconds} totalSeconds={totalSeconds} isRunning={isRunning}
            started={timerStartRef.current !== null}
            subject={timerSubject} sessions={userSessions} pomoPhase={pomoPhase}
            timerCfg={timerCfg} setTimerCfg={setTimerCfg}
            onTypeChange={switchTimerType} onSubjectChange={setTimerSubject}
            onStart={startTimer} onPause={pauseTimer} onFinish={finishTimer} onReset={resetTimer}
            onRecordLap={recordLap} onDeleteSession={() => {}}
            categories={categories} onManageCategories={() => setCatManagerOpen(true)}
            presets={presets} setPresets={setPresets} timerFavs={timerFavs} setTimerFavs={setTimerFavs}
          />
        )}

        {activeTab === "timetable" && <TimetableView blocks={timetable} setBlocks={setTimetable} />}

        {activeTab === "stats" && <StatsView sessions={userSessions} categories={categories} />}

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

      {catManagerOpen && (
        <CategoryManager
          categories={categories} counts={categoryCounts}
          onAdd={addCategory} onRename={renameCategory} onDelete={deleteCategory}
          onClose={() => setCatManagerOpen(false)}
        />
      )}

      {pendingTabNav && (
        <div className="cal-modal-overlay" onClick={() => setPendingTabNav(null)}>
          <div className="cal-day-panel unsaved-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-day-header">
              <h4>저장하지 않고 나갈까요?</h4>
              <button className="icon-button" onClick={() => setPendingTabNav(null)} aria-label="닫기"><Icon name="x" size={14} /></button>
            </div>
            <p className="unsaved-body">작성 중인 노트가 있습니다.<br />저장하지 않고 이동하면 변경사항이 사라집니다.</p>
            <div className="unsaved-actions">
              <button className="ghost-button" onClick={() => setPendingTabNav(null)}>취소</button>
              <button className="danger-button" onClick={discardTabNav}><Icon name="trash-2" size={14} />저장 안 함</button>
              <button className="primary-button" onClick={saveTabNav}><Icon name="save" size={14} color="#fff" />저장하고 이동</button>
            </div>
          </div>
        </div>
      )}

      <ToastHost />
    </div>
  );
}
