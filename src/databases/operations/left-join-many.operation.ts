/**
 * A left outer join operation that returns an array of related records (one-to-many relationship)
 * For example: persons -> email_addresses (a person can have multiple email addresses)
 * 
 * @field from: Specifies the foreign collection or table in the same database to join to the local collection or table.
 * @field localField: Model field name to match on for the current collection (camelCase; Postgres maps to snake_case columns).
 * @field foreignField: Model field name to match on for the foreign collection (camelCase; Postgres maps to snake_case columns).
 * @field as: Specifies the name of the new field to add to the input (will be an array).
 */
export class LeftJoinMany {
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
      throw new Error(`LeftJoinMany alias "${as}" must be different from table name "${from}". The alias is used to identify the join result and must be unique.`);
    }
    this.from = from;
    this.localField = localField;
    this.foreignField = foreignField;
    this.as = as;
  }
}
