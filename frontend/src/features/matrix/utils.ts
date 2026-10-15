export const today = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
export const number = (value: unknown) => Number(value) || 0;
export const fmt = (value: number) => value.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
export const fmtUnit = (value: number) => value.toLocaleString('uk-UA', { maximumFractionDigits: 3 });
export const efficiencyDelta = (ratio: number | null) => ratio === null ? null : ratio - 100;
export const efficiencyText = (ratio: number | null) => {
  const delta = efficiencyDelta(ratio);
  return delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmt(Math.abs(delta))}%`;
};
export const efficiencyColor = (ratio: number | null) => {
  const delta = efficiencyDelta(ratio);
  return delta === null || Math.abs(delta) < 0.000001 ? 'inherit' : delta > 0 ? '#22c55e' : '#ef4444';
};
export const key = (workId: number | string) => String(workId);
