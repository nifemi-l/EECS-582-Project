/* PROLOGUE
File name: edit+api.ts
Description: Route containing behavior for /api/chore/edit endpoint, proxying to Flask backend.
Programmer: Delroy Wright 
Creation date: 2/9/26
Revision date: 3/11/26
Preconditions: A client is running and has requested to edit a chore
Postconditions: A response from the Flask server is returned to the client.
*/

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const task_id = body.task_id || body.id;

    if (!task_id) {
        return Response.json({ ok: false, error: "task_id is required" }, { status: 400 });
    }

    const backendData = {
        task_name: body.title || body.task_name,
        frequency_days: body.frequency_days,
        visibility: body.visibility
    };

    const response = await fetch(`http://localhost:8000/api/task/${task_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendData)
    });

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ ok: false, error: "Failed to connect to backend" }, { status: 500 });
  }
}
