/**
 * PROLOGUE
 * File name: db_commands.tsx
 * Description: Handles database connectivity and defines functions for inserting, updating, and retrieving data from the PostgreSQL database.
 * Programmer: Delroy Wright
 * Creation date: 3/2/26
 * Preconditions: Environment variables for database credentials are defined in .env; PostgreSQL database is running and accessible.
 * Postconditions: A database connection is established and utility functions are available for performing CRUD operations on Household, Account, Feature, and Task relations.
 * Errors: Database connection may fail due to invalid credentials, unreachable host, or server-side errors; SQL execution errors may occur if schema constraints are violated.
 * Side effects: Opens a persistent database connection pool; utility functions perform async SQL operations.
 * Invariants: SQL statements use parameterized queries to prevent injection.
 */

import postgres from 'postgres';
import 'dotenv/config';

const DB_HOST = process.env.DB_HOST;
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = parseInt(process.env.DB_PORT || "5432");

/**
 * Establish a connection to the PostgreSQL database.
 * The 'postgres' library uses a connection pool by default.
 */
const sql = postgres({
    host: DB_HOST,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    onnotice: (notice) => console.log('DB Notice:', notice.message),
});

console.log("DB connection pool initialized");

export default sql;

/**
 * Functions for adding data to the database
 */

export async function add_household(household_name: string) {
    // Ex: add_household("Johnson Family")
    const [result] = await sql`
        INSERT INTO Household (household_name)
        VALUES (${household_name})
        RETURNING household_id
    `;
    // Return the id, can be used or not
    return result.household_id;
}

export async function add_account(account_name: string, hashed_password: string, email: string) {
    const [result] = await sql`
        INSERT INTO Account (account_name, hashed_password, email)
        VALUES (${account_name}, ${hashed_password}, ${email})
        RETURNING account_id
    `;
    return result.account_id;
}

export async function add_feature(household_id: number, feature_name: string, feature_type: string, x_pos: number, y_pos: number, z_pos: number) {
    const [result] = await sql`
        INSERT INTO Feature (household_id, feature_name, feature_type, x_pos, y_pos, z_pos)
        VALUES (${household_id}, ${feature_name}, ${feature_type}, ${x_pos}, ${y_pos}, ${z_pos})
        RETURNING feature_id
    `;
    // Return the feature id
    return result.feature_id;
}

export async function add_task(new_feature_id: number, existing_task_name: string, task_frequency_days: number, time_last_completed: Date | null, task_visibility: string) {
    // Ex: add_task(12, "Clean Room", 7, new Date(), "private")
    const [result] = await sql`
        INSERT INTO Task (feature_id, task_name, frequency_days, last_completed, visibility)
        VALUES (${new_feature_id}, ${existing_task_name}, ${task_frequency_days}, ${time_last_completed}, ${task_visibility})
        RETURNING task_id
    `;
    return result.task_id;
}

/**
 * Add a role for an account in a household
 * Is a separate relation because there is a many-to-many relationship between accounts and households
 */
export async function add_account_role(account_id: number, household_id: number, role: string) {
    await sql`
        INSERT INTO AccountRole (account_id, household_id, role)
        VALUES (${account_id}, ${household_id}, ${role})
    `;
}

/**
 * Functions for retrieving specific data from the database
 */

// Retrieve data for a household by its household id
export async function get_household_by_id(household_id: number) {
    const [household] = await sql`
        SELECT * FROM Household
        WHERE household_id = ${household_id}
    `;
    return household;
}

// Retrieve data for an account by its account id
export async function get_account_by_id(account_id: number) {
    const [account] = await sql`
        SELECT * FROM Account
        WHERE account_id = ${account_id}
    `;
    return account;
}

// Retrieve data for an account by its email
export async function get_account_by_email(email: string) {
    const [account] = await sql`
        SELECT account_id, account_name, hashed_password, email
        FROM Account
        WHERE email = ${email}
    `;
    return account;
}

// Retrieve data for a feature by its feature id
export async function get_feature_by_id(feature_id: number) {
    const [feature] = await sql`
        SELECT * FROM Feature
        WHERE feature_id = ${feature_id}
    `;
    return feature;
}

// Retrieve data for a task by its task id
export async function get_task_by_id(task_id: number) {
    const [task] = await sql`
        SELECT * FROM Task
        WHERE task_id = ${task_id}
    `;
    return task;
}

// Get all tasks associated with a specific feature by its id.
export async function get_tasks_by_feature_id(feature_id: number) {
    const tasks = await sql`
        SELECT * FROM Task
        WHERE feature_id = ${feature_id}
    `;
    return tasks;
}

// Use the account id to get all the roles that account has (to get the households the account is associated with)
export async function get_account_roles_by_account_id(account_id: number) {
    const roles = await sql`
        SELECT household_id, role
        FROM AccountRole
        WHERE account_id = ${account_id}
    `;
    return roles;
}

// Use the household id to get all the roles for that household (to get all the accounts in the household)
export async function get_account_roles_by_household_id(household_id: number) {
    const roles = await sql`
        SELECT account_id, role
        FROM AccountRole
        WHERE household_id = ${household_id}
    `;
    return roles;
}

// Use the household id to get all of its features
export async function get_household_features(household_id: number) {
    const features = await sql`
        SELECT * FROM Feature
        WHERE household_id = ${household_id}
    `;
    return features;
}

// Use the household id to get all of its tasks
// A join between the Task and Feature relations is needed to make the connection between the Household id and the tasks
export async function get_household_tasks(household_id: number) {
    const tasks = await sql`
        SELECT Task.*
        FROM Task
        JOIN Feature ON Task.feature_id = Feature.feature_id
        WHERE Feature.household_id = ${household_id}
    `;
    return tasks;
}

/**
 * Functions for updating data
 */

export async function update_task_last_comp_time(task_id: number) {
    await sql`
        UPDATE Task
        SET last_completed = ${new Date()}
        WHERE task_id = ${task_id}
    `;
}

// Update the last login time for an account
export async function update_account_last_login(account_id: number) {
    await sql`
        UPDATE Account
        SET last_login = ${new Date()}
        WHERE account_id = ${account_id}
    `;
}

// Update feature coordinates
export async function update_feature_coordinates(feature_id: number, x_pos: number, y_pos: number, z_pos: number) {
    await sql`
        UPDATE Feature
        SET x_pos = ${x_pos}, y_pos = ${y_pos}, z_pos = ${z_pos}
        WHERE feature_id = ${feature_id}
    `;
}

