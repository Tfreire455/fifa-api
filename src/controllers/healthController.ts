import type { Request, Response } from "express";
import {
  getGroups,
  getMatches,
  getMetadata,
  getStadiums,
  getTeams
} from "../services/databaseService.js";

export const health = (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    api: "WorldCup 2026 API TS",
    counts: {
      teams: getTeams().length,
      groups: getGroups().length,
      stadiums: getStadiums().length,
      matches: getMatches().length
    }
  });
};

export const metadata = (_req: Request, res: Response) => {
  res.json(getMetadata());
};
