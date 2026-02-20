/* PROLOGUE
File name: user.tsx
Description: Class for a user attached to a particualr household(s).
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 2/16/26: update fields, add readonly keyword
  - 2/18/26: Added household
Preconditions: A client is running and has access to the User class and any inherited members.
Postconditions: An instantiated user class along with any functions that are required.
Errors: Users may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/

import Household from "./household"

export default class User {
    households: Set<Household> 
    readonly username : string 
    readonly password : string 

    constructor(username: string, password : string){
        this.username = username; 
        this.password = password;
    }

    setHousehold(household : Household) {
        household.addUser(this)
        this.households.add(household)
    }
}
