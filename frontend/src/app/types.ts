import type { UserRole } from './dto';
/** Dynamic CRUD record: unknown fields require narrowing before rendering or editing. */
export type Row = Record<string, unknown> & {
  id?: number; name?: string; number?: string; login?: string; role?: UserRole;
  active?: number; progress?: number; quantity?: number; percent?: number;
  contract_id?: number; section_id?: number; vehicle_id?: number; user_id?: number;
  work_id?: number; material_id?: number; contract_work_id?: number; norm_hours?: number;
};

export type { SessionDto as Session } from './dto';
