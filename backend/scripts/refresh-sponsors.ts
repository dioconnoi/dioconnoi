/**
 * Ingests the Home Office "Register of Worker and Temporary Worker licensed
 * sponsors" CSV into Postgres.
 *
 * Usage:
 *   tsx scripts/refresh-sponsors.ts --source <url-or-local-csv-path> [--snapshot-date YYYY-MM-DD]
 *
 * With no --source, falls back to the SPONSOR_REGISTER_CSV_URL env var,
 * which should point at the real gov.uk publication (its CSV download link
 * changes with every refresh, so keep this env var current — see
 * docs/SETUP.md). Intended to run on a schedule matching gov.uk's publish
 * cadence (the register is updated frequently, sometimes daily).
 *
 * Each run fully replaces the sponsors table contents inside a transaction
 * (TRUNCATE + bulk insert) and tags every row with the snapshot date, since
 * individual rows have no stable natural key across releases (an
 * organisation can appear multiple times for different routes).
 */
import "dotenv/config";
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import { Pool } from "pg";
import { env } from "../src/config/env";

const EXPECTED_HEADER = ["Organisation Name", "Town/City", "County", "Type & Rating", "Route"];

interface SponsorRow {
  organisationName: string;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
  route: string | null;
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

function nullIfBlank(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function openCsvStream(source: string): Promise<NodeJS.ReadableStream> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download sponsor CSV from ${source}: HTTP ${res.status}`);
    }
    const { Readable } = await import("stream");
    return Readable.fromWeb(res.body as any);
  }
  return createReadStream(source);
}

async function* parseRows(source: string): AsyncGenerator<SponsorRow> {
  const stream = await openCsvStream(source);
  const parser = stream.pipe(
    parse({
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }),
  );

  let headerChecked = false;
  for await (const record of parser as AsyncIterable<string[]>) {
    if (!headerChecked) {
      headerChecked = true;
      const header = record.map((h) => h.trim());
      const matches = EXPECTED_HEADER.every((col, i) => header[i] === col);
      if (!matches) {
        throw new Error(
          `Unexpected CSV header. Expected ${JSON.stringify(EXPECTED_HEADER)}, got ${JSON.stringify(header)}. The gov.uk CSV format may have changed — review before re-running.`,
        );
      }
      continue;
    }
    const [orgNameRaw, townCity, county, typeRating, route] = record;
    const organisationName = (orgNameRaw ?? "").trim();
    if (!organisationName) continue;
    yield {
      organisationName,
      townCity: nullIfBlank(townCity),
      county: nullIfBlank(county),
      typeRating: nullIfBlank(typeRating),
      route: nullIfBlank(route),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sourceArgIdx = args.indexOf("--source");
  const source = sourceArgIdx >= 0 ? args[sourceArgIdx + 1] : env.SPONSOR_REGISTER_CSV_URL;
  const snapshotArgIdx = args.indexOf("--snapshot-date");
  const snapshotDate =
    snapshotArgIdx >= 0 ? args[snapshotArgIdx + 1] : new Date().toISOString().slice(0, 10);

  if (!source) {
    throw new Error(
      "No CSV source given. Pass --source <url-or-path> or set SPONSOR_REGISTER_CSV_URL.",
    );
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE TABLE sponsors RESTART IDENTITY");

    const BATCH_SIZE = 1000;
    let batch: SponsorRow[] = [];
    let total = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      const values: unknown[] = [];
      const placeholders: string[] = [];
      batch.forEach((row, i) => {
        const base = i * 7;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
        );
        values.push(
          row.organisationName,
          normalizeName(row.organisationName),
          row.townCity,
          row.county,
          row.typeRating,
          row.route,
          snapshotDate,
        );
      });
      await client.query(
        `INSERT INTO sponsors
           (organisation_name, organisation_name_normalized, town_city, county, type_rating, route, source_snapshot_date)
         VALUES ${placeholders.join(", ")}`,
        values,
      );
      total += batch.length;
      batch = [];
    };

    for await (const row of parseRows(source)) {
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        await flush();
      }
    }
    await flush();

    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log(`Ingested ${total} sponsor rows (snapshot date ${snapshotDate}) from ${source}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
