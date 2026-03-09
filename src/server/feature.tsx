/* PROLOGUE
File name: feature.tsx
Description: Class for a location in a home that has a task attached to it.
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 3/8/26: Updated to match Feature table in DDL, reference Task instead of Task
Preconditions: A client is running and has access to the Feature class.
Postconditions: An instantiated feature class.
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

import Task from "./task"

export default class Feature {
    feature_id: number;
    id: string; // for compatibility
    household_id: number;
    feature_name: string;
    name: string; // for compatibility
    feature_type: string;
    x_pos: number;
    y_pos: number;
    z_pos: number;
    tasks: Task[];
    icon: string; // for compatibility

    constructor(feature_name: string, household_id: number, feature_type: string = "", x: number = 0, y: number = 0, z: number = 0, feature_id: number = 0, icon: string = "home-outline") {
        this.feature_name = feature_name;
        this.name = feature_name;
        this.household_id = household_id;
        this.feature_type = feature_type;
        this.x_pos = x;
        this.y_pos = y;
        this.z_pos = z;
        this.feature_id = feature_id;
        this.id = feature_id.toString();
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
