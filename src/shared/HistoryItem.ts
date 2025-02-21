// 定义 HistoryItem 类型
export type HistoryItem = {
	id: string // 历史项 ID
	ts: number // 时间戳
	task: string // 任务描述
	tokensIn: number // 输入的令牌数
	tokensOut: number // 输出的令牌数
	cacheWrites?: number // 可选的缓存写入次数
	cacheReads?: number // 可选的缓存读取次数
	totalCost: number // 总成本
}
