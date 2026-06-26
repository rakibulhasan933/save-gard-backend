import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

export const queryClient = postgres(connectionString, {
  ssl: "require",
  max: 10,
  prepare: false
});

export const db = drizzle(queryClient, { schema });
