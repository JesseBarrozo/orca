import type {
  UniversalChatGatewayRequest,
  UniversalChatGatewayResponse
} from './universal-chat-gateway'
import { dispatchAntigravityRequest } from './universal-chat-antigravity-transport'

export async function dispatchUniversalChatProviderRequest(
  request: UniversalChatGatewayRequest
): Promise<UniversalChatGatewayResponse> {
  if (request.provider === 'antigravity') {
    return dispatchAntigravityRequest(request)
  }
  throw new Error(
    `Orca ne dispose pas encore d’un transport de compte direct pour ${request.provider}.`
  )
}
