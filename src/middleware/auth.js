import { User, OrganisationMember } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) throw new AppError('Authentication required', 401);
  let payload;
  try { payload = verifyAccessToken(token); } catch { throw new AppError('Invalid or expired access token', 401); }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') throw new AppError('Account is unavailable', 401);
  req.user = user;
  next();
});

export const requireOrganisation = asyncHandler(async (req, _res, next) => {
  const organisationId = req.headers['x-organisation-id'] || req.params.organisationId || req.body.organisationId || req.query.organisationId;
  if (!organisationId) throw new AppError('Organisation context is required', 400);
  const membership = await OrganisationMember.findOne({ organisationId, userId: req.user._id });
  if (!membership) throw new AppError('You do not have access to this organisation', 403);
  req.organisationId = membership.organisationId;
  req.membership = membership;
  next();
});

export const allowRoles = (...roles) => (req, _res, next) => roles.includes(req.membership?.role) ? next() : next(new AppError('You do not have permission for this action', 403));
