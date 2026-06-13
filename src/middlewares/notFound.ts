import type { NextFunction, Request, Response } from "express";

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  (error as Error & { statusCode?: number }).statusCode = 404;
  next(error);
};
