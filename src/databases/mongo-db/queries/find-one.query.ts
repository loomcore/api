import { Collection } from "mongodb";
import { IQueryOptions } from "@loomcore/common/models";
import { buildNoSqlMatch, buildFindOptions } from "../utils/index.js";


export async function findOne<T>(collection: Collection, queryObject: IQueryOptions): Promise<T | null> {
    const matchDocument = buildNoSqlMatch(queryObject);
    const filter = matchDocument.$match;
    const options = buildFindOptions(queryObject);

    const entity = await collection.findOne(filter, options);
    
    return entity as T | null;
}

