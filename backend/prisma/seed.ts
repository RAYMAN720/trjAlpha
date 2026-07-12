import { PrismaClient } from "@prisma/client";
import { mockStocks } from "../src/data/mockStocks.js";
import { runMarketScan } from "../src/services/scannerService.js";
import { generateResearchReport } from "../src/services/aiService.js";
import { ensureAutomationJobs } from "../src/services/automationService.js";
import { calculateStrategyPerformance } from "../src/services/learningService.js";
import { generateTradePlan } from "../src/services/tradePlanService.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: "demo@tradepilot.local" },
    update: {
      demoCapital: 500,
      riskPerTradePercent: 1,
      maxOpenTrades: 5,
      maxDailyLossPercent: 3,
      beginnerMode: true,
      autoPaperTrading: true,
      realTradingEnabled: false
    },
    create: {
      name: "Demo User",
      email: "demo@tradepilot.local",
      demoCapital: 500,
      riskPerTradePercent: 1,
      maxOpenTrades: 5,
      maxDailyLossPercent: 3,
      beginnerMode: true,
      autoPaperTrading: true,
      realTradingEnabled: false
    }
  });

  for (const stock of mockStocks) {
    await prisma.stock.upsert({
      where: { ticker: stock.ticker },
      update: {
        companyName: stock.companyName,
        sector: stock.sector,
        industry: stock.industry,
        marketCap: stock.marketCap,
        price: stock.price,
        previousClose: stock.previousClose,
        volume: stock.volume,
        avgVolume: stock.avgVolume,
        relativeVolume: Number((stock.volume / stock.avgVolume).toFixed(2)),
        dailyChangePercent: stock.dailyChangePercent
      },
      create: {
        ticker: stock.ticker,
        companyName: stock.companyName,
        sector: stock.sector,
        industry: stock.industry,
        marketCap: stock.marketCap,
        price: stock.price,
        previousClose: stock.previousClose,
        volume: stock.volume,
        avgVolume: stock.avgVolume,
        relativeVolume: Number((stock.volume / stock.avgVolume).toFixed(2)),
        dailyChangePercent: stock.dailyChangePercent
      }
    });
  }

  const scan = await runMarketScan({ minScore: 55 });
  const topSignals = scan.signals.slice(0, 10);

  for (const signal of topSignals.slice(0, 4)) {
    const stock = mockStocks.find((item) => item.ticker === signal.ticker);
    if (!stock) continue;

    const report = await generateResearchReport(stock, signal);
    await prisma.researchReport.create({
      data: {
        ticker: report.ticker,
        companyName: report.companyName,
        summary: report.summary,
        whyDetected: report.whyDetected,
        bullCase: report.bullCase,
        bearCase: report.bearCase,
        risks: report.risks,
        fundamentals: report.fundamentals,
        valuationComment: report.valuationComment,
        technicalPicture: report.technicalPicture,
        catalysts: report.catalysts,
        aiScore: report.aiScore,
        confidence: report.confidence,
        riskLevel: report.riskLevel,
        decision: report.decision,
        sourcesJson: JSON.stringify(report.sources)
      }
    });

    await prisma.aIPrediction.create({
      data: {
        ticker: report.ticker,
        signalType: signal.signalType,
        sector: stock.sector,
        predictedScore: report.aiScore,
        confidence: report.confidence,
        decision: report.decision,
        riskLevel: report.riskLevel,
        entryPrice: stock.price,
        oneDayReturn: Number((((stock.ticker.charCodeAt(0) % 9) - 3) * 0.7).toFixed(2)),
        outcomeStatus: "1D Checked",
        checkedAt: new Date()
      }
    });
  }

  for (const signal of topSignals.slice(0, 3)) {
    const stock = mockStocks.find((item) => item.ticker === signal.ticker);
    await prisma.watchlistItem.upsert({
      where: { ticker: signal.ticker },
      update: {
        companyName: stock?.companyName ?? signal.ticker,
        score: signal.score,
        riskLevel: signal.riskLevel,
        decision: signal.decision,
        notes: "Seed watchlist item from latest market scan."
      },
      create: {
        ticker: signal.ticker,
        companyName: stock?.companyName ?? signal.ticker,
        score: signal.score,
        riskLevel: signal.riskLevel,
        decision: signal.decision,
        notes: "Seed watchlist item from latest market scan."
      }
    });
  }

  const planOne = await generateTradePlan({
    ticker: "NVDA",
    currentPrice: 128.44,
    aiScore: 82,
    riskLevel: "Medium",
    dailyChangePercent: 5.39
  });
  const planTwo = await generateTradePlan({
    ticker: "AMD",
    currentPrice: 164.9,
    aiScore: 76,
    riskLevel: "Medium",
    dailyChangePercent: 6.94
  });

  await prisma.paperTrade.createMany({
    data: [
      {
        ticker: "NVDA",
        entryPrice: planOne.entryPrice,
        currentPrice: 130.12,
        quantity: Math.max(1, planOne.quantity),
        positionSize: Math.max(planOne.entryPrice, planOne.positionSize),
        stopLoss: planOne.stopLoss,
        takeProfit: planOne.takeProfit,
        profitLoss: 1.68,
        profitLossPercent: 1.31,
        status: "Open",
        tradePlanId: planOne.id
      },
      {
        ticker: "AMD",
        entryPrice: planTwo.entryPrice,
        currentPrice: 162.4,
        quantity: Math.max(1, planTwo.quantity),
        positionSize: Math.max(planTwo.entryPrice, planTwo.positionSize),
        stopLoss: planTwo.stopLoss,
        takeProfit: planTwo.takeProfit,
        profitLoss: -2.5,
        profitLossPercent: -1.52,
        status: "Open",
        tradePlanId: planTwo.id
      }
    ]
  });

  await prisma.journalEntry.createMany({
    data: [
      {
        ticker: "PLTR",
        decision: "Watch",
        entryReason: "Strong AI software momentum but valuation risk looked elevated.",
        exitReason: "No trade opened.",
        emotion: "Curious but patient",
        mistake: "Almost chased the first green candle.",
        lesson: "Wait for pullback or consolidation after a large move.",
        aiReview: "You avoided chasing after a large move. Next time define the exact pullback level before the session starts.",
        result: "No trade"
      },
      {
        ticker: "TSLA",
        decision: "Demo trade",
        entryReason: "High-volume breakout with defined stop below intraday support.",
        exitReason: "Still open",
        emotion: "Confident",
        mistake: "Position size was close to max risk.",
        lesson: "High-volatility stocks need smaller size even when the setup is attractive.",
        aiReview: "The entry had a thesis and stop, but volatility required more conservative sizing.",
        result: "Open"
      }
    ]
  });

  await prisma.alert.create({
    data: {
      ticker: "NVDA",
      alertType: "Price",
      targetPrice: 124,
      message: "Review NVDA if it pulls back near the planned risk zone.",
      severity: "Info"
    }
  });

  await prisma.agentRun.createMany({
    data: [
      {
        agentName: "marketScannerAgent",
        jobName: "marketScanJob",
        status: "Success",
        inputTicker: "SMCI",
        inputJson: JSON.stringify({ ticker: "SMCI" }),
        outputSummary: "SMCI flagged for high-volume momentum breakout.",
        outputJson: JSON.stringify({ ticker: "SMCI", opportunityScore: 81 })
      },
      {
        agentName: "riskAgent",
        jobName: "paperTradeUpdateJob",
        status: "Success",
        inputTicker: "IONQ",
        inputJson: JSON.stringify({ ticker: "IONQ" }),
        outputSummary: "IONQ blocked because risk level is High.",
        outputJson: JSON.stringify({ ticker: "IONQ", blocked: true })
      },
      {
        agentName: "learningAgent",
        jobName: "dailyReviewJob",
        status: "Success",
        inputTicker: null,
        inputJson: JSON.stringify({ scope: "global" }),
        outputSummary: "The app is collecting enough outcomes to compare signal types.",
        outputJson: JSON.stringify({ category: "performance", confidence: 45 })
      }
    ]
  });

  await prisma.paperTradeEvent.createMany({
    data: [
      {
        paperTradeId: null,
        ticker: "NVDA",
        eventType: "paper trade opened",
        price: planOne.entryPrice,
        profitLoss: 0,
        message: "NVDA seed paper trade opened for simulation."
      },
      {
        paperTradeId: null,
        ticker: "AMD",
        eventType: "paper trade opened",
        price: planTwo.entryPrice,
        profitLoss: 0,
        message: "AMD seed paper trade opened for simulation."
      }
    ]
  });

  await prisma.riskEvent.create({
    data: {
      ticker: "RGTI",
      rule: "auto-paper-trade-guardrails",
      severity: "High",
      blocked: true,
      message: "RGTI blocked because one-day move exceeded the chasing guardrail.",
      contextJson: JSON.stringify({ dailyChangePercent: 24.12, relativeVolume: 4.44 })
    }
  });

  await ensureAutomationJobs();
  await calculateStrategyPerformance("seed");
}

main()
  .then(async () => {
    console.log("Seed completed.");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
