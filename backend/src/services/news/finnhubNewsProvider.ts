import { RssNewsProvider } from "./rssNewsProvider.js";

export class FinnhubNewsProvider extends RssNewsProvider {
  name = process.env.FINNHUB_API_KEY ? "finnhub-configured-fallback" : "finnhub-missing-key-fallback";
}

export const finnhubNewsProvider = new FinnhubNewsProvider();
