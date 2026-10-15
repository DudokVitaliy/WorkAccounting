import type { ContractWorkDto, VehicleDto, WorkDto } from '../../app/dto';
import { fmt, fmtUnit, number, key } from './utils';

type Props = {
  vehicles: VehicleDto[]; templates: ContractWorkDto[]; works: WorkDto[];
  workMap: Map<string, WorkDto>; normMap: Map<string, number>; dailyMap: Map<string, number>;
  entries: Record<string,string>; onEntryChange: (workId: number, value: string) => void;
  canEdit: boolean; busy: boolean;
};
export default function MatrixGrid({vehicles,templates,works,workMap,normMap,dailyMap,entries,onEntryChange,canEdit,busy}: Props) {
  return (<div className="matrix-scroll">
            <table className="matrix-table">
              <thead><tr><th className="matrix-sticky">Робота / Автомобіль</th>{vehicles.map(v => <th key={v.id}>№ {v.number}</th>)}</tr></thead>
              <tbody>
                {templates.map(t => <tr key={t.id}>
                  <th className="matrix-sticky">{t.name}<div style={{ fontSize: 12, opacity: .65 }}>Норма: {fmt(number(t.norm_hours))} год</div></th>
                  {vehicles.map(v => {
                    const w = workMap.get(`${t.id}:${v.id}`);
                    if (!w) return <td key={v.id}>—</td>;
                    const previous = dailyMap.get(key(w.id)) || 0;
                    const available = Math.max(0, (100 - number(w.progress) + previous) / 100);
                    return <td key={v.id} style={{ minWidth: 100 }}>
                      <input aria-label={`${t.name}, авто ${v.number}`} type="text" inputMode="decimal"
                        disabled={!canEdit || busy} placeholder="0" style={{ width: '100%', minWidth: 78 }}
                        value={entries[key(w.id)] ?? ''}
                        onChange={e => onEntryChange(w.id, e.target.value)} />
                      <div style={{ fontSize: 11, opacity: .7 }}>Всього: {fmtUnit(number(w.progress) / 100)} / 1 · доступно {fmtUnit(available)}</div>
                    </td>;
                  })}
                </tr>)}
                {templates.length > 0 && <tr className="matrix-total"><th className="matrix-sticky">Поточне виконання по авто</th>
                  {vehicles.map(v => {
                    const items = works.filter(w => String(w.vehicle_id) === String(v.id));
                    const plan = items.reduce((s, w) => s + (normMap.get(String(w.contract_work_id)) || 0), 0);
                    const done = items.reduce((s, w) => s + (normMap.get(String(w.contract_work_id)) || 0) * number(w.progress) / 100, 0);
                    return <td key={v.id}><b>{plan ? fmtUnit(done / plan) : '0'} / 1</b></td>;
                  })}</tr>}
              </tbody>
            </table>
          </div>);
}
