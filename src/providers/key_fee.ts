import Cache from '../util/cache';

// month_fee as of $2: a month_fee last written in an earlier month counts as 0.
const MONTH_FEE = "CASE WHEN date_trunc('month', updated_at) < date_trunc('month', $2::timestamp) THEN 0 ELSE month_fee END";

// Charges one call of fee $1 at time $2 to key $3. The fee first fills what is left of the monthly quota and the
// rest comes off the balance, which the call that uses it up may take below zero; the fee check then refuses the
// next call. One statement computed from the stored row, so concurrent calls cannot overwrite each other.
export const ADD_KEY_FEE_SQL = `UPDATE eiai_key SET
    total_fee = total_fee + $1::numeric,
    month_fee = least(${MONTH_FEE} + $1::numeric, month_quota),
    balance = balance - least($1::numeric, greatest(0, ${MONTH_FEE} + $1::numeric - month_quota)),
    updated_at = $2::timestamp
WHERE id = $3 RETURNING *`;

// Charges the key and copies the stored values to the cached key, which the fee check reads.
// Returns the key row, or undefined when no key has this id.
export async function addKeyFee(db: any, keyId: number, fee: number): Promise<any> {
    const { rows } = await db.query(ADD_KEY_FEE_SQL, [fee, new Date(), keyId]);
    const row = rows && rows[0];
    if (row) {
        Cache.updateKeyFee(row);
    }
    return row;
}
