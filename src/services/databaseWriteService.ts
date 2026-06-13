import { normalizeText } from "../utils/text.js";
import { updateDatabase } from "./databaseService.js";
import type { Country, Player, Stadium, WorldCupDatabase } from "../types/worldCup.js";
import type { LiveSquad, LiveSquadPlayer } from "../types/live.js";

const toSlug = (value: string) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const bucketForPosition = (position: string | null | undefined) => {
  const normalized = normalizeText(position);

  if (["gk", "goalkeeper", "goleiro"].some((key) => normalized.includes(key))) {
    return "goalkeepers" as const;
  }

  if (["df", "def", "defender", "zagueiro", "lateral"].some((key) => normalized.includes(key))) {
    return "defenders" as const;
  }

  if (["fw", "fwd", "forward", "atacante", "striker", "winger"].some((key) => normalized.includes(key))) {
    return "forwards" as const;
  }

  return "midfielders" as const;
};

const findExistingPlayer = (team: Country, livePlayer: LiveSquadPlayer): Player | undefined => {
  const normalizedName = normalizeText(livePlayer.name);

  return (team.squad?.all || []).find((player) => {
    const name = normalizeText(player.name);
    const shirt = normalizeText(player.shirtName);

    return (
      player.id === livePlayer.id ||
      name === normalizedName ||
      Boolean(shirt && shirt === normalizedName) ||
      name.includes(normalizedName) ||
      normalizedName.includes(name)
    );
  });
};

const toDatabasePlayer = (team: Country, livePlayer: LiveSquadPlayer): Player => {
  const existing = findExistingPlayer(team, livePlayer);
  const id = existing?.id || `${team.id}-${toSlug(livePlayer.name)}`;
  const shirtName = livePlayer.shirtName || existing?.shirtName || livePlayer.name.split(" ").at(-1) || livePlayer.name;

  return {
    id,
    teamId: team.id,
    name: livePlayer.name,
    shirtName,
    number: livePlayer.number ?? existing?.number ?? null,
    position: livePlayer.position || existing?.position || "MF",
    club: livePlayer.club ?? existing?.club ?? null,
    birthDate: existing?.birthDate ?? null,
    height: existing?.height ?? null,
    preferredFoot: existing?.preferredFoot ?? null,
    photoUrl: livePlayer.photoUrl || existing?.photoUrl || null,
    imageSearchQuery: existing?.imageSearchQuery || `${livePlayer.name} ${team.nameEn || team.name} football player photo`,
    status: livePlayer.status || existing?.status || "confirmed"
  };
};

const updateDatabaseCounts = (database: WorldCupDatabase) => {
  const allPlayers = database.teams.flatMap((team) => team.squad?.all || []);

  database.metadata.counts.players = allPlayers.length;
  database.metadata.counts.namedPlayers = allPlayers.filter((player) => Boolean(player.name)).length;
  database.metadata.counts.pendingPlayerSlots = database.teams.reduce(
    (total, team) => total + Number(team.squad?.pendingPlayers || 0),
    0
  );
  database.metadata.generatedAt = new Date().toISOString();
};

export const saveLiveSquadToDatabase = async (teamId: string, squad: LiveSquad) => {
  await updateDatabase((database) => {
    const team = database.teams.find((item) => item.id === teamId || item.slug === teamId || item.code === teamId.toUpperCase());
    if (!team) return;

    const players = squad.all.map((player) => toDatabasePlayer(team, player));

    team.coach = {
      name: squad.coach || team.coach?.name || "TBD",
      status: squad.source === "openai-live" ? "ai_persisted_current_data" : team.coach?.status || "local"
    };

    team.coachDetails = {
      id: team.coachDetails?.id || `${team.id}-coach`,
      teamId: team.id,
      name: squad.coachDetails?.name || squad.coach || team.coachDetails?.name || team.coach.name,
      role: team.coachDetails?.role || "Head coach",
      photoUrl: team.coachDetails?.photoUrl || null,
      imageSearchQuery: team.coachDetails?.imageSearchQuery || `${squad.coach || team.coach.name} coach photo`,
      status: "ai_persisted_current_data"
    };

    const goalkeepers = players.filter((player) => bucketForPosition(player.position) === "goalkeepers");
    const defenders = players.filter((player) => bucketForPosition(player.position) === "defenders");
    const midfielders = players.filter((player) => bucketForPosition(player.position) === "midfielders");
    const forwards = players.filter((player) => bucketForPosition(player.position) === "forwards");

    team.squad = {
      totalSlots: Math.max(26, players.length),
      confirmedOrProvisionalPlayers: players.length,
      pendingPlayers: Math.max(0, 26 - players.length),
      goalkeepers,
      defenders,
      midfielders,
      forwards,
      pendingConfirmation: [],
      all: players
    };

    team.squadStatus = "ai_persisted_current_data";
    team.squadPlayersIncluded = players.length;
    team.squadSlotsTotal = Math.max(26, players.length);

    const liveData = {
      squad: {
        ...squad,
        source: "openai-live",
        persistedAt: new Date().toISOString()
      }
    };

    (team as Country & { liveData?: unknown }).liveData = liveData;

    updateDatabaseCounts(database);
  });
};

export type AiStadiumDetails = {
  description?: string | null;
  highlights?: string[];
  opened?: string | null;
  surface?: string | null;
  roof?: string | null;
  architect?: string | null;
  tenantTeams?: string[];
  photoUrl?: string | null;
};

export const saveStadiumDetailsToDatabase = async (stadiumId: string, details: AiStadiumDetails) => {
  await updateDatabase((database) => {
    const lists: Stadium[][] = [database.worldCup2026.stadiums || []];

    const topLevelStadiums = (database as unknown as { stadiums?: Stadium[] }).stadiums;
    if (Array.isArray(topLevelStadiums)) lists.push(topLevelStadiums);

    for (const stadiums of lists) {
      const stadium = stadiums.find((item) => item.id === stadiumId);
      if (!stadium) continue;

      stadium.description = details.description || stadium.description;
      stadium.highlights = details.highlights?.length ? details.highlights.slice(0, 6) : stadium.highlights;
      (stadium as Stadium & AiStadiumDetails).opened = details.opened || (stadium as Stadium & AiStadiumDetails).opened || null;
      (stadium as Stadium & AiStadiumDetails).surface = details.surface || (stadium as Stadium & AiStadiumDetails).surface || null;
      (stadium as Stadium & AiStadiumDetails).roof = details.roof || (stadium as Stadium & AiStadiumDetails).roof || null;
      (stadium as Stadium & AiStadiumDetails).architect = details.architect || (stadium as Stadium & AiStadiumDetails).architect || null;
      (stadium as Stadium & AiStadiumDetails).tenantTeams = details.tenantTeams?.length
        ? details.tenantTeams.slice(0, 6)
        : (stadium as Stadium & AiStadiumDetails).tenantTeams || [];
      (stadium as Stadium & AiStadiumDetails).photoUrl = details.photoUrl || (stadium as Stadium & AiStadiumDetails).photoUrl || null;
    }

    database.metadata.generatedAt = new Date().toISOString();
  });
};
