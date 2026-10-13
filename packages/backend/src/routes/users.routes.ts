import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { audit } from '../audit/audit.js';
import { validatePassword, loadPasswordPolicy, savePasswordPolicy, type PasswordPolicy } from '../utils/validate-password.js';
import { USER_LANGUAGES } from '@calc3d/common';
import { config } from '../config.js';
import { isSmtpEnabled, sendMail, type TransportFactory } from '../mail/mailer.js';
import { credentialsEmail, type CredentialsEmailParams } from '../mail/templates.js';

const VALID_ROLES = ['admin', 'user'];

/** E-mail facultatif : vide = aucune adresse ; sinon une adresse valide, en minuscules. 400 `validation` sinon. */
function parseEmail(v: unknown): string {
  if (v === undefined || v === null) return '';
  const email = String(v).trim().toLowerCase();
  if (email === '') return '';
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Invalid email', undefined, 'validation');
  return email;
}
function parseLanguage(v: unknown): string {
  if (!(USER_LANGUAGES as readonly string[]).includes(String(v))) throw new AppError(400, 'Unsupported language', undefined, 'validation');
  return String(v);
}
/** Préconditions d'une notification : une adresse et SMTP actif. Vérifiées avant toute écriture pour ne jamais créer un compte « à moitié ». */
async function assertCanNotify(req: Request, email: string): Promise<void> {
  if (!email) throw new AppError(400, 'An e-mail address is required to notify the user', undefined, 'validation');
  if (!(await isSmtpEnabled(req.app.locals.prisma))) throw new AppError(409, 'SMTP is not configured', undefined, 'smtp_disabled');
}
/** Envoi des identifiants ; le mot de passe en clair ne quitte jamais cette fonction (ni audit, ni journal). Échec = rapporté, jamais levé. */
async function sendCredentials(req: Request, to: string, language: string | null, p: CredentialsEmailParams): Promise<{ emailSent: boolean; emailError?: string }> {
  try {
    await sendMail(req.app.locals.prisma, { to, ...credentialsEmail(language, p) }, req.app.locals.mailFactory as TransportFactory | undefined);
    return { emailSent: true };
  } catch (err) {
    return { emailSent: false, emailError: err instanceof AppError && err.details ? String(err.details) : (err instanceof Error ? err.message : String(err)) };
  }
}

export const userRoutes: Router = Router();

userRoutes.use(requireRole('admin'));

// GET /api/users/password-policy — current global password policy
userRoutes.get('/password-policy', async (req: Request, res: Response, next) => {
  try {
    res.json(await loadPasswordPolicy(req.app.locals.prisma));
  } catch (err) { next(err); }
});

// PUT /api/users/password-policy — update the global password policy
userRoutes.put('/password-policy', async (req: Request, res: Response, next) => {
  try {
    const minLength = parseInt(req.body.minLength);
    if (isNaN(minLength) || minLength < 1 || minLength > 128) {
      throw new AppError(400, 'minLength must be between 1 and 128');
    }
    const policy: PasswordPolicy = { minLength, requireComplexity: !!req.body.requireComplexity };
    await savePasswordPolicy(req.app.locals.prisma, policy);
    await audit(req, 'user.update', 'password-policy');
    res.json(policy);
  } catch (err) { next(err); }
});

userRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const users = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, enabled: true, createdAt: true, lastLoginAt: true, mfaEnabled: true, mfaRequired: true, email: true, language: true },
      orderBy: { id: 'asc' },
    });
    res.json(users);
  } catch (err) { next(err); }
});

userRoutes.post('/', async (req: Request, res: Response, next) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password || !displayName) throw new AppError(400, 'Username, password, and display name required');

    const prisma = req.app.locals.prisma;
    const pwError = validatePassword(password, await loadPasswordPolicy(prisma));
    if (pwError) throw new AppError(400, pwError);

    const assignedRole = role || 'user';
    if (!VALID_ROLES.includes(assignedRole)) throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    const email = parseEmail(req.body.email);
    const language = req.body.language === undefined || req.body.language === null ? null : parseLanguage(req.body.language);
    const notify = !!req.body.notify;
    if (notify) await assertCanNotify(req, email);
    const passwordHash = await bcrypt.hash(password, 12);
    const mfaRequired = !!req.body.mfaRequired; const mustChangePassword = !!req.body.mustChangePassword;
    const user = await prisma.user.create({
      data: { username, passwordHash, displayName, role: assignedRole, mfaRequired, mustChangePassword, email, language },
    });

    await audit(req, 'user.create', username);
    const mail = notify
      ? await sendCredentials(req, email, language, { kind: 'welcome', url: config.frontendUrl, username, password, displayName, mustChangePassword, mfaRequired, mfaEnabled: false })
      : { emailSent: false };
    res.status(201).json({ id: user.id, username: user.username, ...mail });
  } catch (err) { next(err); }
});

