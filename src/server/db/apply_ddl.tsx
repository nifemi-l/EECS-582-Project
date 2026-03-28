/**
 * PROLOGUE
 * File name: apply_ddl.tsx
 * Description: Apply the DDL statements from ddl.sql file to the database.
 * Programmer: Delroy Wright
 * Creation date: 3/2/26
 */

// TO RUN: `npx ts-node src/server/db/apply_ddl.tsx`

import fs from 'fs';
import path from 'path';
import sql from './db_commands';

/**
 * Apply the DDL statements from ddl.sql file to the database.
 */
export async function apply_ddl() {
    try {
        // Use an absolute path or relative to project root
        const ddlPath = path.join(process.cwd(), "src/server/db/ddl.sql");
        const ddl_statements = fs.readFileSync(ddlPath, "utf-8");

        // .unsafe() allows running multiple statements from a raw string
        await sql.unsafe(ddl_statements);
        console.log("DDL applied successfully");
    } catch (error) {
        console.error("Error applying DDL:", error);
        throw error;
    }
}

/**
 * Completely reset the database by dropping the public schema.
 */
export async function remove_ddl() {
    try {
        await sql`
            DROP SCHEMA IF EXISTS public CASCADE;
            CREATE SCHEMA public;
        `;
        console.log("Database schema reset successfully");
    } catch (error) {
        console.error("Error removing DDL:", error);
        throw error;
    }
}

/**
 * Main execution block
 */
async function main() {
    try {
        console.log("Starting database setup...");
        await remove_ddl();
        await apply_ddl();
        console.log("Database setup complete");
        process.exit(0);
    } catch (err) {
        console.error("Database setup failed:", err);
        process.exit(1);
    }
}

// Run main if this file is executed directly
// Note: This check works in Node.js environments
if (import.meta.url === `file://${process.argv[1]}` || !process.argv[1]) {
    main();
} else if (require?.main === module) {
    main();
}
