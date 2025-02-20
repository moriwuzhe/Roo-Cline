import { ApiConfiguration } from "../shared/api" // 导入 ApiConfiguration 类型
import { buildApiHandler, SingleCompletionHandler } from "../api" // 导入 buildApiHandler 和 SingleCompletionHandler

/**
 * 使用配置的 API 增强提示，而不创建完整的 Cline 实例或任务历史记录。
 * 这是一个轻量级的替代方案，仅使用 API 的完成功能。
 */
export async function singleCompletionHandler(apiConfiguration: ApiConfiguration, promptText: string): Promise<string> {
	if (!promptText) {
		throw new Error("No prompt text provided") // 如果未提供提示文本，则抛出错误
	}
	if (!apiConfiguration || !apiConfiguration.apiProvider) {
		throw new Error("No valid API configuration provided") // 如果未提供有效的 API 配置，则抛出错误
	}

	const handler = buildApiHandler(apiConfiguration) // 构建 API 处理程序

	// 检查处理程序是否支持单次完成
	if (!("completePrompt" in handler)) {
		throw new Error("The selected API provider does not support prompt enhancement") // 如果处理程序不支持提示增强，则抛出错误
	}

	return (handler as SingleCompletionHandler).completePrompt(promptText) // 返回完成的提示文本
}
