export interface AiConfiguration {
  provider: "openai" | "deepseek";
  model: string;
  tariffVersion: string;
  inputMilliCredits: number;
  cachedInputMilliCredits: number;
  outputMilliCredits: number;
  mode: "strict_json_schema" | "json_mode_local_validation";
}
export const OPENAI_CONFIGURATION: AiConfiguration = Object.freeze({
  provider: "openai",
  model: "gpt-4o-mini",
  tariffVersion: "openai-catalog-2026-11-24",
  inputMilliCredits: 150,
  cachedInputMilliCredits: 75,
  outputMilliCredits: 600,
  mode: "strict_json_schema",
});
// Stable internal peak catalogue price, deliberately independent from provider off-peak/holiday invoice discounts.
export const DEEPSEEK_CONFIGURATION: AiConfiguration = Object.freeze({
  provider: "deepseek",
  model: "deepseek-flash",
  tariffVersion: "deepseek-internal-peak-2026-11-24",
  inputMilliCredits: 300,
  cachedInputMilliCredits: 6,
  outputMilliCredits: 1200,
  mode: "json_mode_local_validation",
});
export function aiConfiguration(): AiConfiguration {
  const provider = process.env.AI_PROVIDER ?? "deepseek";
  if (provider === "openai") return OPENAI_CONFIGURATION;
  if (provider === "deepseek") return DEEPSEEK_CONFIGURATION;
  throw new Error("AI_PROVIDER must be openai or deepseek");
}
export function usageCost(
  input: number,
  output: number,
  cachedInput = 0,
  configuration: AiConfiguration = OPENAI_CONFIGURATION,
) {
  if (
    ![input, output, cachedInput].every(
      (x) => Number.isSafeInteger(x) && x >= 0,
    ) ||
    cachedInput > input
  )
    throw new Error("Invalid provider token usage");
  return Math.floor(
    ((input - cachedInput) * configuration.inputMilliCredits +
      cachedInput * configuration.cachedInputMilliCredits +
      output * configuration.outputMilliCredits +
      999) /
      1000,
  );
}
