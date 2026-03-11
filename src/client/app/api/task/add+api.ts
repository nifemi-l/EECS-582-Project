/* PROLOGUE
File name: add+api.ts
Description: Route containing behavior for /api/chore/add endpoint, proxying to Flask backend.
Programmer: Delroy Wright
Creation date: 2/9/26
Revision date: 3/11/26
Preconditions: A client is running and has requested to add a chore
Postconditions: A response from the Flask server is returned to the client.
*/

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const backendData = {
        feature_id: body.feature_id || 1, // Default or extracted
        task_name: body.title || body.task_name,
        frequency_days: body.frequency_days || 1,
        visibility: body.visibility || 'household',
        created_by_account_id: body.account_id
    };

    const response = await fetch("http://localhost:8000/api/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendData),
    });

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ ok: false, error: "Failed to connect to backend" }, { status: 500 });
  }
}
