import { ModelInfo } from "../shared/api" // 导入 ModelInfo 类型

export function calculateApiCost(
	modelInfo: ModelInfo,
	inputTokens: number,
	outputTokens: number,
	cacheCreationInputTokens?: number,
	cacheReadInputTokens?: number,
): number {
	const modelCacheWritesPrice = modelInfo.cacheWritesPrice // 获取模型缓存写入价格
	let cacheWritesCost = 0
	if (cacheCreationInputTokens && modelCacheWritesPrice) {
		cacheWritesCost = (modelCacheWritesPrice / 1_000_000) * cacheCreationInputTokens // 计算缓存写入成本
	}
	const modelCacheReadsPrice = modelInfo.cacheReadsPrice // 获取模型缓存读取价格
	let cacheReadsCost = 0
	if (cacheReadInputTokens && modelCacheReadsPrice) {
		cacheReadsCost = (modelCacheReadsPrice / 1_000_000) * cacheReadInputTokens // 计算缓存读取成本
	}
	const baseInputCost = ((modelInfo.inputPrice || 0) / 1_000_000) * inputTokens // 计算基础输入成本
	const outputCost = ((modelInfo.outputPrice || 0) / 1_000_000) * outputTokens // 计算输出成本
	const totalCost = cacheWritesCost + cacheReadsCost + baseInputCost + outputCost // 计算总成本
	return totalCost
}
