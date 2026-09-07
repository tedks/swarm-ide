const assert = require("node:assert/strict");
function verify(proof, close) {
  assert(proof.ok && proof.synthetic && proof.packaged && proof.modelTurns === 0);
  assert.deepEqual(proof.rendererErrors, []);
  assert(close.observedProcessSurvivedAppClose && close.ownedTmuxCleaned);
  assert.equal(close.desktopCode, 0, "Packaged desktop must close successfully; a late crash is not a passing proof");
}
module.exports = { verify };
if (require.main === module) {
  const fs = require("node:fs"), root = process.argv[2];
  verify(JSON.parse(fs.readFileSync(root + "/proof.json")), JSON.parse(fs.readFileSync(root + "/postclose.json")));
  console.log("Packaged external lineage/conversation/handoff passed with synthetic metadata, clean desktop exit and owned process survival.");
}
