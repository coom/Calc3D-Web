export type AuditAction =
  | 'user.create' | 'user.update' | 'user.delete'
  | 'journal.retention';
export interface AuditEntry { id: number; at: string; userId: number; username: string; action: AuditAction; detail: string | null; ip: string | null }
export interface AuditPage { entries: AuditEntry[]; total: number; page: number; pageSize: number }
