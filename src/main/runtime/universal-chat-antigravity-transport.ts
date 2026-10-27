/* eslint-disable max-lines -- Anthropic, Responses and Chat Completions translations share one audited transport boundary. */
import { randomUUID } from 'node:crypto'
import { getAppEnvironment } from '../../shared/app-environment'
import { createAntigravityHostCredentialBackend } from '../antigravity/native-credential-backend'
import { getMainHttpClient } from '../network/http-client'
import type {
  UniversalChatGatewayRequest,
  UniversalChatGatewayResponse
} from './universal-chat-gateway'

const CODE_ASSIST_URLS = [
  'https://daily-cloudcode-pa.googleapis.com/v1internal',
  'https://cloudcode-pa.googleapis.com/v1internal'
] as const
const encoder = new TextEncoder()

type JsonRecord = Record<string, unknown>
type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: JsonRecord } }
  | { functionResponse: { name: string; response: unknown } }

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function textParts(value: unknown, toolNames = new Map<string, string>()): GeminiPart[] {
  if (typeof value === 'string') {
    return [{ text: value }]
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): GeminiPart[] => {
    const block = record(item)
    if (block.type === 'text' && typeof block.text === 'string') {
      return [{ text: block.text }]
    }
    if (block.type === 'tool_use' && typeof block.name === 'string') {
      if (typeof block.id === 'string') {
        toolNames.set(block.id, block.name)
      }
      return [
        {
          functionCall: {
            name: block.name,
            args: record(block.input)
          }
        }
      ]
    }
    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      return [
        {
          functionResponse: {
            name: toolNames.get(block.tool_use_id) ?? block.tool_use_id,
            response: { content: block.content }
          }
        }
      ]
    }
    return []
  })
}

function canonicalAntigravityModel(modelId: string): string {
  const bare = modelId.replace(/^(?:agy|antigravity)\//i, '')
  return /-(?:low|medium|high)$/i.test(bare) ? bare : `${bare}-medium`
}

function anthropicToCodeAssist(body: unknown, modelId: string): JsonRecord {
  const input = record(body)
  const systemParts = textParts(input.system)
  const messages = Array.isArray(input.messages) ? input.messages : []
  const toolNames = new Map<string, string>()
  const tools = Array.isArray(input.tools)
    ? input.tools.flatMap((value) => {
        const tool = record(value)
        if (typeof tool.name !== 'string') {
          return []
        }
        return [
          {
            name: tool.name,
            ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
            parameters: record(tool.input_schema)
          }
        ]
      })
    : []
  return {
    model: canonicalAntigravityModel(modelId),
    user_prompt_id: randomUUID(),
    request: {
      contents: messages.map((value) => {
        const message = record(value)
        return {
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: textParts(message.content, toolNames)
        }
      }),
      ...(systemParts.length ? { systemInstruction: { role: 'user', parts: systemParts } } : {}),
      ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
      generationConfig: {
        ...(typeof input.max_tokens === 'number' ? { maxOutputTokens: input.max_tokens } : {}),
        ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
        ...(Array.isArray(input.stop_sequences) ? { stopSequences: input.stop_sequences } : {})
      },
      session_id: randomUUID()
    }
  }
}

function openAiContentParts(value: unknown): GeminiPart[] {
  if (typeof value === 'string') {
    return [{ text: value }]
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): GeminiPart[] => {
    const part = record(item)
    if (
      ['text', 'input_text', 'output_text'].includes(String(part.type)) &&
      typeof part.text === 'string'
    ) {
      return [{ text: part.text }]
    }
    return []
  })
}

