import { ClineMessage } from "./ExtensionMessage"

/**
 * 将 API 请求开始和结束消息组合在一起。
 *
 * 该函数查找 'api_req_started' 和 'api_req_finished' 消息对。
 * 当找到一对时，它将它们组合成一条 'api_req_combined' 消息。
 * 合并两条消息文本字段中的 JSON 数据。
 *
 * @param messages - 要处理的 ClineMessage 对象数组。
 * @returns 一个新的 ClineMessage 对象数组，组合了 API 请求。
 *
 * @example
 * const messages = [
 *   { type: "say", say: "api_req_started", text: '{"request":"GET /api/data"}', ts: 1000 },
 *   { type: "say", say: "api_req_finished", text: '{"cost":0.005}', ts: 1001 }
 * ];
 * const result = combineApiRequests(messages);
 * // 结果: [{ type: "say", say: "api_req_started", text: '{"request":"GET /api/data","cost":0.005}', ts: 1000 }]
 */
export function combineApiRequests(messages: ClineMessage[]): ClineMessage[] {
	const combinedApiRequests: ClineMessage[] = []

	for (let i = 0; i < messages.length; i++) {
		if (messages[i].type === "say" && messages[i].say === "api_req_started") {
			let startedRequest = JSON.parse(messages[i].text || "{}")
			let j = i + 1

			while (j < messages.length) {
				if (messages[j].type === "say" && messages[j].say === "api_req_finished") {
					let finishedRequest = JSON.parse(messages[j].text || "{}")
					let combinedRequest = { ...startedRequest, ...finishedRequest }

					combinedApiRequests.push({
						...messages[i],
						text: JSON.stringify(combinedRequest),
					})

					i = j // 跳到 api_req_finished 消息
					break
				}
				j++
			}

			if (j === messages.length) {
				// 如果没有找到匹配的 api_req_finished，保留原始的 api_req_started
				combinedApiRequests.push(messages[i])
			}
		}
	}

	// 替换原始的 api_req_started 并删除 api_req_finished
	return messages
		.filter((msg) => !(msg.type === "say" && msg.say === "api_req_finished"))
		.map((msg) => {
			if (msg.type === "say" && msg.say === "api_req_started") {
				const combinedRequest = combinedApiRequests.find((req) => req.ts === msg.ts)
				return combinedRequest || msg
			}
			return msg
		})
}
