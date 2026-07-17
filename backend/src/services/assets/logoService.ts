import { marketDataProvider, marketForAssetType, normalizeAssetType, type AssetType } from "../marketDataProvider.js";

export type AssetLogo = {
  assetType: AssetType;
  symbol: string;
  name: string;
  logoUrl: string | null;
  provider: "clearbit" | "coingecko-static" | "local-fallback";
  fallbackText: string;
  fallbackColor: string;
  dataQuality: "LIVE DATA" | "CACHED DATA" | "MOCK DATA";
};

const stockDomains: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  NVDA: "nvidia.com",
  TSLA: "tesla.com",
  AMD: "amd.com",
  PLTR: "palantir.com",
  AMZN: "amazon.com",
  GOOGL: "abc.xyz",
  META: "meta.com",
  NFLX: "netflix.com",
  AVGO: "broadcom.com",
  CRM: "salesforce.com",
  ORCL: "oracle.com",
  JPM: "jpmorganchase.com",
  V: "visa.com",
  MA: "mastercard.com",
  SPY: "ssga.com",
  QQQ: "invesco.com",
  IWM: "ishares.com"
};

const cryptoLogos: Record<string, { name: string; logoUrl: string }> = {
  BTC: { name: "Bitcoin", logoUrl: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png" },
  ETH: { name: "Ethereum", logoUrl: "https://assets.coingecko.com/coins/images/279/large/ethereum.png" },
  SOL: { name: "Solana", logoUrl: "https://assets.coingecko.com/coins/images/4128/large/solana.png" },
  BNB: { name: "BNB", logoUrl: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png" },
  XRP: { name: "XRP", logoUrl: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png" },
  DOGE: { name: "Dogecoin", logoUrl: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png" },
  ADA: { name: "Cardano", logoUrl: "https://assets.coingecko.com/coins/images/975/large/cardano.png" },
  AVAX: { name: "Avalanche", logoUrl: "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png" },
  LINK: { name: "Chainlink", logoUrl: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png" },
  AAVE: { name: "Aave", logoUrl: "https://assets.coingecko.com/coins/images/12645/large/AAVE.png" },
  MATIC: { name: "Polygon", logoUrl: "https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png" },
  DOT: { name: "Polkadot", logoUrl: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png" }
};

function fallbackColor(symbol: string) {
  const colors = ["#33d69f", "#f4c430", "#4f8cff", "#d96cff", "#ff5b5b", "#6ee7ff"];
  const index = symbol.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function initials(symbol: string) {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, clean.length > 3 ? 2 : 3) || "?";
}

export async function getAssetLogo(assetTypeInput: string, symbolInput: string): Promise<AssetLogo> {
  const assetType = normalizeAssetType(assetTypeInput);
  const symbol = symbolInput.toUpperCase();
  const fallbackText = initials(symbol);
  const base = {
    assetType,
    symbol,
    fallbackText,
    fallbackColor: fallbackColor(symbol)
  };

  if (assetType === "crypto") {
    const mapped = cryptoLogos[symbol];
    const stock = await marketDataProvider.getStock(symbol, "crypto").catch(() => null);
    return {
      ...base,
      name: stock?.companyName ?? mapped?.name ?? symbol,
      logoUrl: mapped?.logoUrl ?? null,
      provider: mapped ? "coingecko-static" : "local-fallback",
      dataQuality: mapped ? "CACHED DATA" : "MOCK DATA"
    };
  }

  const stock = await marketDataProvider.getStock(symbol, marketForAssetType(assetType)).catch(() => null);
  const domain = stockDomains[symbol];
  return {
    ...base,
    name: stock?.companyName ?? symbol,
    logoUrl: domain ? `https://logo.clearbit.com/${domain}` : null,
    provider: domain ? "clearbit" : "local-fallback",
    dataQuality: domain ? "CACHED DATA" : "MOCK DATA"
  };
}

export async function getAssetProfile(assetTypeInput: string, symbolInput: string) {
  const assetType = normalizeAssetType(assetTypeInput);
  const market = marketForAssetType(assetType);
  const symbol = symbolInput.toUpperCase();
  const [asset, logo] = await Promise.all([
    marketDataProvider.getStock(symbol, market).catch(() => null),
    getAssetLogo(assetType, symbol)
  ]);

  return {
    assetType,
    symbol,
    ticker: symbol,
    name: asset?.companyName ?? logo.name,
    sector: asset?.sector ?? (assetType === "crypto" ? "Crypto" : "Unknown"),
    industry: asset?.industry ?? (assetType === "crypto" ? "Digital assets" : "Unknown"),
    price: asset?.price ?? null,
    dailyChangePercent: asset?.dailyChangePercent ?? null,
    marketCap: asset?.marketCap ?? null,
    volume: asset?.volume ?? null,
    dataQuality: asset?.quoteSource ? "LIVE DATA" : "MOCK DATA",
    logo
  };
}
