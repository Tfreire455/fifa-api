import { Router } from "express";
import {
  getAllGroups,
  getGroupByLetter,
  getGroupMatches,
  getGroupTeams
} from "../controllers/groupController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(getAllGroups));
router.get("/:letter", asyncHandler(getGroupByLetter));
router.get("/:letter/teams", asyncHandler(getGroupTeams));
router.get("/:letter/matches", asyncHandler(getGroupMatches));

export default router;
