/* PROLOGUE
File name: delete+api.ts
Description: Route containing behavior for /api/chore/delete endpoint, proxying to Flask backend.
Programmer: Delroy Wright 
Creation date: 2/9/26
Revision date: 3/11/26
Preconditions: A client is running and has requested to delete a chore
Postconditions: A response from the Flask server is returned to the client.
*/

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const task_id = body.task_id || body.id;

    if (!task_id) {
        return Response.json({ ok: false, error: "task_id is required" }, { status: 400 });
    }

    const response = await fetch(`http://localhost:8000/api/task/${task_id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      }
    });

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ ok: false, error: "Failed to connect to backend" }, { status: 500 });
  }
}
