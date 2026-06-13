import { Router } from "express";
import {
  getAllAssets,
  getTeamAssetByCode,
  getTeamAssetById,
  proxyImage
} from "../controllers/assetController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(getAllAssets));
router.get("/image-proxy", asyncHandler(proxyImage));
router.get("/team/:teamId", asyncHandler(getTeamAssetById));
router.get("/code/:code", asyncHandler(getTeamAssetByCode));

export default router;
