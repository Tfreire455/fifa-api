import { includesNormalized } from "../utils/text.js";
import { getTeams } from "./databaseService.js";
import { getTeamAssets, resolvePlayerPhotoUrl } from "./assetService.js";
import type { Country, Player } from "../types/worldCup.js";

export type TeamFilters = {
  group?: string;
  confederation?: string;
  q?: string;
  withAssets?: string;
};

export const listTeams = (filters: TeamFilters = {}): Country[] => {
  let teams = getTeams();

  if (filters.group) {
    teams = teams.filter(
      (team) => team.group?.toLowerCase() === filters.group?.toLowerCase()
    );
  }

  if (filters.confederation) {
    teams = teams.filter(
      (team) =>
        team.confederation?.toLowerCase() === filters.confederation?.toLowerCase()
    );
  }

  if (filters.q) {
    teams = teams.filter((team) => {
      return [
        team.id,
        team.name,
        team.nameEn,
        team.code,
        team.slug,
        team.confederation,
        team.coach?.name
      ].some((value) => includesNormalized(value, filters.q as string));
    });
  }

  return teams;
};

const resolvePlayer = (team: Country, player: Player): Player => ({
  ...player,
  photoUrl: resolvePlayerPhotoUrl(team, player) || null
});

const resolveSquadPhotos = (team: Country): Country["squad"] => {
  if (!team.squad) return team.squad;

  const goalkeepers = (team.squad.goalkeepers || []).map((player) => resolvePlayer(team, player));
  const defenders = (team.squad.defenders || []).map((player) => resolvePlayer(team, player));
  const midfielders = (team.squad.midfielders || []).map((player) => resolvePlayer(team, player));
  const forwards = (team.squad.forwards || []).map((player) => resolvePlayer(team, player));
  const pendingConfirmation = (team.squad.pendingConfirmation || []).map((player) => resolvePlayer(team, player));

  return {
    ...team.squad,
    goalkeepers,
    defenders,
    midfielders,
    forwards,
    pendingConfirmation,
    all: [...goalkeepers, ...defenders, ...midfielders, ...forwards, ...pendingConfirmation]
  };
};

const resolveLiveDataPhotos = (team: Country): Country["liveData"] => {
  if (!team.liveData?.squad || typeof team.liveData.squad !== "object") {
    return team.liveData;
  }

  const squad = team.liveData.squad as Record<string, unknown>;

  const resolveLivePlayer = (value: unknown) => {
    if (!value || typeof value !== "object") return value;

    const player = value as {
      id?: string | null;
      name?: string | null;
      shirtName?: string | null;
      photoUrl?: string | null;
    };

    if (!player.name) return value;

    return {
      ...player,
      photoUrl: resolvePlayerPhotoUrl(team, {
        id: player.id || null,
        name: player.name,
        shirtName: player.shirtName || null,
        photoUrl: player.photoUrl || null
      }) || null
    };
  };

  const resolveList = (value: unknown) => {
    return Array.isArray(value) ? value.map(resolveLivePlayer) : value;
  };

  return {
    ...team.liveData,
    squad: {
      ...squad,
      goalkeepers: resolveList(squad.goalkeepers),
      defenders: resolveList(squad.defenders),
      midfielders: resolveList(squad.midfielders),
      forwards: resolveList(squad.forwards),
      all: resolveList(squad.all)
    }
  };
};

export const withResolvedPlayerPhotos = (team: Country): Country => ({
  ...team,
  squad: resolveSquadPhotos(team),
  liveData: resolveLiveDataPhotos(team)
});

export const withTeamAssets = (team: Country) => ({
  ...withResolvedPlayerPhotos(team),
  assets: getTeamAssets(team)
});

export const findTeamById = (id: string): Country | undefined => {
  return getTeams().find((team) => team.id === id);
};

export const findTeamBySlug = (slug: string): Country | undefined => {
  return getTeams().find((team) => team.slug === slug);
};

export const findTeamByCode = (code: string): Country | undefined => {
  return getTeams().find((team) => team.code?.toLowerCase() === code.toLowerCase());
};

export const getPlayersByTeamId = (teamId: string) => {
  const team = findTeamById(teamId);
  if (!team) return null;

  return (team.squad?.all || []).map((player) => resolvePlayer(team, player));
};
