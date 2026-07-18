import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const ref = (name, required = true) => ({ type: Schema.Types.ObjectId, ref: name, required });
const clean = { toJSON: { virtuals: true, transform: (_, value) => { delete value.__v; return value; } } };
const make = (name, schema) => models[name] || model(name, schema);

const userSchema = new Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9._-]{3,30}$/ },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, default: '' }, jobTitle: { type: String, default: '', maxlength: 100 }, bio: { type: String, default: '', maxlength: 500 },
  lastActiveAt: { type: Date, default: Date.now }, status: { type: String, enum: ['active', 'blocked', 'disabled'], default: 'active' },
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' }, compact: { type: Boolean, default: false }, accent: { type: String, default: '#FF745F' },
    email: { assignments: { type: Boolean, default: true }, mentions: { type: Boolean, default: true }, comments: { type: Boolean, default: true }, deadlines: { type: Boolean, default: true }, weeklySummary: { type: Boolean, default: true } },
    inApp: { assignments: { type: Boolean, default: true }, mentions: { type: Boolean, default: true }, comments: { type: Boolean, default: true }, deadlines: { type: Boolean, default: true } }
  },
  refreshTokens: { type: [{ tokenHash: String, tokenId: String, expiresAt: Date, createdAt: { type: Date, default: Date.now } }], select: false },
  passwordResetHash: { type: String, select: false }, passwordResetExpires: { type: Date, select: false }
}, { timestamps: true, ...clean });
userSchema.index({ fullName: 'text', email: 'text', username: 'text' });
export const User = make('User', userSchema);

const organisationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 }, slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  logo: { type: String, default: '' }, description: { type: String, default: '', maxlength: 500 }, owner: ref('User'),
  settings: { timezone: { type: String, default: 'Asia/Kolkata' } }
}, { timestamps: true, ...clean });
organisationSchema.index({ name: 'text', slug: 'text' });
export const Organisation = make('Organisation', organisationSchema);

const organisationMemberSchema = new Schema({ organisationId: ref('Organisation'), userId: ref('User'), role: { type: String, enum: ['owner', 'admin', 'manager', 'member'], default: 'member' }, joinedAt: { type: Date, default: Date.now } }, { timestamps: true, ...clean });
organisationMemberSchema.index({ organisationId: 1, userId: 1 }, { unique: true }); organisationMemberSchema.index({ userId: 1, organisationId: 1 });
export const OrganisationMember = make('OrganisationMember', organisationMemberSchema);

const workspaceSchema = new Schema({ organisationId: ref('Organisation'), name: { type: String, required: true, trim: true }, description: { type: String, default: '' }, logo: String, timezone: { type: String, default: 'Asia/Kolkata' }, defaultStatuses: { type: [String], default: ['To Do', 'In Progress', 'Code Review', 'Completed'] } }, { timestamps: true, ...clean });
workspaceSchema.index({ organisationId: 1, name: 1 }, { unique: true }); workspaceSchema.index({ organisationId: 1 });
export const Workspace = make('Workspace', workspaceSchema);

const workspaceMemberSchema = new Schema({ organisationId: ref('Organisation'), workspaceId: ref('Workspace'), userId: ref('User') }, { timestamps: true, ...clean });
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true }); workspaceMemberSchema.index({ organisationId: 1 });
export const WorkspaceMember = make('WorkspaceMember', workspaceMemberSchema);

const projectSchema = new Schema({
  organisationId: ref('Organisation'), workspaceId: ref('Workspace'), name: { type: String, required: true, trim: true }, description: { type: String, default: '' },
  color: { type: String, default: '#FF745F' }, icon: { type: String, default: 'folder-kanban' }, status: { type: String, enum: ['planned', 'active', 'on-hold', 'completed', 'archived'], default: 'active' },
  startDate: Date, deadline: Date, manager: ref('User', false), teamMembers: [ref('User')], completionPercentage: { type: Number, min: 0, max: 100, default: 0 }
}, { timestamps: true, ...clean });
projectSchema.index({ organisationId: 1, workspaceId: 1 }); projectSchema.index({ organisationId: 1, name: 'text', description: 'text' });
export const Project = make('Project', projectSchema);

const boardSchema = new Schema({ organisationId: ref('Organisation'), workspaceId: ref('Workspace'), projectId: { ...ref('Project'), unique: true }, name: { type: String, default: 'Project board' } }, { timestamps: true, ...clean });
boardSchema.index({ organisationId: 1 });
export const Board = make('Board', boardSchema);

const columnSchema = new Schema({ organisationId: ref('Organisation'), boardId: ref('Board'), projectId: ref('Project'), name: { type: String, required: true }, color: { type: String, default: '#75667D' }, position: { type: Number, required: true }, isCompleted: { type: Boolean, default: false } }, { timestamps: true, ...clean });
columnSchema.index({ organisationId: 1, boardId: 1, position: 1 });
export const Column = make('Column', columnSchema);

