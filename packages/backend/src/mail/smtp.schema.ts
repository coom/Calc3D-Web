import { z } from 'zod';

/** Corps de PUT /api/smtp. `password` vide ou absent = inchangé. Activer exige un hôte et un expéditeur. */
export const smtpBodySchema = z.object({
  host: z.string().trim().max(255), port: z.number().int().min(1).max(65535), secure: z.boolean(), username: z.string().trim().max(255),
  password: z.string().max(255).optional(),
  fromAddress: z.string().trim().max(200).refine((v) => v === '' || z.string().email().safeParse(v).success, 'invalid e-mail'),
  fromName: z.string().trim().max(100), enabled: z.boolean(),
}).strict().superRefine((v, ctx) => {
  if (v.enabled && (!v.host || !v.fromAddress)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['enabled'], message: 'host and fromAddress are required to enable SMTP' });
});
export const smtpTestSchema = z.object({ to: z.string().trim().email().max(200) }).strict();
