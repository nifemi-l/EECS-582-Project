export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!body.email || !body.password) {
      return Response.json(
        { ok: false, error: "email and password required" },
        { status: 400 }
      );
    }

    // TODO: call your server logic here (create user, hash password, etc.)
    // const user = await registerUser(body);

    return Response.json(
      { ok: true, user: { email: body.email, name: body.name ?? null } },
      { status: 201 }
    );
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
}

