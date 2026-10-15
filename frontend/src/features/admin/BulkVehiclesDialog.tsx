import { Plus, Trash2 } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { Row } from '../../app/types';
import type { BulkVehiclesResponseDto } from '../../app/dto';

type VehicleField = { id: number; number: string };
type Props = {
 setBulkOpen: Dispatch<SetStateAction<boolean>>;
 addVehiclesBulk: (event: FormEvent<HTMLFormElement>) => Promise<void>;
 bulkContract: string; setBulkContract: Dispatch<SetStateAction<string>>;
 lists: Record<string, Row[]>; bulkNumbers: VehicleField[]; setBulkNumbers: Dispatch<SetStateAction<VehicleField[]>>;
 bulkNextId: number; setBulkNextId: Dispatch<SetStateAction<number>>;
 error: string; bulkResult: BulkVehiclesResponseDto | null; loading: boolean;
};
export default function BulkVehiclesDialog({setBulkOpen,addVehiclesBulk,bulkContract,setBulkContract,lists,bulkNumbers,setBulkNumbers,bulkNextId,setBulkNextId,error,bulkResult,loading}: Props) {
 return (<div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setBulkOpen(false); }}><form className="modal bulk-vehicles-modal" onSubmit={addVehiclesBulk}><div className="modal-head"><div><span className="eyebrow">МАСОВЕ ДОДАВАННЯ</span><h2>Додати автомобілі</h2></div><button type="button" className="icon-button" onClick={() => setBulkOpen(false)}>×</button></div><p>Виберіть контракт, введіть номер кожного автомобіля в окреме поле. Кнопка «+ Додати поле» створює наступний рядок.</p><label>Контракт<select required value={bulkContract} onChange={e => setBulkContract(e.target.value)}><option value="">Оберіть контракт</option>{(lists.contracts || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="bulk-number-header"><b>Номери автомобілів</b><span>Заповнено: {bulkNumbers.filter(r => r.number.trim()).length}</span></div><div className="bulk-number-list">{bulkNumbers.map((row, index) => <div className="bulk-number-row" key={row.id}><span className="bulk-number-index">{index + 1}.</span><input aria-label={`Номер автомобіля ${index + 1}`} placeholder="Введіть номер авто" value={row.number} onChange={e => setBulkNumbers(old => old.map(r => r.id === row.id ? { ...r, number: e.target.value } : r))} /><button type="button" className="bulk-remove-row" title="Прибрати поле" aria-label={`Прибрати поле ${index + 1}`} disabled={bulkNumbers.length === 1} onClick={() => setBulkNumbers(old => old.filter(r => r.id !== row.id))}><Trash2 size={17} /></button></div>)}</div><button type="button" className="secondary bulk-add-row" onClick={() => { setBulkNumbers(old => [...old, { id: bulkNextId, number: '' }]); setBulkNextId(n => n + 1); }}><Plus size={17} /> Додати поле</button><small>Порожні поля пропускаються. Повторні номери не створюються.</small>{error && <div className="error">{error}</div>}{bulkResult && <div className="info-note"><b>Додано: {bulkResult.added}. Пропущено: {bulkResult.skipped}.</b>{bulkResult.skippedNumbers.length > 0 && <div>Дублікати: {bulkResult.skippedNumbers.join(', ')}</div>}</div>}<div className="modal-footer"><button type="button" className="secondary" onClick={() => setBulkOpen(false)}>Закрити</button><button className="primary" disabled={loading || !bulkContract || !bulkNumbers.some(r => r.number.trim())}><Plus size={17} /> Додати всі автомобілі</button></div></form></div>);
}
