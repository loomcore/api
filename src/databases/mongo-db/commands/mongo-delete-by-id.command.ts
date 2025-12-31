import { Db, ObjectId } from "mongodb";
import { DeleteResult as GenericDeleteResult } from "../../models/delete-result.js";
import { BadRequestError } from "../../../errors/index.js";
import { entityUtils } from "@loomcore/common/utils";
import type { AppId } from "@loomcore/common/types";

export async function deleteById(db: Db, id: AppId, pluralResourceName: string): Promise<GenericDeleteResult> {
    if (!entityUtils.isValidObjectId(id)) {
        throw new BadRequestError('id is not a valid ObjectId');
    }
    const collection = db.collection(pluralResourceName);
    const objectId = new ObjectId(id);
    const baseQuery = { _id: objectId };

    const deleteResult = await collection.deleteOne(baseQuery);
    
    return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}
