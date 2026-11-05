import { Badge } from "@/components/ui/states";
import { STATUS_LABEL } from "@/lib/health/view";
import type { HealthStatus } from "@/lib/qbwc";

const TONE = { connected: "success", asleep: "warning", broken: "danger", pending: "info" } as const;

/** Status is always text plus tone, never colour alone. */
export function StatusBadge({ status }: { status: HealthStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
