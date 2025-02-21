import { Anthropic } from "@anthropic-ai/sdk"
import { ModelInfo } from "../../shared/api"

/**
 * Truncates a conversation by removing a fraction of the messages.
 *
 * The first message is always retained, and a specified fraction (rounded to an even number)
 * of messages from the beginning (excluding the first) is removed.
 *
 * @param {Anthropic.Messages.MessageParam[]} messages - The conversation messages.
 * @param {number} fracToRemove - The fraction (between 0 and 1) of messages (excluding the first) to remove.
 * @returns {Anthropic.Messages.MessageParam[]} The truncated conversation messages.
 */
// 定义一个函数，用于截断对话
export function truncateConversation(
	messages: Anthropic.Messages.MessageParam[], // 消息数组
	fracToRemove: number, // 要移除的比例
): Anthropic.Messages.MessageParam[] {
	const truncatedMessages = [messages[0]] // 保留第一条消息
	const rawMessagesToRemove = Math.floor((messages.length - 1) * fracToRemove) // 计算要移除的消息数量
	const messagesToRemove = rawMessagesToRemove - (rawMessagesToRemove % 2) // 确保要移除的消息数量为偶数
	const remainingMessages = messages.slice(messagesToRemove + 1) // 获取剩余的消息
	truncatedMessages.push(...remainingMessages) // 将剩余的消息添加到截断后的消息数组中

	return truncatedMessages // 返回截断后的消息数组
}

/**
 * Conditionally truncates the conversation messages if the total token count exceeds the model's limit.
 *
 * Depending on whether the model supports prompt caching, different maximum token thresholds
 * and truncation fractions are used. If the current total tokens exceed the threshold,
 * the conversation is truncated using the appropriate fraction.
 *
 * @param {Anthropic.Messages.MessageParam[]} messages - The conversation messages.
 * @param {number} totalTokens - The total number of tokens in the conversation.
 * @param {ModelInfo} modelInfo - Model metadata including context window size and prompt cache support.
 * @returns {Anthropic.Messages.MessageParam[]} The original or truncated conversation messages.
 */
export function truncateConversationIfNeeded(
	messages: Anthropic.Messages.MessageParam[],
	totalTokens: number,
	modelInfo: ModelInfo,
): Anthropic.Messages.MessageParam[] {
	if (modelInfo.supportsPromptCache) {
		return totalTokens < getMaxTokensForPromptCachingModels(modelInfo)
			? messages
			: truncateConversation(messages, getTruncFractionForPromptCachingModels(modelInfo))
	} else {
		return totalTokens < getMaxTokensForNonPromptCachingModels(modelInfo)
			? messages
			: truncateConversation(messages, getTruncFractionForNonPromptCachingModels(modelInfo))
	}
}

/**
 * Calculates the maximum allowed tokens for models that support prompt caching.
 *
 * The maximum is computed as the greater of (contextWindow - 40000) and 80% of the contextWindow.
 *
 * @param {ModelInfo} modelInfo - The model information containing the context window size.
 * @returns {number} The maximum number of tokens allowed for prompt caching models.
 */
function getMaxTokensForPromptCachingModels(modelInfo: ModelInfo): number {
	return Math.max(modelInfo.contextWindow - 40_000, modelInfo.contextWindow * 0.8)
}

/**
 * Provides the fraction of messages to remove for models that support prompt caching.
 *
 * @param {ModelInfo} modelInfo - The model information (unused in current implementation).
 * @returns {number} The truncation fraction for prompt caching models (fixed at 0.5).
 */
function getTruncFractionForPromptCachingModels(modelInfo: ModelInfo): number {
	return 0.5
}

/**
 * Calculates the maximum allowed tokens for models that do not support prompt caching.
 *
 * The maximum is computed as the greater of (contextWindow - 40000) and 80% of the contextWindow.
 *
 * @param {ModelInfo} modelInfo - The model information containing the context window size.
 * @returns {number} The maximum number of tokens allowed for non-prompt caching models.
 */
function getMaxTokensForNonPromptCachingModels(modelInfo: ModelInfo): number {
	return Math.max(modelInfo.contextWindow - 40_000, modelInfo.contextWindow * 0.8)
}

/**
 * Provides the fraction of messages to remove for models that do not support prompt caching.
 *
 * @param {ModelInfo} modelInfo - The model information.
 * @returns {number} The truncation fraction for non-prompt caching models (fixed at 0.1).
 */
function getTruncFractionForNonPromptCachingModels(modelInfo: ModelInfo): number {
	return Math.min(40_000 / modelInfo.contextWindow, 0.2)
}
