import type { ContractDto, SectionDto } from '../../app/dto';

type Props = {
  contracts: ContractDto[]; sections: SectionDto[]; contract: string; section: string; date: string;
  onContract: (value: string) => void; onSection: (value: string) => void; onDate: (value: string) => void;
};
export default function MatrixFilters({contracts,sections,contract,section,date,onContract,onSection,onDate}: Props) {
  return (<section className="panel matrix-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        <label>Контракт
          <select value={contract} onChange={e => { onContract(e.target.value); }}>
            <option value="">Оберіть контракт</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>)}
          </select>
        </label>
        <label>Дільниця
          <select value={section} disabled={!contract} onChange={e => onSection(e.target.value)}>
            <option value="">Оберіть дільницю</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Дата щоденного звіту
          <input type="date" value={date} onChange={e => onDate(e.target.value)} />
        </label>
      </section>);
}
