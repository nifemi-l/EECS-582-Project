/* PROLOGUE
File name: edit+api.ts
Description: Route containing behavior for /api/feature/edit endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to edit a feature
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { update_feature } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string | number;
      name?: string;
      type?: string;
      x?: number;
      y?: number;
      z?: number;
    };

    if (!body.id || !body.name) {
      return Response.json(
        { ok: false, error: "Feature ID and name are required" },
        { status: 400 }
      );
    }

    const id = typeof body.id === 'string' ? parseInt(body.id) : body.id;
    await update_feature(
      id,
      body.name,
      body.type ?? '',
      body.x ?? 0,
      body.y ?? 0,
      body.z ?? 0
    );

    return Response.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to edit feature" }, { status: 500 });
  }
}
