import type { Row } from '../app/types';

export function display(row: Row, key: string, lists: Record<string, Row[]>) {
  const val = row[key]; const map: Record<string, string> = { contract_id: 'contracts', vehicle_id: 'vehicles', section_id: 'sections', work_id: 'works', material_id: 'materials' }; if (map[key]) {
    const r = lists[map[key]]?.find(x => String(x.id) === String(val));
    return r ? (r.number || r.name || r.login) : val;
  } if (key === 'progress')
    return <span className="progress-cell"><span className="bar"><span style={{ width: `${val}%` }} /></span><b>{Number(val).toFixed(0)}%</b></span>; if (key === 'active')
    return val ? 'Так' : 'Ні'; if (key === 'role')
    return ({ Admin: 'Адмін', Manager: 'Керівник', Master: 'Майстер' } as Row)[val] || val; return val == null ? '—' : String(val);
}
