import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import {
  findMatchById,
  getMatchesByTeamCode,
  getMatchesByTeamId,
  hydrateMatch,
  listMatches
} from "../services/matchService.js";

export const getAllMatches = (req: Request, res: Response) => {
  const matches = listMatches({
    group: req.query.group as string | undefined,
    teamId: req.query.teamId as string | undefined,
    date: req.query.date as string | undefined,
    stage: req.query.stage as string | undefined,
    status: req.query.status as string | undefined
  });

  const data = req.query.hydrate === "true" ? matches.map(hydrateMatch) : matches;

  res.json({
    total: data.length,
    data
  });
};

export const getMatchById = (req: Request, res: Response) => {
  const match = findMatchById(req.params.id);

  if (!match) throw new HttpError(404, "Match not found");

  res.json(req.query.hydrate === "true" ? hydrateMatch(match) : match);
};

export const getMatchesByTeamIdController = (req: Request, res: Response) => {
  const matches = getMatchesByTeamId(req.params.teamId);

  res.json({
    teamId: req.params.teamId,
    total: matches.length,
    data: matches
  });
};

export const getMatchesByTeamCodeController = (req: Request, res: Response) => {
  const matches = getMatchesByTeamCode(req.params.code);

  if (!matches) throw new HttpError(404, "Team not found");

  res.json({
    code: req.params.code.toUpperCase(),
    total: matches.length,
    data: matches
  });
};
