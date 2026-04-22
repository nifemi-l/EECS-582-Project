/* PROLOGUE
File name: feature.tsx
Description: Class for a location in a home that has a task attached to it.
Programmer: Delroy Wright, Jack Bauer
Creation date: 2/13/26
Revision date: 
  - 3/8/26: Updated to match Feature table in DDL, reference Task instead of Task
  - 4/1/26: Add feature type enum and translation function
  - 4/13/26: Add room_id (FK to Room) for list grouping
  - 4/15/26: Remove room_name, room_number from the feature object
  - 4/16/26: Add 3D scale, rotation support
Preconditions: A client is running and has access to the Feature class.
Postconditions: An instantiated feature class.
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

import Task from "./task";

export enum FeatureType {
    UNDEFINED = "",
    BED = "bed",
    TABLE = "table",
    MONKEY = "monkey",
    FRAME = "frame",
    FLOWER_POT = "flower_pot",
    COUCH = "couch",
    FRIDGE = "fridge",
    CAR = "car",
    WASHING_MACHINE = "washing_machine",
    TALL_PLANT = "tall_plant",
    DESK = "desk",
    BATHTUB = "bathtub",
    SINK = "sink",
    TOILET = "toilet",
    WOOD_CHAIR = "wood_chair",
    SQUARE_RUG = "square_rug",
}

// Translate from a string feature type (as we often see in our app) to the correct enum value
export function getFeatureTypeFromString(str: string): FeatureType {
    // Get a list of our string values.
    const vals = Object.values(FeatureType) as string[];
    if (vals.includes(str)) {
        // If we have one, return the string.
        return str as FeatureType;
    }

    // Otherwise return UNDEFINED
    return FeatureType.UNDEFINED;
}

// Translate from a feature type to a string (as we often see in our app) to the correct enum value
export function getFeatureTypeToString(ft?: FeatureType): string {
    return ft ?? FeatureType.UNDEFINED;
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
    /** Nullable FK to Room for view grouping */
    room_id: number | null;
    scale: number;
    rotation_y: number;

    constructor(feature_name: string, household_id: number, feature_type: FeatureType = FeatureType.UNDEFINED, x: number = 0, y: number = 0, z: number = 0, feature_id: number = 0, icon: string = "home-outline", room_id: number | null = null, scale: number = 1, rotation_y: number = 0) {
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
        this.room_id = room_id;
        this.scale = scale;
        this.rotation_y = rotation_y;
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