const checklistItem = new Schema({ text: { type: String, required: true }, completed: { type: Boolean, default: false }, completedBy: ref('User', false), completedAt: Date }, { timestamps: true });
const subtask = new Schema({ title: { type: String, required: true }, completed: { type: Boolean, default: false }, assignee: ref('User', false) }, { timestamps: true });
const attachment = new Schema(
  { fileId: ref('File', false), name: String, url: String, mimeType: String, size: Number, uploadedBy: ref('User', false) },
  { timestamps: true, toJSON: { virtuals: true } },
);
const taskSchema = new Schema({
  organisationId: ref('Organisation'), workspaceId: ref('Workspace'), projectId: ref('Project'), boardId: ref('Board'), columnId: ref('Column'),
  title: { type: String, required: true, trim: true, maxlength: 200 }, description: { type: String, default: '', maxlength: 10000 }, taskNumber: { type: Number, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' }, labels: [{ name: String, color: String }], assignees: [ref('User')], reporter: ref('User'),
  startDate: Date, deadline: Date, estimatedHours: { type: Number, min: 0, default: 0 }, position: { type: Number, default: 0 }, checklist: [checklistItem], subtasks: [subtask], attachments: [attachment], completedAt: Date
}, { timestamps: true, ...clean });
taskSchema.index({ organisationId: 1, projectId: 1, columnId: 1, position: 1 }); taskSchema.index({ organisationId: 1, title: 'text', description: 'text' }); taskSchema.index({ organisationId: 1, taskNumber: 1 }, { unique: true });
export const Task = make('Task', taskSchema);

const commentSchema = new Schema({ organisationId: ref('Organisation'), projectId: ref('Project'), taskId: ref('Task'), author: ref('User'), parentId: ref('Comment', false), body: { type: String, required: true, maxlength: 5000 }, mentions: [ref('User')], attachments: [attachment], reactions: [{ emoji: String, users: [ref('User')] }], editedAt: Date }, { timestamps: true, ...clean });
commentSchema.index({ organisationId: 1, taskId: 1, createdAt: 1 });
export const Comment = make('Comment', commentSchema);

const messageSchema = new Schema({
  organisationId: ref('Organisation'),
  sender: ref('User'),
  recipient: ref('User'),
  body: { type: String, default: '', trim: true, maxlength: 5000 },
  attachments: [attachment],
  readAt: Date,
  deletedFor: [ref('User')],
  deletedForEveryoneAt: Date
}, { timestamps: true, ...clean });
messageSchema.index({ organisationId: 1, sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ organisationId: 1, recipient: 1, readAt: 1 });
export const Message = make('Message', messageSchema);

const activitySchema = new Schema({ organisationId: ref('Organisation'), workspaceId: ref('Workspace', false), projectId: ref('Project', false), taskId: ref('Task', false), actor: ref('User'), action: { type: String, required: true }, entityType: String, entityId: Schema.Types.ObjectId, details: Schema.Types.Mixed }, { timestamps: true, ...clean });
activitySchema.index({ organisationId: 1, createdAt: -1 }); activitySchema.index({ projectId: 1, createdAt: -1 });
export const Activity = make('Activity', activitySchema);

const notificationSchema = new Schema({ organisationId: ref('Organisation'), userId: ref('User'), type: { type: String, enum: ['assignment', 'mention', 'comment', 'status', 'deadline', 'invitation', 'role', 'project'], required: true }, title: String, message: String, readAt: Date, entityType: String, entityId: Schema.Types.ObjectId, link: String }, { timestamps: true, ...clean });
notificationSchema.index({ organisationId: 1, userId: 1, readAt: 1, createdAt: -1 });
export const Notification = make('Notification', notificationSchema);

const invitationSchema = new Schema({ organisationId: ref('Organisation'), invitedUser: ref('User', false), username: { type: String, lowercase: true, trim: true }, email: { type: String, lowercase: true, trim: true }, role: { type: String, enum: ['admin', 'manager', 'member'], default: 'member' }, invitedBy: ref('User'), tokenHash: { type: String, select: false }, status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'], default: 'pending' }, expiresAt: { type: Date, required: true } }, { timestamps: true, ...clean });
invitationSchema.index({ organisationId: 1, invitedUser: 1, status: 1 }); invitationSchema.index({ invitedUser: 1, status: 1, expiresAt: 1 }); invitationSchema.index({ organisationId: 1, email: 1, status: 1 }); invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Invitation = make('Invitation', invitationSchema);

const fileSchema = new Schema({ organisationId: ref('Organisation'), projectId: ref('Project', false), taskId: ref('Task', false), commentId: ref('Comment', false), messageId: ref('Message', false), originalName: String, publicId: String, secureUrl: String, mimeType: String, size: Number, uploadedBy: ref('User') }, { timestamps: true, ...clean });
fileSchema.index({ organisationId: 1, projectId: 1, createdAt: -1 }); fileSchema.index({ organisationId: 1, originalName: 'text' });
export const File = make('File', fileSchema);

const subscriptionSchema = new Schema({ organisationId: { ...ref('Organisation'), unique: true }, plan: { type: String, enum: ['free', 'pro', 'business'], default: 'free' }, status: { type: String, enum: ['active', 'cancelled'], default: 'active' }, seats: { type: Number, default: 5 }, renewsAt: Date }, { timestamps: true, ...clean });
export const Subscription = make('Subscription', subscriptionSchema);
