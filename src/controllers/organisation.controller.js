import { Organisation, OrganisationMember, Workspace, WorkspaceMember, Project, Board, Column, Task, Comment, Message, Activity, Notification, Invitation, File, Subscription, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';
import { createNotification } from '../services/notification.service.js';
import { uploadBuffer } from '../services/upload.service.js';

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const list = asyncHandler(async (req, res) => {
  const memberships = await OrganisationMember.find({ userId: req.user._id }).populate('organisationId').sort('-createdAt');
  success(res, 'Organisations loaded', { organisations: memberships.filter((m) => m.organisationId).map((m) => ({ ...m.organisationId.toJSON(), role: m.role })) });
});

export const create = asyncHandler(async (req, res) => {
  let slug = slugify(req.body.name); let suffix = 1;
  while (await Organisation.exists({ slug })) slug = `${slugify(req.body.name)}-${suffix++}`;
  const organisation = await Organisation.create({ name: req.body.name, description: req.body.description, slug, owner: req.user._id, settings: { timezone: req.body.timezone } });
  await Promise.all([
    OrganisationMember.create({ organisationId: organisation._id, userId: req.user._id, role: 'owner' }),
    Subscription.create({ organisationId: organisation._id, plan: 'free' })
  ]);
  const workspace = await Workspace.create({ organisationId: organisation._id, name: 'Main workspace', timezone: req.body.timezone });
  await WorkspaceMember.create({ organisationId: organisation._id, workspaceId: workspace._id, userId: req.user._id });
  success(res, 'Organisation created successfully', { organisation: { ...organisation.toJSON(), role: 'owner' }, workspace }, 201);
});

export const update = asyncHandler(async (req, res) => {
  const organisation = await Organisation.findByIdAndUpdate(req.organisationId, { $set: { name: req.body.name, description: req.body.description, 'settings.timezone': req.body.timezone } }, { new: true, runValidators: true });
  success(res, 'Organisation updated successfully', { organisation });
});

export const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file?.mimetype.startsWith('image/')) throw new AppError('Organisation logo must be an image', 415);
  const uploaded = await uploadBuffer(req.file, 'taskflow/organisations');
  const organisation = await Organisation.findByIdAndUpdate(req.organisationId, { logo: uploaded.secureUrl }, { new: true });
  success(res, 'Organisation logo updated', { organisation });
});

export const remove = asyncHandler(async (req, res) => {
  const organisationId = req.organisationId;
  await Promise.all([
    Workspace.deleteMany({ organisationId }), WorkspaceMember.deleteMany({ organisationId }), Project.deleteMany({ organisationId }), Board.deleteMany({ organisationId }), Column.deleteMany({ organisationId }),
    Task.deleteMany({ organisationId }), Comment.deleteMany({ organisationId }), Message.deleteMany({ organisationId }), Activity.deleteMany({ organisationId }), Notification.deleteMany({ organisationId }), Invitation.deleteMany({ organisationId }), File.deleteMany({ organisationId }), Subscription.deleteMany({ organisationId })
  ]);
  await OrganisationMember.deleteMany({ organisationId }); await Organisation.findByIdAndDelete(organisationId);
  success(res, 'Organisation deleted successfully');
});

export const members = asyncHandler(async (req, res) => {
  const rows = await OrganisationMember.find({ organisationId: req.organisationId }).populate('userId', 'fullName username email avatar jobTitle lastActiveAt status').sort('role');
  const stats = await Task.aggregate([{ $match: { organisationId: req.organisationId } }, { $unwind: '$assignees' }, { $group: { _id: '$assignees', assigned: { $sum: 1 }, completed: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } } } }]);
  const statMap = new Map(stats.map((s) => [s._id.toString(), s]));
  const members = rows
    .filter((member) => member.userId)
    .map((member) => ({
      ...member.toJSON(),
      taskStats: statMap.get(member.userId._id.toString()) || { assigned: 0, completed: 0 }
    }));
  success(res, 'Members loaded', { members });
});

export const invite = asyncHandler(async (req, res) => {
  const username = req.body.username.toLowerCase();
  const invitedUser = await User.findOne({ username, status: 'active' }).select('fullName username avatar');
  if (!invitedUser) throw new AppError('No active TaskFlow user was found with that username', 404);
  if (await OrganisationMember.exists({ organisationId: req.organisationId, userId: invitedUser._id })) throw new AppError('This user is already a member', 409);
  if (await Invitation.exists({ organisationId: req.organisationId, invitedUser: invitedUser._id, status: 'pending', expiresAt: { $gt: new Date() } })) throw new AppError('A pending invitation already exists for this user', 409);
  const invitation = await Invitation.create({ organisationId: req.organisationId, invitedUser: invitedUser._id, username, role: req.body.role || 'member', invitedBy: req.user._id, expiresAt: new Date(Date.now() + 7 * 86400000) });
  const organisation = await Organisation.findById(req.organisationId);
  await createNotification({ organisationId: req.organisationId, userId: invitedUser._id, type: 'invitation', title: 'Team invitation', message: `${req.user.fullName} invited you to join ${organisation.name} as ${invitation.role}`, entityType: 'invitation', entityId: invitation._id }, req.io);
  success(res, 'Invitation request sent in TaskFlow', { invitation: { ...invitation.toJSON(), invitedUser } }, 201);
});

export const changeRole = asyncHandler(async (req, res) => {
  const member = await OrganisationMember.findOne({ _id: req.params.memberId, organisationId: req.organisationId });
  if (!member) throw new AppError('Member not found', 404);
  if (member.role === 'owner') throw new AppError('Owner role cannot be changed', 400);
  member.role = req.body.role; await member.save();
  await Notification.create({ organisationId: req.organisationId, userId: member.userId, type: 'role', title: 'Role updated', message: `Your role is now ${member.role}`, entityType: 'organisation', entityId: req.organisationId });
  success(res, 'Member role updated', { member });
});

export const removeMember = asyncHandler(async (req, res) => {
  const member = await OrganisationMember.findOne({ _id: req.params.memberId, organisationId: req.organisationId });
  if (!member) throw new AppError('Member not found', 404);
  if (member.role === 'owner') throw new AppError('Organisation owner cannot be removed', 400);
  await Promise.all([member.deleteOne(), WorkspaceMember.deleteMany({ organisationId: req.organisationId, userId: member.userId })]);
  success(res, 'Member removed successfully');
});

export const activity = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1), limit = Math.min(Number(req.query.limit || 20), 100);
  const [items, total] = await Promise.all([Activity.find({ organisationId: req.organisationId }).populate('actor', 'fullName avatar').sort('-createdAt').skip((page - 1) * limit).limit(limit), Activity.countDocuments({ organisationId: req.organisationId })]);
  success(res, 'Activity loaded', { activity: items }, 200, { page, limit, total, pages: Math.ceil(total / limit) });
});
