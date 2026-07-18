import { Task, Project, Board, Column, Notification } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';
import { recordActivity } from '../services/activity.service.js';

const populate = (query) => query.populate('assignees reporter', 'fullName username avatar email').populate('projectId', 'name color').populate('columnId', 'name isCompleted');
const assertProjectAndColumn = async (organisationId, projectId, columnId) => {
  const project = await Project.findOne({ _id: projectId, organisationId }); if (!project) throw new AppError('Project not found', 404);
  const column = await Column.findOne({ _id: columnId, projectId, organisationId }); if (!column) throw new AppError('Board column not found', 404);
  const board = await Board.findOne({ projectId, organisationId }); return { project, column, board };
};
const recalculateProgress = async (projectId, organisationId) => {
  const [total, completed] = await Promise.all([Task.countDocuments({ projectId, organisationId }), Task.countDocuments({ projectId, organisationId, completedAt: { $ne: null } })]);
  await Project.updateOne({ _id: projectId, organisationId }, { completionPercentage: total ? Math.round(completed * 100 / total) : 0 });
};
const activity = (req, task, action, details) => recordActivity({ organisationId: req.organisationId, workspaceId: task.workspaceId, projectId: task.projectId, taskId: task._id, actor: req.user._id, action, entityType: 'task', entityId: task._id, details });
const assertTaskEditor = (req, task) => {
  if (req.membership.role !== 'member') return;
  const involved = task.reporter?.toString() === req.user._id.toString() || task.assignees.some((id) => id.toString() === req.user._id.toString());
  if (!involved) throw new AppError('Members can only update tasks assigned to them', 403);
};

