import { IQueryOptions } from "@loomcore/common/models";

export function buildWhereClause(queryObject: IQueryOptions): { whereClause: string, values: any[] } {
    const filters = queryObject.filters || {};

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;    
    
    // Build WHERE clause from filters
    for (const [key, value] of Object.entries(filters)) {
        if (value) {
            
            if (value.eq !== undefined) {
                conditions.push(`"${key}" = $${paramIndex}`);
                values.push(value.eq);
                paramIndex++;
            } else if (value.in !== undefined && Array.isArray(value.in)) {
                const placeholders = value.in.map(() => `$${paramIndex++}`).join(', ');
                conditions.push(`"${key}" IN (${placeholders})`);
                values.push(...value.in);
            } else if (value.gte !== undefined) {
                conditions.push(`"${key}" >= $${paramIndex}`);
                values.push(value.gte);
                paramIndex++;
            } else if (value.lte !== undefined) {
                conditions.push(`"${key}" <= $${paramIndex}`);
                values.push(value.lte);
                paramIndex++;
            } else if (value.gt !== undefined) {
                conditions.push(`"${key}" > $${paramIndex}`);
                values.push(value.gt);
                paramIndex++;
            } else if (value.lt !== undefined) {
                conditions.push(`"${key}" < $${paramIndex}`);
                values.push(value.lt);
                paramIndex++;
            } else if (value.contains !== undefined) {
                conditions.push(`LOWER("${key}") LIKE LOWER($${paramIndex})`);
                values.push(`%${value.contains}%`);
                paramIndex++;
            }
        }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values };
}