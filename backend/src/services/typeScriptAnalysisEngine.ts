export type TypeScriptAnalysisEngineStatus = {
  enabled: true;
  engine: "typescript";
  connected: true;
  lastAnalysisAt: string | null;
  engines: {
    indicators: "active";
    multiTimeframe: "active";
    backtesting: "active";
    risk: "active";
  };
  paperTradingOnly: true;
  realTradingEnabled: false;
};

let lastAnalysisAt: string | null = null;

export function markTypeScriptAnalysisRun() {
  lastAnalysisAt = new Date().toISOString();
}

export function getTypeScriptAnalysisEngineStatus(): TypeScriptAnalysisEngineStatus {
  return {
    enabled: true,
    engine: "typescript",
    connected: true,
    lastAnalysisAt,
    engines: {
      indicators: "active",
      multiTimeframe: "active",
      backtesting: "active",
      risk: "active"
    },
    paperTradingOnly: true,
    realTradingEnabled: false
  };
}
