import { useEffect, useState } from 'react';
import { BriefcaseBusiness, Truck, ClipboardList, CalendarDays, ChartNoAxesCombined, LogOut, Plus, Trash2, Save, RefreshCw, Menu, Search } from 'lucide-react';
import WorkMatrix from './WorkMatrix';
import { definitions, keys, labels, nav, type Page } from './app/config';
import { api } from './lib/api';
import type { Row, Session } from './app/types';
const initialDate = () => new Date().toLocaleDateString('sv-SE');
function display(row: Row, key: string, lists: Record<string, Row[]>) {
  const val = row[key]; const map: Record<string, string> = { contract_id: 'contracts', vehicle_id: 'vehicles', section_id: 'sections', work_id: 'works', material_id: 'materials' }; if (map[key]) {
    const r = lists[map[key]]?.find(x => String(x.id) === String(val));
    return r ? (r.number || r.name || r.login) : val;
  } if (key === 'progress')
    return <span className="progress-cell"><span className="bar"><span style={{ width: `${val}%` }} /></span><b>{Number(val).toFixed(0)}%</b></span>; if (key === 'active')
    return val ? 'Так' : 'Ні'; if (key === 'role')
    return ({ Admin: 'Адмін', Manager: 'Керівник', Master: 'Майстер' } as Row)[val] || val; return val == null ? '—' : String(val);
}
export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('wa_session') || 'null');
    }
    catch {
      return null;
    }
  });
  const [page, setPage] = useState<Page>('dashboard');
  const [lists, setLists] = useState<Record<string, Row[]>>({});
  const [summary, setSummary] = useState<Row>({});
  const [contractReport, setContractReport] = useState<Row[]>([]);
  const [dailyReport, setDailyReport] = useState<Row[]>([]);
  const [materialReport, setMaterialReport] = useState<Row[]>([]);
  const [form, setForm] = useState<Row>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [login, setLogin] = useState('admin');
  const [password, setPassword] = useState('');
  const [receipt, setReceipt] = useState<Row | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkContract, setBulkContract] = useState('');
  const [bulkNumbers, setBulkNumbers] = useState<{ id: number; number: string }[]>([{ id: 1, number: '' }]);
  const [bulkNextId, setBulkNextId] = useState(2);
  const [bulkResult, setBulkResult] = useState<{ added: number; skipped: number; skippedNumbers: string[] } | null>(null);
  const [worksOpen, setWorksOpen] = useState(false);
  const [worksContract, setWorksContract] = useState('');
  const [worksSection, setWorksSection] = useState('');
  const [workRows, setWorkRows] = useState<{id:number;name:string;norm_hours:string;description:string}[]>([{id:1,name:'',norm_hours:'',description:''}]);
  const [worksNextId, setWorksNextId] = useState(2);
  const [worksResult, setWorksResult] = useState<{added:number;skipped:number;skippedNames:string[]} | null>(null);
  const [worksError, setWorksError] = useState('');
  const [allowedSections, setAllowedSections] = useState<number[]>([]);
  const [accessUser, setAccessUser] = useState<Row | null>(null);
  const [accessIds, setAccessIds] = useState<number[]>([]);
  const refresh = async () => {
    if (!session)
      return; setLoading(true); try {
        const entityNames = ['contracts', 'vehicles', 'sections', 'contract_works', 'works', 'materials', 'work_materials', 'daily', 'section_daily_hours', 'movements', ...(session.role === 'Admin' ? ['users', 'user_sections'] : [])];
        const [rows, sum, cr, dr, mr, access] = await Promise.all([Promise.all(entityNames.map(k => api('/' + k, session.token))), api('/report/summary', session.token), api('/report/contracts', session.token), api('/report/daily', session.token), api('/report/materials', session.token), api('/auth/sections', session.token)]);
        setAllowedSections(access.map(Number));
        setLists(Object.fromEntries(entityNames.map((k, i) => [k, rows[i]])));
        setSummary(sum);
        setContractReport(cr);
        setDailyReport(dr);
        setMaterialReport(mr);
        setError('');
      }
    catch (e) {
      setError(String(e));
    }
    finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (session)
      void refresh();
  }, [session]);
  const signIn = async (e: React.FormEvent) => {
    e.preventDefault(); try {
      const s = await api('/auth/login', '', 'POST', { login, password });
      sessionStorage.setItem('wa_session', JSON.stringify(s));
      setSession(s);
      setPassword('');
      setError('');
    }
      catch {
        setError('Невірний логін або пароль');
      }
  };
  const logout = () => {
    if (session)
      void api('/auth/logout', session.token, 'POST').catch(() => { }); sessionStorage.removeItem('wa_session'); setSession(null); setLists({}); setError('');
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!session)
      return; try {
        setLoading(true);
        const data = { ...form };
        for (const f of definitions[page]?.fields || []) {
          if (f.kind === 'number' || f.ref)
            data[f.key] = Number(data[f.key]);
        }
        await api('/' + page + (editing !== null ? '/' + editing : ''), session.token, editing !== null ? 'PUT' : 'POST', data);
        setOpen(false);
        setEditing(null);
        setForm({});
        await refresh();
      }
    catch (e) {
      setError(String(e));
    }
    finally {
      setLoading(false);
    }
  };
  const remove = async (id: number) => {
    if (!session || !confirm('Видалити запис? Пов’язані дані можуть блокувати видалення.'))
      return; try {
        await api('/' + page + '/' + id, session.token, 'DELETE');
        await refresh();
      }
    catch (e) {
      setError(String(e));
    }
  };
  const begin = (row?: Row) => { setForm(row ? { ...row } : { date: initialDate(), role: 'Master', status: 'Active', unit: 'шт' }); setEditing(row?.id ?? null); setOpen(true); setError(''); };
  const receive = async (e: React.FormEvent) => {
    e.preventDefault(); if (!session || !receipt)
      return; try {
        await api('/materials/' + receipt.id + '/receive', session.token, 'POST', { quantity: Number(receipt.quantity) });
        setReceipt(null);
        await refresh();
      }
    catch (e) {
      setError(String(e));
    }
  };
  const addVehiclesBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const numbers = bulkNumbers.map(row => row.number.trim()).filter(Boolean);
    if (!numbers.length || !bulkContract) { setError('Оберіть контракт і введіть номери'); return; }
    try {
      setLoading(true);
      const result = await api('/vehicles/bulk', session.token, 'POST', { contract_id: Number(bulkContract), numbers });
      setBulkResult(result);
      setBulkNumbers([{ id: 1, number: '' }]);
      setBulkNextId(2);
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };
  const pasteWorkExcel = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, start: 'name' | 'norm_hours' | 'description') => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n') && !raw.includes('\r')) return;
    e.preventDefault();
    const lines = raw.replace(/\r/g, '').split('\n').filter(line => line.trim() !== '');
    const fields = ['name', 'norm_hours', 'description'] as const;
    const offset = fields.indexOf(start);
    const parsed = lines.map(line => line.split('\t'));
    setWorkRows(old => {
      const next = [...old];
      let nextId = Math.max(0, ...old.map(x => x.id)) + 1;
      parsed.forEach((cells, i) => {
        const target = rowIndex + i;
        while (next.length <= target) next.push({ id: nextId++, name: '', norm_hours: '', description: '' });
        const updated = { ...next[target] };
        cells.forEach((cell, col) => {
          const key = fields[offset + col];
          if (key) updated[key] = cell.trim();
        });
        next[target] = updated;
      });
      setWorksNextId(n => Math.max(n, nextId));
      return next;
    });
    setWorksResult(null);
  };
  const saveWorksBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setWorksError(''); setWorksResult(null);
    const rows = workRows.filter(r => r.name.trim() || r.norm_hours.trim() || r.description.trim());
    if (!worksContract || !worksSection || !rows.length) { setWorksError('Оберіть контракт, дільницю та заповніть роботи'); return; }
    if (rows.some(r => !r.name.trim() || !r.norm_hours.trim() || !Number.isFinite(Number(r.norm_hours.replace(',', '.'))) || Number(r.norm_hours.replace(',', '.')) < 0)) {
      setWorksError('Кожна робота повинна мати назву та невід’ємну числову норму (наприклад 4,5)'); return;
    }
    try {
      setLoading(true);
      const result = await api('/contract-works/bulk', session.token, 'POST', {
        contract_id: Number(worksContract), section_id: Number(worksSection),
        works: rows.map(r => ({ name: r.name.trim(), norm_hours: Number(r.norm_hours.replace(',', '.')), description: r.description.trim() }))
      });
      setWorksResult(result);
      setWorkRows([{ id: 1, name: '', norm_hours: '', description: '' }]); setWorksNextId(2);
      await refresh();
    } catch (err) { setWorksError(String(err)); }
    finally { setLoading(false); }
  };
  const admin = session?.role === 'Admin';
  const master = session?.role === 'Master';
  const activeDef = definitions[page];
  const filtered = (lists[page] || []).filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())));
  if (!session)
    return <div className="login-page"><div className="login-art"><div className="brand-large"><img src="/logo.jpg" alt="Логотип WorkAccounting" className="brand-logo" /> UKR ARMO TECH</div><div className="login-art-text"><span className="eyebrow">ОБЛІК ВИРОБНИЦТВА</span><h1>Усі роботи.<br />Усі контракти.<br /><em>Одна система.</em></h1><p>Щоденний прогрес, аналітика виконання та облік матеріалів без розрізнених таблиць.</p></div><div className="login-art-footer">Контракти · Автомобілі · Дільниці · ТМЦ</div></div><div className="login-panel"><form className="login-card" onSubmit={signIn}><div className="mobile-brand"><img src="/logo.jpg" alt="Логотип WorkAccounting" className="brand-logo" /> WORKACCOUNTING</div><span className="eyebrow">ЗАХИЩЕНИЙ ДОСТУП</span><h2>Вхід до системи</h2><p>Увійдіть за службовим логіном, наданим адміністратором.</p><label>Логін<input autoComplete="username" value={login} onChange={e => setLogin(e.target.value)} required /></label><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{error && <div className="error">{error}</div>}<button className="primary full">Увійти →</button><small>Публічна реєстрація вимкнена</small></form></div></div>;
  return <div className="shell"><aside className={'sidebar ' + (sidebar ? 'sidebar-open' : '')}><div className="sidebar-brand"><img src="/logo.jpg" alt="Логотип WorkAccounting" className="brand-logo" /><div><b>UKR ARMO TECH</b><small>Виробничий облік</small></div></div><div className="sidebar-section">РОБОЧИЙ ПРОСТІР</div><nav>{nav.filter(n => n.key !== 'users' || admin).map(n => <button key={n.key} className={'nav-item ' + (page === n.key ? 'active' : '')} onClick={() => { setPage(n.key); setOpen(false); setSearch(''); setError(''); setSidebar(false); }}><n.icon size={19} strokeWidth={1.8} />{n.label}</button>)}</nav><div className="sidebar-bottom"><div className="user-avatar">{session.login.slice(0, 1).toUpperCase()}</div><div className="user-meta"><b>{session.login}</b><small>{display({ role: session.role }, 'role', lists)}</small></div><button title="Вийти" onClick={logout} className="logout"><LogOut size={19} /></button></div></aside><main className="content"><header className="topbar"><button className="icon-button menu" onClick={() => setSidebar(!sidebar)}><Menu size={22} /></button><div className="breadcrumb">Робочий простір <span>/</span> <b>{nav.find(n => n.key === page)?.label}</b></div><div className="topbar-right"><span className="live-dot" /> Локальна система <span className="divider-v" /> <div className="top-avatar">{session.login[0].toUpperCase()}</div></div></header><div className="page-content"><div className="page-head"><div><span className="eyebrow">ВИРОБНИЧИЙ КОНТРОЛЬ</span><h1>{page === 'dashboard' ? 'Панель керування' : page === 'reports' ? 'Аналітика та звіти' : nav.find(n => n.key === page)?.label}</h1><p>{page === 'dashboard' ? 'Огляд стану контрактів, робіт і ресурсів' : page === 'section_daily_hours' ? 'Облік часу за контрактом, дільницею та датою' : page === 'reports' ? 'Показники виконання, витрат часу та списання ТМЦ' : 'Керуйте даними та переглядайте поточний стан'}</p></div><div className="head-actions">{admin && page === 'contract_works' && <button className="primary" onClick={() => { setWorksOpen(true); setWorksContract(String((lists.contracts || [])[0]?.id || '')); setWorksSection(String((lists.sections || [])[0]?.id || '')); setWorkRows([{id:1,name:'',norm_hours:'',description:''}]); setWorksNextId(2); setWorksResult(null); setWorksError(''); }}><Plus size={17} /> Додати роботи та норми</button>}{admin && page === 'vehicles' && <button className="primary" onClick={() => { setBulkOpen(true); setBulkResult(null); setBulkContract(String((lists.contracts || [])[0]?.id || '')); setBulkNumbers([{ id: 1, number: '' }]); setBulkNextId(2); setError(''); }}><Plus size={17} /> Додати автомобілі</button>}<button className="secondary" onClick={() => void refresh()}><RefreshCw size={16} /> Оновити</button>{activeDef && page !== 'vehicles' && page !== 'contract_works' && (admin || (master && page === 'section_daily_hours' && allowedSections.length > 0)) && <button className="primary" onClick={() => begin()}><Plus size={17} /> Додати запис</button>}</div></div>{error && <div className="error error-page">{error}<button onClick={() => setError('')}>×</button></div>}
    {page === 'dashboard' && <><div className="stat-grid">{[{ label: 'Контракти', value: summary.contracts || 0, icon: BriefcaseBusiness, accent: 'blue' }, { label: 'Автомобілі', value: summary.vehicles || 0, icon: Truck, accent: 'violet' }, { label: 'Завершені роботи', value: `${summary.completed || 0} / ${summary.works || 0}`, icon: ClipboardList, accent: 'green' }, { label: 'Людино-години сьогодні', value: Number(summary.todayHours || 0).toFixed(1), icon: CalendarDays, accent: 'orange' }].map(s => <div className="stat-card" key={s.label}><div className={'stat-icon ' + s.accent}><s.icon size={21} /></div><span>{s.label}</span><strong>{s.value}</strong><small>Поточні дані</small></div>)}</div><div className="two-col"><section className="panel"><div className="panel-title"><div><h3>Виконання контрактів</h3><p>Прогрес за нормативною трудомісткістю</p></div><ChartNoAxesCombined size={20} /></div>{contractReport.length ? contractReport.map(c => <div className="contract-progress" key={c.id}><div className="progress-label"><b>{c.name}</b><strong>{c.progress}%</strong></div><div className="big-bar"><span style={{ width: `${Math.min(100, Number(c.progress))}%` }} /></div><small>{c.works} робіт · {Number(c.completed_norm_hours).toFixed(1)} із {Number(c.planned_norm_hours).toFixed(1)} нормо-год</small></div>) : <div className="empty">Створіть перший контракт для початку обліку</div>}</section><section className="panel"><div className="panel-title"><div><h3>Оперативні показники</h3><p>За весь період</p></div></div><div className="metric-line"><span>Людино-години</span><b>{Number(summary.totalHours || 0).toFixed(1)} год</b></div><div className="metric-line"><span>Робіт у системі</span><b>{summary.works || 0}</b></div><div className="metric-line"><span>Завершено робіт</span><b>{summary.completed || 0}</b></div><div className="metric-line"><span>Операцій списання ТМЦ</span><b>{summary.writtenOff || 0}</b></div><div className="info-note">Матеріали списуються автоматично після досягнення 100% виконання роботи.</div></section></div><section className="panel"><div className="panel-title"><div><h3>Останні записи виконання</h3><p>Хронологія внесених робіт</p></div><button className="text-button" onClick={() => setPage('daily')}>Усі записи →</button></div><DataTable rows={dailyReport.slice(0, 6)} columns={['date', 'contract', 'vehicle', 'section', 'work', 'percent', 'author']} /></section></>}
    {page === 'matrix' && <WorkMatrix lists={lists} token={session.token} role={session.role} allowedSections={allowedSections} refresh={refresh} />}{page === 'reports' && <><div className="stat-grid compact">{[{ label: 'Всього робіт', v: summary.works || 0 }, { label: 'Завершено', v: summary.completed || 0 }, { label: 'Людино-годин', v: Number(summary.totalHours || 0).toFixed(1) }, { label: 'Списань ТМЦ', v: summary.writtenOff || 0 }].map(s => <div className="stat-card" key={s.label}><span>{s.label}</span><strong>{s.v}</strong></div>)}</div><section className="panel"><div className="panel-title"><h3>Виконання контрактів</h3><button className="secondary" onClick={() => csv(contractReport, 'contracts.csv')}>Експорт CSV</button></div><DataTable rows={contractReport} columns={['name', 'works', 'planned_norm_hours', 'completed_norm_hours', 'progress']} /></section><section className="panel"><div className="panel-title"><h3>Щоденні записи</h3><button className="secondary" onClick={() => csv(dailyReport, 'daily.csv')}>Експорт CSV</button></div><DataTable rows={dailyReport} columns={['date', 'contract', 'vehicle', 'section', 'work', 'percent', 'norm_hours', 'author']} /></section><section className="panel"><div className="panel-title"><h3>Списані матеріали</h3><button className="secondary" onClick={() => csv(materialReport, 'materials.csv')}>Експорт CSV</button></div><DataTable rows={materialReport} columns={['created_at', 'contract', 'vehicle', 'section', 'work', 'material', 'quantity', 'unit']} /></section></>}
    {page !== 'dashboard' && page !== 'reports' && page !== 'matrix' && <section className="panel data-panel"><div className="table-tools"><div className="table-heading"><h3>{activeDef?.label || nav.find(n => n.key === page)?.label}</h3><p>Записів: {filtered.length}</p></div><div className="search-box"><Search size={17} /><input placeholder="Пошук у таблиці..." value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="table-scroll"><table><thead><tr>{Object.keys(filtered[0] || { id: 0, ...Object.fromEntries((activeDef?.fields || []).map(f => [f.key, ''])) }).filter(k => k !== 'password_hash').map(k => <th key={k}>{labels[k] || k}</th>)}{(admin && page !== 'daily' && page !== 'movements' && page !== 'works' || master && page === 'section_daily_hours') && <th>Дії</th>}</tr></thead><tbody>{filtered.map(r => <tr key={r.id}>{Object.keys(filtered[0] || {}).filter(k => k !== 'password_hash').map(k => <td key={k}>{display(r, k, lists)}</td>)}{((admin && page !== 'daily' && page !== 'movements' && page !== 'works') || (master && page === 'section_daily_hours' && allowedSections.includes(Number(r.section_id)))) && <td><div className="row-actions">{page !== 'work_materials' && <button onClick={() => begin(r)}>Редагувати</button>}{admin && page === 'users' && r.role === 'Master' && <button onClick={() => { setAccessUser(r); setAccessIds((lists.user_sections || []).filter(x => Number(x.user_id) === Number(r.id)).map(x => Number(x.section_id))); }}>Доступ до дільниць</button>}{page === 'materials' && <button onClick={() => setReceipt({ id: r.id, name: r.name, quantity: 1 })}>+ Прихід</button>}{admin && page !== 'section_daily_hours' && <button className="danger-link" onClick={() => void remove(r.id)}><Trash2 size={15} /></button>}</div></td>}</tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">Записів поки немає</div>}</div></section>}
  </div></main>{open && activeDef && <div className="overlay" onMouseDown={e => {
    if (e.target === e.currentTarget)
      setOpen(false);
  }}><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">{editing !== null ? 'РЕДАГУВАННЯ' : 'НОВИЙ ЗАПИС'}</span><h2>{activeDef.label}</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div><div className="modal-fields">{activeDef.fields.filter(f => !(editing !== null && f.key === 'password')).map(f => <label key={f.key}>{f.label}{f.ref ? <select required value={form[f.key] ?? ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })}><option value="">Оберіть...</option>{(lists[f.ref] || []).filter(r => !(f.ref === 'sections' && page === 'section_daily_hours' && master && !allowedSections.includes(Number(r.id)))).map(r => <option key={r.id} value={r.id}>{r.number || r.name || r.login}</option>)}</select> : f.options ? <select value={form[f.key] || f.options[0]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}>{f.options.map(o => <option key={o}>{o}</option>)}</select> : <input required={['name', 'number', 'login', 'password', 'date', 'percent', 'work_id'].includes(f.key)} type={f.kind || 'text'} step={f.kind === 'number' ? 'any' : undefined} min={f.kind === 'number' ? 0 : undefined} value={form[f.key] ?? ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />}</label>)}</div><div className="modal-footer"><button type="button" className="secondary" onClick={() => setOpen(false)}>Скасувати</button><button disabled={loading} className="primary"><Save size={17} /> Зберегти</button></div></form></div>}{accessUser && <div className="overlay"><div className="modal small-modal"><div className="modal-head"><h2>Доступ: {accessUser.login}</h2><button className="icon-button" onClick={() => setAccessUser(null)}>×</button></div><div className="modal-fields">{(lists.sections || []).map(sec => <label key={sec.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><input type="checkbox" checked={accessIds.includes(Number(sec.id))} onChange={e => setAccessIds(old => e.target.checked ? [...old, Number(sec.id)] : old.filter(id => id !== Number(sec.id)))} />{sec.name}</label>)}</div><div className="modal-footer"><button className="secondary" onClick={() => setAccessUser(null)}>Скасувати</button><button className="primary" onClick={async () => {
    if (!session)
      return; try {
        await api('/users/' + accessUser.id + '/sections', session.token, 'PUT', { section_ids: accessIds });
        setAccessUser(null);
        await refresh();
      }
    catch (e) {
      setError(String(e));
    }
  }}>Зберегти доступ</button></div></div></div>}{worksOpen && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setWorksOpen(false); }}><form className="modal bulk-works-modal" onSubmit={saveWorksBulk}><div className="modal-head"><div><span className="eyebrow">МАСОВЕ ДОДАВАННЯ</span><h2>Роботи та норми</h2></div><button type="button" className="icon-button" onClick={() => setWorksOpen(false)}>×</button></div><p>Додавайте роботи окремими рядками або вставте діапазон із Excel (назва, норма, примітка). Контракт і дільниця спільні для всіх рядків.</p><div className="bulk-works-filters"><label>Контракт<select required value={worksContract} onChange={e => setWorksContract(e.target.value)}><option value="">Оберіть контракт</option>{(lists.contracts || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Дільниця<select required value={worksSection} onChange={e => setWorksSection(e.target.value)}><option value="">Оберіть дільницю</option>{(lists.sections || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div><div className="bulk-number-header"><b>Перелік робіт</b><span>Заповнено: {workRows.filter(r => r.name.trim()).length}</span></div><div className="bulk-works-table"><div className="bulk-works-grid bulk-works-grid-head"><span>№</span><span>Назва роботи</span><span>Норма, год</span><span>Примітка</span><span></span></div>{workRows.map((r,i) => <div className="bulk-works-grid" key={r.id}><span className="bulk-number-index">{i+1}.</span><input aria-label={`Назва роботи ${i+1}`} placeholder="Назва роботи" value={r.name} onPaste={e => pasteWorkExcel(e,i,'name')} onChange={e => setWorkRows(old => old.map(x => x.id===r.id ? {...x,name:e.target.value} : x))}/><input aria-label={`Норма роботи ${i+1}`} inputMode="decimal" placeholder="4,5" value={r.norm_hours} onPaste={e => pasteWorkExcel(e,i,'norm_hours')} onChange={e => setWorkRows(old => old.map(x => x.id===r.id ? {...x,norm_hours:e.target.value} : x))}/><input aria-label={`Примітка роботи ${i+1}`} placeholder="Необов’язково" value={r.description} onPaste={e => pasteWorkExcel(e,i,'description')} onChange={e => setWorkRows(old => old.map(x => x.id===r.id ? {...x,description:e.target.value} : x))}/><button type="button" className="bulk-remove-row" aria-label={`Видалити рядок ${i+1}`} title="Прибрати рядок" disabled={workRows.length===1} onClick={() => setWorkRows(old => old.filter(x => x.id!==r.id))}><Trash2 size={16}/></button></div>)}</div><button type="button" className="secondary bulk-add-row" onClick={() => {setWorkRows(old => [...old,{id:worksNextId,name:'',norm_hours:'',description:''}]);setWorksNextId(n=>n+1);}}><Plus size={17}/> Додати роботу</button><div className="bulk-works-tip">Excel: виділіть стовпці «Назва роботи | Норма | Примітка», скопіюйте та вставте (Ctrl+V) у перше поле назви. Можна вставити й один стовпець назв. Заголовки таблиці не копіюйте.</div>{worksError && <div className="error">{worksError}</div>}{worksResult && <div className="info-note"><b>Створено: {worksResult.added}. Пропущено дублікатів: {worksResult.skipped}.</b>{worksResult.skippedNames.length>0 && <div>{worksResult.skippedNames.join(', ')}</div>}</div>}<div className="modal-footer"><button type="button" className="secondary" onClick={() => setWorksOpen(false)}>Закрити</button><button className="primary" disabled={loading || !worksContract || !worksSection || !workRows.some(r => r.name.trim())}><Save size={17}/> Зберегти всі роботи</button></div></form></div>}{bulkOpen && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setBulkOpen(false); }}><form className="modal bulk-vehicles-modal" onSubmit={addVehiclesBulk}><div className="modal-head"><div><span className="eyebrow">МАСОВЕ ДОДАВАННЯ</span><h2>Додати автомобілі</h2></div><button type="button" className="icon-button" onClick={() => setBulkOpen(false)}>×</button></div><p>Виберіть контракт, введіть номер кожного автомобіля в окреме поле. Кнопка «+ Додати поле» створює наступний рядок.</p><label>Контракт<select required value={bulkContract} onChange={e => setBulkContract(e.target.value)}><option value="">Оберіть контракт</option>{(lists.contracts || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="bulk-number-header"><b>Номери автомобілів</b><span>Заповнено: {bulkNumbers.filter(r => r.number.trim()).length}</span></div><div className="bulk-number-list">{bulkNumbers.map((row, index) => <div className="bulk-number-row" key={row.id}><span className="bulk-number-index">{index + 1}.</span><input aria-label={`Номер автомобіля ${index + 1}`} placeholder="Введіть номер авто" value={row.number} onChange={e => setBulkNumbers(old => old.map(r => r.id === row.id ? { ...r, number: e.target.value } : r))} /><button type="button" className="bulk-remove-row" title="Прибрати поле" aria-label={`Прибрати поле ${index + 1}`} disabled={bulkNumbers.length === 1} onClick={() => setBulkNumbers(old => old.filter(r => r.id !== row.id))}><Trash2 size={17} /></button></div>)}</div><button type="button" className="secondary bulk-add-row" onClick={() => { setBulkNumbers(old => [...old, { id: bulkNextId, number: '' }]); setBulkNextId(n => n + 1); }}><Plus size={17} /> Додати поле</button><small>Порожні поля пропускаються. Повторні номери не створюються.</small>{error && <div className="error">{error}</div>}{bulkResult && <div className="info-note"><b>Додано: {bulkResult.added}. Пропущено: {bulkResult.skipped}.</b>{bulkResult.skippedNumbers.length > 0 && <div>Дублікати: {bulkResult.skippedNumbers.join(', ')}</div>}</div>}<div className="modal-footer"><button type="button" className="secondary" onClick={() => setBulkOpen(false)}>Закрити</button><button className="primary" disabled={loading || !bulkContract || !bulkNumbers.some(r => r.number.trim())}><Plus size={17} /> Додати всі автомобілі</button></div></form></div>}{receipt && <div className="overlay"><form className="modal small-modal" onSubmit={receive}><div className="modal-head"><h2>Надходження: {receipt.name}</h2><button type="button" className="icon-button" onClick={() => setReceipt(null)}>×</button></div><label>Кількість<input type="number" step="any" min="0.001" required value={receipt.quantity} onChange={e => setReceipt({ ...receipt, quantity: e.target.value })} /></label><div className="modal-footer"><button type="button" className="secondary" onClick={() => setReceipt(null)}>Скасувати</button><button className="primary">Оприбуткувати</button></div></form></div>}</div>;
}
function DataTable({ rows, columns }: {
  rows: Row[];
  columns: string[];
}) { return <div className="table-scroll"><table><thead><tr>{columns.map(c => <th key={c}>{labels[c] || ({ contract: 'Контракт', vehicle: 'Авто', section: 'Дільниця', work: 'Робота', author: 'Майстер', material: 'Матеріал', planned_norm_hours: 'План, н/год', completed_norm_hours: 'Виконано, н/год', works: 'Робіт' } as Row)[c] || c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{r[c] ?? '—'}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty">Даних поки немає</div>}</div>; }
function csv(rows: Row[], name: string) {
  if (!rows.length)
    return; const columns = Object.keys(rows[0]); const data = [columns.join(';'), ...rows.map(r => columns.map(c => '"' + String(r[c] ?? '').replaceAll('"', '""') + '"').join(';'))].join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + data], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
