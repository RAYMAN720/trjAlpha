import { RssNewsProvider } from "./rssNewsProvider.js";

export class CryptoNewsProvider extends RssNewsProvider {
  name = "crypto-news-fallback";
}

export const cryptoNewsProvider = new CryptoNewsProvider();