export const list = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1), limit = Math.min(Number(req.query.limit || 100), 200); const filter = { organisationId: req.organisationId };
  if (req.query.projectId) filter.projectId = req.query.projectId; if (req.query.columnId) filter.columnId = req.query.columnId; if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.assignee) filter.assignees = req.query.assignee; if (req.query.label) filter['labels.name'] = req.query.label; if (req.query.search) filter.$text = { $search: req.query.search };
  const now = new Date(); if (req.query.scope === 'today') { const end = new Date(now); end.setHours(23, 59, 59, 999); filter.deadline = { $gte: new Date(now.setHours(0, 0, 0, 0)), $lte: end }; }
  if (req.query.scope === 'upcoming') filter.deadline = { $gt: now }; if (req.query.scope === 'overdue') { filter.deadline = { $lt: now }; filter.completedAt = null; } if (req.query.scope === 'completed') filter.completedAt = { $ne: null };
  const sortMap = { deadline: 'deadline', priority: '-priority', createdAt: '-createdAt' }; const sort = sortMap[req.query.sort] || 'position';
  let tasks, total;
  if (req.query.sort === 'priority') {
    const all = await populate(Task.find(filter)); const weight = { urgent: 0, high: 1, medium: 2, low: 3 }; all.sort((a, b) => weight[a.priority] - weight[b.priority]); total = all.length; tasks = all.slice((page - 1) * limit, page * limit);
  } else [tasks, total] = await Promise.all([populate(Task.find(filter)).sort(sort).skip((page - 1) * limit).limit(limit), Task.countDocuments(filter)]);
  success(res, 'Tasks loaded', { tasks }, 200, { page, limit, total, pages: Math.ceil(total / limit) });
});
export const get = asyncHandler(async (req, res) => { const task = await populate(Task.findOne({ _id: req.params.id, organisationId: req.organisationId })); if (!task) throw new AppError('Task not found', 404); success(res, 'Task loaded', { task }); });
export const create = asyncHandler(async (req, res) => {
  const { project, column, board } = await assertProjectAndColumn(req.organisationId, req.body.projectId, req.body.columnId);
  const last = await Task.findOne({ organisationId: req.organisationId }).sort('-taskNumber').select('taskNumber');
  const position = await Task.countDocuments({ columnId: column._id });
  let task = await Task.create({ ...req.body, organisationId: req.organisationId, workspaceId: project.workspaceId, boardId: board._id, reporter: req.user._id, taskNumber: (last?.taskNumber || 0) + 1, position, completedAt: column.isCompleted ? new Date() : null });
  await activity(req, task, 'created task', { title: task.title });
  if (task.assignees.length) await Promise.all(task.assignees.filter((id) => id.toString() !== req.user._id.toString()).map((userId) => Notification.create({ organisationId: req.organisationId, userId, type: 'assignment', title: 'New task assigned', message: task.title, entityType: 'task', entityId: task._id, link: `/projects/${project._id}/board?task=${task._id}` })));
  task = await populate(Task.findById(task._id)); req.io?.to(`project:${project._id}`).emit('task:created', task); await recalculateProgress(project._id, req.organisationId); success(res, 'Task created successfully', { task }, 201);
});
export const update = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404); assertTaskEditor(req, task);
  const oldAssignees = new Set(task.assignees.map(String)); const allowed = ['title', 'description', 'priority', 'labels', 'assignees', 'startDate', 'deadline', 'estimatedHours']; allowed.forEach((key) => { if (req.body[key] !== undefined) task[key] = req.body[key]; }); await task.save();
  const added = task.assignees.filter((id) => !oldAssignees.has(id.toString()) && id.toString() !== req.user._id.toString()); await Promise.all(added.map((userId) => Notification.create({ organisationId: req.organisationId, userId, type: 'assignment', title: 'Task assigned', message: task.title, entityType: 'task', entityId: task._id, link: `/projects/${task.projectId}/board?task=${task._id}` })));
  await activity(req, task, 'updated task'); const result = await populate(Task.findById(task._id)); req.io?.to(`project:${task.projectId}`).emit('task:updated', result); success(res, 'Task updated successfully', { task: result });
});
export const move = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404); assertTaskEditor(req, task); const oldColumnId = task.columnId;
  const destination = await Column.findOne({ _id: req.body.columnId, boardId: task.boardId, organisationId: req.organisationId }); if (!destination) throw new AppError('Destination column not found', 404);
  const position = Math.max(Number(req.body.position || 0), 0);
  if (oldColumnId.toString() === destination._id.toString()) await Task.updateMany({ columnId: oldColumnId, _id: { $ne: task._id }, position: { $gte: position } }, { $inc: { position: 1 } });
  else { await Task.updateMany({ columnId: oldColumnId, position: { $gt: task.position } }, { $inc: { position: -1 } }); await Task.updateMany({ columnId: destination._id, position: { $gte: position } }, { $inc: { position: 1 } }); }
  task.columnId = destination._id; task.position = position; task.completedAt = destination.isCompleted ? (task.completedAt || new Date()) : null; await task.save();
  await activity(req, task, 'moved task', { fromColumnId: oldColumnId, toColumnId: destination._id }); await recalculateProgress(task.projectId, req.organisationId);
  const result = await populate(Task.findById(task._id)); req.io?.to(`project:${task.projectId}`).emit('task:moved', result); success(res, 'Task moved successfully', { task: result });
});
export const bulk = asyncHandler(async (req, res) => { const updates = {}; ['priority', 'deadline', 'columnId'].forEach((key) => { if (req.body.updates?.[key] !== undefined) updates[key] = req.body.updates[key]; }); const result = await Task.updateMany({ _id: { $in: req.body.taskIds }, organisationId: req.organisationId }, updates); success(res, 'Tasks updated successfully', { modifiedCount: result.modifiedCount }); });
export const addChecklist = asyncHandler(async (req, res) => { const task = await Task.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404); assertTaskEditor(req, task); task.checklist.push({ text: req.body.text }); await task.save(); await activity(req, task, 'added checklist item'); success(res, 'Checklist item added', { task }); });
export const toggleChecklist = asyncHandler(async (req, res) => { const task = await Task.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404); assertTaskEditor(req, task); const item = task.checklist.id(req.params.itemId); if (!item) throw new AppError('Checklist item not found', 404); item.completed = !item.completed; item.completedBy = item.completed ? req.user._id : null; item.completedAt = item.completed ? new Date() : null; await task.save(); success(res, 'Checklist updated', { task }); });
export const addSubtask = asyncHandler(async (req, res) => { const task = await Task.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404); assertTaskEditor(req, task); task.subtasks.push({ title: req.body.title, assignee: req.body.assignee }); await task.save(); await activity(req, task, 'added subtask'); success(res, 'Subtask added', { task }); });
export const toggleSubtask = asyncHandler(async (req, res) => { const task = await Task.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404); assertTaskEditor(req, task); const item = task.subtasks.id(req.params.subtaskId); if (!item) throw new AppError('Subtask not found', 404); item.completed = !item.completed; await task.save(); success(res, 'Subtask updated', { task }); });
export const remove = asyncHandler(async (req, res) => { const task = await Task.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!task) throw new AppError('Task not found', 404); await task.deleteOne(); await Task.updateMany({ columnId: task.columnId, position: { $gt: task.position } }, { $inc: { position: -1 } }); await recalculateProgress(task.projectId, req.organisationId); req.io?.to(`project:${task.projectId}`).emit('task:deleted', { id: task._id }); success(res, 'Task deleted successfully'); });
