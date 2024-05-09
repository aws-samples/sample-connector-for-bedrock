export default {
    total: async (db: any, options: any) => {
        let count_key = await db.count("eiai_key");
        let total_fee = await db.sum("eiai_key", "total_fee");
        let total_month_fee = await db.sum("eiai_key", "month_fee");
        let active_key = await db.count("eiai_key", {
            where: "total_fee>0"
        });

        let firstDay = new Date();
        firstDay.setDate(1);
        firstDay.setHours(0, 0, 0, 0);
        let active_key_this_month = await db.count("eiai_key", {
            where: "updated_at>=$1 and total_fee>0",
            params: [firstDay]
        });
        count_key *= 1;
        active_key_this_month *= 1;
        active_key *= 1;
        total_fee *= 1.0;
        total_month_fee *= 1.0;
        return {
            count_key,
            active_key,
            active_key_this_month,
            total_fee,
            total_month_fee,
        };
    }
}