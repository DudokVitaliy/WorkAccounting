import { useEffect, useState } from 'react';
import { LogOut, Plus, RefreshCw, Menu } from 'lucide-react';
import WorkMatrix from './WorkMatrix';
import DashboardPage from './features/dashboard/DashboardPage';
import ReportsPage from './features/reports/ReportsPage';
import EntityTable from './features/admin/EntityTable';
import EntityEditorDialog from './features/admin/EntityEditorDialog';
import BulkWorksDialog from './features/admin/BulkWorksDialog';
import BulkVehiclesDialog from './features/admin/BulkVehiclesDialog';
import ReceiptDialog from './features/inventory/ReceiptDialog';
import { display } from './components/display';


import { definitions, nav, type Page } from './app/config';
import { api } from './lib/api';
import type { Row, Session } from './app/types';
import type { SummaryDto, ContractReportDto, DailyReportDto, MaterialReportDto, BulkVehiclesResponseDto, BulkWorksResponseDto } from './app/dto';
const initialDate = () => new Date().toLocaleDateString('sv-SE');
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
  const [summary, setSummary] = useState<SummaryDto>({contracts:0,vehicles:0,works:0,completed:0,todayHours:0,totalHours:0,writtenOff:0});
  const [contractReport, setContractReport] = useState<ContractReportDto[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReportDto[]>([]);
  const [materialReport, setMaterialReport] = useState<MaterialReportDto[]>([]);
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
        const [rows, sum, cr, dr, mr, access] = await Promise.all([Promise.all(entityNames.map(k => api<Row[]>('/' + k, session.token))), api<SummaryDto>('/report/summary', session.token), api<ContractReportDto[]>('/report/contracts', session.token), api<DailyReportDto[]>('/report/daily', session.token), api<MaterialReportDto[]>('/report/materials', session.token), api<number[]>('/auth/sections', session.token)]);
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
      const s = await api<Session>('/auth/login', '', 'POST', { login, password });
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
        await api('/materials/' + Number(receipt.id) + '/receive', session.token, 'POST', { quantity: Number(receipt.quantity) });
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
      const result = await api<BulkVehiclesResponseDto>('/vehicles/bulk', session.token, 'POST', { contract_id: Number(bulkContract), numbers });
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
      const result = await api<BulkWorksResponseDto>('/contract-works/bulk', session.token, 'POST', {
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
    {page === 'dashboard' && <DashboardPage summary={summary} contractReport={contractReport} dailyReport={dailyReport} onShowDaily={() => setPage('daily')} />}
    {page === 'matrix' && <WorkMatrix lists={lists} token={session.token} role={session.role} allowedSections={allowedSections} refresh={refresh} />}{page === 'reports' && <ReportsPage summary={summary} contractReport={contractReport} dailyReport={dailyReport} materialReport={materialReport} />}
    {page !== 'dashboard' && page !== 'reports' && page !== 'matrix' && <EntityTable page={page} activeDef={activeDef} filtered={filtered} search={search} setSearch={setSearch} lists={lists} admin={admin} master={master} allowedSections={allowedSections} begin={begin} setAccessUser={setAccessUser} setAccessIds={setAccessIds} setReceipt={setReceipt} remove={remove} />}
  </div></main>{open && activeDef && <EntityEditorDialog activeDef={activeDef} editing={editing} page={page} form={form} setForm={setForm} lists={lists} master={master} allowedSections={allowedSections} loading={loading} setOpen={setOpen} submit={submit} />}{accessUser && <div className="overlay"><div className="modal small-modal"><div className="modal-head"><h2>Доступ: {accessUser.login}</h2><button className="icon-button" onClick={() => setAccessUser(null)}>×</button></div><div className="modal-fields">{(lists.sections || []).map(sec => <label key={sec.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><input type="checkbox" checked={accessIds.includes(Number(sec.id))} onChange={e => setAccessIds(old => e.target.checked ? [...old, Number(sec.id)] : old.filter(id => id !== Number(sec.id)))} />{sec.name}</label>)}</div><div className="modal-footer"><button className="secondary" onClick={() => setAccessUser(null)}>Скасувати</button><button className="primary" onClick={async () => {
    if (!session)
      return; try {
        await api('/users/' + Number(accessUser.id) + '/sections', session.token, 'PUT', { section_ids: accessIds });
        setAccessUser(null);
        await refresh();
      }
    catch (e) {
      setError(String(e));
    }
  }}>Зберегти доступ</button></div></div></div>}{worksOpen && <BulkWorksDialog setWorksOpen={setWorksOpen} saveWorksBulk={saveWorksBulk} worksContract={worksContract} setWorksContract={setWorksContract} worksSection={worksSection} setWorksSection={setWorksSection} lists={lists} workRows={workRows} setWorkRows={setWorkRows} pasteWorkExcel={pasteWorkExcel} worksNextId={worksNextId} setWorksNextId={setWorksNextId} worksError={worksError} worksResult={worksResult} loading={loading} />}{bulkOpen && <BulkVehiclesDialog setBulkOpen={setBulkOpen} addVehiclesBulk={addVehiclesBulk} bulkContract={bulkContract} setBulkContract={setBulkContract} lists={lists} bulkNumbers={bulkNumbers} setBulkNumbers={setBulkNumbers} bulkNextId={bulkNextId} setBulkNextId={setBulkNextId} error={error} bulkResult={bulkResult} loading={loading} />}{receipt && <ReceiptDialog receipt={receipt} setReceipt={setReceipt} receive={receive} />}</div>;
}
