import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import {
  getAllLiveStandings,
  getLiveMatches,
  getLiveMatchStats,
  getLiveStandings
} from "../services/liveService.js";
import {
  getLiveLineups,
  getLiveSquad,
  getTopScorers
} from "../services/squadService.js";
import type { WorldCupGroup } from "../types/worldCup.js";

const GROUP_LETTERS = "ABCDEFGHIJKL";

/**
 * Refresh manual: só quando o usuário clica em "Refresh" / "Is something wrong?".
 * Sem isso, o live nunca é reativado (os dados ficam gravados, economizando tokens).
 */
const wantsRefresh = (req: Request): boolean =>
  req.query.refresh === "true" || req.query.force === "true";

export const liveMatches = async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "Invalid date. Use the YYYY-MM-DD format.");
  }

  const result = await getLiveMatches(date, { force: wantsRefresh(req) });
  res.json(result);
};

export const liveStandingsAll = async (req: Request, res: Response) => {
  const standings = await getAllLiveStandings({ force: wantsRefresh(req) });

  res.json({
    total: standings.length,
    data: standings
  });
};

export const liveStandingsByGroup = async (req: Request, res: Response) => {
  const letter = String(req.params.letter || "").toUpperCase();

  if (!GROUP_LETTERS.includes(letter) || letter.length !== 1) {
    throw new HttpError(404, "Group not found. Use a letter from A to L.");
  }

  const standings = await getLiveStandings(letter as WorldCupGroup, {
    force: wantsRefresh(req)
  });
  res.json(standings);
};

export const liveMatchStats = async (req: Request, res: Response) => {
  const stats = await getLiveMatchStats(req.params.id, {
    force: wantsRefresh(req)
  });

  if (!stats) throw new HttpError(404, "Match not found");

  res.json(stats);
};

export const liveTeamSquad = async (req: Request, res: Response) => {
  const squad = await getLiveSquad(req.params.id, { force: wantsRefresh(req) });

  if (!squad) throw new HttpError(404, "Team not found");

  res.json(squad);
};

export const liveMatchLineups = async (req: Request, res: Response) => {
  const lineups = await getLiveLineups(req.params.id, {
    force: wantsRefresh(req)
  });

  if (!lineups) throw new HttpError(404, "Match not found");

  res.json(lineups);
};

export const liveTopScorers = async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 10;
  const result = await getTopScorers(limit, { force: wantsRefresh(req) });

  res.json(result);
};
