/** Errors that are safe to show the client. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, details);
export const unauthorized = (msg = 'You need to be logged in.') => new AppError(401, msg);
export const forbidden = (msg = 'Not allowed.') => new AppError(403, msg);
export const notFound = (msg = 'Not found.') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);
export const tooMany = (msg = 'Too many attempts. Try again shortly.') => new AppError(429, msg);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
