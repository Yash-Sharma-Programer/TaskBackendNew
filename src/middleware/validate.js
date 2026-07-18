import { AppError } from '../utils/AppError.js';

export const validate = (schema, target = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[target]);
  if (!result.success) return next(new AppError('Validation failed', 422, result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))));
  req[target] = result.data;
  next();
};
