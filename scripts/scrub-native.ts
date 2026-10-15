import postgres from "postgres";
import { scrubPersonal } from "../src/lib/scrub-personal";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1 });

async function main() {
  const rows = await sql<{ id: string; description: string | null; additional_costs: string | null }[]>`
    select id, description, additional_costs from listings where origin = 'native'`;
  let changed = 0;
  for (const r of rows) {
    const description = scrubPersonal(r.description);
    const additionalCosts = scrubPersonal(r.additional_costs);
    if (description === r.description && additionalCosts === r.additional_costs) continue;
    await sql`update listings set description = ${description}, additional_costs = ${additionalCosts}, updated_at = now() where id = ${r.id}`;
    changed++;
  }
  console.log(`native listings: ${rows.length}, scrubbed: ${changed}`);
  await sql.end();
}

main();
