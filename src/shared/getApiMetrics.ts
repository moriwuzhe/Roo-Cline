import { ClineMessage } from "./ExtensionMessage"

// 定义 ApiMetrics 接口
interface ApiMetrics {
	totalTokensIn: number // 总输入令牌数
	totalTokensOut: number // 总输出令牌数
	totalCacheWrites?: number // 可选的总缓存写入次数
	totalCacheReads?: number // 可选的总缓存读取次数
	totalCost: number // 总成本
	contextTokens: number // 对话中的总令牌数（最后一条消息的 tokensIn + tokensOut + cacheWrites + cacheReads）
}

/**
 * 从 ClineMessages 数组计算 API 指标。
 *
 * 此函数处理已通过 combineApiRequests 函数合并其对应的 'api_req_finished' 消息的 'api_req_started' 消息。
 * 它提取并汇总这些消息中的 tokensIn、tokensOut、cacheWrites、cacheReads 和成本。
 *
 * @param messages - 要处理的 ClineMessage 对象数组。
 * @returns 包含 totalTokensIn、totalTokensOut、totalCacheWrites、totalCacheReads、totalCost 和 contextTokens 的 ApiMetrics 对象。
 *
 * @example
 * const messages = [
 *   { type: "say", say: "api_req_started", text: '{"request":"GET /api/data","tokensIn":10,"tokensOut":20,"cost":0.005}', ts: 1000 }
 * ];
 * const { totalTokensIn, totalTokensOut, totalCost } = getApiMetrics(messages);
 * // 结果: { totalTokensIn: 10, totalTokensOut: 20, totalCost: 0.005 }
 */
export function getApiMetrics(messages: ClineMessage[]): ApiMetrics {
	const result: ApiMetrics = {
		totalTokensIn: 0, // 初始化总输入令牌数
		totalTokensOut: 0, // 初始化总输出令牌数
		totalCacheWrites: undefined, // 初始化总缓存写入次数
		totalCacheReads: undefined, // 初始化总缓存读取次数
		totalCost: 0, // 初始化总成本
		contextTokens: 0, // 初始化对话中的总令牌数
	}

	// 辅助函数，从消息中获取总令牌数
	const getTotalTokensFromMessage = (message: ClineMessage): number => {
		if (!message.text) return 0
		try {
			const { tokensIn, tokensOut, cacheWrites, cacheReads } = JSON.parse(message.text)
			return (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
		} catch {
			return 0
		}
	}

	// 查找最后一条具有令牌的 api_req_started 消息
	const lastApiReq = [...messages].reverse().find((message) => {
		if (message.type === "say" && message.say === "api_req_started") {
			return getTotalTokensFromMessage(message) > 0
		}
		return false
	})

	// 计算运行总数
	messages.forEach((message) => {
		if (message.type === "say" && message.say === "api_req_started" && message.text) {
			try {
				const { tokensIn, tokensOut, cacheWrites, cacheReads, cost } = JSON.parse(message.text)

				if (typeof tokensIn === "number") {
					result.totalTokensIn += tokensIn
				}
				if (typeof tokensOut === "number") {
					result.totalTokensOut += tokensOut
				}
				if (typeof cacheWrites === "number") {
					result.totalCacheWrites = (result.totalCacheWrites ?? 0) + cacheWrites
				}
				if (typeof cacheReads === "number") {
					result.totalCacheReads = (result.totalCacheReads ?? 0) + cacheReads
				}
				if (typeof cost === "number") {
					result.totalCost += cost
				}

				// 如果这是最后一个具有令牌的 API 请求，请使用其总数作为上下文大小
				if (message === lastApiReq) {
					result.contextTokens = getTotalTokensFromMessage(message)
				}
			} catch (error) {
				console.error("解析 JSON 时出错:", error)
			}
		}
	})

	return result
}
