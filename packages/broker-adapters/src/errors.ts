export class BrokerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerError";
  }
}

export class InvalidOrderRequestError extends BrokerError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderRequestError";
  }
}

export class InsufficientBuyingPowerError extends BrokerError {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientBuyingPowerError";
  }
}

export class OrderNotFoundError extends BrokerError {
  constructor(orderId: string) {
    super(`Order "${orderId}" not found`);
    this.name = "OrderNotFoundError";
  }
}

export class InvalidStateTransitionError extends BrokerError {
  constructor(from: string, to: string) {
    super(`Invalid order state transition: ${from} -> ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}
