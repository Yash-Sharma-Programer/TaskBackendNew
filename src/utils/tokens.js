import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const createAccessToken = (user) => jwt.sign({ sub: user._id.toString(), type: 'access' }, env.accessSecret, { expiresIn: env.accessExpires });
export const createRefreshToken = (user, tokenId = crypto.randomUUID()) => jwt.sign({ sub: user._id.toString(), jti: tokenId, type: 'refresh' }, env.refreshSecret, { expiresIn: `${env.refreshDays}d` });
export const verifyAccessToken = (token) => jwt.verify(token, env.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.refreshSecret);
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
export const refreshCookie = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: env.cookieSameSite,
  maxAge: env.refreshDays * 24 * 60 * 60 * 1000,
  path: '/api/v1/auth'
};
