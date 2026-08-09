// Application Insights (ADR-009): workspace-based, Node SDK only. Inert
// (no-op) unless APPLICATIONINSIGHTS_CONNECTION_STRING is set — required for
// local dev and tests to run without any telemetry backend.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return;

  // `webpackIgnore` keeps this entirely out of both the Node and Edge
  // compiler passes (the SDK's OpenTelemetry/gRPC dependency chain isn't
  // Edge-bundleable, and register() is otherwise still reachable from
  // instrumentation.ts's shared module graph regardless of the runtime
  // guard above) — resolved by Node's own `import()` at runtime instead.
  const appInsights = await import(/* webpackIgnore: true */ "applicationinsights");
  appInsights
    .setup()
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .setSendLiveMetrics(false)
    .start();
}
