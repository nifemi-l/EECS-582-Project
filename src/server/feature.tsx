/* PROLOGUE
File name: feature.tsx
Description: Class for a location in a home that has a task attached to it.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 2/16/26: update fields, add createdBy and accessList
  - 2/18/26: Rename variables, update createdBy to be user type
Preconditions: A client is running and has access to the Feature class and any inherited members.
Postconditions: An instantiated feature class along with any functions that are required.
Errors: Features may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/

import User from "./user"
import Task, { TaskVisibility } from "./task"
import {add_task} from "./db/db_commands"

export default class Feature {
    name : string;
    id: string;
    icon: string;
    // createdBy : User;
    // accessList : User[];
    // healthPercent : number;
    tasks : Task[];
    // location : Location ?? 
    constructor(id: string, name : string, icon: string ) {
        this.name = name;
        this.id = id
        this.icon = icon;
        this.tasks = [];
    }

    addTask(task : Task): void {
        this.tasks.push(task)
        const visibility = (() : string => {
            if (task.visibility == TaskVisibility.Private)
                return "private"
            else if (task.visibility == TaskVisibility.Household)
                return "household"
            throw new Error(`Invalid visibility`);
        })();

        //TODO: update id
        // add_task(0, task.name, task.frequency.days, null, visibility)
    }

}
