import { useEffect, useMemo, useState } from 'react';

type Row = Record<string, any>;
type Props = {
  lists: Record<string, Row[]>;
  token: string;
  role: string;
  allowedSections: number[];
  refresh: () => Promise<void>;
};

const today = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const number = (value: unknown) => Number(value) || 0;
const fmt = (value: number) => value.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
const fmtUnit = (value: number) => value.toLocaleString('uk-UA', { maximumFractionDigits: 3 });
const efficiencyDelta = (ratio: number | null) => ratio === null ? null : ratio - 100;
const efficiencyText = (ratio: number | null) => {
  const delta = efficiencyDelta(ratio);
  return delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmt(Math.abs(delta))}%`;
};
const efficiencyColor = (ratio: number | null) => {
  const delta = efficiencyDelta(ratio);
  return delta === null || Math.abs(delta) < 0.000001 ? 'inherit' : delta > 0 ? '#22c55e' : '#ef4444';
};
const key = (workId: number | string) => String(workId);

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

  const contracts = lists.contracts || [];
  const sections = lists.sections || [];
  const vehicles = useMemo(() => (lists.vehicles || [])
    .filter(v => String(v.contract_id) === contract)
    .sort((a, b) => String(a.number).localeCompare(String(b.number), 'uk', { numeric: true })),
  [lists.vehicles, contract]);

  const templates = useMemo(() => (lists.contract_works || [])
    .filter(w => String(w.contract_id) === contract && String(w.section_id) === section),
  [lists.contract_works, contract, section]);

  const vehicleIds = useMemo(() => new Set(vehicles.map(v => String(v.id))), [vehicles]);
  const templateIds = useMemo(() => new Set(templates.map(t => String(t.id))), [templates]);
  const works = useMemo(() => (lists.works || []).filter(w =>
    vehicleIds.has(String(w.vehicle_id)) && templateIds.has(String(w.contract_work_id))),
  [lists.works, vehicleIds, templateIds]);
  const workMap = useMemo(() => new Map(works.map(w => [`${w.contract_work_id}:${w.vehicle_id}`, w])), [works]);
  const normMap = useMemo(() => new Map(templates.map(t => [String(t.id), number(t.norm_hours)])), [templates]);
  const workIdSet = useMemo(() => new Set(works.map(w => key(w.id))), [works]);

  const dayRows = useMemo(() => (lists.daily || []).filter(r =>
    r.date === date && workIdSet.has(key(r.work_id))), [lists.daily, date, workIdSet]);
  const dailyMap = useMemo(() => {
    const map = new Map<string, number>();
    dayRows.forEach(r => map.set(key(r.work_id), (map.get(key(r.work_id)) || 0) + number(r.percent)));
    return map;
  }, [dayRows]);

  const hourRecord = useMemo(() => (lists.section_daily_hours || []).find(r =>
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
  const totalHours = (lists.section_daily_hours || []).filter(r =>
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
    const payload = [];
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
      const response = await fetch('/api/section-report', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: number(contract), section_id: number(section), date, hours: h, entries: payload }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text.slice(0, 450) || `HTTP ${response.status}`);
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
      <section className="panel matrix-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        <label>Контракт
          <select value={contract} onChange={e => { setContract(e.target.value); setSection(''); }}>
            <option value="">Оберіть контракт</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>)}
          </select>
        </label>
        <label>Дільниця
          <select value={section} disabled={!contract} onChange={e => setSection(e.target.value)}>
            <option value="">Оберіть дільницю</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Дата щоденного звіту
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </section>

      {!hasSelection ? <section className="panel empty">Оберіть контракт і дільницю.</section> : <>
        <section className="panel">
          <div className="panel-title"><div><h3>Щоденний звіт · {date}</h3><p>Виконання та витрати за вибрану дату</p></div></div>
          <div className="stat-grid compact">
            <div className="stat-card"><span>Виконано за день</span><strong>{fmt(dayNorm)} н-год</strong></div>
            <div className="stat-card"><span>Витрачено за день</span><strong>{fmt(dayHours)} л-год</strong></div>
            <div className="stat-card"><span>Ефективність за день</span><strong style={{ color: efficiencyColor(dayEfficiency) }}>{efficiencyText(dayEfficiency)}</strong></div>
          </div>
          <p style={{ marginTop: 12 }}>У матриці вводиться <b>частка виконання за вибрану дату</b>: 0,5 = половина роботи, 1 = повністю. Порожня клітинка означає 0.</p>
          <div className="matrix-scroll">
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
                        onChange={e => setEntries(old => ({ ...old, [key(w.id)]: e.target.value }))} />
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
          </div>
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

        <section className="panel">
          <div className="panel-title"><div><h3>Поточний стан контракту на дільниці</h3><p>Завжди актуальні дані, незалежно від дати звіту</p></div></div>
          <div className="stat-grid compact">
            <div className="stat-card"><span>Плановий обсяг</span><strong>{fmt(planned)} н-год</strong></div>
            <div className="stat-card"><span>Виконано</span><strong>{fmt(completed)} н-год</strong></div>
            <div className="stat-card"><span>Залишок</span><strong>{fmt(remaining)} н-год</strong></div>
            <div className="stat-card"><span>Прогрес</span><strong>{fmt(progress)}%</strong></div>
            <div className="stat-card"><span>Витрачено всього</span><strong>{fmt(totalHours)} л-год</strong></div>
            <div className="stat-card"><span>Накопичена ефективність</span><strong style={{ color: efficiencyColor(totalEfficiency) }}>{efficiencyText(totalEfficiency)}</strong></div>
          </div>
          <div className="big-bar" style={{ marginTop: 14 }}><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
          <div style={{ marginTop: 18 }}>
            <h3>Прогноз завершення</h3>
            <label>Працівників на дільниці
              <input type="number" min="1" step="1" value={workers} onChange={e => setWorkers(e.target.value)} />
            </label>
            <div className="stat-grid compact" style={{ marginTop: 12 }}>
              <div className="stat-card"><span>Зміна 8 годин</span><strong>{forecast(8)} змін</strong></div>
              <div className="stat-card"><span>Зміна 11 годин</span><strong>{forecast(11)} змін</strong></div>
            </div>
            <p>Прогноз враховує поточний залишок, кількість працівників і накопичену ефективність. Якщо немає фактичних витрат або виконання — прогноз недоступний. Це робочі зміни, не календарні дні.</p>
          </div>
        </section>
      </>}
    </div>
  );
}
