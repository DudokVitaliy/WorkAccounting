import { Search, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { definitions, labels, nav, type Page } from '../../app/config';
import { display } from '../../components/display';
import type { Row } from '../../app/types';

type Props = {
  page: Page;
  activeDef: (typeof definitions)[string] | undefined;
  filtered: Row[];
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  lists: Record<string, Row[]>;
  admin: boolean;
  master: boolean;
  allowedSections: number[];
  begin: (row: Row) => void;
  setAccessUser: Dispatch<SetStateAction<Row | null>>;
  setAccessIds: Dispatch<SetStateAction<number[]>>;
  setReceipt: Dispatch<SetStateAction<Row | null>>;
  remove: (id: number) => Promise<void>;
};
export default function EntityTable({page,activeDef,filtered,search,setSearch,lists,admin,master,allowedSections,begin,setAccessUser,setAccessIds,setReceipt,remove}: Props) {
  return (<section className="panel data-panel"><div className="table-tools"><div className="table-heading"><h3>{activeDef?.label || nav.find(n => n.key === page)?.label}</h3><p>Записів: {filtered.length}</p></div><div className="search-box"><Search size={17} /><input placeholder="Пошук у таблиці..." value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="table-scroll"><table><thead><tr>{Object.keys(filtered[0] || { id: 0, ...Object.fromEntries((activeDef?.fields || []).map(f => [f.key, ''])) }).filter(k => k !== 'password_hash').map(k => <th key={k}>{labels[k] || k}</th>)}{(admin && page !== 'daily' && page !== 'movements' || master && page === 'section_daily_hours') && <th>Дії</th>}</tr></thead><tbody>{filtered.map(r => <tr key={r.id}>{Object.keys(filtered[0] || {}).filter(k => k !== 'password_hash').map(k => <td key={k}>{display(r, k, lists)}</td>)}{((admin && page !== 'daily' && page !== 'movements') || (master && page === 'section_daily_hours' && allowedSections.includes(Number(r.section_id)))) && <td><div className="row-actions">{page !== 'work_materials' && <button onClick={() => begin(r)}>Редагувати</button>}{admin && page === 'users' && r.role === 'Master' && <button onClick={() => { setAccessUser(r); setAccessIds((lists.user_sections || []).filter(x => Number(x.user_id) === Number(r.id)).map(x => Number(x.section_id))); }}>Доступ до дільниць</button>}{page === 'materials' && <button onClick={() => setReceipt({ id: r.id, name: r.name, quantity: 1 })}>+ Прихід</button>}{admin && page !== 'section_daily_hours' && <button className="danger-link" onClick={() => void remove(Number(r.id))}><Trash2 size={15} /></button>}</div></td>}</tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">Записів поки немає</div>}</div></section>);
}
