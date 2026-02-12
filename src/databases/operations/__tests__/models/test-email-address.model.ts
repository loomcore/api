import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";


export interface ITestEmailAddressModel extends IEntity, IAuditable {
    personId: number;
    emailAddress: string;
    isDefault: boolean;
}

export const testEmailAddressSchema = Type.Object({
    personId: Type.Number(),
    emailAddress: Type.String(),
    isDefault: Type.Boolean(),
});

export const testEmailAddressModelSpec = entityUtils.getModelSpec(testEmailAddressSchema);
