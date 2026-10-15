import { labels } from '../app/config';
import type { Row } from '../app/types';

export function DataTable({ rows, columns }: {
  rows: Row[];
  columns: string[];
}) { return <div className="table-scroll"><table><thead><tr>{columns.map(c => <th key={c}>{labels[c] || ({ contract: 'Контракт', vehicle: 'Авто', section: 'Дільниця', work: 'Робота', author: 'Майстер', material: 'Матеріал', planned_norm_hours: 'План, н/год', completed_norm_hours: 'Виконано, н/год', works: 'Робіт' } as Row)[c] || c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{r[c] ?? '—'}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty">Даних поки немає</div>}</div>; }
