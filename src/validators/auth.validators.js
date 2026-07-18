import { z } from 'zod';

const password = z.string().min(8, 'Use at least 8 characters').regex(/[A-Z]/, 'Add an uppercase letter').regex(/[a-z]/, 'Add a lowercase letter').regex(/[0-9]/, 'Add a number');
export const registerSchema = z.object({ fullName: z.string().trim().min(2).max(80), username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/), email: z.string().trim().toLowerCase().email(), password });
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ token: z.string().min(20), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
