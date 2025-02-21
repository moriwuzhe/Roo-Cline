import { TOOL_GROUPS, ToolGroup, ALWAYS_AVAILABLE_TOOLS } from "./tool-groups"

// 模式类型
export type Mode = string

// 组选项类型
export type GroupOptions = {
	fileRegex?: string // 正则表达式模式
	description?: string // 模式的可读描述
}

// 组条目可以是字符串或带有选项的元组
export type GroupEntry = ToolGroup | readonly [ToolGroup, GroupOptions]

// 模式配置类型
export type ModeConfig = {
	slug: string
	name: string
	roleDefinition: string
	customInstructions?: string
	groups: readonly GroupEntry[] // 现在支持简单字符串和带选项的元组
}

// 仅限模式特定的提示
export type PromptComponent = {
	roleDefinition?: string
	customInstructions?: string
}

export type CustomModePrompts = {
	[key: string]: PromptComponent | undefined
}

// 帮助函数，用于提取组名，无论格式如何
export function getGroupName(group: GroupEntry): ToolGroup {
	return Array.isArray(group) ? group[0] : group
}

// 帮助函数，用于获取组选项（如果存在）
function getGroupOptions(group: GroupEntry): GroupOptions | undefined {
	return Array.isArray(group) ? group[1] : undefined
}

// 帮助函数，用于检查文件路径是否匹配正则表达式模式
export function doesFileMatchRegex(filePath: string, pattern: string): boolean {
	try {
		const regex = new RegExp(pattern)
		return regex.test(filePath)
	} catch (error) {
		console.error(`无效的正则表达式模式: ${pattern}`, error)
		return false
	}
}

// 帮助函数，用于获取模式的所有工具
export function getToolsForMode(groups: readonly GroupEntry[]): string[] {
	const tools = new Set<string>()

	// 从每个组中添加工具
	groups.forEach((group) => {
		const groupName = getGroupName(group)
		const groupConfig = TOOL_GROUPS[groupName]
		groupConfig.tools.forEach((tool: string) => tools.add(tool))
	})

	// 始终添加必需的工具
	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool))

	return Array.from(tools)
}

// 主要模式配置作为有序数组
export const modes: readonly ModeConfig[] = [
	{
		slug: "code",
		name: "Code",
		roleDefinition:
			"你是Roo，一名技术娴熟的软件工程师，拥有多种编程语言、框架、设计模式和最佳实践的广泛知识。",
		groups: ["read", "edit", "browser", "command", "mcp"],
	},
	{
		slug: "architect",
		name: "Architect",
		roleDefinition:
			"你是Roo，一名经验丰富的技术领导者，善于提问和优秀的规划者。你的目标是收集信息并获取上下文，以创建一个详细的计划来完成用户的任务，用户将在切换到其他模式以实施解决方案之前对其进行审查和批准。",
		groups: ["read", ["edit", { fileRegex: "\\.md$", description: "仅限Markdown文件" }], "browser", "mcp"],
		customInstructions:
			"根据用户的请求，你可能需要进行一些信息收集（例如使用read_file或search_files）以获取有关任务的更多上下文。你还可以向用户提出澄清性问题，以更好地理解任务。一旦你获得了更多关于用户请求的上下文，你应该创建一个详细的计划来完成任务。（如果合适，你可以将计划写入markdown文件。）\n\n然后你可以询问用户是否对这个计划满意，或者他们是否想做任何更改。将其视为一个头脑风暴会议，你可以讨论任务并计划完成它的最佳方法。最后，一旦看起来你已经达成了一个好的计划，使用switch_mode工具请求用户切换到另一个模式以实施解决方案。",
	},
	{
		slug: "ask",
		name: "Ask",
		roleDefinition:
			"你是Roo，一名知识渊博的技术助理，专注于回答有关软件开发、技术和相关主题的问题并提供信息。",
		groups: ["read", ["edit", { fileRegex: "\\.md$", description: "仅限Markdown文件" }], "browser", "mcp"],
		customInstructions:
			"你可以分析代码，解释概念，并访问外部资源。虽然你主要保持对代码库的只读访问，但你可以创建和编辑markdown文件，以更好地记录和解释概念。确保回答用户的问题，不要急于切换到实现代码。",
	},
] as const

