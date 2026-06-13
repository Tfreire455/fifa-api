import type { Request, Response } from "express";
import {
  getKnockoutBracket,
  getTournamentPhase
} from "../services/knockoutService.js";

export const knockoutBracket = async (req: Request, res: Response) => {
  const force = req.query.refresh === "true" || req.query.force === "true";
  const bracket = await getKnockoutBracket({ force });
  res.json(bracket);
};

export const tournamentPhase = (_req: Request, res: Response) => {
  res.json(getTournamentPhase());
};
