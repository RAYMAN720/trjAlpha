import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const project = read("lean-engine/TradePilot.Algorithm/TradePilot.Algorithm.csproj");
const algorithm = read("lean-engine/TradePilot.Algorithm/TradePilotLeanAlgorithm.cs");
const dockerfile = read("lean-engine/Dockerfile");
const paper = JSON.parse(read("lean-engine/config/paper.template.json"));
const backtest = JSON.parse(read("lean-engine/config/backtest.template.json"));
const rootEnv = read(".env.example");
const gatewayEnv = read("lean-gateway/.env.example");

assert(project.includes("<TargetFramework>net10.0</TargetFramework>"), "LEAN algorithm must target .NET 10.");
assert(project.includes('QuantConnect.Algorithm" Version="2.5.17654"'), "Unexpected QuantConnect.Algorithm package version.");
assert(algorithm.includes("if (!LiveMode)"), "Backtest dates/cash must not override live-paper brokerage state.");
assert(algorithm.includes("SubmitOrResizeProtectiveOrders"), "Partial entry fills need immediate protective orders.");
assert(algorithm.includes("OrderStatus.PartiallyFilled"), "Partial fills must be handled explicitly.");
assert(algorithm.includes("public bool Closing { get; set; }"), "Position lifecycle needs an explicit closing state.");
assert(algorithm.includes("CancelIfOpen(state.EntryTicket"), "Exits must cancel outstanding entry orders.");
assert(algorithm.includes("state.ExitTicket = null;"), "Failed exit orders must support protection recovery.");
assert(algorithm.includes("liquid && trend && breakout && volume && notExtended && score >= _minimumScore"), "Configured strategy score must participate in entry approval.");
assert(dockerfile.includes("FROM quantconnect/lean:latest"), "The official LEAN image must remain the engine base.");
assert(dockerfile.includes("/out/TradePilot.Algorithm.dll"), "Only the custom algorithm assembly should be layered into LEAN.");
assert(!dockerfile.includes("COPY --from=algorithm-build /out/ /Lean"), "Do not overwrite LEAN runtime assemblies.");
assert(backtest.environment === "backtesting", "Backtest template environment is invalid.");
assert(paper["live-mode"] === true, "Paper template must use LEAN live mode.");
assert(paper["alpaca-paper-trading"] === true, "Alpaca must remain in paper mode.");
assert(paper["alpaca-environment"] === "paper", "Alpaca environment must remain paper.");
assert(paper["data-queue-handler"] === "QuantConnect.Brokerages.Alpaca.AlpacaBrokerage", "Alpaca data queue handler namespace is invalid.");
assert(rootEnv.includes("ALLOW_LIVE_BROKER_TRADING=false"), "Root environment example must disable live-money trading.");
assert(gatewayEnv.includes("ALLOW_LIVE_BROKER_TRADING=false"), "Gateway environment example must disable live-money trading.");
assert(gatewayEnv.includes("LEAN_EXECUTION_ENABLED=false"), "Gateway must default to dry-run mode.");
assert(gatewayEnv.includes("QUANTCONNECT_ORGANIZATION_ID="), "Gateway must expose official local brokerage credentials without populating them.");
assert(gatewayEnv.includes("LEAN_DOCKER_MEMORY=4g"), "LEAN containers need a default memory limit.");
assert(gatewayEnv.includes("LEAN_DOCKER_CPUS=2"), "LEAN containers need a default CPU limit.");

console.log("LEAN static configuration validation passed.");