userRoutes.put('/:userId', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(String(req.params.userId));
    const data: any = {};

    if (req.body.displayName !== undefined) data.displayName = req.body.displayName;
    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role)) throw new AppError(400, `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
      data.role = req.body.role;
    }
    if (req.body.enabled !== undefined) data.enabled = req.body.enabled;
    if (req.body.password) {
      const pwError = validatePassword(req.body.password, await loadPasswordPolicy(prisma));
      if (pwError) throw new AppError(400, pwError);
      data.passwordHash = await bcrypt.hash(req.body.password, 12);
    }
    if (req.body.mustChangePassword !== undefined) data.mustChangePassword = !!req.body.mustChangePassword;
    if (req.body.email !== undefined) data.email = parseEmail(req.body.email);
    if (req.body.language !== undefined) data.language = req.body.language === null ? null : parseLanguage(req.body.language);
    // Admin MFA controls
    if (req.body.mfaRequired !== undefined) data.mfaRequired = !!req.body.mfaRequired;
    if (req.body.resetMfa) {
      // Lost device: clear the user's MFA so they (re-)enroll. If still
      // required, they're forced to set it up again at next login.
      data.mfaEnabled = false;
      data.mfaSecret = null;
      data.mfaPendingSecret = null;
      data.mfaRecoveryCodes = null;
    }

    const isDemoting = data.enabled === false || data.role === 'user';
    if (isDemoting) {
      // Self-protection: cannot disable or demote your own account
      if (id === req.user!.id) throw new AppError(400, 'Cannot disable or demote your own account');

      // Last-admin protection: if target is currently an enabled admin, ensure others remain
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true, enabled: true } });
      if (target?.role === 'admin' && target.enabled) {
        const otherAdmins = await prisma.user.count({ where: { role: 'admin', enabled: true, id: { not: id } } });
        if (otherAdmins === 0) throw new AppError(400, 'Cannot remove the last administrator');
      }
    }

    // Notification (réinitialisation de mot de passe par l'admin) : préconditions vérifiées avant l'écriture.
    const notify = !!req.body.notify && !!req.body.password;
    const before = notify ? await prisma.user.findUnique({ where: { id }, select: { email: true, language: true, displayName: true, username: true, mfaRequired: true, mfaEnabled: true } }) : null;
    if (notify) {
      if (!before) throw new AppError(404, 'User not found');
      await assertCanNotify(req, data.email ?? before.email);
    }

    await prisma.user.update({ where: { id }, data });
    await audit(req, 'user.update', String(id));
    if (!notify || !before) { res.status(204).send(); return; }
    const mail = await sendCredentials(req, data.email ?? before.email, data.language ?? before.language, {
      kind: 'reset', url: config.frontendUrl, username: before.username, password: String(req.body.password), displayName: data.displayName ?? before.displayName,
      mustChangePassword: data.mustChangePassword ?? false, mfaRequired: data.mfaRequired ?? before.mfaRequired, mfaEnabled: req.body.resetMfa ? false : before.mfaEnabled,
    });
    res.json(mail);
  } catch (err) { next(err); }
});

userRoutes.delete('/:userId', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(String(req.params.userId));
    if (id === req.user!.id) throw new AppError(400, 'Cannot delete your own account');

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, enabled: true } });
    if (target?.role === 'admin' && target.enabled) {
      const otherAdmins = await prisma.user.count({ where: { role: 'admin', enabled: true, id: { not: id } } });
      if (otherAdmins === 0) throw new AppError(400, 'Cannot remove the last administrator');
    }

    await prisma.user.delete({ where: { id } });
    await audit(req, 'user.delete', String(id));
    res.status(204).send();
  } catch (err) { next(err); }
});
