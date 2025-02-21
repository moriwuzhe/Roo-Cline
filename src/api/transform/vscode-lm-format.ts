import { Anthropic } from "@anthropic-ai/sdk" // 导入 Anthropic SDK
import * as vscode from "vscode" // 导入 VS Code API

/**
 * Safely converts a value into a plain object.
 * 安全地将值转换为普通对象。
 */
function asObjectSafe(value: any): object {
	// Handle null/undefined
	// 处理 null/undefined
	if (!value) {
		return {}
	}

	try {
		// Handle strings that might be JSON
		// 处理可能是 JSON 的字符串
		if (typeof value === "string") {
			return JSON.parse(value)
		}

		// Handle pre-existing objects
		// 处理已存在的对象
		if (typeof value === "object") {
			return Object.assign({}, value)
		}

		return {}
	} catch (error) {
		console.warn("Roo Code <Language Model API>: Failed to parse object:", error) // 解析对象失败时发出警告
		return {}
	}
}

export function convertToVsCodeLmMessages(
	anthropicMessages: Anthropic.Messages.MessageParam[], // Anthropic 消息参数数组
): vscode.LanguageModelChatMessage[] {
	const vsCodeLmMessages: vscode.LanguageModelChatMessage[] = [] // 初始化 VS Code 语言模型聊天消息数组

	for (const anthropicMessage of anthropicMessages) {
		// Handle simple string messages
		// 处理简单的字符串消息
		if (typeof anthropicMessage.content === "string") {
			vsCodeLmMessages.push(
				anthropicMessage.role === "assistant"
					? vscode.LanguageModelChatMessage.Assistant(anthropicMessage.content) // 如果角色是助手，创建助手消息
					: vscode.LanguageModelChatMessage.User(anthropicMessage.content), // 否则，创建用户消息
			)
			continue // 继续处理下一个消息
		}

		// Handle complex message structures
		// 处理复杂的消息结构
		switch (anthropicMessage.role) {
			case "user": {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] // 非工具消息数组
					toolMessages: Anthropic.ToolResultBlockParam[] // 工具消息数组
				}>(
					(acc, part) => {
						if (part.type === "tool_result") {
							acc.toolMessages.push(part) // 如果是工具结果消息，添加到工具消息数组
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part) // 如果是文本或图像消息，添加到非工具消息数组
						}
						return acc // 返回累加器
					},
					{ nonToolMessages: [], toolMessages: [] }, // 初始化累加器
				)

				// Process tool messages first then non-tool messages
				// 先处理工具消息，然后处理非工具消息
				const contentParts = [
					// Convert tool messages to ToolResultParts
					// 将工具消息转换为工具结果部分
					...toolMessages.map((toolMessage) => {
						// Process tool result content into TextParts
						// 将工具结果内容处理为文本部分
						const toolContentParts: vscode.LanguageModelTextPart[] =
							typeof toolMessage.content === "string"
								? [new vscode.LanguageModelTextPart(toolMessage.content)] // 如果内容是字符串，创建新的文本部分
								: (toolMessage.content?.map((part) => {
										if (part.type === "image") {
											return new vscode.LanguageModelTextPart(
												`[Image (${part.source?.type || "Unknown source-type"}): ${part.source?.media_type || "unknown media-type"} not supported by VSCode LM API]`, // 如果是图像，创建新的文本部分，说明图像不支持
											)
										}
										return new vscode.LanguageModelTextPart(part.text) // 否则，创建新的文本部分
									}) ?? [new vscode.LanguageModelTextPart("")]) // 如果内容为空，创建空的文本部分

						return new vscode.LanguageModelToolResultPart(toolMessage.tool_use_id, toolContentParts) // 创建新的工具结果部分
					}),

					// Convert non-tool messages to TextParts after tool messages
					// 在工具消息之后将非工具消息转换为文本部分
					...nonToolMessages.map((part) => {
						if (part.type === "image") {
							return new vscode.LanguageModelTextPart(
								`[Image (${part.source?.type || "Unknown source-type"}): ${part.source?.media_type || "unknown media-type"} not supported by VSCode LM API]`, // 如果是图像，创建新的文本部分，说明图像不支持
							)
						}
						return new vscode.LanguageModelTextPart(part.text) // 否则，创建新的文本部分
					}),
				]

				// Add single user message with all content parts
				// 添加包含所有内容部分的单个用户消息
				vsCodeLmMessages.push(vscode.LanguageModelChatMessage.User(contentParts))
				break
			}

			case "assistant": {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] // 非工具消息数组
					toolMessages: Anthropic.ToolUseBlockParam[] // 工具消息数组
				}>(
					(acc, part) => {
						if (part.type === "tool_use") {
							acc.toolMessages.push(part) // 如果是工具使用消息，添加到工具消息数组
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part) // 如果是文本或图像消息，添加到非工具消息数组
						}
						return acc // 返回累加器
					},
					{ nonToolMessages: [], toolMessages: [] }, // 初始化累加器
				)

				// Process tool messages first then non-tool messages
				// 先处理工具消息，然后处理非工具消息
				const contentParts = [
					// Convert tool messages to ToolCallParts first
					// 先将工具消息转换为工具调用部分
					...toolMessages.map(
						(toolMessage) =>
							new vscode.LanguageModelToolCallPart(
								toolMessage.id,
								toolMessage.name,
								asObjectSafe(toolMessage.input), // 创建新的工具调用部分
							),
					),

					// Convert non-tool messages to TextParts after tool messages
					// 在工具消息之后将非工具消息转换为文本部分
					...nonToolMessages.map((part) => {
						if (part.type === "image") {
							return new vscode.LanguageModelTextPart("[Image generation not supported by VSCode LM API]") // 如果是图像，创建新的文本部分，说明图像生成不支持
						}
						return new vscode.LanguageModelTextPart(part.text) // 否则，创建新的文本部分
					}),
				]

				// Add the assistant message to the list of messages
				// 将助手消息添加到消息列表中
				vsCodeLmMessages.push(vscode.LanguageModelChatMessage.Assistant(contentParts))
				break
			}
		}
	}

	return vsCodeLmMessages // 返回 VS Code 语言模型聊天消息数组
}

