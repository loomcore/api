import { IPersonModel, personModelSpec } from "@loomcore/common/models";
import { ApiController } from "./api.controller.js";
import { isAuthorized } from "../middleware/is-authorized.js";
import { Application } from "express";
import { IDatabase } from "../databases/models/index.js";
import { PersonService } from "../services/person.service.js";

export class PersonsController extends ApiController<IPersonModel> {

    constructor(app: Application, database: IDatabase) {
        const personService = new PersonService(database);
        super('persons', app, personService);
    }

    override mapRoutes(app: Application) {
        super.mapRoutes(app);

        app.get('/api/persons', isAuthorized(), this.get.bind(this));
        app.get('/api/persons/:id', isAuthorized(), this.getById.bind(this));
        app.post('/api/persons', isAuthorized(), this.create.bind(this));
        app.put('/api/persons/:id', isAuthorized(), this.fullUpdateById.bind(this));
        app.patch('/api/persons/:id', isAuthorized(), this.partialUpdateById.bind(this));
        app.delete('/api/persons/:id', isAuthorized(), this.deleteById.bind(this));
    }
}