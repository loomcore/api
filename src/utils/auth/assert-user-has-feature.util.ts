import { IUserContext } from "@loomcore/common/models";
import { UnauthorizedError } from "../../errors/index.js";

export function assertUserHasFeature(userContext: IUserContext, features: string[]): void {
    if (features.length === 0) {
        return;
    }
    const missingFeatures = features.filter(feature => !userContext.features.includes(feature));
    if (missingFeatures.length > 0) {
        throw new UnauthorizedError(missingFeatures);
    }
}