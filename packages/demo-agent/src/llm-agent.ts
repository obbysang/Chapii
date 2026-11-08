const provider = process.env.LLM_PROVIDER ?? "";
const key = process.env.LLM_API_KEY ?? "";

if (!key || !provider) {
  console.log("LLM demo skipped: set LLM_PROVIDER + LLM_API_KEY to run the prompt-injection scenario (scripted mode needs no key).");
  process.exit(0);
}

console.log(`LLM demo placeholder (provider=${provider}); see spec 5.4. The vault blocks injected payments regardless of model behaviour.`);
