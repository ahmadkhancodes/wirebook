import type { EndUser, HealthEvent, HealthStatus } from "@/lib/qbwc/types";
import { evaluate } from "./evaluate";

export const STATUS_LABEL: Record<HealthStatus, string> = { connected: "Connected", asleep: "Asleep", broken: "Broken", pending: "Pending" };
export const STATUS_HELP: Record<HealthStatus, string> = {
  connected: "The Web Connector is polling and requests run.",
  asleep: "No poll for a while. Usually the computer is off or asleep. It recovers by itself on the next poll.",
  broken: "The connection failed or has been silent for days. Send a reconnect link.",
  pending: "Waiting for the first sync. Share the connect link with your customer.",
};

/** Status as of now: the stored one, moved forward by the same rule the health-tick job applies (so the list is right between ticks). */
export const liveStatus = (u: EndUser, now = new Date()): HealthStatus => evaluate(u, now)?.status ?? u.status;

export interface EndUserView {
  id: string;
  externalId: string | null;
  companyName: string | null;
  status: HealthStatus;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string | null;
  qbVersion: string | null;
}

const iso = (d?: Date) => (d ? new Date(d).toISOString() : null);

export function endUserView(u: EndUser, now = new Date()): EndUserView {
  return {
    id: u.id, externalId: u.externalId ?? null, companyName: u.companyName ?? null, status: liveStatus(u, now),
    lastPollAt: iso(u.lastPollAt), lastSuccessAt: iso(u.lastSuccessAt), lastError: u.lastError ?? null, createdAt: iso(u.createdAt), qbVersion: u.qbVersion ?? null,
  };
}

export interface HealthEventView { id: string; at: string; status: HealthStatus; reason: string }
export const eventView = (e: HealthEvent): HealthEventView => ({ id: e.id, at: new Date(e.at).toISOString(), status: e.status, reason: e.reason });

export const projectOf = (orgId: string, env: string | null | undefined) => `${orgId}__${env === "production" ? "production" : "test"}`;
export const ownsUser = (orgId: string, u: EndUser) => u.projectId === `${orgId}__test` || u.projectId === `${orgId}__production`;
