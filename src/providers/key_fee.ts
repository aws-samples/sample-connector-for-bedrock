import Cache from '../util/cache';

// updated_at also marks the month of month_fee. Every statement that stamps updated_at on a key writes month_fee
// with this expression, so a month_fee last written in an earlier month than `now` (a parameter such as "$2")
// counts as 0.
export function monthFeeAt(now: string): string {
    return `CASE WHEN date_trunc('month', updated_at) < date_trunc('month', ${now}::timestamp) THEN 0 ELSE month_fee END`;
}

// The new updated_at for a write at `now`. A write sent in the old month can commit after one of the new month, and
// must not move updated_at back into the old month, which would reset month_fee a second time.
export function updatedAtAt(now: string): string {
    return `greatest(updated_at, ${now}::timestamp)`;
}

// The same month test for a key read from the database or the cache. node-pg writes and reads timestamp columns in
// local time, so this local-time comparison sees the same months as the SQL.
export function isEarlierMonth(updatedAt: Date, now: Date): boolean {
    return updatedAt.getFullYear() * 12 + updatedAt.getMonth() < now.getFullYear() * 12 + now.getMonth();
}

const MONTH_FEE = monthFeeAt('$2');

// Charges one call of fee $1 at time $2 to key $3. The fee first fills what is left of the monthly quota and the
// rest comes off the balance, which the call that uses it up may take below zero; the fee check then refuses the
// next call. One statement computed from the stored row, so concurrent calls cannot overwrite each other.
export const ADD_KEY_FEE_SQL = `UPDATE eiai_key SET
    total_fee = total_fee + $1::numeric,
    month_fee = least(${MONTH_FEE} + $1::numeric, month_quota),
    balance = balance - least($1::numeric, greatest(0, ${MONTH_FEE} + $1::numeric - month_quota)),
    updated_at = ${updatedAtAt('$2')}
WHERE id = $3 RETURNING *`;

// Charges the key and copies the stored values to the cached key, which the fee check reads.
// Returns the key row, or undefined when no key has this id. A fee that is not a finite number of zero or more is
// refused, because Postgres would store NaN, and a NaN balance never reaches zero.
export async function addKeyFee(db: any, keyId: number, fee: number): Promise<any> {
    if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) {
        throw new Error(`the fee must be a finite number of zero or more, got ${fee}`);
    }
    const { rows } = await db.query(ADD_KEY_FEE_SQL, [fee, new Date(), keyId]);
    const row = rows && rows[0];
    if (row) {
        Cache.updateKeyFee(row);
    }
    return row;
}
