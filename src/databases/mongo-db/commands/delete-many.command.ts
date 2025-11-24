import { Collection, Db } from "mongodb";
import { IQueryOptions } from "@loomcore/common/models";
import { DeleteResult as GenericDeleteResult } from "../../models/delete-result.js";
import { buildNoSqlMatch } from "../utils/build-no-sql-match.util.js";


export async function deleteMany(db: Db, queryObject: IQueryOptions, pluralResourceName: string): Promise<GenericDeleteResult> {
    const collection = db.collection(pluralResourceName);
    // Build match document and extract the filter object
    const matchDocument = buildNoSqlMatch(queryObject);
    const filter = matchDocument.$match;

    const deleteResult = await collection.deleteMany(filter);
    return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

