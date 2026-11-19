import { loadEnv } from './env';
import { AnthropicLlmClient, DisabledLlmClient } from './llm';
import { buildApp } from './server';

const env = loadEnv();
const llm = env.ANTHROPIC_API_KEY
  ? new AnthropicLlmClient(env.ANTHROPIC_API_KEY)
  : new DisabledLlmClient();
const app = buildApp({ env, llm });

if (!env.ANTHROPIC_API_KEY) {
  app.log.warn('ANTHROPIC_API_KEY absent : les routes IA renverront les fallbacks locaux.');
}

app.listen({ port: env.PORT, host: env.HOST }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