function openAiToCodeAssist(body: unknown, modelId: string): JsonRecord {
  const input = record(body)
  const rawMessages = Array.isArray(input.messages)
    ? input.messages
    : Array.isArray(input.input)
      ? input.input
      : typeof input.input === 'string'
        ? [{ role: 'user', content: input.input }]
        : []
  const systemParts = [
    ...openAiContentParts(input.instructions),
    ...rawMessages.flatMap((value) => {
      const message = record(value)
      return ['system', 'developer'].includes(String(message.role))
        ? openAiContentParts(message.content)
        : []
    })
  ]
  const toolNames = new Map<string, string>()
  const contents = rawMessages.flatMap((value) => {
    const message = record(value)
    if (['system', 'developer'].includes(String(message.role))) {
      return []
    }
    if (message.type === 'function_call_output') {
      const callId = String(message.call_id ?? '')
      return [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolNames.get(callId) ?? callId,
                response: { output: message.output }
              }
            }
          ]
        }
      ]
    }
    const parts = openAiContentParts(message.content)
    if (Array.isArray(message.tool_calls)) {
      for (const rawCall of message.tool_calls) {
        const call = record(rawCall)
        const fn = record(call.function)
        const name = String(fn.name ?? '')
        const id = String(call.id ?? '')
        if (id && name) {
          toolNames.set(id, name)
        }
        let args: JsonRecord = {}
        try {
          args =
            typeof fn.arguments === 'string'
              ? record(JSON.parse(fn.arguments))
              : record(fn.arguments)
        } catch {}
        if (name) {
          parts.push({ functionCall: { name, args } })
        }
      }
    }
    if (message.role === 'tool') {
      const callId = String(message.tool_call_id ?? '')
      return [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolNames.get(callId) ?? String(message.name ?? callId),
                response: { content: message.content }
              }
            }
          ]
        }
      ]
    }
    return [{ role: message.role === 'assistant' ? 'model' : 'user', parts }]
  })
  const rawTools = Array.isArray(input.tools) ? input.tools : []
  const functions = rawTools.flatMap((value) => {
    const tool = record(value)
    const fn = tool.type === 'function' && tool.function ? record(tool.function) : tool
    if (typeof fn.name !== 'string') {
      return []
    }
    return [
      {
        name: fn.name,
        ...(typeof fn.description === 'string' ? { description: fn.description } : {}),
        parameters: record(fn.parameters)
      }
    ]
  })
  return {
    model: canonicalAntigravityModel(modelId),
    user_prompt_id: randomUUID(),
    request: {
      contents,
      ...(systemParts.length ? { systemInstruction: { role: 'user', parts: systemParts } } : {}),
      ...(functions.length ? { tools: [{ functionDeclarations: functions }] } : {}),
      generationConfig: {
        ...(typeof input.max_tokens === 'number' ? { maxOutputTokens: input.max_tokens } : {}),
        ...(typeof input.max_output_tokens === 'number'
          ? { maxOutputTokens: input.max_output_tokens }
          : {}),
        ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {})
      },
      session_id: randomUUID()
    }
  }
}

function responseParts(payloads: JsonRecord[]): GeminiPart[] {
  return payloads.flatMap((payload) => {
    const response = record(payload.response)
    const candidates = Array.isArray(response.candidates) ? response.candidates : []
    const first = record(candidates[0])
    const content = record(first.content)
    return Array.isArray(content.parts) ? (content.parts as GeminiPart[]) : []
  })
}

