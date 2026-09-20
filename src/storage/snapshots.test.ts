import { checkForChange } from "./snapshots.js";
import { rm } from "node:fs/promises";

const TEST_PATH = "./.data/test-snapshots.json";

async function main() {
  await rm(TEST_PATH, { force: true });

  const r1 = await checkForChange("sub-1", "task-1", "wallet-x", "First version of my work", TEST_PATH);
  console.log("1st call:", { isFirstObservation: r1.isFirstObservation, changed: r1.changed });

  const r2 = await checkForChange("sub-1", "task-1", "wallet-x", "First version of my work", TEST_PATH);
  console.log("2nd call, same content:", { isFirstObservation: r2.isFirstObservation, changed: r2.changed });

  const r3 = await checkForChange("sub-1", "task-1", "wallet-x", "Updated version with more detail https://x.com/foo", TEST_PATH);
  console.log("3rd call, changed content:", { isFirstObservation: r3.isFirstObservation, changed: r3.changed, links: r3.current.links });

  await rm(TEST_PATH, { force: true });
}
main();
