export type BrokerOrderRequest = {
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  timeInForce: string;
  quantity?: string;
  notional?: string;
  limitPrice?: string;
  stopPrice?: string;
};

export type BrokerOrderResult = {
  brokerOrderId: string;
  status: string;
  submittedAt?: string;
  raw: unknown;
};

export type BrokerOrderSnapshot = BrokerOrderResult & {
  clientOrderId?: string;
  symbol?: string;
  side?: string;
  type?: string;
  quantity?: string;
  filledQuantity?: string;
};

export type BrokerAccountSnapshot = {
  externalAccountId?: string;
  status: string;
  currency: string;
  cash: string;
  buyingPower: string;
  portfolioValue: string;
};

export type BrokerPositionSnapshot = {
  symbol: string;
  quantity: string;
  averageCost: string;
  marketPrice: string;
  marketValue: string;
  unrealizedPnL: string;
};

export interface BrokerAdapter {
  getAccount(): Promise<BrokerAccountSnapshot>;
  getPositions(): Promise<BrokerPositionSnapshot[]>;
  submitOrder(order: BrokerOrderRequest): Promise<BrokerOrderResult>;
  cancelOrder(brokerOrderId: string): Promise<void>;
  getOrder(brokerOrderId: string): Promise<BrokerOrderResult>;
  listOrders(status?: "open" | "closed" | "all"): Promise<BrokerOrderSnapshot[]>;
}
