import {
  Invitation,
  Notification,
  OrganisationMember,
  Workspace,
  WorkspaceMember,
} from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashToken } from '../utils/tokens.js';
import { success } from '../utils/response.js';

const invitationData = (invitation) => ({
  id: invitation._id,
  organisation: invitation.organisationId,
  invitedBy: invitation.invitedBy,
  username: invitation.username,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
});

export const list = asyncHandler(async (req, res) => {
  const invitations = await Invitation.find({
    invitedUser: req.user._id,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
    .populate('organisationId', 'name logo')
    .populate('invitedBy', 'fullName username avatar')
    .sort('-createdAt');
  success(res, 'Pending invitations loaded', {
    invitations: invitations
      .filter((invitation) => invitation.organisationId && invitation.invitedBy)
      .map(invitationData),
  });
});

// Kept for invitations created by older TaskFlow versions.
export const preview = asyncHandler(async (req, res) => {
  if (!req.query.token) throw new AppError('Invitation token is required', 400);
  const invitation = await Invitation.findOne({
    tokenHash: hashToken(req.query.token),
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
    .populate('organisationId', 'name logo')
    .populate('invitedBy', 'fullName username avatar');
  if (!invitation) throw new AppError('Invitation is invalid or expired', 404);
  success(res, 'Invitation loaded', { invitation: invitationData(invitation) });
});

export const respond = asyncHandler(async (req, res) => {
  const { invitationId, token, action } = req.body;
  if (!['accept', 'reject'].includes(action)) {
    throw new AppError('Choose accept or reject', 400);
  }
  if (!invitationId && !token) {
    throw new AppError('Invitation identifier is required', 400);
  }

  const filter = invitationId
    ? {
        _id: invitationId,
        invitedUser: req.user._id,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      }
    : {
        tokenHash: hashToken(token),
        status: 'pending',
        expiresAt: { $gt: new Date() },
      };
  const invitation = await Invitation.findOne(filter)
    .select('+tokenHash')
    .populate('organisationId', 'name logo');
  if (!invitation) throw new AppError('Invitation is invalid or expired', 404);
  if (!invitation.invitedUser && invitation.email !== req.user.email) {
    throw new AppError('This invitation belongs to a different account', 403);
  }

  if (action === 'accept') {
    await OrganisationMember.findOneAndUpdate(
      { organisationId: invitation.organisationId._id, userId: req.user._id },
      { role: invitation.role },
      { upsert: true, new: true },
    );
    const workspaces = await Workspace.find({
      organisationId: invitation.organisationId._id,
    }).select('_id');
    await WorkspaceMember.insertMany(
      workspaces.map((workspace) => ({
        organisationId: invitation.organisationId._id,
        workspaceId: workspace._id,
        userId: req.user._id,
      })),
      { ordered: false },
    ).catch(() => {});
    invitation.status = 'accepted';
  } else {
    invitation.status = 'rejected';
  }

  await invitation.save();
  await Notification.updateMany(
    {
      userId: req.user._id,
      entityType: 'invitation',
      entityId: invitation._id,
    },
    { readAt: new Date() },
  );
  req.io
    ?.to(`user:${req.user._id}`)
    .emit('invitation:responded', { invitationId: invitation._id, action });
  if (action === 'accept') {
    req.io
      ?.to(`org:${invitation.organisationId._id}`)
      .emit('member:joined', { userId: req.user._id });
  }

  success(res, `Invitation ${invitation.status}`, {
    invitation: invitationData(invitation),
  });
});
