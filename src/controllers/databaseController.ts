import type { Request, Response } from "express";
import { getDatabase, reloadDatabase } from "../services/databaseService.js";

export const getFullDatabase = (_req: Request, res: Response) => {
  res.json(getDatabase());
};

export const reload = (_req: Request, res: Response) => {
  const database = reloadDatabase();

  res.json({
    message: "Database reloaded from JSON file",
    metadata: database.metadata
  });
};
