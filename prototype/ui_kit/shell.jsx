/* ============================================================
   shell.jsx — LoginScreen, Sidebar (+ notifications, mobile)
   ============================================================ */
const { useState: useStateS } = React;

const NAV_ITEMS = [
{ id: "overview", icon: "bar-chart-3", label: "대시보드" },
{ id: "timetable", icon: "calendar-days", label: "시간표" },
{ id: "timer", icon: "clock", label: "포모도로" },
{ id: "notes", icon: "book-open-text", label: "학습 노트" },
{ id: "materials", icon: "upload-cloud", label: "자료/요약" },
{ id: "anki", icon: "layers", label: "Anki" },
{ id: "stats", icon: "flame", label: "통계" }];


const NOTIFICATIONS = [
{ id: "n1", icon: "layers", title: "오늘 복습할 Anki 카드가 기다리고 있어요.", time: "방금 전", unread: true },
{ id: "n2", icon: "flame", title: "어제 학습으로 연속 출석이 이어졌어요.", time: "어제", unread: true },
{ id: "n3", icon: "sparkles", title: "루미가 새로운 단계에 도달했어요.", time: "2일 전", unread: false },
{ id: "n4", icon: "check-circle-2", title: "지난주 학습 요약 리포트가 준비되었습니다.", time: "3일 전", unread: false }];


function LoginScreen({ onLogin }) {
  const [nick, setNick] = useStateS("");
  return (
    <main className="auth-shell">
      <div className="auth-aurora" />
      <section className="auth-panel">
        <div className="brand-mark"><Icon name="sparkles" size={28} /></div>
        <h1>AI 학습 어시스턴트</h1>
        <p>자료 요약, 노트 복습, Anki 카드, 타이머 기록, 캐릭터 성장까지 한 흐름으로 관리합니다.</p>
        <div className="nickname-row">
          <label htmlFor="nickname">닉네임</label>
          <input id="nickname" type="text" placeholder="화면에 표시할 이름" maxLength={20} value={nick}
          onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => {if (e.key === "Enter") onLogin("KAKAO", nick);}} />
          <span className="nickname-hint">비우고 진행하면 기본 이름이 사용됩니다.</span>
        </div>
        <div className="auth-actions">
          <button className="provider-button google" onClick={() => onLogin("GOOGLE", nick)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M21.35 11.1H12v3.8h5.32c-.23 1.49-1.7 4.36-5.32 4.36-3.2 0-5.81-2.65-5.81-5.92s2.61-5.92 5.81-5.92c1.82 0 3.04.78 3.74 1.44l2.55-2.46C16.78 4.74 14.62 3.7 12 3.7c-4.79 0-8.67 3.88-8.67 8.67S7.21 21.04 12 21.04c5 0 8.32-3.51 8.32-8.46 0-.57-.06-1-.13-1.48z" /></svg>
            Google 계정으로 로그인
          </button>
          <button className="provider-button kakao" onClick={() => onLogin("KAKAO", nick)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#2c2100"><path d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.84 5.32 4.6 6.74-.2.71-.73 2.57-.83 2.97-.13.5.18.5.39.36.16-.1 2.55-1.73 3.58-2.43.74.11 1.5.16 2.26.16 5.52 0 10-3.58 10-8s-4.48-7.8-10-7.8z" /></svg>
            Kakao로 시작
          </button>
          <button className="provider-button naver" onClick={() => onLogin("NAVER", nick)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M16.273 12.845 7.376 0H0v24h7.726V11.155L16.624 24H24V0h-7.727z" /></svg>
            Naver로 시작
          </button>
        </div>
        <p className="footer-note">로그인 정보는 이 브라우저에만 저장됩니다 (데모용).<br />실제 OAuth 연동은 백엔드 설정 후 가능합니다.</p>
      </section>
    </main>);

}

function NotifyButton() {
  const [open, setOpen] = useStateS(false);
  const [notes, setNotes] = useStateS(NOTIFICATIONS);
  const unread = notes.filter((n) => n.unread).length;
  return (
    <div className="notify-wrap">
      <button className="topbar-icon-btn" aria-label="알림" title="알림" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={18} />{unread > 0 && <span className="notify-dot" />}
      </button>
      {open && <>
        <div className="notify-scrim" onClick={() => setOpen(false)} />
        <div className="notify-panel" role="dialog" aria-label="알림">
          <div className="notify-head">
            <span className="notify-title">알림{unread > 0 ? ` · ${unread}` : ""}</span>
            <button className="notify-readall" onClick={() => setNotes((ns) => ns.map((n) => ({ ...n, unread: false })))} disabled={unread === 0}>모두 읽음</button>
          </div>
          <ul className="notify-list">
            {notes.map((n) =>
            <li key={n.id} className={`notify-item ${n.unread ? "is-unread" : ""}`}>
                <span className="notify-ico"><Icon name={n.icon} size={16} /></span>
                <div className="notify-body"><p className="notify-text">{n.title}</p><span className="notify-time">{n.time}</span></div>
              </li>
            )}
          </ul>
        </div>
      </>}
    </div>);

}

function Sidebar({ activeTab, onTab, user, onLogout, attendance }) {
  const [open, setOpen] = useStateS(false);
  const activeLabel = NAV_ITEMS.find((it) => it.id === activeTab)?.label ?? "대시보드";
  const pick = (id) => {onTab(id);setOpen(false);};
  return <>
    <header className="mobile-bar">
      <div className="mobile-left">
        <button className="hamburger" aria-label="메뉴 열기" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
        <span className="mobile-title">{activeLabel}</span>
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
          <span className="brand-mark"><Icon name="sparkles" size={22} /></span>
          <span>AI 학습 어시스턴트</span>
          <button className="drawer-close" aria-label="메뉴 닫기" onClick={() => setOpen(false)}><Icon name="x" size={20} /></button>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((it) =>
          <button key={it.id} className={`nav-button ${activeTab === it.id ? "active" : ""}`} onClick={() => pick(it.id)}>
              <Icon name={it.icon} size={18} />{it.label}
            </button>
          )}
        </nav>
      </div>
      <div className="user" data-comment-anchor="fbc44091c2-div-119-7">
        <span className="user-avatar">{user.nickname.slice(0, 1).toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name">{user.nickname}</div>
          <div className="user-sub">{user.provider} 로그인</div>
        </div>
        <button className="user-logout" title="로그아웃" aria-label="로그아웃" onClick={onLogout}><Icon name="log-out" size={16} /></button>
      </div>
    </aside>
  </>;
}

Object.assign(window, { LoginScreen, Sidebar, NotifyButton, NAV_ITEMS });