function anthropicBlocks(parts: GeminiPart[]): JsonRecord[] {
  return parts.flatMap<JsonRecord>((part, index) => {
    if ('text' in part) {
      return [{ type: 'text', text: part.text }]
    }
    if ('functionCall' in part) {
      return [
        {
          type: 'tool_use',
          id: `toolu_orca_${index}_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
          name: part.functionCall.name,
          input: part.functionCall.args
        }
      ]
    }
    return []
  })
}

function parseSse(text: string): JsonRecord[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .flatMap((line) => {
      try {
        return [record(JSON.parse(line.slice(5).trim()) as unknown)]
      } catch {
        return []
      }
    })
}

function anthropicResponse(blocks: JsonRecord[], modelId: string): JsonRecord {
  return {
    id: `msg_orca_${randomUUID().replaceAll('-', '')}`,
    type: 'message',
    role: 'assistant',
    model: modelId,
    content: blocks,
    stop_reason: blocks.some((block) => block.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 }
  }
}

function anthropicSse(message: JsonRecord): ReadableStream<Uint8Array> {
  const blocks = Array.isArray(message.content) ? message.content.map(record) : []
  const events: JsonRecord[] = [
    { type: 'message_start', message: { ...message, content: [], stop_reason: null } }
  ]
  blocks.forEach((block, index) => {
    if (block.type === 'tool_use') {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} }
      })
      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) }
      })
    } else {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' }
      })
      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: typeof block.text === 'string' ? block.text : '' }
      })
    }
    events.push({ type: 'content_block_stop', index })
  })
  events.push({
    type: 'message_delta',
    delta: { stop_reason: message.stop_reason, stop_sequence: null },
    usage: { output_tokens: 0 }
  })
  events.push({ type: 'message_stop' })
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
        )
      }
      controller.close()
    }
  })
}

function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    }
  })
}

function openAiChatResponse(blocks: JsonRecord[], modelId: string, stream: boolean) {
  const id = `chatcmpl_orca_${randomUUID().replaceAll('-', '')}`
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => String(block.text ?? ''))
    .join('')
  const toolCalls = blocks
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      type: 'function',
      function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) }
    }))
  if (!stream) {
    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        id,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: text || null,
              ...(toolCalls.length ? { tool_calls: toolCalls } : {})
            },
            finish_reason: toolCalls.length ? 'tool_calls' : 'stop'
          }
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      })
    }
  }
  const chunk = (delta: JsonRecord, finishReason: string | null) =>
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [{ index: 0, delta, finish_reason: finishReason }]
    })}\n\n`
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    body: streamFromLines([
      chunk({ role: 'assistant' }, null),
      ...(text ? [chunk({ content: text }, null)] : []),
      ...(toolCalls.length ? [chunk({ tool_calls: toolCalls }, null)] : []),
      chunk({}, toolCalls.length ? 'tool_calls' : 'stop'),
      'data: [DONE]\n\n'
    ])
  }
}

function openAiResponsesResponse(blocks: JsonRecord[], modelId: string, stream: boolean) {
  const id = `resp_orca_${randomUUID().replaceAll('-', '')}`
  const output = blocks.map((block, index) =>
    block.type === 'tool_use'
      ? {
          type: 'function_call',
          id: block.id,
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
          status: 'completed'
        }
      : {
          type: 'message',
          id: `msg_orca_${index}`,
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: String(block.text ?? ''), annotations: [] }]
        }
  )
  const response = {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: modelId,
    output,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
  }
  if (!stream) {
    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(response)
    }
  }
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    body: streamFromLines([
      `event: response.created\ndata: ${JSON.stringify({ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } })}\n\n`,
      ...output.flatMap((item, outputIndex) => [
        `event: response.output_item.added\ndata: ${JSON.stringify({ type: 'response.output_item.added', output_index: outputIndex, item })}\n\n`,
        `event: response.output_item.done\ndata: ${JSON.stringify({ type: 'response.output_item.done', output_index: outputIndex, item })}\n\n`
      ]),
      `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
      'data: [DONE]\n\n'
    ])
  }
}

export async function dispatchAntigravityRequest(
  input: UniversalChatGatewayRequest
): Promise<UniversalChatGatewayResponse> {
  const backend = createAntigravityHostCredentialBackend(getAppEnvironment().getPath('home'))
  const credential = await backend.read()
  if (!credential) {
    throw new Error('Aucun compte Antigravity connecté n’a été trouvé par Orca.')
  }
  if (credential.expiresAt && credential.expiresAt <= Date.now() + 30_000) {
    throw new Error('La session Antigravity a expiré. Reconnectez le compte dans Orca.')
  }
  const requestBody = JSON.stringify(
    input.protocol === 'anthropic-messages'
      ? anthropicToCodeAssist(input.body, input.modelId)
      : openAiToCodeAssist(input.body, input.modelId)
  )
  let upstream: Response | null = null
  for (const baseUrl of CODE_ASSIST_URLS) {
    upstream = await getMainHttpClient().fetch(`${baseUrl}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'orca-universal-chat'
      },
      body: requestBody,
      signal: input.signal
    })
    if (upstream.ok || ![404, 429, 500, 502, 503, 504].includes(upstream.status)) {
      break
    }
  }
  if (!upstream) {
    throw new Error('Orca n’a trouvé aucun endpoint Antigravity disponible.')
  }
  const raw = await upstream.text()
  if (!upstream.ok) {
    throw new Error(`Antigravity a refusé la requête (HTTP ${upstream.status}).`)
  }
  const message = anthropicResponse(
    anthropicBlocks(responseParts(parseSse(raw))),
    canonicalAntigravityModel(input.modelId)
  )
  const wantsStream = record(input.body).stream === true
  if (input.protocol === 'openai-chat') {
    return openAiChatResponse(message.content as JsonRecord[], message.model as string, wantsStream)
  }
  if (input.protocol === 'openai-responses') {
    return openAiResponsesResponse(
      message.content as JsonRecord[],
      message.model as string,
      wantsStream
    )
  }
  return wantsStream
    ? {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        body: anthropicSse(message)
      }
    : {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(message)
      }
}
