import type { WorldCupGroup, WorldCupMatch } from "./worldCup.js";

export type DataSource = "openai-live" | "database-saved" | "local-fallback";

export type LiveScore = {
  matchNumber: number;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" | string;
  minute: string | null;
  penalties?: {
    homeScore: number | null;
    awayScore: number | null;
  } | null;
};

export type LiveMatch = WorldCupMatch & {
  homeScore: number | null;
  awayScore: number | null;
  minute: string | null;
  penalties?: LiveScore["penalties"];
};

export type GroupStandingRow = {
  position: number;
  teamId: string | null;
  teamCode: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type GroupStandings = {
  group: WorldCupGroup;
  source: DataSource;
  updatedAt: string;
  standings: GroupStandingRow[];
};

export type MatchTeamStats = {
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  yellowCards: number | null;
  redCards: number | null;
  offsides: number | null;
  passes: number | null;
  passAccuracy: number | null;
};

export type MatchStats = {
  matchId: string;
  matchNumber: number;
  source: DataSource;
  updatedAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  home: MatchTeamStats;
  away: MatchTeamStats;
  summary: string | null;
  scorers: {
    team: "home" | "away";
    player: string;
    minute: string | null;
  }[];
};

export type TournamentPhase =
  | "pre_tournament"
  | "group_stage"
  | "knockout"
  | "finished";

export type PhaseInfo = {
  phase: TournamentPhase;
  today: string;
  groupStageStart: string;
  groupStageEnd: string;
  knockoutStart: string;
  finalDate: string;
  daysUntilKnockout: number;
};

export type KnockoutStage =
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "third_place"
  | "final";

export type KnockoutTeamRef = {
  id: string | null;
  code: string | null;
  name: string | null;
  flagUrl: string | null;
};

export type KnockoutMatch = {
  matchNumber: number;
  stage: KnockoutStage;
  /** Rótulo da vaga, ex: "1A", "2B", "3(C/E/F/H/I)", "W73", "L101". */
  homeLabel: string;
  awayLabel: string;
  homeTeam: KnockoutTeamRef | null;
  awayTeam: KnockoutTeamRef | null;
  homeScore: number | null;
  awayScore: number | null;
  penalties: {
    homeScore: number | null;
    awayScore: number | null;
  } | null;
  status: "scheduled" | "live" | "finished" | string;
  minute: string | null;
  date: string | null;
  kickoffLocal: string | null;
  stadiumName: string | null;
  city: string | null;
};

export type KnockoutRound = {
  stage: KnockoutStage;
  name: string;
  dateRange: string;
  matches: KnockoutMatch[];
};

export type KnockoutBracket = {
  phase: TournamentPhase;
  source: DataSource;
  updatedAt: string;
  knockoutStart: string;
  rounds: KnockoutRound[];
};

export type LiveSquadPlayer = {
  id: string | null;
  name: string;
  shirtName: string | null;
  number: number | null;
  position: string;
  club: string | null;
  captain: boolean;
  status: string;
  photoUrl: string | null;
};

export type SquadUpdate = {
  date: string | null;
  type: "injury" | "replacement" | "call_up" | "suspension" | "info" | string;
  description: string;
};

export type LiveCoachDetails = {
  name: string | null;
  nationality: string | null;
  age: number | null;
  since: string | null;
};

export type LiveTeamResult = {
  date: string | null;
  opponent: string | null;
  score: string | null;
  competition: string | null;
  result: "W" | "D" | "L" | string | null;
};

export type LiveNextMatch = {
  date: string | null;
  opponent: string | null;
  competition: string | null;
  stadium: string | null;
};

export type LiveSquad = {
  teamId: string;
  teamCode: string;
  teamName: string;
  source: DataSource;
  updatedAt: string;
  coach: string | null;
  coachDetails: LiveCoachDetails | null;
  captain: string | null;
  fifaRanking: number | null;
  recentResults: LiveTeamResult[];
  nextMatch: LiveNextMatch | null;
  updates: SquadUpdate[];
  goalkeepers: LiveSquadPlayer[];
  defenders: LiveSquadPlayer[];
  midfielders: LiveSquadPlayer[];
  forwards: LiveSquadPlayer[];
  all: LiveSquadPlayer[];
};

export type LineupPlayer = {
  number: number | null;
  name: string;
  position: string | null;
  captain?: boolean;
};

export type TeamLineup = {
  teamCode: string | null;
  teamName: string | null;
  formation: string | null;
  coach: string | null;
  startingXI: LineupPlayer[];
  bench: LineupPlayer[];
};

export type MatchLineups = {
  matchId: string;
  matchNumber: number;
  source: DataSource;
  updatedAt: string;
  available: boolean;
  home: TeamLineup;
  away: TeamLineup;
};

export type TopScorer = {
  position: number;
  name: string;
  teamCode: string | null;
  teamName: string | null;
  goals: number;
  assists: number | null;
};

export type TopScorersResult = {
  source: DataSource;
  updatedAt: string;
  total: number;
  data: TopScorer[];
};