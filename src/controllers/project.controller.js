import { Project, Workspace, Board, Column, Task, Comment, Activity } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';
import { recordActivity } from '../services/activity.service.js';

export const list = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1), limit = Math.min(Number(req.query.limit || 50), 100);
  const filter = { organisationId: req.organisationId };
  if (req.query.workspaceId) filter.workspaceId = req.query.workspaceId;
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.search) filter.$text = { $search: req.query.search };
  const sortMap = { name: 'name', deadline: 'deadline', createdAt: '-createdAt' }; const sort = sortMap[req.query.sort] || '-createdAt';
  const [projects, total] = await Promise.all([Project.find(filter).populate('manager', 'fullName avatar').populate('teamMembers', 'fullName avatar').sort(sort).skip((page - 1) * limit).limit(limit), Project.countDocuments(filter)]);
  success(res, 'Projects loaded', { projects }, 200, { page, limit, total, pages: Math.ceil(total / limit) });
});
export const get = asyncHandler(async (req, res) => { const project = await Project.findOne({ _id: req.params.id, organisationId: req.organisationId }).populate('manager teamMembers', 'fullName avatar email'); if (!project) throw new AppError('Project not found', 404); success(res, 'Project loaded', { project }); });
export const create = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findOne({ _id: req.body.workspaceId, organisationId: req.organisationId }); if (!workspace) throw new AppError('Workspace not found', 404);
  const project = await Project.create({ ...req.body, organisationId: req.organisationId });
  const board = await Board.create({ organisationId: req.organisationId, workspaceId: workspace._id, projectId: project._id, name: `${project.name} board` });
  await Column.insertMany(workspace.defaultStatuses.map((name, position) => ({ organisationId: req.organisationId, boardId: board._id, projectId: project._id, name, position, isCompleted: name.toLowerCase() === 'completed' })));
  await recordActivity({ organisationId: req.organisationId, workspaceId: workspace._id, projectId: project._id, actor: req.user._id, action: 'created project', entityType: 'project', entityId: project._id, details: { name: project.name } });
  req.io?.to(`org:${req.organisationId}`).emit('project:created', project); success(res, 'Project created successfully', { project }, 201);
});
export const update = asyncHandler(async (req, res) => { const project = await Project.findOneAndUpdate({ _id: req.params.id, organisationId: req.organisationId }, req.body, { new: true, runValidators: true }); if (!project) throw new AppError('Project not found', 404); await recordActivity({ organisationId: req.organisationId, workspaceId: project.workspaceId, projectId: project._id, actor: req.user._id, action: 'updated project', entityType: 'project', entityId: project._id }); req.io?.to(`project:${project._id}`).emit('project:updated', project); success(res, 'Project updated successfully', { project }); });
export const archive = asyncHandler(async (req, res) => { const project = await Project.findOneAndUpdate({ _id: req.params.id, organisationId: req.organisationId }, { status: 'archived' }, { new: true }); if (!project) throw new AppError('Project not found', 404); success(res, 'Project archived', { project }); });
export const remove = asyncHandler(async (req, res) => { const project = await Project.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!project) throw new AppError('Project not found', 404); const tasks = await Task.find({ projectId: project._id }).select('_id'); await Promise.all([Board.deleteMany({ projectId: project._id }), Column.deleteMany({ projectId: project._id }), Comment.deleteMany({ taskId: { $in: tasks.map((t) => t._id) } }), Task.deleteMany({ projectId: project._id }), Activity.deleteMany({ projectId: project._id })]); await project.deleteOne(); success(res, 'Project deleted successfully'); });
