import { IUserContext } from "@loomcore/common/models";
import type { AppId } from "@loomcore/common/types";
import { getSystemUserId } from "@loomcore/common/validation";
import moment from "moment";

export function auditForCreate(userContext: IUserContext, doc: any) {
    const now = moment().utc().toDate();
    const userId: AppId = userContext.user?._id ?? getSystemUserId();
    doc._created = now;
    doc._createdBy = userId;
    doc._updated = now;
    doc._updatedBy = userId;
}