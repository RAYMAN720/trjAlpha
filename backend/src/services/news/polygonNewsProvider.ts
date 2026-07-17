import { RssNewsProvider } from "./rssNewsProvider.js";

export class PolygonNewsProvider extends RssNewsProvider {
  name = process.env.POLYGON_API_KEY ? "polygon-configured-fallback" : "polygon-missing-key-fallback";
}

export const polygonNewsProvider = new PolygonNewsProvider();
