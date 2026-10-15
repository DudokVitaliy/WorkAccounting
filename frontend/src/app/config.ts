import { LayoutDashboard, BriefcaseBusiness, Truck, Factory, ClipboardList, CalendarDays, Package, PackageCheck, Users, ChartNoAxesCombined, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const keys = ['dashboard', 'matrix', 'contracts', 'vehicles', 'sections', 'contract_works', 'daily', 'section_daily_hours', 'materials', 'work_materials', 'movements', 'users', 'reports'] as const;
export type Page = typeof keys[number];
export const nav: {
  key: Page;
  label: string;
  icon: LucideIcon;
}[] = [{ key: 'dashboard', label: 'Огляд', icon: LayoutDashboard }, { key: 'matrix', label: 'Матриця робіт', icon: ClipboardList }, { key: 'contracts', label: 'Контракти', icon: BriefcaseBusiness }, { key: 'vehicles', label: 'Автомобілі', icon: Truck }, { key: 'sections', label: 'Дільниці', icon: Factory }, { key: 'contract_works', label: 'Роботи та норми', icon: ClipboardList }, { key: 'daily', label: 'Історія виконання', icon: CalendarDays }, { key: 'section_daily_hours', label: 'Людино-години', icon: CalendarDays }, { key: 'materials', label: 'Міні-склад', icon: Package }, { key: 'work_materials', label: 'ТМЦ на роботах', icon: PackageCheck }, { key: 'movements', label: 'Рух матеріалів', icon: ArrowUpRight }, { key: 'reports', label: 'Звіти', icon: ChartNoAxesCombined }, { key: 'users', label: 'Користувачі', icon: Users }];
export const definitions: Record<string, {
  label: string;
  fields: {
    key: string;
    label: string;
    kind?: string;
    ref?: string;
    options?: string[];
  }[];
}> = {
  contracts: { label: 'Контракти', fields: [{ key: 'name', label: 'Назва контракту' }, { key: 'code', label: 'Номер / код' }, { key: 'description', label: 'Примітка' }, { key: 'status', label: 'Статус', options: ['Active', 'Paused', 'Closed'] }] },
  vehicles: { label: 'Автомобілі', fields: [{ key: 'contract_id', label: 'Контракт', ref: 'contracts' }, { key: 'number', label: 'Номер автомобіля' }, { key: 'description', label: 'Примітка' }] },
  sections: { label: 'Дільниці', fields: [{ key: 'name', label: 'Назва дільниці' }] },
  contract_works: { label: 'Роботи та норми', fields: [{ key: 'contract_id', label: 'Контракт', ref: 'contracts' }, { key: 'section_id', label: 'Дільниця', ref: 'sections' }, { key: 'name', label: 'Назва роботи' }, { key: 'norm_hours', label: 'Норма, год', kind: 'number' }, { key: 'description', label: 'Примітка' }] },
  materials: { label: 'Міні-склад', fields: [{ key: 'name', label: 'Матеріал' }, { key: 'sku', label: 'Артикул' }, { key: 'unit', label: 'Одиниця виміру' }] },
  work_materials: { label: 'Закріплення ТМЦ', fields: [{ key: 'work_id', label: 'Робота', ref: 'works' }, { key: 'material_id', label: 'Матеріал', ref: 'materials' }, { key: 'quantity', label: 'Кількість', kind: 'number' }] },
  section_daily_hours: { label: 'Людино-години', fields: [{ key: 'contract_id', label: 'Контракт', ref: 'contracts' }, { key: 'section_id', label: 'Дільниця', ref: 'sections' }, { key: 'date', label: 'Дата', kind: 'date' }, { key: 'hours', label: 'Людино-години', kind: 'number' }] },
  users: { label: 'Користувачі', fields: [{ key: 'login', label: 'Логін' }, { key: 'password', label: 'Пароль (мін. 10 символів)', kind: 'password' }, { key: 'role', label: 'Роль', options: ['Master', 'Manager', 'Admin'] }] }
};
export const labels: Record<string, string> = { id: 'ID', name: 'Назва', code: 'Код', description: 'Примітка', status: 'Статус', contract_id: 'Контракт', number: 'Номер авто', vehicle_id: 'Автомобіль', section_id: 'Дільниця', norm_hours: 'Нормо-години', progress: 'Прогрес, %', balance: 'Залишок', sku: 'Артикул', unit: 'Од.', contract_work_id: 'Шаблон роботи', work_id: 'Робота', material_id: 'Матеріал', quantity: 'Кількість', kind: 'Тип', created_at: 'Дата операції', date: 'Дата', percent: 'За день, %', hours: 'Людино-години', login: 'Логін', role: 'Роль', active: 'Активний', user_id: 'Користувач', token_hash: 'Токен' };
