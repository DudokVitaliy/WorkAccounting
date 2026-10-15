import type { Dispatch, SetStateAction } from 'react';
import { fmt, efficiencyColor, efficiencyText } from './utils';

type Props = {
  planned: number; completed: number; remaining: number; progress: number;
  totalHours: number; totalEfficiency: number | null;
  workers: string; setWorkers: Dispatch<SetStateAction<string>>; forecast: (shift: number) => string;
};
export default function ProductionSummary({planned,completed,remaining,progress,totalHours,totalEfficiency,workers,setWorkers,forecast}: Props) {
  return (<section className="panel">
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
        </section>);
}
