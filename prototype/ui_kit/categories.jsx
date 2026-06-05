/* ============================================================
   categories.jsx — shared category system UI
   CategoryManager modal (CRUD) + CategoryField (select + 관리)
   Categories are shared across 포모도로 · 학습 노트 · 자료/요약 · Anki.
   ============================================================ */
const { useState: useStateCM, useEffect: useEffectCM } = React;

function CategoryManager({ categories, counts, onAdd, onRename, onDelete, onClose }) {
  const [adding, setAdding] = useStateCM("");
  const [editing, setEditing] = useStateCM(null);
  const [editVal, setEditVal] = useStateCM("");
  const [confirmDel, setConfirmDel] = useStateCM(null);
  useEffectCM(() => {
    const onKey = (e) => {if (e.key === "Escape") {if (confirmDel) setConfirmDel(null);else if (editing) setEditing(null);else onClose();}};
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmDel, editing]);

  function commitAdd() {if (onAdd(adding)) setAdding("");}
  function startEdit(name) {setEditing(name);setEditVal(name);}
  function commitEdit() {onRename(editing, editVal);setEditing(null);}

  return (
    <div className="anki-dialog-overlay" onClick={onClose}>
      <div className="anki-dialog cat-manager" role="dialog" aria-label="카테고리 관리" onClick={(e) => e.stopPropagation()}>
        <div className="cat-manager-head">
          <h3 className="dialog-title" style={{ margin: 0 }}>카테고리 관리</h3>
          <button className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <p className="dialog-hint">여기서 만든 카테고리는 포모도로 · 학습 노트 · 자료/요약 · Anki 덱에서 함께 사용됩니다.</p>
        <div className="cat-list">
          {categories.map((name) => {
            const used = counts?.[name] || 0;
            const isEditing = editing === name;
            return (
              <div className={`cat-row ${isEditing ? "editing" : ""}`} key={name}>
                {isEditing ?
                <input className="cat-edit-input" autoFocus value={editVal} maxLength={20}
                onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => {if (e.key === "Enter") commitEdit();if (e.key === "Escape") setEditing(null);}} /> :

                <span className="cat-name"><span className="cat-dot" />{name}</span>
                }
                {!isEditing && <span className="cat-count">{used > 0 ? `${used}곳 사용` : "사용 안 함"}</span>}
                {isEditing ?
                <div className="cat-row-actions">
                    <button className="chip-button" onClick={commitEdit}><Icon name="check" size={13} />저장</button>
                    <button className="icon-button" aria-label="취소" onClick={() => setEditing(null)}><Icon name="x" size={14} /></button>
                  </div> :

                <div className="cat-row-actions">
                    <button className="icon-button" aria-label="이름 변경" title="이름 변경" onClick={() => startEdit(name)}><Icon name="pencil" size={14} /></button>
                    <button className="icon-button danger" aria-label="삭제" title="삭제" disabled={categories.length <= 1} onClick={() => setConfirmDel(name)}><Icon name="trash-2" size={14} /></button>
                  </div>
                }
              </div>);

          })}
        </div>
        <div className="cat-add-row">
          <input className="cat-edit-input" placeholder="새 카테고리 이름" maxLength={20} value={adding}
          onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => {if (e.key === "Enter") commitAdd();}} />
          <button className="primary-button" disabled={!adding.trim()} onClick={commitAdd}><Icon name="plus" size={15} color="#fff" />추가</button>
        </div>
        {confirmDel &&
        <div className="cat-confirm" onClick={(e) => e.stopPropagation()}>
            <p><strong>{confirmDel}</strong> 카테고리를 삭제할까요?<br />이 카테고리를 쓰던 항목은 다른 카테고리로 옮겨집니다.</p>
            <div className="dialog-actions">
              <button className="ghost-button" onClick={() => setConfirmDel(null)}>취소</button>
              <button className="danger-button" onClick={() => {onDelete(confirmDel);setConfirmDel(null);}}>삭제</button>
            </div>
          </div>
        }
      </div>
    </div>);

}

/* select + 관리 gear, shared by Timer & Notes */
function CategoryField({ categories, value, onChange, onManage, label = "과목", style }) {
  return (
    <div className="cat-field" style={style}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-comment-anchor="29411f802d-select-83-7">
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        {value && !categories.includes(value) && <option value={value}>{value}</option>}
      </select>
      <button type="button" className="cat-manage-btn" title="카테고리 관리" aria-label="카테고리 관리" onClick={onManage}><Icon name="settings-2" size={15} /></button>
    </div>);

}

Object.assign(window, { CategoryManager, CategoryField });