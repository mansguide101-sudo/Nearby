import type { Service } from "./schema.js";

export class RequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function requireValue(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new RequestError(message, status);
}

export function field(value: unknown, label: string, max: number, required = false): string {
  requireValue(typeof value === "string", `Invalid ${label}.`);
  const result = value.trim();
  requireValue(result.length <= max && (!required || result.length > 0), `Invalid ${label}.`);
  return result;
}

export function services(value: unknown): Service[] {
  requireValue(Array.isArray(value) && value.length > 0 && value.length <= 30, "Add between 1 and 30 services.");
  return value.map((item) => {
    requireValue(item && typeof item === "object", "Invalid service.");
    requireValue(Number.isInteger(item.min) && item.min >= 1 && item.min <= 480, "Service duration must be 1–480 minutes.");
    requireValue(typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 && item.price <= 100000, "Invalid service price.");
    return { n: field(item.n, "service name", 100, true), min: item.min, price: Math.round(item.price * 100) / 100 };
  });
}

export function bookingDate(value: unknown, now = new Date()): string {
  const result = field(value, "booking date", 10, true);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(result), "Invalid booking date.");
  const day = new Date(`${result}T00:00:00Z`);
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  requireValue(!Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === result && day >= start && day <= end, "Choose a date within the next seven days (UTC).");
  return result;
}

export function bookingTime(value: unknown, date: string, now = new Date()): string {
  const result = field(value, "booking time", 5, true);
  requireValue(/^(09|1[0-6]):00$/.test(result), "Choose an available hourly slot.");
  requireValue(new Date(`${date}T${result}:00Z`) > now, "That time has passed. Choose a future slot.");
  return result;
}

export const transitions: Record<string, string[]> = {
  pending: ["confirmed", "declined"],
  confirmed: ["completed", "late", "noshow"],
};
