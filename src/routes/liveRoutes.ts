import { Router } from "express";
import {
  liveMatches,
  liveMatchStats,
  liveStandingsAll,
  liveStandingsByGroup,
  liveTeamSquad,
  liveMatchLineups,
  liveTopScorers
} from "../controllers/liveController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/matches", asyncHandler(liveMatches));
router.get("/standings", asyncHandler(liveStandingsAll));
router.get("/standings/:letter", asyncHandler(liveStandingsByGroup));
router.get("/match/:id/stats", asyncHandler(liveMatchStats));
router.get("/match/:id/lineups", asyncHandler(liveMatchLineups));
router.get("/team/:id/squad", asyncHandler(liveTeamSquad));
router.get("/scorers", asyncHandler(liveTopScorers));

export default router;
