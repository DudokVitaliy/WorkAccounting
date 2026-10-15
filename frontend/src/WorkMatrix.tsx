import { useEffect, useMemo, useState } from 'react';

import type { Row } from './app/types';
import { api } from './lib/api';
import type { ContractDto, VehicleDto, SectionDto, ContractWorkDto, WorkDto, DailyDto, SectionDailyHoursDto, SectionReportRequestDto, SectionReportResponseDto } from './app/dto';
import { today, number, fmt, efficiencyText, efficiencyColor, key } from './features/matrix/utils';
import MatrixFilters from './features/matrix/MatrixFilters';
import MatrixGrid from './features/matrix/MatrixGrid';
import ProductionSummary from './features/matrix/ProductionSummary';
type Props = {
  lists: Record<string, Row[]>;
  token: string;
  role: string;
  allowedSections: number[];
  refresh: () => Promise<void>;
};

export default function WorkMatrix({ lists, token, role, allowedSections, refresh }: Props) {
  const [contract, setContract] = useState('');
  const [section, setSection] = useState('');
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [hours, setHours] = useState('');
  const [workers, setWorkers] = useState('8');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const contracts = (lists.contracts || []) as ContractDto[];
  const sections = (lists.sections || []) as SectionDto[];
  const vehicles = useMemo(() => ((lists.vehicles || []) as VehicleDto[])
    .filter(v => String(v.contract_id) === contract)
    .sort((a, b) => String(a.number).localeCompare(String(b.number), 'uk', { numeric: true })),
  [lists.vehicles, contract]);

  const templates = useMemo(() => ((lists.contract_works || []) as ContractWorkDto[])
    .filter(w => String(w.contract_id) === contract && String(w.section_id) === section),
  [lists.contract_works, contract, section]);

  const vehicleIds = useMemo(() => new Set(vehicles.map(v => String(v.id))), [vehicles]);
  const templateIds = useMemo(() => new Set(templates.map(t => String(t.id))), [templates]);
  const works = useMemo(() => ((lists.works || []) as WorkDto[]).filter(w =>
    vehicleIds.has(String(w.vehicle_id)) && templateIds.has(String(w.contract_work_id))),
  [lists.works, vehicleIds, templateIds]);
  const workMap = useMemo(() => new Map(works.map(w => [`${w.contract_work_id}:${w.vehicle_id}`, w])), [works]);
  const normMap = useMemo(() => new Map(templates.map(t => [String(t.id), number(t.norm_hours)])), [templates]);
  const workIdSet = useMemo(() => new Set(works.map(w => key(w.id))), [works]);

  const dayRows = useMemo(() => ((lists.daily || []) as DailyDto[]).filter(r =>
    r.date === date && workIdSet.has(key(r.work_id))), [lists.daily, date, workIdSet]);
  const dailyMap = useMemo(() => {
    const map = new Map<string, number>();
    dayRows.forEach(r => map.set(key(r.work_id), (map.get(key(r.work_id)) || 0) + number(r.percent)));
    return map;
  }, [dayRows]);

  const hourRecord = useMemo(() => ((lists.section_daily_hours || []) as SectionDailyHoursDto[]).find(r =>
    String(r.contract_id) === contract && String(r.section_id) === section && r.date === date),
  [lists.section_daily_hours, contract, section, date]);

  // A change of date/contract/section loads that day's existing values.
  useEffect(() => {
    setEntries(Object.fromEntries(works.map(w => [key(w.id), dailyMap.get(key(w.id)) ? String((dailyMap.get(key(w.id)) || 0) / 100) : ''])));
    setHours(hourRecord ? String(hourRecord.hours) : '');
    setError('');
    setMessage('');
  }, [works, dailyMap, hourRecord, date, contract, section]);

  const canEdit = role === 'Admin' || (role === 'Master' && allowedSections.includes(number(section)));
  const hasSelection = Boolean(contract && section);
  const planned = works.reduce((sum, w) => sum + (normMap.get(String(w.contract_work_id)) || 0), 0);
  const completed = works.reduce((sum, w) => sum +
    (normMap.get(String(w.contract_work_id)) || 0) * number(w.progress) / 100, 0);
  const remaining = Math.max(0, planned - completed);
  const progress = planned > 0 ? 100 * completed / planned : 0;

  // Today's panel: date-specific facts. Contract panel: always current facts.
  const dayNorm = dayRows.reduce((sum, r) => sum + number(r.norm_hours), 0);
  const dayHours = number(hourRecord?.hours);
  const dayEfficiency = dayHours > 0 ? dayNorm / dayHours * 100 : null;
  const totalHours = ((lists.section_daily_hours || []) as SectionDailyHoursDto[]).filter(r =>
    String(r.contract_id) === contract && String(r.section_id) === section)
    .reduce((sum, r) => sum + number(r.hours), 0);
  const totalEfficiency = totalHours > 0 ? completed / totalHours * 100 : null;
  const people = Number(workers);
  const forecast = (shift: number) => {
    if (remaining <= 0) return '0';
    if (!Number.isFinite(people) || people <= 0 || totalEfficiency === null || totalEfficiency <= 0) return '—';
    return String(Math.ceil(remaining / (people * shift * totalEfficiency / 100)));
  };

  const save = async () => {
    if (!hasSelection || !canEdit || busy) return;
    const h = Number(hours);
    if (hours.trim() === '' || !Number.isFinite(h) || h < 0) {
      setError('Вкажіть фактично витрачені людино-години (0, якщо витрат не було).');
      return;
    }
    const payload: SectionReportRequestDto['entries'] = [];
    for (const w of works) {
      const raw = entries[key(w.id)] ?? '';
      const unit = raw.trim() === '' ? 0 : Number(raw.replace(',', '.'));
      const value = unit * 100;
      const old = dailyMap.get(key(w.id)) || 0;
      const next = number(w.progress) - old + value;
      if (!Number.isFinite(unit) || unit < 0 || unit > 1 || next < -0.000001 || next > 100.000001) {
        setError(`Некоректне виконання для роботи #${w.id}. Значення за день і загальне виконання мають бути в межах 0–1.`);
        return;
      }
      payload.push({ work_id: number(w.id), percent: value });
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const request: SectionReportRequestDto = {
        contract_id: number(contract), section_id: number(section), date, hours: h, entries: payload
      };
      await api<SectionReportResponseDto>('/section-report', token, 'PUT', request);
      await refresh();
      setMessage('Щоденний звіт збережено.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="matrix-page" style={{ display: 'grid', gap: 18 }}>
      <MatrixFilters contracts={contracts} sections={sections} contract={contract} section={section} date={date} onContract={value => { setContract(value); setSection(''); }} onSection={setSection} onDate={setDate} />

      {!hasSelection ? <section className="panel empty">Оберіть контракт і дільницю.</section> : <>
        <section className="panel">
          <div className="panel-title"><div><h3>Щоденний звіт · {date}</h3><p>Виконання та витрати за вибрану дату</p></div></div>
          <div className="stat-grid compact">
            <div className="stat-card"><span>Виконано за день</span><strong>{fmt(dayNorm)} н-год</strong></div>
            <div className="stat-card"><span>Витрачено за день</span><strong>{fmt(dayHours)} л-год</strong></div>
            <div className="stat-card"><span>Ефективність за день</span><strong style={{ color: efficiencyColor(dayEfficiency) }}>{efficiencyText(dayEfficiency)}</strong></div>
          </div>
          <p style={{ marginTop: 12 }}>У матриці вводиться <b>частка виконання за вибрану дату</b>: 0,5 = половина роботи, 1 = повністю. Порожня клітинка означає 0.</p>
          <MatrixGrid vehicles={vehicles} templates={templates} works={works} workMap={workMap} normMap={normMap} dailyMap={dailyMap} entries={entries} onEntryChange={(id, value) => setEntries(old => ({ ...old, [key(id)]: value }))} canEdit={canEdit} busy={busy} />
          {templates.length === 0 && <div className="empty">Для дільниці ще немає робіт за цим контрактом.</div>}
          <div className="matrix-savebar">
            <label className="matrix-hours-field">
              <span>Загальні витрати дільниці за день, люд.-год</span>
              <input type="number" min="0" step="any" placeholder="Наприклад, 64" value={hours}

                disabled={!canEdit || busy} onChange={e => setHours(e.target.value)} />
            </label>
            {canEdit && <button type="button" className="primary matrix-save-button" disabled={busy} onClick={() => void save()}>{busy ? 'Збереження…' : 'Зберегти щоденний звіт'}</button>}
          </div>
          {!canEdit && <p>Перегляд без редагування. Майстру потрібен доступ до дільниці.</p>}
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          {message && <p role="status" style={{ marginTop: 12 }}>{message}</p>}
        </section>

        <ProductionSummary planned={planned} completed={completed} remaining={remaining} progress={progress} totalHours={totalHours} totalEfficiency={totalEfficiency} workers={workers} setWorkers={setWorkers} forecast={forecast} />
      </>}
    </div>
  );
}
