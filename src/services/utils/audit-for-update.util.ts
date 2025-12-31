import { IUserContext } from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import { getSystemUserId } from "@loomcore/common/validation";
import moment from "moment";

export function auditForUpdate(userContext: IUserContext, doc: any) {
    const userId: AppIdType = userContext.user?._id ?? getSystemUserId();
    doc._updated = moment().utc().toDate();
    doc._updatedBy = userId;
};