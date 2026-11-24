export interface ProductionPolicy {
  allowRegistration: boolean;
  allowMockTopUps: boolean;
}
export function productionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ProductionPolicy {
  const production = env.NODE_ENV === "production";
  return {
    allowRegistration:
      env.ALLOW_PUBLIC_REGISTRATION === undefined
        ? !production
        : env.ALLOW_PUBLIC_REGISTRATION === "true",
    allowMockTopUps:
      env.ALLOW_MOCK_TOPUPS === undefined
        ? !production
        : env.ALLOW_MOCK_TOPUPS === "true",
  };
}
