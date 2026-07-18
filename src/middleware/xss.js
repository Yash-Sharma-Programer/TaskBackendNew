const cleanString = (value) => value
  .replace(/\0/g, '')
  .replace(/<\/?script\b[^>]*>/gi, '')
  .replace(/javascript\s*:/gi, '')
  .replace(/\son\w+\s*=/gi, ' data-removed=');

const sanitize = (value) => {
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
};

export const preventXss = (req, _res, next) => { if (req.body) req.body = sanitize(req.body); next(); };
