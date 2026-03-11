/* PROLOGUE
File name: household.tsx
Description: Class for a household containing tasks, users, and features.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 3/8/26: Updated to match Household table in DDL, restored createMockHousehold
Preconditions: A client is running and has access to the Household class.
Postconditions: An instantiated household class.
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

import User from "./user" 
import Feature from "./feature"
import Task from "./task"

export default class Household {
    household_id: number;
    id: number; // for compatibility
    household_name: string;
    name: string; // for compatibility
    users: Set<User>;
    features: Set<Feature>;

    constructor(household_name: string, household_id: number = 0) {
        //TODO: get id from database
        this.household_name = household_name;
        this.name = household_name;
        this.household_id = household_id;
        this.id = 0;
        this.users = new Set();
        this.features = new Set();
    }

    addUser(user: User) {
        this.users.add(user);
    }

    addFeature(feature: Feature) {
        this.features.add(feature);
    }

    decay() {
        for (let feature of this.features) {
            feature.decay()
        }
    }

    static createMockHousehold(): Household {
        const h = new Household("My Home", 1);
        
        const kitchen = new Feature("Kitchen", 1, "room", 0, 0, 0, 1, "silverware-fork-knife");
        const washDishes = new Task("Wash dishes", 1, 0.5, "dishwasher"); // 0.5 days = 12 hours
        washDishes.last_completed = new Date(Date.now() - 4 * 60 * 60 * 1000);
        kitchen.addTask(washDishes);
        
        const wipeCounters = new Task("Wipe counters", 1, 1, "spray-bottle");
        wipeCounters.last_completed = new Date(Date.now() - 20 * 60 * 60 * 1000);
        kitchen.addTask(wipeCounters);
        
        h.addFeature(kitchen);
        
        const bathroom = new Feature("Bathroom", 1, "room", 2, 0, 0, 2, "shower");
        const scrubToilet = new Task("Scrub toilet", 2, 7, "toilet");
        scrubToilet.last_completed = new Date(Date.now() - 150 * 60 * 60 * 1000);
        bathroom.addTask(scrubToilet);
        h.addFeature(bathroom);
        
        return h;
    }
}
