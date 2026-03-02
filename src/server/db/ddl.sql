/*
Author: Blake Carlson
Filename: ddl.sql
Purpose: SQL file containing the DDL for the project database
Creation Date: 2/15/2026
Preconditions: N/A
Postconditions: Create the base structure of the database with the tables, attributes, and data types
Error / Exception conditions: N/A
Side effects: N/A
Invariants: The structure of the database must match the DDL

The tables that will need to be created are
    Household
    Account
    Feature
    Task
*/

/* 
Create a table for the Households
    Attributes:
        ID (Primary key)
        Name
        
        (Anything else?)
*/
CREATE TABLE IF NOT EXISTS Household (
    /* Household has an id as the primary key */
    household_id SERIAL PRIMARY KEY CHECK (household_id > 0),
    /* The name of the household */
    household_name VARCHAR(50) NOT NULL
    /* Any more needed? */
);

/*
Create a table for Accounts
    Attributes:
        Number (Primary Key)
        Name
        Linked to a household by household_id
*/
CREATE TABLE IF NOT EXISTS Account (
    /* Account id is the primary key */
    account_id SERIAL PRIMARY KEY CHECK (account_id > 0),
    /* A single account can be a part of multiple households
        Add a many to many relationship table
    */
    /* The name of the account */
    account_name VARCHAR(50) NOT NULL,
    /* Store a hashed version of the user's password for security */
    hashed_password VARCHAR(255) NOT NULL,
    /* Each account should have a unique email for login */
    email VARCHAR(255) NOT NULL UNIQUE,
    /* Store time the account is created */
    created_at TIMESTAMPTZ DEFAULT NOW(),
    /* Last login time */
    last_login TIMESTAMPTZ
);

/* Create a table for account roles
    Each account could have a different role in each household
    The roles are either "admin" and "member"
*/
CREATE TABLE IF NOT EXISTS AccountRole (
    account_id INTEGER NOT NULL
        REFERENCES Account(account_id) ON DELETE CASCADE,
    household_id INTEGER NOT NULL
        REFERENCES Household(household_id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL
        CHECK (role IN ('admin', 'member')),
    PRIMARY KEY (account_id, household_id)
);

/*
Create a table for cleanable features
    Attributes:
        Feature id (Primary Key)
        Feature name
        Feature Type
        Position
            X
            Y
            Z
    Linked to household by household_id
*/
CREATE TABLE IF NOT EXISTS Feature (
    /* Positive id for features as the primary key */
    feature_id SERIAL PRIMARY KEY CHECK (feature_id > 0),
    /* Household id should link the feature to a specific household 
        Is cascade needed here?
    */
    household_id INTEGER REFERENCES Household(household_id) ON DELETE CASCADE,
    /* Name and types of the feature */
    feature_name VARCHAR(50) NOT NULL,
    feature_type VARCHAR(50),
    /* Do I have x, y, and z as separate or one position with all 3?
        Make floats */
    x_pos FLOAT NOT NULL,
    y_pos FLOAT NOT NULL,
    z_pos FLOAT NOT NULL
);


/*
Create a feature for the individual tasks
    Attributes:
        Name (Primary key)
        Frequency
        Last_Completed
*/
CREATE TABLE IF NOT EXISTS Task (
    /* Id for each individual task which is used as a primary key */
    task_id SERIAL PRIMARY KEY,
    /* Use feature id to link each task to a particular feature 
        Is cascade needed here?
    */
    feature_id INTEGER REFERENCES Feature(feature_id) ON DELETE CASCADE,
    /* Name of the task */
    task_name VARCHAR(50) NOT NULL,
    /* # of days for how often the task needs to be done */
    frequency_days INTEGER NOT NULL,
    /* Last completed is stored as a time stamp. timestamptz includes timezone as well converting to UTC */
    last_completed TIMESTAMPTZ,
    /* Temporary implementation of privacy settings for tasks 
        The visibility options will be "private" and "household" or something to that effect
            Ex: doing my personal laundry shouldn't be public to everyone in the house
    */
    visibility VARCHAR(20) CHECK (visibility IN ('private', 'household')) NOT NULL,
    created_by_account_id INTEGER REFERENCES Account(account_id) ON DELETE SET NULL
);


/*
Functions for adding data to the database
*/



/*
Functions for retrieving specific data from the database
*/