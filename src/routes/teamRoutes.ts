import { Router } from "express";
import {
  getAllTeams,
  getTeamByCode,
  getTeamById,
  getTeamBySlug,
  getTeamMatches,
  getTeamPlayers
} from "../controllers/teamController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(getAllTeams));
router.get("/slug/:slug", asyncHandler(getTeamBySlug));
router.get("/code/:code", asyncHandler(getTeamByCode));
router.get("/:id", asyncHandler(getTeamById));
router.get("/:teamId/players", asyncHandler(getTeamPlayers));
router.get("/:teamId/matches", asyncHandler(getTeamMatches));

export default router;
