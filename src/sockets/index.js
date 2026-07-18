import { User, OrganisationMember, WorkspaceMember, Project } from '../models/index.js';
import { verifyAccessToken } from '../utils/tokens.js';

export const configureSockets = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (!user || user.status !== 'active') return next(new Error('Unauthorized'));
      socket.user = user; next();
    } catch { next(new Error('Unauthorized')); }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.user._id}`);
    socket.on('rooms:join', async ({ organisationId, workspaceId, projectId } = {}, acknowledge = () => {}) => {
      try {
        const membership = await OrganisationMember.findOne({ organisationId, userId: socket.user._id });
        if (!membership) throw new Error('Forbidden organisation');
        socket.join(`org:${organisationId}`); socket.data.organisationId = organisationId;
        if (workspaceId) { if (!await WorkspaceMember.exists({ organisationId, workspaceId, userId: socket.user._id }) && !['owner', 'admin'].includes(membership.role)) throw new Error('Forbidden workspace'); socket.join(`workspace:${workspaceId}`); }
        if (projectId) { if (!await Project.exists({ _id: projectId, organisationId })) throw new Error('Forbidden project'); socket.join(`project:${projectId}`); }
        socket.to(`org:${organisationId}`).emit('presence:update', { userId: socket.user._id, online: true }); acknowledge({ success: true });
      } catch (error) { acknowledge({ success: false, message: error.message }); }
    });
    socket.on('disconnect', () => { if (socket.data.organisationId) socket.to(`org:${socket.data.organisationId}`).emit('presence:update', { userId: socket.user._id, online: false }); });
  });
};