export function convertToAnthropicRole(vsCodeLmMessageRole: vscode.LanguageModelChatMessageRole): string | null {
	switch (vsCodeLmMessageRole) {
		case vscode.LanguageModelChatMessageRole.Assistant:
			return "assistant" // 如果角色是助手，返回 "assistant"
		case vscode.LanguageModelChatMessageRole.User:
			return "user" // 如果角色是用户，返回 "user"
		default:
			return null // 否则，返回 null
	}
}

export async function convertToAnthropicMessage(
	vsCodeLmMessage: vscode.LanguageModelChatMessage, // VS Code 语言模型聊天消息
): Promise<Anthropic.Messages.Message> {
	const anthropicRole: string | null = convertToAnthropicRole(vsCodeLmMessage.role) // 转换为 Anthropic 角色
	if (anthropicRole !== "assistant") {
		throw new Error("Roo Code <Language Model API>: Only assistant messages are supported.") // 如果不是助手角色，抛出错误
	}

	return {
		id: crypto.randomUUID(), // 生成随机 UUID
		type: "message", // 消息类型
		model: "vscode-lm", // 模型名称
		role: anthropicRole, // 角色
		content: vsCodeLmMessage.content
			.map((part): Anthropic.ContentBlock | null => {
				if (part instanceof vscode.LanguageModelTextPart) {
					return {
						type: "text", // 文本类型
						text: part.value, // 文本值
					}
				}

				if (part instanceof vscode.LanguageModelToolCallPart) {
					return {
						type: "tool_use", // 工具使用类型
						id: part.callId || crypto.randomUUID(), // 工具调用 ID
						name: part.name, // 工具名称
						input: asObjectSafe(part.input), // 工具输入
					}
				}

				return null // 否则，返回 null
			})
			.filter((part): part is Anthropic.ContentBlock => part !== null), // 过滤掉 null 部分
		stop_reason: null, // 停止原因
		stop_sequence: null, // 停止序列
		usage: {
			input_tokens: 0, // 输入令牌数
			output_tokens: 0, // 输出令牌数
		},
	}
}
