import {
  File,
  Message,
  OrganisationMember,
  User,
} from '../models/index.js';
import path from 'path';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';
import { deleteUpload, uploadBuffer } from '../services/upload.service.js';

const memberFields = 'fullName username avatar jobTitle lastActiveAt';
const populateMessage = (query) =>
  query
    .populate('sender', memberFields)
    .populate('recipient', memberFields);

const serializeMessage = (document) => {
  const message = document.toJSON ? document.toJSON() : { ...document };
  message.id = message.id || message._id?.toString();
  message.attachments = (message.attachments || []).map((attachment) => ({
    ...attachment,
    id: attachment.id || attachment._id?.toString(),
  }));
  return message;
};

const requireChatMember = async (organisationId, userId, currentUserId) => {
  if (userId === currentUserId.toString()) {
    throw new AppError('Select another team member', 400);
  }
  const member = await OrganisationMember.exists({
    organisationId,
    userId,
  });
  if (!member) throw new AppError('Team member not found', 404);
};

export const members = asyncHandler(async (req, res) => {
  const memberships = await OrganisationMember.find({
    organisationId: req.organisationId,
    userId: { $ne: req.user._id },
  })
    .populate('userId', memberFields)
    .sort('role');
  const unread = await Message.aggregate([
    {
      $match: {
        organisationId: req.organisationId,
        recipient: req.user._id,
        readAt: null,
        deletedFor: { $ne: req.user._id },
        deletedForEveryoneAt: null,
      },
    },
    { $group: { _id: '$sender', count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(
    unread.map((entry) => [entry._id.toString(), entry.count]),
  );
  success(res, 'Chat members loaded', {
    members: memberships
      .filter((membership) => membership.userId)
      .map((membership) => ({
        ...membership.userId.toJSON(),
        role: membership.role,
        unread: unreadMap.get(membership.userId._id.toString()) || 0,
      })),
  });
});

export const messages = asyncHandler(async (req, res) => {
  await requireChatMember(
    req.organisationId,
    req.params.memberId,
    req.user._id,
  );
  const filter = {
    organisationId: req.organisationId,
    deletedFor: { $ne: req.user._id },
    $or: [
      { sender: req.user._id, recipient: req.params.memberId },
      { sender: req.params.memberId, recipient: req.user._id },
    ],
  };
  const rows = await populateMessage(
    Message.find(filter).sort('-createdAt').limit(100),
  );
  await Message.updateMany(
    {
      organisationId: req.organisationId,
      sender: req.params.memberId,
      recipient: req.user._id,
      readAt: null,
    },
    { readAt: new Date() },
  );
  success(res, 'Messages loaded', {
    messages: rows.reverse().map(serializeMessage),
  });
});

export const send = asyncHandler(async (req, res) => {
  await requireChatMember(
    req.organisationId,
    req.params.memberId,
    req.user._id,
  );
  const body = String(req.body.body || '').trim();
  if (!body && !req.files?.length) {
    throw new AppError('Write a message or select a file', 400);
  }
  if (body.length > 5000) throw new AppError('Message is too long', 422);

  const storedFiles = [];
  for (const item of req.files || []) {
    const stored = await uploadBuffer(
      item,
      `taskflow/${req.organisationId}/chat`,
    );
    storedFiles.push(
      await File.create({
        organisationId: req.organisationId,
        originalName: item.originalname,
        publicId: stored.publicId,
        secureUrl: stored.secureUrl,
        mimeType: item.mimetype,
        size: item.size,
        uploadedBy: req.user._id,
      }),
    );
  }

  let message = await Message.create({
    organisationId: req.organisationId,
    sender: req.user._id,
    recipient: req.params.memberId,
    body,
    attachments: storedFiles.map((file) => ({
      fileId: file._id,
      name: file.originalName,
      url: file.secureUrl,
      mimeType: file.mimeType,
      size: file.size,
      uploadedBy: req.user._id,
    })),
  });
  if (storedFiles.length) {
    await File.updateMany(
      { _id: { $in: storedFiles.map((file) => file._id) } },
      { messageId: message._id },
    );
  }
  message = await populateMessage(Message.findById(message._id));
  const payload = serializeMessage(message);
  req.io?.to(`user:${req.params.memberId}`).emit('chat:message', payload);
  req.io?.to(`user:${req.user._id}`).emit('chat:message', payload);
  success(res, 'Message sent', { message: payload }, 201);
});

export const remove = asyncHandler(async (req, res) => {
  const scope = req.query.scope === 'everyone' ? 'everyone' : 'me';
  const message = await Message.findOne({
    _id: req.params.messageId,
    organisationId: req.organisationId,
    $or: [{ sender: req.user._id }, { recipient: req.user._id }],
  });
  if (!message) throw new AppError('Message not found', 404);

  if (scope === 'everyone') {
    if (message.sender.toString() !== req.user._id.toString()) {
      throw new AppError('Only the sender can delete this message for everyone', 403);
    }
    const files = await File.find({
      _id: { $in: message.attachments.map((item) => item.fileId).filter(Boolean) },
      organisationId: req.organisationId,
    });
    await Promise.all(files.map((file) => deleteUpload(file.publicId)));
    await File.deleteMany({ _id: { $in: files.map((file) => file._id) } });
    message.body = '';
    message.attachments = [];
    message.deletedForEveryoneAt = new Date();
    await message.save();
    const payload = {
      messageId: message._id,
      scope,
      deletedAt: message.deletedForEveryoneAt,
    };
    req.io?.to(`user:${message.sender}`).emit('chat:deleted', payload);
    req.io?.to(`user:${message.recipient}`).emit('chat:deleted', payload);
  } else {
    if (!message.deletedFor.some((id) => id.toString() === req.user._id.toString())) {
      message.deletedFor.push(req.user._id);
      await message.save();
    }
    req.io?.to(`user:${req.user._id}`).emit('chat:deleted', {
      messageId: message._id,
      scope,
      userId: req.user._id,
    });
  }
  success(
    res,
    scope === 'everyone'
      ? 'Message deleted for everyone'
      : 'Message deleted for you',
  );
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const message = await Message.findOne({
    _id: req.params.messageId,
    organisationId: req.organisationId,
    deletedFor: { $ne: req.user._id },
    deletedForEveryoneAt: null,
    $or: [{ sender: req.user._id }, { recipient: req.user._id }],
  });
  if (!message) throw new AppError('Message attachment is unavailable', 404);
  const attachment = message.attachments.id(req.params.attachmentId);
  if (!attachment?.fileId) throw new AppError('Attachment not found', 404);
  const file = await File.findOne({
    _id: attachment.fileId,
    organisationId: req.organisationId,
  });
  if (!file) throw new AppError('Attachment file is unavailable', 404);

  const safeName = file.originalName.replace(/["\r\n]/g, '_');
  if (file.secureUrl.startsWith('/uploads/')) {
    const localPath = path.resolve('uploads', path.basename(file.secureUrl));
    await new Promise((resolve, reject) =>
      res.download(localPath, safeName, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    return;
  }

  const remote = await fetch(file.secureUrl);
  if (!remote.ok) throw new AppError('Could not download attachment', 502);
  const buffer = Buffer.from(await remote.arrayBuffer());
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(buffer);
});
