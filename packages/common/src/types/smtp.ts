export interface SmtpSettingsDto { host: string; port: number; secure: boolean; username: string; hasPassword: boolean; fromAddress: string; fromName: string; enabled: boolean }
/** `password` vide ou absent = inchangé. */
export interface SmtpSettingsBody { host: string; port: number; secure: boolean; username: string; password?: string; fromAddress: string; fromName: string; enabled: boolean }
