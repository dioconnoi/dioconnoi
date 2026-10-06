import type { Pool } from "pg";
import { SponsorIndex, loadSponsorRowsFromDb, getSponsorSnapshotDate } from "./sponsorMatch.service";

/**
 * Holds the current in-memory Fuse.js sponsor index behind a single mutable
 * reference. `refresh()` builds a brand-new SponsorIndex off the DB and only
 * then swaps the reference — concurrent requests always see either the old
 * or the new complete index, never a half-built one.
 */
export class SponsorIndexHolder {
  private indexRef: SponsorIndex;
  private snapshotDateRef: string | null;

  private constructor(initial: SponsorIndex, snapshotDate: string | null) {
    this.indexRef = initial;
    this.snapshotDateRef = snapshotDate;
  }

  static async create(pool: Pool): Promise<SponsorIndexHolder> {
    const [rows, snapshotDate] = await Promise.all([loadSponsorRowsFromDb(pool), getSponsorSnapshotDate(pool)]);
    return new SponsorIndexHolder(new SponsorIndex(rows), snapshotDate);
  }

  get current(): SponsorIndex {
    return this.indexRef;
  }

  get snapshotDate(): string | null {
    return this.snapshotDateRef;
  }

  async refresh(pool: Pool): Promise<void> {
    const [rows, snapshotDate] = await Promise.all([loadSponsorRowsFromDb(pool), getSponsorSnapshotDate(pool)]);
    this.indexRef = new SponsorIndex(rows); // swap only after the new index is fully built
    this.snapshotDateRef = snapshotDate;
  }
}
