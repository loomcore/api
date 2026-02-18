/**
 * An inner join operation (one-to-one relationship)
 * @field from: Specifies the foreign collection or table in the same database to join to the local collection or table.
 * @field localField: Specifies the field to match on for the current collection or table.
 * @field foreignField: Specifies the field to match on for the foreign collection or table.
 * @field as: Specifies the name of the new field to add to the input.
 */
export class InnerJoin {
    from: string;
    localField: string;
    foreignField: string;
    as: string;

    constructor(
        from: string,
        localField: string,
        foreignField: string,
        as: string,
    ) {
        if (from === as) {
            throw new Error(`InnerJoin alias "${as}" must be different from table name "${from}". The alias is used to identify the join result and must be unique.`);
        }
        this.from = from;
        this.localField = localField;
        this.foreignField = foreignField;
        this.as = as;
    }
}
