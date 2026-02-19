import { Operation } from "../../operations/index.js";


export function buildAs(columnName: string, operation: Operation): string {
    return `${operation.as}__${columnName}`;
}