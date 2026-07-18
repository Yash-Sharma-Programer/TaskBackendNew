import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export const emailTransportConfigured = Boolean(
  env.smtp.host && env.smtp.user && env.smtp.pass
);

const transport = emailTransportConfigured
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: { minVersion: 'TLSv1.2' }
    })
  : nodemailer.createTransport({ jsonTransport: true });

export const verifyEmailTransport = async () => {
  if (!emailTransportConfigured) return false;
  await transport.verify();
  return true;
};

export const sendEmail = async ({ to, subject, text, html }) =>
  transport.sendMail({ from: env.smtp.from, to, subject, text, html });
