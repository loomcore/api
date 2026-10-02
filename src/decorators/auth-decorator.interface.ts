import { IAuthRequirement } from "./auth-requirement.interface.js";

export interface IAuthDecorator {
    createOrUpdateAuthRequirement(requirement: IAuthRequirement | undefined, entity: any): IAuthRequirement | undefined;
}