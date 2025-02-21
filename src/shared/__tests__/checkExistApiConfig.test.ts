import { checkExistKey } from "../checkExistApiConfig"
import { ApiConfiguration } from "../api"

// 描述 "checkExistKey" 测试套件
describe("checkExistKey", () => {
	// 测试未定义配置时返回 false
	it("should return false for undefined config", () => {
		expect(checkExistKey(undefined)).toBe(false)
	})

	// 测试空配置时返回 false
	it("should return false for empty config", () => {
		const config: ApiConfiguration = {}
		expect(checkExistKey(config)).toBe(false)
	})

	// 测试当一个密钥被定义时返回 true
	it("should return true when one key is defined", () => {
		const config: ApiConfiguration = {
			apiKey: "test-key",
		}
		expect(checkExistKey(config)).toBe(true)
	})

	// 测试当多个密钥被定义时返回 true
	it("should return true when multiple keys are defined", () => {
		const config: ApiConfiguration = {
			apiKey: "test-key",
			glamaApiKey: "glama-key",
			openRouterApiKey: "openrouter-key",
		}
		expect(checkExistKey(config)).toBe(true)
	})

	// 测试当只有非密钥字段未定义时返回 true
	it("should return true when only non-key fields are undefined", () => {
		const config: ApiConfiguration = {
			apiKey: "test-key",
			apiProvider: undefined,
			anthropicBaseUrl: undefined,
		}
		expect(checkExistKey(config)).toBe(true)
	})

	// 测试当所有密钥字段未定义时返回 false
	it("should return false when all key fields are undefined", () => {
		const config: ApiConfiguration = {
			apiKey: undefined,
			glamaApiKey: undefined,
			openRouterApiKey: undefined,
			awsRegion: undefined,
			vertexProjectId: undefined,
			openAiApiKey: undefined,
			ollamaModelId: undefined,
			lmStudioModelId: undefined,
			geminiApiKey: undefined,
			openAiNativeApiKey: undefined,
			deepSeekApiKey: undefined,
			mistralApiKey: undefined,
			vsCodeLmModelSelector: undefined,
			requestyApiKey: undefined,
			unboundApiKey: undefined,
		}
		expect(checkExistKey(config)).toBe(false)
	})
})
