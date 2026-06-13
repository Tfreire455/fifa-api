import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3333),
  nodeEnv: process.env.NODE_ENV || "development",
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3333}`,

  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.5",
  openaiSearchModel: process.env.OPENAI_SEARCH_MODEL || "gpt-5-search-api",

  liveCacheTtlMs: Number(process.env.LIVE_CACHE_TTL_MS || 60_000),
  standingsCacheTtlMs: Number(process.env.STANDINGS_CACHE_TTL_MS || 180_000),
  knockoutCacheTtlMs: Number(process.env.KNOCKOUT_CACHE_TTL_MS || 120_000),
  statsCacheTtlMs: Number(process.env.STATS_CACHE_TTL_MS || 120_000),
  squadCacheTtlMs: Number(process.env.SQUAD_CACHE_TTL_MS || 21_600_000),
  lineupsCacheTtlMs: Number(process.env.LINEUPS_CACHE_TTL_MS || 120_000),
  scorersCacheTtlMs: Number(process.env.SCORERS_CACHE_TTL_MS || 600_000)
};

export const isOpenAIConfigured = () => Boolean(env.openaiApiKey);