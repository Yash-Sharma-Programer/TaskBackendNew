import { env } from '../config/env.js';

export const notFound = (req, res) => res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found`, errors: [] });
export const errorHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);
  let status = error.statusCode || 500;
  let message = error.message || 'Internal server error';
  if (error.name === 'CastError') { status = 400; message = 'Invalid resource identifier'; }
  if (error.code === 11000) { status = 409; message = `${Object.keys(error.keyPattern || {})[0] || 'Value'} already exists`; }
  if (error.name === 'ValidationError') { status = 422; message = 'Validation failed'; }
  res.status(status).json({ success: false, message, errors: error.errors || [], ...(env.nodeEnv === 'development' && status === 500 ? { stack: error.stack } : {}) });
};
