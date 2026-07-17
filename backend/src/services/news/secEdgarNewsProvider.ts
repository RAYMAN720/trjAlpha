import { RssNewsProvider } from "./rssNewsProvider.js";

export class SecEdgarNewsProvider extends RssNewsProvider {
  name = "sec-edgar-fallback";
}

export const secEdgarNewsProvider = new SecEdgarNewsProvider();
