import { z } from 'zod';
import { RoleSchema } from './enums';

export const PASSWORD_MIN_LENGTH = 12;

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128);

export const PersonNameSchema = z.string().trim().min(1).max(100);

/**
 * Signing up asks for no password: every request gets the same answer and an emailed link,
 * so the endpoint never reveals whether an address already has an account. A new address
 * chooses its password from the link, which creates the account and the business.
 */
export const RegisterSchema = z.object({
  name: PersonNameSchema,
  email: EmailSchema,
  businessName: z.string().trim().min(2).max(100),
  /** ISO 4217 currency for the loyalty programme. */
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .default('GBP'),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const CompleteRegistrationSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});
export type CompleteRegistrationInput = z.infer<typeof CompleteRegistrationSchema>;

export const LoginSchema = z.object({
  email: EmailSchema,
  // Not PasswordSchema: policy changes must not lock out existing accounts.
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({ email: EmailSchema });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const MembershipSummarySchema = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  role: RoleSchema,
});
export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;

export const MeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  }),
  memberships: z.array(MembershipSummarySchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
