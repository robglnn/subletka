import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings } from "@/db/schema";
import { bearerMatches } from "@/lib/bearer";

export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/listings/[id]">) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.DEPLOY_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const deleted = await db
    .delete(listings)
    .where(and(eq(listings.id, decodeURIComponent(id)), eq(listings.status, "removed")))
    .returning({ id: listings.id });
  return Response.json({ deleted: deleted.map((d) => d.id) }, { status: deleted.length ? 200 : 404 });
}
