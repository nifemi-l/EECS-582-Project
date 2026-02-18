/* PROLOGUE
File name: feature.tsx
Description: Class for a location in a home that has a chore attached to it.
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

export default class Feature {
    title : string;
    createdBy : User;
    accessList : User[];
    constructor(title : string, createdBy : User) {
        this.title = title;
        this.createdBy = createdBy;
        this.accessList = [createdBy];
    }
}
