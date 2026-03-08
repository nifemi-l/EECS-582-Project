/* PROLOGUE
File name: household.tsx
Description: Class for a household containing tasks, users, and features.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 2/16/26: update fields, add adminUsers, sensors, and features
  - 2/18/26: Rename variables, update feature field to be Feature type, sensor field to be Sensor type
Preconditions: A client is running and has access to the Sensor class and any inherited members.
Postconditions: An instantiated household class along with any functions that are required.
Errors: Households may be attempted to be created with invalid data or fields.
Side effects: None
Invariants: None
Known faults: None
*/

import User from "./user";
import Sensors from "./sensors";
import Feature from "./feature";
import Task from "./task"; // assuming you have one

export default class Household {
    id: number;
    name: string;
    users: User[];
    adminUsers: User[];
    sensors: Sensors;
    features: Feature[];

    constructor(name: string, features: Set<Feature> = new Set()) {
        this.id = -1;
        this.name = name;
        this.users = [];
        this.adminUsers = [];
        this.sensors = new Sensors(); // or null/optional if you want
        this.features = [];
    }

    addUser(user: User) {
        this.users.push(user);
    }

    getHoursAgo(h: number): string {
        return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
    }

    static createMockHousehold(): Household {
        const hh = new Household("My Home");

        const kitchen = new Feature(
            "loc-kitchen",
            "Kitchen",
            "silverware-fork-knife",
        );
        kitchen.addTask(
            new Task("t1", "Wash dishes", 12, hhHoursAgo(4), "dishwasher"),
        );
        kitchen.addTask(
            new Task("t2", "Wipe counters", 24, hhHoursAgo(20), "spray-bottle"),
        );
        kitchen.addTask(new Task("t3", "Mop floor", 168, hhHoursAgo(100), "broom"));

        const bathroom = new Feature("loc-bathroom", "Bathroom", "shower");
        bathroom.addTask(
            new Task("t4", "Scrub toilet", 168, hhHoursAgo(150), "toilet"),
        );
        bathroom.addTask(
            new Task("t5", "Clean mirror", 168, hhHoursAgo(50), "mirror-rectangle"),
        );

        const living = new Feature("loc-living", "Living Room", "sofa");
        living.addTask(
            new Task("t6", "Vacuum carpet", 72, hhHoursAgo(10), "vacuum"),
        );
        living.addTask(
            new Task("t7", "Dust shelves", 168, hhHoursAgo(160), "bookshelf"),
        );

        const bedroom = new Feature("loc-bedroom", "Bedroom", "bed");
        bedroom.addTask(
            new Task("t8", "Make bed", 24, hhHoursAgo(2), "bed-outline"),
        );
        bedroom.addTask(
            new Task(
                "t9",
                "Organize closet",
                336,
                hhHoursAgo(200),
                "wardrobe-outline",
            ),
        );

        hh.features = [kitchen, bathroom, living, bedroom];
        hh.id = 1;

        return hh;

        function hhHoursAgo(h: number): Date {
            return new Date(Date.now() - h * 60 * 60 * 1000);
        }
    }


    //TODO: add feature
    //TODO: delete feature
    //TODO: rename feature
    //TODO: rename feature
}
