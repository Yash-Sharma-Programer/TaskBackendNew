import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
export const organisationSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().max(500).optional().default(''), timezone: z.string().optional() });
export const workspaceSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().max(500).optional().default(''), timezone: z.string().optional(), defaultStatuses: z.array(z.string().min(1)).min(2).optional() });
export const projectSchema = z.object({
  workspaceId: objectId, name: z.string().trim().min(2).max(120), description: z.string().max(2000).optional().default(''), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), icon: z.string().optional(),
  status: z.enum(['planned', 'active', 'on-hold', 'completed', 'archived']).optional(), startDate: z.coerce.date().optional().nullable(), deadline: z.coerce.date().optional().nullable(), manager: objectId.optional().nullable(), teamMembers: z.array(objectId).optional()
});
export const taskSchema = z.object({
  projectId: objectId, columnId: objectId, title: z.string().trim().min(2).max(200), description: z.string().max(10000).optional().default(''), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  labels: z.array(z.object({ name: z.string().min(1), color: z.string().optional() })).optional(), assignees: z.array(objectId).optional(), startDate: z.coerce.date().optional().nullable(), deadline: z.coerce.date().optional().nullable(), estimatedHours: z.coerce.number().min(0).optional()
});
export const commentSchema = z.object({ taskId: objectId, body: z.string().trim().min(1).max(5000), parentId: objectId.optional().nullable() });
export const invitationSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'Enter a valid username'),
  role: z.enum(['admin', 'manager', 'member']).default('member')
});
