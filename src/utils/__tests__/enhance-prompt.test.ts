import { singleCompletionHandler } from "../single-completion-handler" // 导入 singleCompletionHandler 函数
import { ApiConfiguration } from "../../shared/api" // 导入 ApiConfiguration 类型
import { buildApiHandler, SingleCompletionHandler } from "../../api" // 导入 buildApiHandler 和 SingleCompletionHandler
import { supportPrompt } from "../../shared/support-prompt" // 导入 supportPrompt

// 模拟 API 处理程序
jest.mock("../../api", () => ({
	buildApiHandler: jest.fn(),
}))

describe("enhancePrompt", () => {
	// 描述 "enhancePrompt" 测试套件
	const mockApiConfig: ApiConfiguration = {
		// 模拟 ApiConfiguration 对象
		apiProvider: "openai", // API 提供者
		openAiApiKey: "test-key", // OpenAI API 密钥
		openAiBaseUrl: "https://api.openai.com/v1", // OpenAI 基础 URL
	}

	beforeEach(() => {
		jest.clearAllMocks() // 清除所有模拟

		// 模拟具有 completePrompt 方法的 API 处理程序
		;(buildApiHandler as jest.Mock).mockReturnValue({
			completePrompt: jest.fn().mockResolvedValue("Enhanced prompt"), // 模拟 completePrompt 方法
			createMessage: jest.fn(), // 模拟 createMessage 方法
			getModel: jest.fn().mockReturnValue({
				id: "test-model", // 模型 ID
				info: {
					maxTokens: 4096, // 最大 token 数
					contextWindow: 8192, // 上下文窗口大小
					supportsPromptCache: false, // 是否支持提示缓存
				},
			}),
		} as unknown as SingleCompletionHandler)
	})

	it("enhances prompt using default enhancement prompt when no custom prompt provided", async () => {
		// 测试在未提供自定义提示时使用默认增强提示
		const result = await singleCompletionHandler(mockApiConfig, "Test prompt") // 调用 singleCompletionHandler

		expect(result).toBe("Enhanced prompt") // 断言结果是否为 "Enhanced prompt"
		const handler = buildApiHandler(mockApiConfig) // 构建 API 处理程序
		expect((handler as any).completePrompt).toHaveBeenCalledWith(`Test prompt`) // 断言 completePrompt 方法是否被调用
	})

	it("enhances prompt using custom enhancement prompt when provided", async () => {
		// 测试在提供自定义提示时使用自定义增强提示
		const customEnhancePrompt = "You are a custom prompt enhancer" // 自定义增强提示
		const customEnhancePromptWithTemplate = customEnhancePrompt + "\n\n${userInput}" // 带模板的自定义增强提示

		const result = await singleCompletionHandler(
			mockApiConfig,
			supportPrompt.create(
				"ENHANCE",
				{
					userInput: "Test prompt", // 用户输入
				},
				{
					ENHANCE: customEnhancePromptWithTemplate, // 自定义增强提示模板
				},
			),
		)

		expect(result).toBe("Enhanced prompt") // 断言结果是否为 "Enhanced prompt"
		const handler = buildApiHandler(mockApiConfig) // 构建 API 处理程序
		expect((handler as any).completePrompt).toHaveBeenCalledWith(`${customEnhancePrompt}\n\nTest prompt`) // 断言 completePrompt 方法是否被调用
	})

	it("throws error for empty prompt input", async () => {
		// 测试在提示输入为空时是否抛出错误
		await expect(singleCompletionHandler(mockApiConfig, "")).rejects.toThrow("No prompt text provided") // 断言是否抛出 "No prompt text provided" 错误
	})

	it("throws error for missing API configuration", async () => {
		// 测试在缺少 API 配置时是否抛出错误
		await expect(singleCompletionHandler({} as ApiConfiguration, "Test prompt")).rejects.toThrow(
			"No valid API configuration provided", // 断言是否抛出 "No valid API configuration provided" 错误
		)
	})

	it("throws error for API provider that does not support prompt enhancement", async () => {
		// 测试在 API 提供者不支持提示增强时是否抛出错误
		;(buildApiHandler as jest.Mock).mockReturnValue({
			// 没有 completePrompt 方法
			createMessage: jest.fn(), // 模拟 createMessage 方法
			getModel: jest.fn().mockReturnValue({
				id: "test-model", // 模型 ID
				info: {
					maxTokens: 4096, // 最大 token 数
					contextWindow: 8192, // 上下文窗口大小
					supportsPromptCache: false, // 是否支持提示缓存
				},
			}),
		})

		await expect(singleCompletionHandler(mockApiConfig, "Test prompt")).rejects.toThrow(
			"The selected API provider does not support prompt enhancement", // 断言是否抛出 "The selected API provider does not support prompt enhancement" 错误
		)
	})

	it("uses appropriate model based on provider", async () => {
		// 测试根据提供者使用适当的模型
		const openRouterConfig: ApiConfiguration = {
			// 模拟 OpenRouter 配置
			apiProvider: "openrouter", // API 提供者
			openRouterApiKey: "test-key", // OpenRouter API 密钥
			openRouterModelId: "test-model", // OpenRouter 模型 ID
		}

		// 模拟成功的增强
		;(buildApiHandler as jest.Mock).mockReturnValue({
			completePrompt: jest.fn().mockResolvedValue("Enhanced prompt"), // 模拟 completePrompt 方法
			createMessage: jest.fn(), // 模拟 createMessage 方法
			getModel: jest.fn().mockReturnValue({
				id: "test-model", // 模型 ID
				info: {
					maxTokens: 4096, // 最大 token 数
					contextWindow: 8192, // 上下文窗口大小
					supportsPromptCache: false, // 是否支持提示缓存
				},
			}),
		} as unknown as SingleCompletionHandler)

		const result = await singleCompletionHandler(openRouterConfig, "Test prompt") // 调用 singleCompletionHandler

		expect(buildApiHandler).toHaveBeenCalledWith(openRouterConfig) // 断言 buildApiHandler 是否被调用
		expect(result).toBe("Enhanced prompt") // 断言结果是否为 "Enhanced prompt"
	})

	it("propagates API errors", async () => {
		// 测试是否传播 API 错误
		;(buildApiHandler as jest.Mock).mockReturnValue({
			completePrompt: jest.fn().mockRejectedValue(new Error("API Error")), // 模拟 completePrompt 方法抛出错误
			createMessage: jest.fn(), // 模拟 createMessage 方法
			getModel: jest.fn().mockReturnValue({
				id: "test-model", // 模型 ID
				info: {
					maxTokens: 4096, // 最大 token 数
					contextWindow: 8192, // 上下文窗口大小
					supportsPromptCache: false, // 是否支持提示缓存
				},
			}),
		} as unknown as SingleCompletionHandler)

		await expect(singleCompletionHandler(mockApiConfig, "Test prompt")).rejects.toThrow("API Error") // 断言是否抛出 "API Error" 错误
	})
})
