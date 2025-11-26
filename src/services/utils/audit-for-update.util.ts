import { IUserContext } from "@loomcore/common/models";
import moment from "moment";

export function auditForUpdate(userContext: IUserContext, doc: any) {
    const userId = userContext.user?._id?.toString() ?? 'system';
    doc._updated = moment().utc().toDate();
    doc._updatedBy = userId;
    doc._deleted = null;
    doc._deletedBy = null;
};