export const success = (res, message, data = {}, status = 200, meta) =>
  res.status(status).json({ success: true, message, data, ...(meta ? { meta } : {}) });
