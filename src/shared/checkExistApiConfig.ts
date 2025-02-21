import { ApiConfiguration } from "../shared/api"

// 检查配置中是否存在任何 API 密钥
export function checkExistKey(config: ApiConfiguration | undefined) {
	return config
		? [
				config.apiKey, // 检查 apiKey 是否存在
				config.glamaApiKey, // 检查 glamaApiKey 是否存在
				config.openRouterApiKey, // 检查 openRouterApiKey 是否存在
				config.awsRegion, // 检查 awsRegion 是否存在
				config.vertexProjectId, // 检查 vertexProjectId 是否存在
				config.openAiApiKey, // 检查 openAiApiKey 是否存在
				config.ollamaModelId, // 检查 ollamaModelId 是否存在
				config.lmStudioModelId, // 检查 lmStudioModelId 是否存在
				config.geminiApiKey, // 检查 geminiApiKey 是否存在
				config.openAiNativeApiKey, // 检查 openAiNativeApiKey 是否存在
				config.deepSeekApiKey, // 检查 deepSeekApiKey 是否存在
				config.mistralApiKey, // 检查 mistralApiKey 是否存在
				config.vsCodeLmModelSelector, // 检查 vsCodeLmModelSelector 是否存在
				config.requestyApiKey, // 检查 requestyApiKey 是否存在
				config.unboundApiKey, // 检查 unboundApiKey 是否存在
			].some((key) => key !== undefined) // 如果任何一个密钥存在，则返回 true
		: false // 如果配置未定义，则返回 false
}
