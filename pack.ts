
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