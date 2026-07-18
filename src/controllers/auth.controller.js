import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';
import { createAccessToken, createRefreshToken, hashToken, randomToken, refreshCookie, verifyRefreshToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { sendEmail } from '../services/email.service.js';
import { uploadBuffer } from '../services/upload.service.js';

const publicUser = (user) => ({ id: user._id, fullName: user.fullName, username: user.username, email: user.email, avatar: user.avatar, jobTitle: user.jobTitle, bio: user.bio, lastActiveAt: user.lastActiveAt, status: user.status, preferences: user.preferences, createdAt: user.createdAt });

const issueSession = async (user, res) => {
  const refreshToken = createRefreshToken(user);
  const payload = verifyRefreshToken(refreshToken);
  user.refreshTokens = (user.refreshTokens || []).filter((item) => item.expiresAt > new Date());
  user.refreshTokens.push({ tokenHash: hashToken(refreshToken), tokenId: payload.jti, expiresAt: new Date(payload.exp * 1000) });
  user.lastActiveAt = new Date();
  await user.save();
  res.cookie('taskflow_refresh', refreshToken, refreshCookie);
  return createAccessToken(user);
};

export const register = asyncHandler(async (req, res) => {
  if (await User.exists({ $or: [{ email: req.body.email }, { username: req.body.username }] })) throw new AppError('Email or username is already registered', 409);
  const user = await User.create({ ...req.body, passwordHash: await bcrypt.hash(req.body.password, 12), password: undefined });
  const accessToken = await issueSession(user, res);
  success(res, 'Account created successfully', { user: publicUser(user), accessToken }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash +refreshTokens');
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) throw new AppError('Invalid email or password', 401);
  if (user.status !== 'active') throw new AppError('This account is not active', 403);
  const accessToken = await issueSession(user, res);
  success(res, 'Logged in successfully', { user: publicUser(user), accessToken });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.taskflow_refresh;
  if (!token) throw new AppError('Refresh token is required', 401);
  let payload;
  try { payload = verifyRefreshToken(token); } catch { throw new AppError('Refresh session expired', 401); }
  const tokenHash = hashToken(token);
  const now = new Date();
  const tokenMatch = {
    tokenHash,
    tokenId: payload.jti,
    expiresAt: { $gt: now }
  };
  const user = await User.findOne({
    _id: payload.sub,
    refreshTokens: { $elemMatch: tokenMatch }
  }).select('+refreshTokens');
  if (!user) throw new AppError('Refresh token reuse detected', 401);

  const nextRefreshToken = createRefreshToken(user);
  const nextPayload = verifyRefreshToken(nextRefreshToken);
  const refreshTokens = user.refreshTokens
    .filter((item) => item.tokenHash !== tokenHash && item.expiresAt > now)
    .map((item) => ({
      tokenHash: item.tokenHash,
      tokenId: item.tokenId,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt
    }));
  refreshTokens.push({
    tokenHash: hashToken(nextRefreshToken),
    tokenId: nextPayload.jti,
    expiresAt: new Date(nextPayload.exp * 1000)
  });

  // The old token must still exist when this update runs. This makes rotation
  // atomic and ensures a concurrent request receives 401 instead of a save
  // version conflict and a 500 response.
  const rotatedUser = await User.findOneAndUpdate(
    { _id: user._id, refreshTokens: { $elemMatch: tokenMatch } },
    { $set: { refreshTokens, lastActiveAt: now } },
    { new: true, runValidators: true }
  ).select('+refreshTokens');
  if (!rotatedUser) throw new AppError('Refresh token reuse detected', 401);

  res.cookie('taskflow_refresh', nextRefreshToken, refreshCookie);
  success(res, 'Session refreshed', {
    user: publicUser(rotatedUser),
    accessToken: createAccessToken(rotatedUser)
  });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies.taskflow_refresh;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      const user = await User.findById(payload.sub).select('+refreshTokens');
      if (user) { user.refreshTokens = user.refreshTokens.filter((item) => item.tokenHash !== hashToken(token)); await user.save(); }
    } catch { /* An invalid cookie is simply cleared. */ }
  }
  res.clearCookie('taskflow_refresh', refreshCookie);
  success(res, 'Logged out successfully');
});

export const me = asyncHandler(async (req, res) => success(res, 'Current user loaded', { user: publicUser(req.user) }));

export const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['fullName', 'username', 'jobTitle', 'bio', 'preferences'];
  allowed.forEach((key) => { if (req.body[key] !== undefined) req.user[key] = req.body[key]; });
  await req.user.save();
  success(res, 'Profile updated successfully', { user: publicUser(req.user) });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Please select an image', 400);
  if (!req.file.mimetype.startsWith('image/')) throw new AppError('Avatar must be an image', 415);
  const uploaded = await uploadBuffer(req.file, 'taskflow/avatars');
  req.user.avatar = uploaded.secureUrl; await req.user.save();
  success(res, 'Profile picture updated', { user: publicUser(req.user) });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordResetHash +passwordResetExpires');
  if (user) {
    const token = randomToken(); user.passwordResetHash = hashToken(token); user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); await user.save();
    const url = `${env.clientUrls[0]}/reset-password?token=${token}`;
    await sendEmail({ to: user.email, subject: 'Reset your TaskFlow password', text: `Reset your password within 30 minutes: ${url}`, html: `<p>Reset your password within 30 minutes:</p><p><a href="${url}">Reset password</a></p>` });
  }
  success(res, 'If an account exists, reset instructions have been sent');
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ passwordResetHash: hashToken(req.body.token), passwordResetExpires: { $gt: new Date() } }).select('+passwordHash +passwordResetHash +passwordResetExpires +refreshTokens');
  if (!user) throw new AppError('Reset link is invalid or expired', 400);
  user.passwordHash = await bcrypt.hash(req.body.password, 12); user.passwordResetHash = undefined; user.passwordResetExpires = undefined; user.refreshTokens = []; await user.save();
  success(res, 'Password reset successfully');
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash +refreshTokens');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) throw new AppError('Current password is incorrect', 400);
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12); user.refreshTokens = []; await user.save();
  res.clearCookie('taskflow_refresh', refreshCookie);
  success(res, 'Password changed. Please log in again');
});
