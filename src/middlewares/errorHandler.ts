import type { NextFunction, Request, Response } from "express";

export const errorHandler = (
  error: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    error: true,
    statusCode,
    message: error.message || "Internal server error"
  });
};
