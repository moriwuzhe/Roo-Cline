// 定义实验 ID 常量
export const EXPERIMENT_IDS = {
	DIFF_STRATEGY: "experimentalDiffStrategy", // 实验性差异策略
	SEARCH_AND_REPLACE: "search_and_replace", // 搜索和替换
	INSERT_BLOCK: "insert_content", // 插入内容
} as const

// 定义 ExperimentKey 类型
export type ExperimentKey = keyof typeof EXPERIMENT_IDS
// 定义 ExperimentId 类型
export type ExperimentId = valueof<typeof EXPERIMENT_IDS]

// 定义 ExperimentConfig 接口
export interface ExperimentConfig {
	name: string // 名称
	description: string // 描述
	enabled: boolean // 是否启用
}

// 定义 valueof 类型
type valueof<X> = X[keyof X]

// 定义实验配置映射
export const experimentConfigsMap: Record<ExperimentKey, ExperimentConfig> = {
	DIFF_STRATEGY: {
		name: "Use experimental unified diff strategy", // 使用实验性统一差异策略
		description:
			"Enable the experimental unified diff strategy. This strategy might reduce the number of retries caused by model errors but may cause unexpected behavior or incorrect edits. Only enable if you understand the risks and are willing to carefully review all changes.", // 启用实验性统一差异策略。此策略可能会减少因模型错误导致的重试次数，但可能会导致意外行为或错误编辑。仅在您了解风险并愿意仔细审查所有更改时启用。
		enabled: false, // 默认不启用
	},
	SEARCH_AND_REPLACE: {
		name: "Use experimental search and replace tool", // 使用实验性搜索和替换工具
		description:
			"Enable the experimental search and replace tool, allowing Roo to replace multiple instances of a search term in one request.", // 启用实验性搜索和替换工具，允许 Roo 在一次请求中替换多个搜索词实例。
		enabled: false, // 默认不启用
	},
	INSERT_BLOCK: {
		name: "Use experimental insert content tool", // 使用实验性插入内容工具
		description:
			"Enable the experimental insert content tool, allowing Roo to insert content at specific line numbers without needing to create a diff.", // 启用实验性插入内容工具，允许 Roo 在特定行号插入内容而无需创建差异。
		enabled: false, // 默认不启用
	},
}

// 定义实验默认配置
export const experimentDefault = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(([_, config]) => [
		EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId,
		config.enabled,
	]),
) as Record<ExperimentId, boolean>

// 定义实验对象
export const experiments = {
	get: (id: ExperimentKey): ExperimentConfig | undefined => {
		return experimentConfigsMap[id] // 获取实验配置
	},
	isEnabled: (experimentsConfig: Record<ExperimentId, boolean>, id: ExperimentId): boolean => {
		return experimentsConfig[id] ?? experimentDefault[id] // 检查实验是否启用
	},
} as const

// 为 UI 暴露实验详情 - 预先计算映射以提高性能
export const experimentLabels = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(([_, config]) => [
		EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId,
		config.name,
	]),
) as Record<string, string>

export const experimentDescriptions = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(([_, config]) => [
		EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId,
		config.description,
	]),
) as Record<string, string>
