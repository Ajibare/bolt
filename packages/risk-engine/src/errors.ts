export class RiskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskError";
  }
}

export class InvalidRiskConfigError extends RiskError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRiskConfigError";
  }
}

export class InvalidOrderRiskError extends RiskError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderRiskError";
  }
}
