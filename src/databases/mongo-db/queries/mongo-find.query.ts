import { Collection, Db } from "mongodb";
import { IQueryOptions } from "@loomcore/common/models";
import { buildNoSqlMatch, buildFindOptions } from "../utils/index.js";


export async function find<T>(db: Db, queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
    const collection = db.collection(pluralResourceName);
    const matchDocument = buildNoSqlMatch(queryObject);
    const filter = matchDocument.$match;

    const options = buildFindOptions(queryObject);

    const entities = await collection.find(filter, options).toArray();
            
    return entities as T[];
}

