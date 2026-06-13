import { Router } from "express";
import { getAllStadiums, getStadiumById } from "../controllers/stadiumController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(getAllStadiums));
router.get("/:id", asyncHandler(getStadiumById));

export default router;
