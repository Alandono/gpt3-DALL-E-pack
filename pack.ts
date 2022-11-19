
import * as coda from '@codahq/packs-sdk';

export const pack = coda.newPack();

const DEFAULT_MODEL = 'text-ada-001';

pack.setUserAuthentication({
  type: coda.AuthenticationType.HeaderBearerToken,
  instructionsUrl: 'https://platform.openai.com/account/api-keys',
});

pack.addNetworkDomain('openai.com');

interface CompletionsRequest {
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
}

interface ChatCompletionMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
}

function isChatCompletionModel(model: string): boolean {
  // Also works with snapshot model like `gpt-3.5-turbo-0301` & `gpt-4-0314`
  return model.includes('gpt-3.5-turbo') || model.includes('gpt-4');
}

async function getChatCompletion(context: coda.ExecutionContext, request: ChatCompletionRequest): Promise<string> {
  const resp = await context.fetcher.fetch({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    body: JSON.stringify(request),
    headers: {'Content-Type': 'application/json'},
  });
  return resp.body.choices[0].message.content.trim();
}

async function getCompletion(context: coda.ExecutionContext, request: CompletionsRequest): Promise<string> {
  try {
    // Call Chat Completion API if the model is a chat completion model.
    if (isChatCompletionModel(request.model)) {
      return getChatCompletion(context, {
        model: request.model,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        messages: [{role: 'user', content: request.prompt}],
      });
    }

    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/completions',
      method: 'POST',
      body: JSON.stringify(request),
      headers: {'Content-Type': 'application/json'},
    });
    return resp.body.choices[0].text.trim();
  } catch (err: any) {
    if (err.statusCode === 429 && err.type === 'insufficient_quota') {
      throw new coda.UserVisibleError(
        "You've exceed your current OpenAI API quota. Please check your plan and billing details. For help, see https://help.openai.com/en/articles/6891831-error-code-429-you-exceeded-your-current-quota-please-check-your-plan-and-billing-details",
      );
    }

    throw err;
  }
}

const promptParam = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'prompt',
  description: 'prompt',
});

const modelParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'model',
  description: