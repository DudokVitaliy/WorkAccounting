import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { Row } from '../../app/types';
type Props = { receipt: Row; setReceipt: Dispatch<SetStateAction<Row | null>>; receive: (event: FormEvent<HTMLFormElement>) => Promise<void> };
export default function ReceiptDialog({receipt,setReceipt,receive}: Props) {
 return (<div className="overlay"><form className="modal small-modal" onSubmit={receive}><div className="modal-head"><h2>Надходження: {receipt.name}</h2><button type="button" className="icon-button" onClick={() => setReceipt(null)}>×</button></div><label>Кількість<input type="number" step="any" min="0.001" required value={receipt.quantity} onChange={e => setReceipt({ ...receipt, quantity: e.target.value })} /></label><div className="modal-footer"><button type="button" className="secondary" onClick={() => setReceipt(null)}>Скасувати</button><button className="primary">Оприбуткувати</button></div></form></div>);
}
