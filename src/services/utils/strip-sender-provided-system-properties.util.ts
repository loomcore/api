import { IUserContext } from "@loomcore/common/models";
import { getSystemUserId } from "@loomcore/common/validation";

export function stripSenderProvidedSystemProperties(userContext: IUserContext, entity: any, allowId: boolean = false) {
    // Allow system properties if this is a system-initiated action
    const isSystemUser = userContext.user?._id === getSystemUserId();
    if (isSystemUser) {
      return; // Don't strip any properties for system actions
    }

    // we don't allow users to provide/overwrite any system properties
    // todo: seriously consider removing the _orgId check once we handle user creation properly (when there is no more register endpoint)
    const propertiesToIgnore = ['_orgId'];

    // Add '_id' to ignore list if allowId is true
    if (allowId) {
      propertiesToIgnore.push('_id');
    }

    // Remove properties that start with '_' except those in the ignore list
    for (const key in entity) {
      if (Object.prototype.hasOwnProperty.call(entity, key) && key.startsWith('_') && !propertiesToIgnore.includes(key)) {
        delete entity[key];
      }
    }
}