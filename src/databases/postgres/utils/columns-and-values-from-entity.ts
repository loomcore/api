import { IEntity } from "@loomcore/common/models";

export function columnsAndValuesFromEntity<T extends IEntity>(entity: Partial<T>): { columns: string[], values: any[] } {
    const columns: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(entity)) {
        columns.push(`"${key}"`);
        values.push(value);
    }
    return { columns, values };
}