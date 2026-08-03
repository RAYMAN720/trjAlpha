import type { BrokerAccount } from "@prisma/client";
import { decryptCredential } from "../../services/security/credentialVault.js";
import type { BrokerAccountSnapshot, BrokerAdapter, BrokerOrderRequest, BrokerOrderResult, BrokerOrderSnapshot, BrokerPositionSnapshot } from "./brokerAdapter.js";

type AlpacaCredential = { keyId: string; secretKey: string };

export class AlpacaAdapter implements BrokerAdapter {
  private readonly credential: AlpacaCredential;
  private readonly baseUrl: string;

  constructor(private readonly account: BrokerAccount) {
    if (!account.encryptedCredential) throw new Error("Broker credentials are not configured for this account.");
    this.credential = decryptCredential<AlpacaCredential>(account.encryptedCredential);
    this.baseUrl = account.environment === "live" ? "https://api.alpaca.markets/v2" : "https://paper-api.alpaca.markets/v2";
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "APCA-API-KEY-ID": this.credential.keyId,
        "APCA-API-SECRET-KEY": this.credential.secretKey,
        ...(init.headers ?? {})
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data.message ?? data.error ?? `Alpaca returned ${response.status}.`);
    return data as T;
  }

  async getAccount(): Promise<BrokerAccountSnapshot> {
    const data = await this.request<Record<string, string>>("/account");
    return {
      externalAccountId: data.account_number,
      status: data.status ?? "UNKNOWN",
      currency: data.currency ?? "USD",
      cash: data.cash ?? "0",
      buyingPower: data.buying_power ?? "0",
      portfolioValue: data.portfolio_value ?? "0"
    };
  }

  async getPositions(): Promise<BrokerPositionSnapshot[]> {
    const rows = await this.request<Array<Record<string, string>>>("/positions");
    return rows.map((row) => ({
      symbol: row.symbol,
      quantity: row.qty ?? "0",
      averageCost: row.avg_entry_price ?? "0",
      marketPrice: row.current_price ?? "0",
      marketValue: row.market_value ?? "0",
      unrealizedPnL: row.unrealized_pl ?? "0"
    }));
  }

  async submitOrder(order: BrokerOrderRequest): Promise<BrokerOrderResult> {
    const body: Record<string, string> = {
      client_order_id: order.clientOrderId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      time_in_force: order.timeInForce.toLowerCase()
    };
    if (order.quantity) body.qty = order.quantity;
    if (order.notional) body.notional = order.notional;
    if (order.limitPrice) body.limit_price = order.limitPrice;
    if (order.stopPrice) body.stop_price = order.stopPrice;
    const data = await this.request<Record<string, unknown>>("/orders", { method: "POST", body: JSON.stringify(body) });
    return {
      brokerOrderId: String(data.id ?? ""),
      status: String(data.status ?? "submitted").toUpperCase(),
      submittedAt: data.submitted_at ? String(data.submitted_at) : undefined,
      raw: data
    };
  }

  async cancelOrder(brokerOrderId: string) {
    await this.request(`/orders/${encodeURIComponent(brokerOrderId)}`, { method: "DELETE" });
  }

  async getOrder(brokerOrderId: string): Promise<BrokerOrderResult> {
    const data = await this.request<Record<string, unknown>>(`/orders/${encodeURIComponent(brokerOrderId)}`);
    return {
      brokerOrderId: String(data.id ?? brokerOrderId),
      status: String(data.status ?? "UNKNOWN").toUpperCase(),
      submittedAt: data.submitted_at ? String(data.submitted_at) : undefined,
      raw: data
    };
  }
  async listOrders(status: "open" | "closed" | "all" = "open"): Promise<BrokerOrderSnapshot[]> {
    const rows = await this.request<Array<Record<string, unknown>>>(`/orders?status=${status}&limit=500&direction=desc&nested=false`);
    return rows.map((data) => ({
      brokerOrderId: String(data.id ?? ""),
      clientOrderId: data.client_order_id ? String(data.client_order_id) : undefined,
      symbol: data.symbol ? String(data.symbol) : undefined,
      side: data.side ? String(data.side).toUpperCase() : undefined,
      type: data.type ? String(data.type).toUpperCase() : undefined,
      quantity: data.qty ? String(data.qty) : undefined,
      filledQuantity: data.filled_qty ? String(data.filled_qty) : undefined,
      status: String(data.status ?? "UNKNOWN").toUpperCase(),
      submittedAt: data.submitted_at ? String(data.submitted_at) : undefined,
      raw: data
    }));
  }

}
