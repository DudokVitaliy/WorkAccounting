import { Save } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { definitions, type Page } from '../../app/config';
import type { Row } from '../../app/types';

type Props = { activeDef: (typeof definitions)[string]; editing: number | null; page: Page;
 form: Row; setForm: Dispatch<SetStateAction<Row>>; lists: Record<string, Row[]>;
 master: boolean; allowedSections: number[]; loading: boolean;
 setOpen: Dispatch<SetStateAction<boolean>>; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> };
export default function EntityEditorDialog({activeDef,editing,page,form,setForm,lists,master,allowedSections,loading,setOpen,submit}: Props) {
 return (activeDef && <div className="overlay" onMouseDown={e => {
    if (e.target === e.currentTarget)
      setOpen(false);
  }}><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">{editing !== null ? 'РЕДАГУВАННЯ' : 'НОВИЙ ЗАПИС'}</span><h2>{activeDef.label}</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div><div className="modal-fields">{activeDef.fields.filter(f => !(editing !== null && f.key === 'password')).map(f => <label key={f.key}>{f.label}{f.ref ? <select required value={String(form[f.key] ?? '')} onChange={e => setForm({ ...form, [f.key]: e.target.value })}><option value="">Оберіть...</option>{(lists[f.ref] || []).filter(r => !(f.ref === 'sections' && page === 'section_daily_hours' && master && !allowedSections.includes(Number(r.id)))).map(r => <option key={r.id} value={r.id}>{r.number || r.name || r.login}</option>)}</select> : f.options ? <select value={String(form[f.key] || f.options[0])} onChange={e => setForm({ ...form, [f.key]: e.target.value })}>{f.options.map(o => <option key={o}>{o}</option>)}</select> : <input required={['name', 'number', 'login', 'password', 'date', 'percent', 'work_id'].includes(f.key)} type={f.kind || 'text'} step={f.kind === 'number' ? 'any' : undefined} min={f.kind === 'number' ? 0 : undefined} value={String(form[f.key] ?? '')} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />}</label>)}</div><div className="modal-footer"><button type="button" className="secondary" onClick={() => setOpen(false)}>Скасувати</button><button disabled={loading} className="primary"><Save size={17} /> Зберегти</button></div></form></div>);
}
