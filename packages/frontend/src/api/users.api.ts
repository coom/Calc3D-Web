import api from './client';

export interface UserRow {
  id: number; username: string; displayName: string; role: 'admin' | 'user';
  enabled: boolean; createdAt: string; lastLoginAt: string | null; mfaEnabled: boolean; mfaRequired: boolean;
  email: string; language: string | null;
}
export interface CreateUserBody { username: string; password: string; displayName: string; role: string; mfaRequired?: boolean; mustChangePassword?: boolean; email?: string; language?: string | null; notify?: boolean }
export type UpdateUserBody = Partial<{ displayName: string; role: string; enabled: boolean; password: string; mfaRequired: boolean; mustChangePassword: boolean; resetMfa: boolean; email: string; language: string | null; notify: boolean }>;
/** Résultat d'une notification : `emailSent` faux avec `emailError` si le transport a échoué (le compte est quand même créé ou modifié). */
export interface MailOutcome { emailSent: boolean; emailError?: string }

export const usersApi = {
  list: (): Promise<UserRow[]> => api.get('/users').then((r) => r.data),
  create: (data: CreateUserBody): Promise<{ id: number; username: string } & MailOutcome> =>
    api.post('/users', data).then((r) => r.data),
  /** 204 sans notification ; 200 avec `MailOutcome` quand `notify` accompagne un nouveau mot de passe. */
  update: (id: number, data: UpdateUserBody): Promise<MailOutcome | undefined> =>
    api.put(`/users/${id}`, data).then((r) => (r.status === 200 ? r.data : undefined)),
  delete: (id: number) => api.delete(`/users/${id}`),
  passwordPolicy: (): Promise<{ minLength: number; requireComplexity: boolean }> => api.get('/users/password-policy').then((r) => r.data),
  updatePasswordPolicy: (data: { minLength: number; requireComplexity: boolean }) => api.put('/users/password-policy', data).then((r) => r.data),
};
