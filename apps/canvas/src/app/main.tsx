import { prepareOriginMigration } from "./originMigration";
import { showStartupFatalFailure, showStartupPhase } from "./startupDom";

showStartupPhase("opening");
void prepareOriginMigration()
  .then(() => {
    showStartupPhase("loading");
    return import("./canvasApp");
  })
  .catch((error: unknown) => {
    console.error(error);
    showStartupFatalFailure(error);
  });
