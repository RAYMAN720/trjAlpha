import { onDomainEvent } from "./eventBus.js";
import { prisma } from "../utils/prisma.js";

let registered = false;

export function registerDomainEventHandlers() {
  if (registered) return;
  registered = true;

  onDomainEvent("ORDER_REJECTED", async (event) => {
    if (!event.userId) return;
    await prisma.notification.create({
      data: {
        userId: event.userId,
        type: "ORDER_REJECTED",
        title: "Order blocked by risk controls",
        body: "TradePilot did not submit this order because one or more pre-trade controls failed.",
        severity: "WARNING",
        metadataJson: JSON.stringify({ orderId: event.aggregateId, payload: event.payload })
      }
    });
  });

  onDomainEvent("ORDER_SUBMISSION_FAILED", async (event) => {
    if (!event.userId) return;
    await prisma.notification.create({
      data: {
        userId: event.userId,
        type: "ORDER_SUBMISSION_FAILED",
        title: "Broker submission failed",
        body: "The broker did not accept the order. No retry is performed without an explicit idempotent request.",
        severity: "ERROR",
        metadataJson: JSON.stringify({ orderId: event.aggregateId, payload: event.payload })
      }
    });
  });

  onDomainEvent("ORDER_FILLED", async (event) => {
    if (!event.userId) return;
    await prisma.notification.create({
      data: {
        userId: event.userId,
        type: "ORDER_FILLED",
        title: "Order filled",
        body: "A broker fill was reconciled and recorded in the immutable portfolio ledger.",
        severity: "INFO",
        metadataJson: JSON.stringify({ orderId: event.aggregateId, payload: event.payload })
      }
    });
  });
}
