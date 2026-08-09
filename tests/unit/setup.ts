// SESSION_SECRET must be >=32 chars (sessionConfig.ts) — a fixed test value,
// never a real secret.
process.env.SESSION_SECRET = "test-session-secret-value-32-bytes-min";
