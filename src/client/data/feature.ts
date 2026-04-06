/* PROLOGUE
File name: feature.tsx
Description: Class for a location in a home that has a task attached to it.
Programmer: Delroy Wright, Jack Bauer
Creation date: 2/13/26
Revision date: 
  - 3/8/26: Updated to match Feature table in DDL, reference Task instead of Task
  - 4/1/26: Add feature type enum and translation function
Preconditions: A client is running and has access to the Feature class.
Postconditions: An instantiated feature class.
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

import Task from "./task";

export enum FeatureType {
    UNDEFINED = 0,
    BED = 1,
    TABLE = 2,
    MONKEY = 3,
}

// Translate from a string feature type (as we often see in our app) to the correct enum value
export function getFeatureTypeFromString(str: string) {
    switch (str) {
        case "monkey":
            return FeatureType.MONKEY;
        case "table":
            return FeatureType.TABLE;
        case "bed":
            return FeatureType.BED;
        case "":
        default:
            return FeatureType.UNDEFINED;
    }
}

// Translate from a feature type to a string (as we often see in our app) to the correct enum value
export function getFeatureTypeToString(ft?: FeatureType) {
    switch (ft) {
        case FeatureType.BED:
            return "bed";
        case FeatureType.TABLE:
            return "table";
        case FeatureType.MONKEY:
            return "monkey";
        case FeatureType.UNDEFINED:
        default:
            return "";
    }
}

export default class Feature {
    id: number;
    household_id: number;
    feature_name: string;
    name: string; // for compatibility
    feature_type: FeatureType;
    x_pos: number;
    y_pos: number;
    z_pos: number;
    tasks: Task[];
    icon: string; // for compatibility

    constructor(feature_name: string, household_id: number, feature_type: FeatureType = FeatureType.UNDEFINED, x: number = 0, y: number = 0, z: number = 0, feature_id: number = 0, icon: string = "home-outline") {
        this.feature_name = feature_name;
        this.name = feature_name;
        this.household_id = household_id;
        this.feature_type = feature_type;
        this.x_pos = x;
        this.y_pos = y;
        this.z_pos = z;
        // Use the id from the database so we can reference this feature in API calls
        this.id = feature_id;
        this.tasks = [];
        this.icon = icon;
    }

    addTask(task : Task) {
        this.tasks.push(task)
    }

    calculateHealthPercent() : number {
        let numTasks = this.tasks.length
        if (numTasks == 0)
            return 1

        let totalPercent = 0
        for (let task of this.tasks) { 
            totalPercent += task.getAndSetHealthPercent()
        }
        return totalPercent / numTasks
    }

    decay() {
        for (let task of this.tasks) {
            task.decayTask()
        }
    }
}