export interface Page<T> { items: T[]; total: number; page: number; limit: number }
export type WebLoginReason = 'bad_password' | 'disabled' | 'mfa_failed' | 'unknown_user' | 'trusted_device' | 'mfa';
export interface WebLoginEntry { id: number; username: string; userId: number | null; ip: string; country: string | null; success: boolean; reason: WebLoginReason | null; createdAt: string }
export interface JournalRetention { days: number }
