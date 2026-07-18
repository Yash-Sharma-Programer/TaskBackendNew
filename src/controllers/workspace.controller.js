import { Workspace, WorkspaceMember, Project, Board, Column, Task, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';

export const list = asyncHandler(async (req, res) => success(res, 'Workspaces loaded', { workspaces: await Workspace.find({ organisationId: req.organisationId }).sort('name') }));
export const create = asyncHandler(async (req, res) => {
  const workspace = await Workspace.create({ organisationId: req.organisationId, ...req.body });
  await WorkspaceMember.create({ organisationId: req.organisationId, workspaceId: workspace._id, userId: req.user._id });
  success(res, 'Workspace created successfully', { workspace }, 201);
});
export const update = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findOneAndUpdate({ _id: req.params.id, organisationId: req.organisationId }, req.body, { new: true, runValidators: true });
  if (!workspace) throw new AppError('Workspace not found', 404); success(res, 'Workspace updated successfully', { workspace });
});
export const remove = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findOne({ _id: req.params.id, organisationId: req.organisationId }); if (!workspace) throw new AppError('Workspace not found', 404);
  const projects = await Project.find({ organisationId: req.organisationId, workspaceId: workspace._id }).select('_id'); const projectIds = projects.map((p) => p._id);
  await Promise.all([Project.deleteMany({ _id: { $in: projectIds } }), Board.deleteMany({ projectId: { $in: projectIds } }), Column.deleteMany({ projectId: { $in: projectIds } }), Task.deleteMany({ projectId: { $in: projectIds } }), WorkspaceMember.deleteMany({ workspaceId: workspace._id })]);
  await workspace.deleteOne(); success(res, 'Workspace deleted successfully');
});
export const members = asyncHandler(async (req, res) => {
  const memberships = await WorkspaceMember.find({ workspaceId: req.params.id, organisationId: req.organisationId }).populate('userId', 'fullName username email avatar jobTitle');
  success(res, 'Workspace members loaded', { members: memberships });
});
export const addMember = asyncHandler(async (req, res) => {
  if (!await User.exists({ _id: req.body.userId })) throw new AppError('User not found', 404);
  const member = await WorkspaceMember.findOneAndUpdate({ workspaceId: req.params.id, userId: req.body.userId }, { organisationId: req.organisationId }, { upsert: true, new: true }).populate('userId', 'fullName email avatar');
  success(res, 'Workspace member added', { member }, 201);
});
export const removeMember = asyncHandler(async (req, res) => { await WorkspaceMember.deleteOne({ workspaceId: req.params.id, userId: req.params.userId, organisationId: req.organisationId }); success(res, 'Workspace member removed'); });
