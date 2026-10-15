/** API contracts. Named DTO fields are strongly typed; the legacy schema-driven CRUD editor keeps a dynamic record. */
export type UserRole = 'Admin' | 'Manager' | 'Master';
export type ContractStatus = 'Active' | 'Paused' | 'Closed';
export type Id = number;
export type ISODate = string;

export interface SessionDto { token: string; login: string; role: UserRole }
export interface CurrentUserDto { id: Id; login: string; role: UserRole; sections: Id[] }
export interface ContractDto { id: Id; name: string; code: string; description: string; status: ContractStatus }
export interface VehicleDto { id: Id; contract_id: Id; number: string; description: string }
export interface SectionDto { id: Id; name: string }
export interface ContractWorkDto { id: Id; contract_id: Id; section_id: Id; name: string; norm_hours: number; description: string }
export interface WorkDto { id: Id; vehicle_id: Id; contract_work_id: Id; progress: number }
export interface DailyDto { id: Id; work_id: Id; user_id: Id; date: ISODate; percent: number; norm_hours: number; created_at: string }
export interface SectionDailyHoursDto { id: Id; contract_id: Id; section_id: Id; date: ISODate; hours: number; user_id: Id; updated_at: string }
export interface MaterialDto { id: Id; name: string; sku: string; unit: string; balance: number }
export interface WorkMaterialDto { id: Id; work_id: Id; material_id: Id; quantity: number }
export interface MaterialMovementDto { id: Id; work_id: Id | null; material_id: Id; quantity: number; kind: 'Receipt' | 'WriteOff'; created_at: string }
export interface UserDto { id: Id; login: string; role: UserRole; active: number }
export interface UserSectionDto { id: Id; user_id: Id; section_id: Id }

export interface SummaryDto {
  contracts: number; vehicles: number; works: number; completed: number;
  todayHours: number; totalHours: number; writtenOff: number;
}
export interface ContractReportDto {
  id: Id; name: string; works: number; planned_norm_hours: number;
  completed_norm_hours: number; progress: number;
}
export interface DailyReportDto {
  id: Id; date: ISODate; percent: number; norm_hours: number; created_at: string;
  author: string; contract: string; vehicle: string; section: string; work: string;
}
export interface MaterialReportDto {
  material: string; unit: string; quantity: number; created_at: string;
  contract: string | null; vehicle: string | null; section: string | null; work: string | null;
}
export interface BulkVehiclesResponseDto { added: number; skipped: number; addedNumbers: string[]; skippedNumbers: string[] }
export interface BulkWorksResponseDto { added: number; skipped: number; addedNames: string[]; skippedNames: string[] }
export interface SectionReportEntryDto { work_id: Id; percent: number }
export interface SectionReportRequestDto {
  contract_id: Id; section_id: Id; date: ISODate; hours: number; entries: SectionReportEntryDto[];
}
export interface SectionReportResponseDto { saved: boolean; entries: number }
export interface WorkAccountingListsDto {
  contracts?: ContractDto[];
  vehicles?: VehicleDto[];
  sections?: SectionDto[];
  contract_works?: ContractWorkDto[];
  works?: WorkDto[];
  daily?: DailyDto[];
  section_daily_hours?: SectionDailyHoursDto[];
  materials?: MaterialDto[];
  work_materials?: WorkMaterialDto[];
  movements?: MaterialMovementDto[];
  users?: UserDto[];
  user_sections?: UserSectionDto[];
}
