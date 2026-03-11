/* PROLOGUE
File name: task.tsx
Description: Class for a task (Task) attached to a particular location (Feature).
Programmer: Delroy Wright
Creation date: 2/13/26
Revision date: 
  - 3/8/26: Updated to match Task table in DDL, consolidated from Task
Preconditions: A client is running and has access to the Task class.
Postconditions: An instantiated Task class.
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

import Feature from "./feature"

export enum TaskVisibility {
    Private = 'private',
    Household = 'household',
}

export default class Task {
    id: number; // for compatibility with older code
    feature_id: number;
    task_name: string;
    name: string; // for compatibility with older code
    frequency_days: number;
    last_completed: Date | null;
    visibility: TaskVisibility;
    created_by_account_id: number | null;
    icon: string; // MaterialCommunityIcons icon name

    // Derived fields for logic
    healthPercent: number;

    constructor(
        //TODO: get id from database
        task_name: string,
        feature_id: number,
        frequency_days: number,
        icon: string = "clipboard-text-outline",
        visibility: TaskVisibility = TaskVisibility.Household,
        created_by_account_id: number | null = null,
        task_id: number = 0
    ) {
        this.task_name = task_name;
        this.name = task_name;
        this.feature_id = feature_id;
        this.frequency_days = frequency_days;
        this.icon = icon;
        this.visibility = visibility;
        this.created_by_account_id = created_by_account_id;
        this.id = task_id;
        this.last_completed = null;
        this.healthPercent = 1;
    }

    // Updates and returns healthpercent for a task (0 to 1)
    getAndSetHealthPercent() {
        if (!this.last_completed) {
            this.healthPercent = 0;
            return 0;
        }
        
        const now = Date.now();
        const last = this.last_completed.getTime();
        const windowMs = this.frequency_days * 24 * 60 * 60 * 1000;
        const elapsed = now - last;
        
        this.healthPercent = Math.max(0, Math.min(1, 1 - elapsed / windowMs));
        return this.healthPercent;
    }

    // Pick a color based on the health percentage
    getHealthColor(percent: number): string {
        if (percent >= 0.6) return "#4caf50"; // green for healthy
        if (percent >= 0.3) return "#ff9800"; // orange for mid-range
        return "#f44336"; // red for overdue
    }

    finishTask() { 
        this.last_completed = new Date();
        this.healthPercent = 1;
    }
    
    decayTask() {
        this.getAndSetHealthPercent();
    }
}
