import dotenv from "dotenv";
import { startAutomationWorkers } from "./services/automationService.js";
import { validateStartupSafety } from "./services/startupSafetyService.js";

dotenv.config();
validateStartupSafety();

startAutomationWorkers()
  .then(() => {
    console.log("TradePilot worker process started. Paper trading only.");
  })
  .catch((error) => {
    console.error("TradePilot worker failed to start.", error);
    process.exit(1);
  });
