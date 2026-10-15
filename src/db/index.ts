import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/subletka", { max: 10 });
globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
