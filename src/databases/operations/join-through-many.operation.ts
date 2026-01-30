/**
 * A join operation that goes through a join table (many-to-many relationship) and returns an array
 * For example: persons -> persons_phone_numbers -> phone_numbers
 * 
 * @field from: Specifies the final foreign collection or table to join to.
 * @field through: Specifies the join table that connects the local and foreign tables.
 * @field localField: Specifies the field to match on for the current collection or table.
 * @field throughLocalField: Specifies the field in the join table that matches the local field.
 * @field throughForeignField: Specifies the field in the join table that matches the foreign field.
 * @field foreignField: Specifies the field to match on for the foreign collection or table.
 * @field as: Specifies the name of the new field to add to the input (will be an array).
 */
export class JoinThroughMany {
    from: string;
    through: string;
    localField: string;
    throughLocalField: string;
    throughForeignField: string;
    foreignField: string;
    as: string;

    constructor(
        from: string,
        through: string,
        localField: string,
        throughLocalField: string,
        throughForeignField: string,
        foreignField: string,
        as: string,
    ) {
        this.from = from;
        this.through = through;
        this.localField = localField;
        this.throughLocalField = throughLocalField;
        this.throughForeignField = throughForeignField;
        this.foreignField = foreignField;
        this.as = as;
    }
}
