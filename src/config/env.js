import 'dotenv/config';

const requiredInProduction = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
if (process.env.NODE_ENV === 'production') {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

const normalizeOrigin = (value) => value.trim().replace(/\/+$/, '');
const configuredClientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
const clientUrls = [...new Set([
  'http://localhost:5173',
  'https://task-frontend-iota-ruby.vercel.app',
  ...configuredClientUrls,
])];

export const env = {
  nodeEnv: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || 'mongodb+srv://yash:0RtRbEz7iuDbRcKI@ecommercepracticewebapp.e3upoww.mongodb.net/taskflow',
  clientUrls,
  accessSecret: process.env.JWT_ACCESS_SECRET || 'development-access-secret-change-this-32',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-this-32',
  accessExpires: process.env.ACCESS_TOKEN_EXPIRES || '15m',
  refreshDays: Number(process.env.REFRESH_TOKEN_DAYS || 7),
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
  cloudinary: { cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'TaskFlow <yashbca029@gmail.com>'
  }
};
