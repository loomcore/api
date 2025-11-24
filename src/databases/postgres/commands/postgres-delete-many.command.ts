import { Client } from 'pg';
import { IQueryOptions } from "@loomcore/common/models";
import { BadRequestError } from "../../../errors/index.js";
import { buildWhereClause } from '../utils/build-where-clause.js';
import { DeleteResult } from "../../models/delete-result.js";

export async function deleteMany(
    client: Client,
    queryObject: IQueryOptions,
    pluralResourceName: string
): Promise<DeleteResult> {
    // Build WHERE clause from queryObject
    const { whereClause, values } = buildWhereClause(queryObject);
    
    if (!whereClause) {
        throw new BadRequestError('Delete query must include filters to prevent deleting all records');
    }

    const query = `DELETE FROM "${pluralResourceName}" ${whereClause}`;
    const result = await client.query(query, values);
    
    return new DeleteResult(true, result.rowCount || 0);
}

