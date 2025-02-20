import { calculateApiCost } from "../cost" // 导入 calculateApiCost 函数
import { ModelInfo } from "../../shared/api" // 导入 ModelInfo 类型

describe("Cost Utility", () => {
	// 描述 "Cost Utility" 测试套件
	describe("calculateApiCost", () => {
		// 描述 "calculateApiCost" 测试套件
		const mockModelInfo: ModelInfo = {
			// 模拟 ModelInfo 对象
			maxTokens: 8192, // 最大 token 数
			contextWindow: 200_000, // 上下文窗口大小
			supportsPromptCache: true, // 是否支持提示缓存
			inputPrice: 3.0, // 每百万个 token 3 美元
			outputPrice: 15.0, // 每百万个 token 15 美元
			cacheWritesPrice: 3.75, // 每百万个 token 3.75 美元
			cacheReadsPrice: 0.3, // 每百万个 token 0.3 美元
		}

		it("should calculate basic input/output costs correctly", () => {
			// 测试基本输入/输出成本计算是否正确
			const cost = calculateApiCost(mockModelInfo, 1000, 500) // 计算成本

			// 输入成本: (3.0 / 1_000_000) * 1000 = 0.003
			// 输出成本: (15.0 / 1_000_000) * 500 = 0.0075
			// 总计: 0.003 + 0.0075 = 0.0105
			expect(cost).toBe(0.0105) // 断言成本是否正确
		})

		it("should handle cache writes cost", () => {
			// 测试缓存写入成本计算是否正确
			const cost = calculateApiCost(mockModelInfo, 1000, 500, 2000) // 计算成本

			// 输入成本: (3.0 / 1_000_000) * 1000 = 0.003
			// 输出成本: (15.0 / 1_000_000) * 500 = 0.0075
			// 缓存写入: (3.75 / 1_000_000) * 2000 = 0.0075
			// 总计: 0.003 + 0.0075 + 0.0075 = 0.018
			expect(cost).toBeCloseTo(0.018, 6) // 断言成本是否接近预期值
		})

		it("should handle cache reads cost", () => {
			// 测试缓存读取成本计算是否正确
			const cost = calculateApiCost(mockModelInfo, 1000, 500, undefined, 3000) // 计算成本

			// 输入成本: (3.0 / 1_000_000) * 1000 = 0.003
			// 输出成本: (15.0 / 1_000_000) * 500 = 0.0075
			// 缓存读取: (0.3 / 1_000_000) * 3000 = 0.0009
			// 总计: 0.003 + 0.0075 + 0.0009 = 0.0114
			expect(cost).toBe(0.0114) // 断言成本是否正确
		})

		it("should handle all cost components together", () => {
			// 测试所有成本组件一起计算是否正确
			const cost = calculateApiCost(mockModelInfo, 1000, 500, 2000, 3000) // 计算成本

			// 输入成本: (3.0 / 1_000_000) * 1000 = 0.003
			// 输出成本: (15.0 / 1_000_000) * 500 = 0.0075
			// 缓存写入: (3.75 / 1_000_000) * 2000 = 0.0075
			// 缓存读取: (0.3 / 1_000_000) * 3000 = 0.0009
			// 总计: 0.003 + 0.0075 + 0.0075 + 0.0009 = 0.0189
			expect(cost).toBe(0.0189) // 断言成本是否正确
		})

		it("should handle missing prices gracefully", () => {
			// 测试缺少价格时是否能正确处理
			const modelWithoutPrices: ModelInfo = {
				// 模拟没有价格的 ModelInfo 对象
				maxTokens: 8192, // 最大 token 数
				contextWindow: 200_000, // 上下文窗口大小
				supportsPromptCache: true, // 是否支持提示缓存
			}

			const cost = calculateApiCost(modelWithoutPrices, 1000, 500, 2000, 3000) // 计算成本
			expect(cost).toBe(0) // 断言成本是否为 0
		})

		it("should handle zero tokens", () => {
			// 测试零 token 时是否能正确处理
			const cost = calculateApiCost(mockModelInfo, 0, 0, 0, 0) // 计算成本
			expect(cost).toBe(0) // 断言成本是否为 0
		})

		it("should handle undefined cache values", () => {
			// 测试未定义的缓存值是否能正确处理
			const cost = calculateApiCost(mockModelInfo, 1000, 500) // 计算成本

			// 输入成本: (3.0 / 1_000_000) * 1000 = 0.003
			// 输出成本: (15.0 / 1_000_000) * 500 = 0.0075
			// 总计: 0.003 + 0.0075 = 0.0105
			expect(cost).toBe(0.0105) // 断言成本是否正确
		})

		it("should handle missing cache prices", () => {
			// 测试缺少缓存价格时是否能正确处理
			const modelWithoutCachePrices: ModelInfo = {
				// 模拟没有缓存价格的 ModelInfo 对象
				...mockModelInfo, // 复制 mockModelInfo 对象
				cacheWritesPrice: undefined, // 未定义的缓存写入价格
				cacheReadsPrice: undefined, // 未定义的缓存读取价格
			}

			const cost = calculateApiCost(modelWithoutCachePrices, 1000, 500, 2000, 3000) // 计算成本

			// 只应包括输入和输出成本
			// 输入成本: (3.0 / 1_000_000) * 1000 = 0.003
			// 输出成本: (15.0 / 1_000_000) * 500 = 0.0075
			// 总计: 0.003 + 0.0075 = 0.0105
			expect(cost).toBe(0.0105) // 断言成本是否正确
		})
	})
})
