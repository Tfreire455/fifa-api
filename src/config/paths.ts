import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export const ROOT_DIR = path.resolve(dirname, "../..");
export const SRC_DIR = path.resolve(ROOT_DIR, "src");
export const DATA_DIR = path.resolve(SRC_DIR, "data");
export const PUBLIC_DIR = path.resolve(ROOT_DIR, "public");
export const WORLD_CUP_JSON_PATH = path.resolve(DATA_DIR, "worldCup2026.json");

export const CACHE_DIR = path.resolve(ROOT_DIR, ".cache");
