import { IUserContext } from "@loomcore/common/models";
import moment from "moment";

export function auditForCreate(userContext: IUserContext, doc: any) {
    const now = moment().utc().toDate();
    const userId = userContext.user?._id?.toString() ?? 'system';
    doc._created = now;
    doc._createdBy = userId;
    doc._updated = now;
    doc._updatedBy = userId;
    doc._deleted = null;
    doc._deletedBy = null;
}