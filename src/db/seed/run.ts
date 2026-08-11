import { getDb } from "@/db/client";
import { runSeed } from "./index";

runSeed(getDb())
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
