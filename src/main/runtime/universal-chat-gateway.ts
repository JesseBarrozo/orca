import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

const MAX_REQUEST_BYTES = 16 * 1024 * 1024

export type UniversalChatGatewayRoute = {
  harness: string
  provider: string
  baseUrl: string
  authToken: string
  routedModelId: string
  launchModelId: string
}

export type UniversalChatGatewayRequest = {
  protocol: 'anthropic-messages' | 'openai-responses' | 'openai-chat'
  provider: string
  modelId: string
  body: unknown
  signal: AbortSignal
}

export type UniversalChatGatewayResponse = {
  status: number
  headers?: Record<string, string>
  body: string | Uint8Array | ReadableStream<Uint8Array>
}

export type UniversalChatGatewayDispatcher = (
  request: UniversalChatGatewayRequest
) => Promise<UniversalChatGatewayResponse>

const GATEWAY_CAPABLE_HARNESSES = new Set(['claude', 'codex', 'opencode', 'opencode2'])
const routes = new Map<string, { provider: string; modelId: string }>()
let serverState: Promise<{ server: Server; baseUrl: string }> | null = null
let dispatcher: UniversalChatGatewayDispatcher | null = null

/** The runtime wires its connected-account transports here; no external daemon is involved. */
export function setUniversalChatGatewayDispatcher(
  next: UniversalChatGatewayDispatcher | null
): void {
  dispatcher = next
}

export async function resolveUniversalChatGatewayRoute(input: {
  harness: string
  provider: string
  modelId: string
}): Promise<UniversalChatGatewayRoute | null> {
  if (input.harness === input.provider) {
    return null
  }
  if (!GATEWAY_CAPABLE_HARNESSES.has(input.harness)) {
    throw new Error(
      `Le harness ${input.harness} ne permet pas encore à Orca de remplacer son backend par le modèle ${input.modelId}. Choisissez Claude Code, Codex ou OpenCode comme harness.`
    )
  }
  const target = await ensureInternalGateway()
  const routedModelId = gatewayModelId(input.provider, input.modelId)
  const authToken = randomBytes(32).toString('base64url')
  routes.set(authToken, { provider: input.provider, modelId: input.modelId })
  return {
    harness: input.harness,
    provider: input.provider,
    baseUrl: target.baseUrl,
    authToken,
    routedModelId,
    launchModelId:
      input.harness === 'opencode' || input.harness === 'opencode2'
        ? `orca-universal/${routedModelId}`
        : routedModelId
  }
}

export function releaseUniversalChatGatewayRoute(authToken: string): void {
  routes.delete(authToken)
  stopInternalGatewayIfIdle()
}

function stopInternalGatewayIfIdle(): void {
  if (routes.size > 0 || !serverState) {
    return
  }
  const closing = serverState
  // A later route may start a fresh shim without waiting for old keep-alive connections.
  serverState = null
  void closing
    .then(({ server }) => {
      server.closeIdleConnections()
      server.close()
    })
    .catch(() => undefined)
}

export function gatewayModelId(provider: string, modelId: string): string {
  const normalizedModel = modelId.trim().replace(/^\/+/, '')
  if (normalizedModel.includes('/')) {
    return normalizedModel
  }
  if (provider === 'antigravity') {
    return `agy/${normalizedModel}`
  }
  if (provider === 'codex') {
    return `openai/${normalizedModel}`
  }
  return `${provider}/${normalizedModel}`
}

async function ensureInternalGateway(): Promise<{ server: Server; baseUrl: string }> {
  if (serverState) {
    return serverState
  }
  const startup = new Promise<{ server: Server; baseUrl: string }>((resolve, reject) => {
    const server = createServer((request, response) => void handleRequest(request, response))
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Orca n’a pas pu ouvrir son gateway interne.'))
        return
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  }).catch((error: unknown) => {
    serverState = null
    throw error
  })
  serverState = startup
  return startup
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ok', owner: 'orca' })
    return
  }
  const protocol = protocolFor(request.method, request.url)
  if (!protocol) {
    sendJson(response, 404, { error: { message: 'Route inconnue.' } })
    return
  }
  const token = bearerToken(request)
  const route = token ? routes.get(token) : null
  if (!route) {
    sendJson(response, 401, { error: { message: 'Session de Chat universel invalide.' } })
    return
  }
  const controller = new AbortController()
  request.once('aborted', () => controller.abort())
  try {
    const activeDispatcher =
      dispatcher ??
      (await import('./universal-chat-provider-dispatcher')).dispatchUniversalChatProviderRequest
    const result = await activeDispatcher({
      protocol,
      provider: route.provider,
      modelId: route.modelId,
      body: await readJsonBody(request),
      signal: controller.signal
    })
    response.writeHead(result.status, result.headers)
    if (result.body instanceof ReadableStream) {
      const reader = result.body.getReader()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        response.write(chunk.value)
      }
      response.end()
      return
    }
    response.end(result.body)
  } catch (error) {
    sendJson(response, 502, {
      error: { message: error instanceof Error ? error.message : 'Échec du transport fournisseur.' }
    })
  }
}

function protocolFor(
  method: string | undefined,
  url: string | undefined
): UniversalChatGatewayRequest['protocol'] | null {
  if (method !== 'POST') {
    return null
  }
  const path = url?.split('?')[0]
  if (path === '/v1/messages') {
    return 'anthropic-messages'
  }
  if (path === '/v1/responses') {
    return 'openai-responses'
  }
  if (path === '/v1/chat/completions') {
    return 'openai-chat'
  }
  return null
}

function bearerToken(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization?.trim()
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim() || null
  }
  const anthropic = request.headers['x-api-key']
  return typeof anthropic === 'string' && anthropic.trim() ? anthropic.trim() : null
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > MAX_REQUEST_BYTES) {
      throw new Error('La requête du harness dépasse la limite autorisée par Orca.')
    }
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}
