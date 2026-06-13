import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import { getGroupWithTeams, listGroups } from "../services/groupService.js";
import { listMatches } from "../services/matchService.js";
import { listTeams } from "../services/teamService.js";

export const getAllGroups = (_req: Request, res: Response) => {
  const groups = listGroups();

  res.json({
    total: groups.length,
    data: groups
  });
};

export const getGroupByLetter = (req: Request, res: Response) => {
  const group = getGroupWithTeams(req.params.letter);

  if (!group) throw new HttpError(404, "Group not found");

  res.json(group);
};

export const getGroupTeams = (req: Request, res: Response) => {
  const teams = listTeams({ group: req.params.letter });

  res.json({
    group: req.params.letter.toUpperCase(),
    total: teams.length,
    data: teams
  });
};

export const getGroupMatches = (req: Request, res: Response) => {
  const matches = listMatches({ group: req.params.letter });

  res.json({
    group: req.params.letter.toUpperCase(),
    total: matches.length,
    data: matches
  });
};
