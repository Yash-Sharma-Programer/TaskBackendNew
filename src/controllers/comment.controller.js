import { Comment, Task, OrganisationMember, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';
import { createNotification } from '../services/notification.service.js';
import { recordActivity } from '../services/activity.service.js';

const resolveMentions = async (body, organisationId) => {
  const usernames = [...new Set([...body.matchAll(/@([a-z0-9._-]{3,30})/gi)].map((match) => match[1].toLowerCase()))];
  if (!usernames.length) return [];
  const users = await User.find({ username: { $in: usernames } }).select('_id');
  const members = await OrganisationMember.find({ organisationId, userId: { $in: users.map((u) => u._id) } }).select('userId');
  return members.map((member) => member.userId);
};

export const list = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.query.taskId, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404);
  const comments = await Comment.find({ taskId: task._id, organisationId: req.organisationId }).populate('author', 'fullName username avatar').populate('mentions', 'fullName username').sort('createdAt');
  success(res, 'Comments loaded', { comments });
});
export const create = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.body.taskId, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404);
  if (req.body.parentId && !await Comment.exists({ _id: req.body.parentId, taskId: task._id, organisationId: req.organisationId })) throw new AppError('Parent comment not found', 404);
  const mentions = await resolveMentions(req.body.body, req.organisationId);
  let comment = await Comment.create({ organisationId: req.organisationId, projectId: task.projectId, taskId: task._id, author: req.user._id, parentId: req.body.parentId, body: req.body.body, mentions });
  const recipients = new Set([...mentions.map(String), ...task.assignees.map(String)]); recipients.delete(req.user._id.toString());
  await Promise.all([...recipients].map((userId) => createNotification({ organisationId: req.organisationId, userId, type: mentions.some((id) => id.toString() === userId) ? 'mention' : 'comment', title: mentions.some((id) => id.toString() === userId) ? 'You were mentioned' : 'New task comment', message: `${req.user.fullName}: ${req.body.body.slice(0, 100)}`, entityType: 'task', entityId: task._id, link: `/projects/${task.projectId}/board?task=${task._id}` }, req.io)));
  await recordActivity({ organisationId: req.organisationId, workspaceId: task.workspaceId, projectId: task.projectId, taskId: task._id, actor: req.user._id, action: 'commented on task', entityType: 'comment', entityId: comment._id });
  comment = await Comment.findById(comment._id).populate('author', 'fullName username avatar').populate('mentions', 'fullName username'); req.io?.to(`project:${task.projectId}`).emit('comment:created', comment); success(res, 'Comment added successfully', { comment }, 201);
});
export const update = asyncHandler(async (req, res) => { const comment = await Comment.findOne({ _id: req.params.id, organisationId: req.organisationId, author: req.user._id }); if (!comment) throw new AppError('Comment not found or cannot be edited', 404); comment.body = req.body.body; comment.mentions = await resolveMentions(req.body.body, req.organisationId); comment.editedAt = new Date(); await comment.save(); req.io?.to(`project:${comment.projectId}`).emit('comment:updated', comment); success(res, 'Comment updated', { comment }); });
export const react = asyncHandler(async (req, res) => { const comment = await Comment.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!comment) throw new AppError('Comment not found', 404); let reaction = comment.reactions.find((r) => r.emoji === req.body.emoji); if (!reaction) { comment.reactions.push({ emoji: req.body.emoji, users: [req.user._id] }); } else { const exists = reaction.users.some((id) => id.equals(req.user._id)); reaction.users = exists ? reaction.users.filter((id) => !id.equals(req.user._id)) : [...reaction.users, req.user._id]; } await comment.save(); success(res, 'Reaction updated', { comment }); });
export const remove = asyncHandler(async (req, res) => { const comment = await Comment.findOne({ _id: req.params.id, organisationId: req.organisationId, author: req.user._id }); if (!comment) throw new AppError('Comment not found or cannot be deleted', 404); await Comment.deleteMany({ $or: [{ _id: comment._id }, { parentId: comment._id }] }); req.io?.to(`project:${comment.projectId}`).emit('comment:deleted', { id: comment._id }); success(res, 'Comment deleted'); });
