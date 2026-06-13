export type WorldCupGroup =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L";

export type PlayerStatus =
  | "provisional_current_squad"
  | "pending_confirmation"
  | string;

export type Player = {
  id: string;
  teamId: string;
  name: string;
  shirtName: string | null;
  number: number | null;
  position: string;
  club: string | null;
  birthDate: string | null;
  height: string | null;
  preferredFoot: string | null;
  photoUrl: string | null;
  imageSearchQuery: string | null;
  status: PlayerStatus;
};

export type Coach = {
  name: string;
  status: string;
};

export type CoachDetails = {
  id: string;
  teamId: string;
  name: string;
  role: string;
  photoUrl: string | null;
  imageSearchQuery: string | null;
  status: string;
};

export type WorldCupHistory = {
  participationsIncluding2026: number;
  participationYears: number[];
  titles: number;
  titleYears: number[];
  runnerUpYears: number[];
  bestCampaign: string | null;
};

export type WorldCupMatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled"
  | string;

export type WorldCupMatch = {
  id: string;
  matchNumber: number;
  stage: string;
  group: WorldCupGroup;
  round: string;
  date: string;
  kickoffLocal: string;
  kickoffUTC?: string;
  timezone: string;

  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
  awayTeamCode: string;

  stadiumId: string;
  stadiumName: string;
  city: string;
  country: string;

  status: WorldCupMatchStatus;

  homeScore?: number | null;
  awayScore?: number | null;
  minute?: string | null;
  penalties?: {
    homeScore: number | null;
    awayScore: number | null;
  } | null;
};

export type Country = {
  id: string;
  name: string;
  nameEn: string;
  code: string;
  slug: string;
  confederation: string;
  group: WorldCupGroup;

  flagUrl?: string;
  flagSvgUrl?: string;
  flag?: string;

  teamPhotoUrl?: string;
  teamPhoto?: string;

  fixtureIds?: string[];

  worldCup2026: {
    qualified: boolean;
    host: boolean;
    debut: boolean;
    group: WorldCupGroup;
  };

  worldCupHistory: WorldCupHistory;

  coach: Coach;
  coachDetails: CoachDetails;

  squadStatus: string;
  playersEndpoint: string;
  squadPlayersIncluded: number;
  squadSlotsTotal: number;

  squad: {
    totalSlots: number;
    confirmedOrProvisionalPlayers: number;
    pendingPlayers: number;
    goalkeepers: Player[];
    defenders: Player[];
    midfielders: Player[];
    forwards: Player[];
    pendingConfirmation: Player[];
    all: Player[];
  };

  liveData?: {
    squad?: unknown;
  };
};

export type WorldCupGroupInfo = {
  id: string;
  worldCupId: string;
  name: string;
  letter: WorldCupGroup;
  teamIds: string[];
};

export type Stadium = {
	id: string;
	name: string;
	city: string;
	country: string;
	capacity: number;
	timezone?: string;
	matchCount?: number;
	matches?: WorldCupMatch[];
	description?: string;
	highlights?: string[];
	opened?: string | null;
	surface?: string | null;
	roof?: string | null;
	architect?: string | null;
	tenantTeams?: string[];
	photoUrl?: string | null;
	assets?: {
		stadiumId: string;
		urls: { image: string | null };
		local: { image: string | null };
		remote?: { image: string | null };
	};
};

export type WorldCupDatabase = {
  liveData?: {
    matches?: Record<string, unknown>;
    standings?: Record<string, unknown>;
    matchStats?: Record<string, unknown>;
    lineups?: Record<string, unknown>;
    scorers?: Record<string, unknown>;
    knockout?: unknown;
    [key: string]: unknown;
  };

  metadata: {
    name: string;
    version: string;
    language: string;
    generatedAt: string;
    description: string;
    importantNotice: string;
    counts: {
      teams: number;
      groups: number;
      coaches: number;
      players: number;
      namedPlayers: number;
      pendingPlayerSlots: number;
      worldCups: number;
      champions: number;
      stadiums: number;
      matches: number;
    };
  };

  worldCup2026: {
    hostCountries: string[];
    totalTeams: number;
    totalGroups: number;
    teamsPerGroup: number;
    groups: WorldCupGroupInfo[];
    stadiums: Stadium[];
    matches?: WorldCupMatch[];
    groupStageMatches?: WorldCupMatch[];
  };

  matches?: WorldCupMatch[];
  teams: Country[];
};


