// TEST ONLY. Read-only observation of the actual Electron utility-process
// transport. No request/reply alteration, metadata injection or control endpoint.
const { utilityProcess } = require("electron");
const actualFork = utilityProcess.fork.bind(utilityProcess);
const requests = [];
let generations = 0, overflow = false;
utilityProcess.fork = (...args) => {
  const child = actualFork(...args);
  generations++;
  const post = child.postMessage.bind(child);
  child.postMessage = (...messageArgs) => {
    const input = messageArgs[0];
    if (typeof input?.type === "string" && typeof input?.requestId === "string") {
      if (requests.length < 4096) requests.push({ type: input.type, requestId: input.requestId });
      else overflow = true;
    }
    return post(...messageArgs);
  };
  return child;
};
module.exports = () => ({ requests: [...requests], generations, overflow });
