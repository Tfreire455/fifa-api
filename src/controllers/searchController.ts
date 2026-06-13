import type { Request, Response } from "express";
import { includesNormalized } from "../utils/text.js";
import { listMatches } from "../services/matchService.js";
import { listStadiums } from "../services/stadiumService.js";
import { listTeams } from "../services/teamService.js";

export const search = (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();

  if (!q) {
    res.json({
      query: "",
      teams: [],
      stadiums: [],
      matches: []
    });
    return;
  }

  const teams = listTeams({ q });
  const stadiums = listStadiums({ q });

  const matches = listMatches().filter((match) => {
    return [
      match.id,
      match.group,
      match.round,
      match.date,
      match.homeTeamId,
      match.awayTeamId,
      match.homeTeamName,
      match.awayTeamName,
      match.homeTeamCode,
      match.awayTeamCode,
      match.stadiumName,
      match.city,
      match.country
    ].some((value) => includesNormalized(value, q));
  });

  res.json({
    query: q,
    teams,
    stadiums,
    matches
  });
};
