// Fictional local provider boundary. Persistence is selected by the test config.
import { createServer } from "node:http";
import { createHmac, createHash, randomUUID } from "node:crypto";
const users = new Map(),
  refresh = new Map(),
  codes = new Map();
const secret = "B2-local-synthetic-provider-key";
let recovery, confirmation;
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (data) =>
  createHmac("sha256", secret).update(data).digest("base64url");
const view = (user) => ({
  id: user.id,
  email: user.email,
  email_confirmed_at: user.confirmedAt,
  aud: "authenticated",
  role: "authenticated",
  is_anonymous: false,
  created_at: user.confirmedAt,
  app_metadata: {},
  user_metadata: {},
});
const session = (user) => {
  const now = Math.floor(Date.now() / 1000);
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, email: user.email, iss: "http://127.0.0.1:3104/auth/v1", aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now, amr: [{ method: "password", timestamp: now }] })}`;
  const rt = randomUUID();
  refresh.set(rt, user);
  return {
    access_token: `${data}.${sign(data)}`,
    refresh_token: rt,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: view(user),
  };
};
const authenticate = (header) => {
  try {
    const p = (header || "").replace(/^Bearer /, "").split(".");
    if (p.length !== 3 || sign(p.slice(0, 2).join(".")) !== p[2]) return;
    const claims = JSON.parse(Buffer.from(p[1], "base64url"));
    if (claims.exp <= Date.now() / 1000) return;
    return [...users.values()].find((u) => u.id === claims.sub);
  } catch {
    return;
  }
};
createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization,content-type,apikey,x-client-info,x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Supabase-Api-Version", "2024-01-01");
  res.setHeader("Access-Control-Expose-Headers", "X-Supabase-Api-Version");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const send = (status, value) => {
    res.writeHead(status);
    res.end(JSON.stringify(value));
  };
  const url = new URL(req.url, "http://127.0.0.1:3104");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || "{}");
  if (url.pathname === "/health") return send(200, {});
  if (url.pathname === "/test/recovery") return send(200, recovery || {});
  if (url.pathname === "/test/confirmation") return send(200, confirmation || {});
  if (url.pathname === "/auth/v1/signup") {
    const email = body.email.toLowerCase();
    if (users.has(email))
      return send(422, {
        code: "user_already_exists",
        msg: "Already registered",
      });
    const user = {
      id: randomUUID(),
      email,
      password: body.password,
      confirmedAt: email.startsWith("verify-") ? null : new Date().toISOString(),
    };
    users.set(email, user);
    if (!user.confirmedAt) {
      const code = randomUUID();
      codes.set(code, { user, challenge: body.code_challenge, signup: true });
      confirmation = { code, redirect: url.searchParams.get("redirect_to") };
      return send(200, view(user));
    }
    return send(200, session(user));
  }
  if (url.pathname === "/auth/v1/recover") {
    const user = users.get(body.email.toLowerCase());
    recovery = {
      requested: true,
      redirect: url.searchParams.get("redirect_to"),
    };
    if (user) {
      const code = randomUUID();
      codes.set(code, { user, challenge: body.code_challenge });
      recovery.code = code;
    }
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "pkce") {
      const code = codes.get(body.auth_code);
      if (
        !code ||
        createHash("sha256")
          .update(body.code_verifier || "")
          .digest("base64url") !== code.challenge
      )
        return send(403, {
          code: "bad_code_verifier",
          msg: "Invalid recovery",
        });
      codes.delete(body.auth_code);
      if (code.signup) code.user.confirmedAt = new Date().toISOString();
      return send(200, session(code.user));
    }
    const user = body.refresh_token
      ? refresh.get(body.refresh_token)
      : users.get(body.email?.toLowerCase());
    if (!user || (!body.refresh_token && body.password !== user.password))
      return send(400, {
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      });
    if (!user.confirmedAt) return send(403, { code: "email_not_confirmed", msg: "Confirm your email before signing in." });
    return send(200, session(user));
  }
  if (url.pathname === "/auth/v1/.well-known/jwks.json")
    return send(200, { keys: [] });
  const user = authenticate(req.headers.authorization);
  if (!user) return send(401, { message: "Authentication required" });
  if (url.pathname === "/auth/v1/user") {
    if (req.method === "PUT" && body.password) user.password = body.password;
    return send(200, view(user));
  }
  if (url.pathname === "/auth/v1/logout") return send(200, {});
  return send(404, { message: "Provider fixture route not found" });
}).listen(3104, "127.0.0.1");
