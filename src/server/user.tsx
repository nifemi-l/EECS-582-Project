/* PROLOGUE
File name: user.tsx
Description: Class for a user (Account) attached to a particular household(s).
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 3/8/26: Updated to match Account table in DDL
Preconditions: A client is running and has access to the User class.
Postconditions: An instantiated User class.
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

import Household from "./household"

export default class User {
    account_id: number;
    account_name: string;
    hashed_password: string;
    email: string;
    created_at: Date;
    last_login: Date | null;
    households: Set<Household>;

    constructor(account_name: string, email: string, hashed_password: string) {
        this.account_name = account_name;
        this.email = email;
        this.hashed_password = hashed_password;
        this.created_at = new Date();
        this.last_login = null;
        this.households = new Set();
    }

    setHousehold(household: Household) {
        this.households.add(household)
    }
}
