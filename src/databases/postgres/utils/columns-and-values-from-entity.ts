import { IEntity } from "@loomcore/common/models";

export function columnsAndValuesFromEntity<T extends IEntity>(entity: Partial<T>): { columns: string[], values: any[] } {
    const columns: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(entity)) {
        // Skip undefined values (they shouldn't be included in updates)
        // null values are allowed and should be included
        if (value !== undefined) {
            columns.push(`"${key}"`);
            values.push(value);
        }
    }
    return { columns, values };
}