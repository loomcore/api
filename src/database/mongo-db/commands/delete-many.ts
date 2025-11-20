import { Collection } from "mongodb";
import { IQueryOptions } from "@loomcore/common/models";
import { DeleteResult as GenericDeleteResult } from "../../models/deleteResult.js";
import { buildNoSqlMatch } from "../utils/build-no-sql-match.util.js";


export async function deleteMany(collection: Collection, queryObject: IQueryOptions): Promise<GenericDeleteResult> {
    // Build match document and extract the filter object
    const matchDocument = buildNoSqlMatch(queryObject);
    const filter = matchDocument.$match;

    const deleteResult = await collection.deleteMany(filter);
    return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

