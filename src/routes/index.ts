import { Router } from "express";

import assetRoutes from "./assetRoutes.js";
import databaseRoutes from "./databaseRoutes.js";
import groupRoutes from "./groupRoutes.js";
import healthRoutes from "./healthRoutes.js";
import knockoutRoutes from "./knockoutRoutes.js";
import liveRoutes from "./liveRoutes.js";
import matchRoutes from "./matchRoutes.js";
import searchRoutes from "./searchRoutes.js";
import stadiumRoutes from "./stadiumRoutes.js";
import teamRoutes from "./teamRoutes.js";

const router = Router();

router.use("/", healthRoutes);
router.use("/assets", assetRoutes);
router.use("/database", databaseRoutes);
router.use("/groups", groupRoutes);
router.use("/knockout", knockoutRoutes);
router.use("/live", liveRoutes);
router.use("/matches", matchRoutes);
router.use("/search", searchRoutes);
router.use("/stadiums", stadiumRoutes);
router.use("/teams", teamRoutes);

export default router;
