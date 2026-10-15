import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { publicListingId } from "@/lib/listing-id";

const syncPublicIds = async (sql: postgres.Sql) => {
  const rows = await sql<{ id: string; origin: "imported" | "native" }[]>`select id, origin from listings`;
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const publicIds = rows.map((r) => publicListingId(r.id, r.origin));
  await sql`
    update listings set public_id = v.public_id
    from unnest(${ids}::text[], ${publicIds}::text[]) as v(id, public_id)
    where listings.id = v.id and listings.public_id is distinct from v.public_id`;
};

export async function runMigrations(url: string) {
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await syncPublicIds(sql);
  } finally {
    await sql.end();
  }
}
