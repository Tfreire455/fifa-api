import fs from "node:fs";
import { WORLD_CUP_JSON_PATH } from "../config/paths.js";
import type { WorldCupDatabase } from "../types/worldCup.js";

let cache: WorldCupDatabase | null = null;
let writeQueue: Promise<WorldCupDatabase> = Promise.resolve(null as unknown as WorldCupDatabase);

const readJsonFile = (): WorldCupDatabase => {
  const raw = fs.readFileSync(WORLD_CUP_JSON_PATH, "utf-8");
  return JSON.parse(raw) as WorldCupDatabase;
};

const writeJsonFile = (database: WorldCupDatabase) => {
  const payload = `${JSON.stringify(database, null, 2)}\n`;
  fs.writeFileSync(WORLD_CUP_JSON_PATH, payload, "utf-8");
};

export const getDatabase = (): WorldCupDatabase => {
  if (!cache) {
    cache = readJsonFile();
  }

  return cache;
};

export const reloadDatabase = (): WorldCupDatabase => {
  cache = readJsonFile();
  return cache;
};

/**
 * Atualiza o JSON principal do projeto em disco e também atualiza o cache em memória.
 * Use isto para persistir dados vindos da IA dentro da database atual, sem depender
 * apenas de `.cache` e sem gastar tokens nas próximas leituras.
 */
export const updateDatabase = async (
  updater: (database: WorldCupDatabase) => WorldCupDatabase | void
): Promise<WorldCupDatabase> => {
  writeQueue = writeQueue.then(async () => {
    const database = readJsonFile();
    const updated = updater(database) || database;

    writeJsonFile(updated);
    cache = updated;

    return updated;
  });

  return writeQueue;
};

export const getMetadata = () => getDatabase().metadata;

export const getWorldCup = () => getDatabase().worldCup2026;

export const getTeams = () => getDatabase().teams || [];

export const getGroups = () => getWorldCup().groups || [];

export const getStadiums = () => getWorldCup().stadiums || [];

export const getMatches = () => getWorldCup().matches || [];
