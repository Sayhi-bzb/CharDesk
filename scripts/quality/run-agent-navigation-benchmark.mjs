import { execFileSync } from "node:child_process";
import { AGENT_NAVIGATION_CASES } from "./agent-navigation-cases.mjs";

const TOP_K = 3;
const TARGET_SCORE = 0.9;

const symbolKey = (symbol) => `${symbol.filePath}:${symbol.name}`;

const rankImplementationCandidates = (result) => {
  const seen = new Set();
  return [...(result.definitions ?? []), ...(result.process_symbols ?? [])]
    .filter(
      (symbol) =>
        symbol.filePath?.startsWith("apps/canvas/src/") &&
        !/\.(?:test|spec)\.[tj]sx?$/.test(symbol.filePath)
    )
    .filter((symbol) => {
      const key = symbolKey(symbol);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, TOP_K);
};

const runCase = (benchmarkCase) => {
  const output = execFileSync(
    "gitnexus",
    [
      "query",
      benchmarkCase.question,
      "--repo",
      "CharDesk",
      "--goal",
      `Locate the authoritative ${benchmarkCase.expectedOwner} owner and its execution flow`,
      "--limit",
      String(TOP_K),
    ],
    { encoding: "utf8" }
  );
  const result = JSON.parse(output);
  const candidates = rankImplementationCandidates(result);
  const rankedSymbols = candidates.map(symbolKey);
  const anchor = benchmarkCase.anchors.find((candidate) => rankedSymbols.includes(candidate));
  const ownerHit = candidates.find((symbol) =>
    benchmarkCase.ownerPrefixes.some((prefix) => symbol.filePath.startsWith(prefix))
  );
  return { ...benchmarkCase, anchor, ownerHit, rankedSymbols };
};

const results = AGENT_NAVIGATION_CASES.map(runCase);
const hits = results.filter((result) => result.ownerHit).length;
const score = hits / results.length;

for (const result of results) {
  const status = result.ownerHit ? "PASS" : "MISS";
  const evidence =
    (result.ownerHit ? symbolKey(result.ownerHit) : result.rankedSymbols.slice(0, TOP_K).join(", ") || "no result");
  console.log(`${status} ${result.id}: ${evidence}`);
}

console.log(`Agent navigation Top-${TOP_K}: ${hits}/${results.length} (${Math.round(score * 100)}%)`);
if (score < TARGET_SCORE) {
  console.log(
    `Diagnostic below ${Math.round(TARGET_SCORE * 100)}% target; use source and AST evidence to resolve misses.`
  );
}
