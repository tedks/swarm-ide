import { startCoreWorker } from "./worker-runtime";
import { createDitzTaskProvider } from "./tasks/provider";

// Production composition is fixed. No renderer/env-selected test provider.
startCoreWorker({ createTasks: createDitzTaskProvider });
