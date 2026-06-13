import { getMatches } from "./databaseService.js";
import { findTeamByCode, findTeamById } from "./teamService.js";
import { applyPersistedLiveScoreToMatch } from "./livePersistenceService.js";
import type { WorldCupMatch } from "../types/worldCup.js";

export type MatchFilters = {
  group?: string;
  teamId?: string;
  date?: string;
  stage?: string;
  status?: string;
};

const sortByMatchNumber = (a: WorldCupMatch, b: WorldCupMatch) => {
  return Number(a.matchNumber || 0) - Number(b.matchNumber || 0);
};

export const listMatches = (filters: MatchFilters = {}): WorldCupMatch[] => {
  let matches = getMatches().map(applyPersistedLiveScoreToMatch);

  if (filters.group) {
    matches = matches.filter(
      (match) => match.group?.toLowerCase() === filters.group?.toLowerCase()
    );
  }

  if (filters.teamId) {
    matches = matches.filter(
      (match) =>
        match.homeTeamId === filters.teamId ||
        match.awayTeamId === filters.teamId
    );
  }

  if (filters.date) {
    matches = matches.filter((match) => match.date === filters.date);
  }

  if (filters.stage) {
    matches = matches.filter((match) => match.stage === filters.stage);
  }

  if (filters.status) {
    matches = matches.filter((match) => match.status === filters.status);
  }

  return [...matches].sort(sortByMatchNumber);
};

export const findMatchById = (id: string): WorldCupMatch | undefined => {
  return getMatches()
    .map(applyPersistedLiveScoreToMatch)
    .find((match) => match.id === id);
};

export const getMatchesByTeamId = (teamId: string): WorldCupMatch[] => {
  return listMatches({ teamId });
};

export const getMatchesByTeamCode = (code: string): WorldCupMatch[] | null => {
  const team = findTeamByCode(code);

  if (!team) return null;

  return getMatchesByTeamId(team.id);
};

export const hydrateMatch = (match: WorldCupMatch) => {
  return {
    ...match,
    homeTeam: findTeamById(match.homeTeamId) || null,
    awayTeam: findTeamById(match.awayTeamId) || null
  };
};