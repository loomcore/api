import { CustomError } from "@loomcore/common/errors";


export class NotImplementedError extends CustomError {
    statusCode = 501;

    constructor() {
        super("Not implemented");
        Object.setPrototypeOf(this, NotImplementedError.prototype);
    }

    serializeErrors() {
        return [{ message: this.message }];
    }
}