// 导出默认模式slug
export const defaultModeSlug = modes[0].slug

// 帮助函数
export function getModeBySlug(slug: string, customModes?: ModeConfig[]): ModeConfig | undefined {
	// 首先检查自定义模式
	const customMode = customModes?.find((mode) => mode.slug === slug)
	if (customMode) {
		return customMode
	}
	// 然后检查内置模式
	return modes.find((mode) => mode.slug === slug)
}

export function getModeConfig(slug: string, customModes?: ModeConfig[]): ModeConfig {
	const mode = getModeBySlug(slug, customModes)
	if (!mode) {
		throw new Error(`未找到slug为${slug}的模式`)
	}
	return mode
}

// 获取所有可用模式，自定义模式覆盖内置模式
export function getAllModes(customModes?: ModeConfig[]): ModeConfig[] {
	if (!customModes?.length) {
		return [...modes]
	}

	// 从内置模式开始
	const allModes = [...modes]

	// 处理自定义模式
	customModes.forEach((customMode) => {
		const index = allModes.findIndex((mode) => mode.slug === customMode.slug)
		if (index !== -1) {
			// 覆盖现有模式
			allModes[index] = customMode
		} else {
			// 添加新模式
			allModes.push(customMode)
		}
	})

	return allModes
}

// 检查模式是自定义的还是覆盖的
export function isCustomMode(slug: string, customModes?: ModeConfig[]): boolean {
	return !!customModes?.some((mode) => mode.slug === slug)
}

// 自定义错误类，用于文件限制
export class FileRestrictionError extends Error {
	constructor(mode: string, pattern: string, description: string | undefined, filePath: string) {
		super(
			`此模式（${mode}）只能编辑匹配模式的文件：${pattern}${description ? `（${description}）` : ""}。得到：${filePath}`,
		)
		this.name = "FileRestrictionError"
	}
}

export function isToolAllowedForMode(
	tool: string,
	modeSlug: string,
	customModes: ModeConfig[],
	toolRequirements?: Record<string, boolean>,
	toolParams?: Record<string, any>, // 所有工具参数
	experiments?: Record<string, boolean>,
): boolean {
	// 始终允许这些工具
	if (ALWAYS_AVAILABLE_TOOLS.includes(tool as any)) {
		return true
	}

	if (experiments && tool in experiments) {
		if (!experiments[tool]) {
			return false
		}
	}

	// 检查工具要求（如果存在）
	if (toolRequirements && tool in toolRequirements) {
		if (!toolRequirements[tool]) {
			return false
		}
	}

	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		return false
	}

	// 检查工具是否在模式的任何组中，并遵守任何组选项
	for (const group of mode.groups) {
		const groupName = getGroupName(group)
		const options = getGroupOptions(group)

		const groupConfig = TOOL_GROUPS[groupName]

		// 如果工具不在此组的工具中，请继续下一个组
		if (!groupConfig.tools.includes(tool)) {
			continue
		}

		// 如果没有选项，则允许工具
		if (!options) {
			return true
		}

		// 对于编辑组，如果指定了文件正则表达式，请检查
		if (groupName === "edit" && options.fileRegex) {
			const filePath = toolParams?.path
			if (
				filePath &&
				(toolParams.diff || toolParams.content || toolParams.operations) &&
				!doesFileMatchRegex(filePath, options.fileRegex)
			) {
				throw new FileRestrictionError(mode.name, options.fileRegex, options.description, filePath)
			}
		}

		return true
	}

	return false
}

// 创建模式特定的默认提示
export const defaultPrompts: Readonly<CustomModePrompts> = Object.freeze(
	Object.fromEntries(
		modes.map((mode) => [
			mode.slug,
			{
				roleDefinition: mode.roleDefinition,
				customInstructions: mode.customInstructions,
			},
		]),
	),
)

// 帮助函数，用于安全地获取角色定义
export function getRoleDefinition(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`未找到slug为${modeSlug}的模式`)
		return ""
	}
	return mode.roleDefinition
}

// 帮助函数，用于安全地获取自定义说明
export function getCustomInstructions(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`未找到slug为${modeSlug}的模式`)
		return ""
	}
	return mode.customInstructions ?? ""
}
