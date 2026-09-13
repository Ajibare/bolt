export type ComponentStatus = "ok" | "degraded" | "down";

export interface HealthComponent {
  status: ComponentStatus;
  detail?: string;
}

export interface ServiceHealth {
  status: ComponentStatus;
  app: string;
  environment: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  components: Record<string, HealthComponent>;
}
