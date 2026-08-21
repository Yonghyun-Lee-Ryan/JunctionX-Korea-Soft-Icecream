export interface AiGenerateRequest {
  prompt: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AiGenerateResponse {
  text: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AiStreamChunk {
  textDelta: string;
}

export interface AiProvider {
  generate(request: AiGenerateRequest): Promise<AiGenerateResponse>;
  stream?(request: AiGenerateRequest): AsyncIterable<AiStreamChunk>;
}
