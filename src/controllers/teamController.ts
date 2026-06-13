import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import {
  findTeamByCode,
  findTeamById,
  findTeamBySlug,
  getPlayersByTeamId,
  listTeams,
  withTeamAssets
} from "../services/teamService.js";
import { getMatchesByTeamId } from "../services/matchService.js";

const shouldIncludeAssets = (value: unknown) => value === "true" || value === true;

export const getAllTeams = (req: Request, res: Response) => {
  const teams = listTeams({
    group: req.query.group as string | undefined,
    confederation: req.query.confederation as string | undefined,
    q: req.query.q as string | undefined
  });

  const data = shouldIncludeAssets(req.query.assets)
    ? teams.map(withTeamAssets)
    : teams;

  res.json({
    total: data.length,
    data
  });
};

export const getTeamById = (req: Request, res: Response) => {
  const team = findTeamById(req.params.id);

  if (!team) throw new HttpError(404, "Team not found");

  res.json(shouldIncludeAssets(req.query.assets) ? withTeamAssets(team) : team);
};

export const getTeamBySlug = (req: Request, res: Response) => {
  const team = findTeamBySlug(req.params.slug);

  if (!team) throw new HttpError(404, "Team not found");

  res.json(shouldIncludeAssets(req.query.assets) ? withTeamAssets(team) : team);
};

export const getTeamByCode = (req: Request, res: Response) => {
  const team = findTeamByCode(req.params.code);

  if (!team) throw new HttpError(404, "Team not found");

  res.json(shouldIncludeAssets(req.query.assets) ? withTeamAssets(team) : team);
};

export const getTeamPlayers = (req: Request, res: Response) => {
  const players = getPlayersByTeamId(req.params.teamId);

  if (!players) throw new HttpError(404, "Team not found");

  res.json({
    teamId: req.params.teamId,
    total: players.length,
    data: players
  });
};

export const getTeamMatches = (req: Request, res: Response) => {
  const team = findTeamById(req.params.teamId);

  if (!team) throw new HttpError(404, "Team not found");

  const matches = getMatchesByTeamId(req.params.teamId);

  res.json({
    team,
    total: matches.length,
    data: matches
  });
};
