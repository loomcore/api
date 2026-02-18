/**
 * An inner join operation (one-to-one relationship)
 * Only returns rows where a matching record exists in both tables.
 * 
 * @field from: Specifies the foreign collection or table in the same database to join to the local collection or table.
 * @field localField: Specifies the field to match on for the current collection or table.
 * @field foreignField: Specifies the field to match on for the foreign collection or table.
 * @field as: Specifies the name of the new field to add to the input. Defaults to the "from" table name if not provided.
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
        as?: string,
    ) {
        this.from = from;
        this.localField = localField;
        this.foreignField = foreignField;
        this.as = as ?? from;
    }
}
