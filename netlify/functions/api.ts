import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { businesses, bookings, profiles } from "../../db/schema.js";
import { bookingDate, bookingTime, field, RequestError, requireValue, services, transitions } from "../../db/validation.js";

type Items = Record<string, Record<string, unknown>>;

function addItem(collection: Items, userId: string, id: string, value: unknown) {
  collection[userId] ??= {};
  collection[userId][id] = value;
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);
    const resource = url.pathname.split("/").pop();
    const currentUser = await getUser();
    const isAdmin = currentUser?.roles?.includes("admin") ?? false;

    if (request.method !== "GET") {
      requireValue(request.method === "POST" || request.method === "DELETE", "Method not allowed.", 405);
      requireValue(currentUser, "Sign in to continue.", 401);
      requireValue(request.headers.get("X-Requested-With") === "Nearby", "Invalid request.", 403);
      const origin = request.headers.get("Origin");
      requireValue(!origin || origin === url.origin, "Invalid request origin.", 403);
      requireValue(request.headers.get("Content-Type")?.startsWith("application/json"), "JSON is required.", 415);
    }

    if (currentUser) {
      await db.insert(profiles).values({
        id: currentUser.id,
        name: (currentUser.name || "Customer").slice(0, 100),
        email: currentUser.email || "",
      }).onConflictDoUpdate({ target: profiles.id, set: { name: (currentUser.name || "Customer").slice(0, 100), email: currentUser.email || "" } });
    }

    if (request.method === "GET" && resource === "data") {
      const raw = await db.select().from(businesses);
      const allBookings = await db.select().from(bookings);
      const groupedBookings: Items = {};
      const responses: Items = {};
      const reviews: Items = {};
      const visibleProfiles = new Set<string>();

      for (const booking of allBookings) {
        const business = raw.find((item) => item.id === booking.businessId);
        const visible = Boolean(currentUser && (isAdmin || booking.clientId === currentUser.id || business?.ownerId === currentUser.id));
        const clientId = visible ? booking.clientId : "public";
        const active = booking.status === "pending" || booking.status === "confirmed";
        addItem(groupedBookings, clientId, booking.id, {
          bid: booking.businessId,
          svc: visible ? booking.service : "",
          price: visible ? booking.price / 100 : 0,
          date: visible || active ? booking.date : "",
          time: visible || active ? booking.time : "",
          status: booking.status,
          cancelled: booking.status === "cancelled",
          created: visible ? booking.createdAt.getTime() : 0,
        });
        if (business?.ownerId) addItem(responses, business.ownerId, `${clientId}~${booking.id}`, { status: booking.status });
        if (booking.stars && ["completed", "late"].includes(booking.status)) addItem(reviews, clientId, booking.id, { stars: booking.stars, text: booking.review || "" });
        if (visible) visibleProfiles.add(booking.clientId);
      }

      raw.forEach((business) => { if (business.ownerId) visibleProfiles.add(business.ownerId); });
      if (currentUser) visibleProfiles.add(currentUser.id);
      const people = visibleProfiles.size ? await db.select().from(profiles).where(inArray(profiles.id, [...visibleProfiles])) : [];
      return json({
        raw,
        bookings: groupedBookings,
        responses,
        reviews,
        listings: {},
        profiles: Object.fromEntries(people.map((person) => [person.id, { name: person.name }])),
        me: currentUser ? { id: currentUser.id, name: currentUser.name || "Customer", email: currentUser.email } : { id: null },
        isAdmin,
      });
    }

    if (request.method === "GET" && resource === "people") {
      requireValue(isAdmin, "Administrator access is required.", 403);
      const query = (url.searchParams.get("q") || "").trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
      if (query.length < 2) return json([]);
      return json(await db.select().from(profiles).where(or(ilike(profiles.name, `%${query}%`), ilike(profiles.email, `%${query}%`))).limit(20));
    }

    requireValue(request.method !== "GET", "Not found.", 404);
    requireValue(currentUser, "Sign in to continue.", 401);
    const text = await request.text();
    requireValue(text.length <= 16000, "Request is too large.", 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new RequestError("Invalid JSON."); }
    requireValue(body && typeof body === "object" && !Array.isArray(body), "Invalid request.");
    const id = field(body.id, "record ID", 100, true);
    requireValue(/^[a-zA-Z0-9~_-]+$/.test(id), "Invalid record ID.");
    const value = body.value ?? {};
    requireValue(typeof value === "object" && !Array.isArray(value), "Invalid record.");

    if (resource === "businesses" || resource === "listings") {
      const [existing] = await db.select().from(businesses).where(eq(businesses.id, id));
      requireValue(isAdmin || (resource === "listings" && existing?.ownerId === currentUser.id), "You cannot edit this business.", 403);
      if (request.method === "DELETE") {
        requireValue(isAdmin, "Administrator access is required.", 403);
        await db.delete(businesses).where(eq(businesses.id, id));
        return json({ ok: true });
      }
      const input = { ...existing, ...value };
      const ownerId = isAdmin ? (input.ownerId || null) : existing?.ownerId;
      if (ownerId) {
        requireValue(typeof ownerId === "string", "Invalid owner.");
        const [owner] = await db.select().from(profiles).where(eq(profiles.id, ownerId));
        requireValue(owner, "The owner must sign in to Nearby first.");
      }
      const business = {
        id,
        name: field(input.name, "business name", 120, true),
        cat: field(input.cat, "category", 60, true),
        em: field(input.em, "business symbol", 16),
        addr: field(input.addr, "address", 300),
        hours: field(input.hours, "opening hours", 200),
        about: field(input.about, "description", 2000),
        services: services(input.services),
        ownerId: ownerId ?? null,
      };
      await db.insert(businesses).values(business).onConflictDoUpdate({ target: businesses.id, set: business });
      return json({ ok: true });
    }

    if (resource === "bookings" && request.method === "POST" && !value.cancelled) {
      const bid = field(value.bid, "business ID", 100, true);
      const [business] = await db.select().from(businesses).where(eq(businesses.id, bid));
      requireValue(business, "This business is no longer available.", 404);
      const service = business.services.find((item) => item.n === value.svc);
      requireValue(service, "Choose a service from this business.");
      const now = new Date();
      const date = bookingDate(value.date, now);
      const time = bookingTime(value.time, date, now);
      await db.insert(bookings).values({ id, clientId: currentUser.id, businessId: bid, service: service.n, price: Math.round(service.price * 100), date, time });
      return json({ ok: true }, 201);
    }

    const bookingId = resource === "responses" ? id.split("~").pop()! : id;
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    requireValue(booking, "This booking is no longer available.", 404);

    if (resource === "bookings") {
      if (request.method === "DELETE") {
        requireValue(isAdmin, "Administrator access is required.", 403);
        await db.delete(bookings).where(eq(bookings.id, id));
      } else {
        requireValue(booking.clientId === currentUser.id, "You cannot cancel this booking.", 403);
        const updated = await db.update(bookings).set({ status: "cancelled" }).where(and(eq(bookings.id, id), inArray(bookings.status, ["pending", "confirmed"]))).returning();
        requireValue(updated.length, "Only pending or confirmed bookings can be cancelled.", 409);
      }
      return json({ ok: true });
    }

    if (resource === "reviews") {
      if (request.method === "DELETE") {
        requireValue(isAdmin, "Administrator access is required.", 403);
        await db.update(bookings).set({ stars: null, review: null }).where(eq(bookings.id, id));
      } else {
        requireValue(booking.clientId === currentUser.id, "You cannot review this booking.", 403);
        requireValue(["completed", "late"].includes(booking.status) && booking.stars === null, "Only completed, unrated visits can be reviewed.", 409);
        requireValue(Number.isInteger(value.stars) && value.stars >= 1 && value.stars <= 5, "Choose 1–5 stars.");
        const updated = await db.update(bookings).set({ stars: value.stars, review: field(value.text ?? "", "review", 500) }).where(and(eq(bookings.id, id), isNull(bookings.stars), inArray(bookings.status, ["completed", "late"]))).returning();
        requireValue(updated.length, "This visit has already been rated.", 409);
      }
      return json({ ok: true });
    }

    if (resource === "responses") {
      requireValue(request.method === "POST", "Method not allowed.", 405);
      const [business] = await db.select().from(businesses).where(eq(businesses.id, booking.businessId));
      requireValue(isAdmin || business?.ownerId === currentUser.id, "You cannot manage this booking.", 403);
      requireValue(transitions[booking.status]?.includes(value.status), "This booking status cannot be changed that way.", 409);
      const updated = await db.update(bookings).set({ status: value.status }).where(and(eq(bookings.id, bookingId), eq(bookings.status, booking.status))).returning();
      requireValue(updated.length, "The booking changed. Refresh and try again.", 409);
      return json({ ok: true });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === "23505" || cause.cause?.code === "23505") return json({ error: "That slot is already booked. Choose another time." }, 409);
    return json({ error: "The booking service is temporarily unavailable. Please try again." }, 503);
  }
};

export const config: Config = {
  path: ["/api/data", "/api/people", "/api/businesses", "/api/listings", "/api/bookings", "/api/reviews", "/api/responses"],
};
