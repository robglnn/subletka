import { eq } from "drizzle-orm";
import { db } from "@/db";
import { listings } from "@/db/schema";
import { bearerMatches } from "@/lib/bearer";

export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.DEPLOY_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const removed = await db
    .select({ id: listings.id, origin: listings.origin, title: listings.title, createdAt: listings.createdAt })
    .from(listings)
    .where(eq(listings.status, "removed"));
  return Response.json({ removed });
}
