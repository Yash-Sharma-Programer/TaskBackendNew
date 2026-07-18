import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

const cloudEnabled = Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);
if (cloudEnabled) cloudinary.config({ cloud_name: env.cloudinary.cloudName, api_key: env.cloudinary.apiKey, api_secret: env.cloudinary.apiSecret });

export const uploadBuffer = async (file, folder = 'taskflow') => {
  if (cloudEnabled) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'auto', use_filename: true }, (error, result) => error ? reject(error) : resolve({ publicId: result.public_id, secureUrl: result.secure_url }));
      stream.end(file.buffer);
    });
  }
  const extension = path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '') || '';
  const name = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const directory = path.resolve('uploads');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, name), file.buffer);
  return { publicId: `local/${name}`, secureUrl: `/uploads/${name}` };
};

export const deleteUpload = async (publicId) => {
  if (!publicId) return;
  if (cloudEnabled) return cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
  if (publicId.startsWith('local/')) await fs.unlink(path.resolve('uploads', publicId.slice(6))).catch(() => {});
};
