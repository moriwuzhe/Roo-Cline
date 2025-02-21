// 定义工具组配置类型
export type ToolGroupConfig = {
	tools: readonly string[] // 工具数组
	alwaysAvailable?: boolean // 是否始终可用，不在提示视图中显示
}

// 工具 slug 到显示名称的映射
export const TOOL_DISPLAY_NAMES = {
	execute_command: "run commands", // 运行命令
	read_file: "read files", // 读取文件
	write_to_file: "write files", // 写入文件
	apply_diff: "apply changes", // 应用更改
	search_files: "search files", // 搜索文件
	list_files: "list files", // 列出文件
	list_code_definition_names: "list definitions", // 列出定义
	browser_action: "use a browser", // 使用浏览器
	use_mcp_tool: "use mcp tools", // 使用 MCP 工具
	access_mcp_resource: "access mcp resources", // 访问 MCP 资源
	ask_followup_question: "ask questions", // 提问
	attempt_completion: "complete tasks", // 完成任务
	switch_mode: "switch modes", // 切换模式
	new_task: "create new task", // 创建新任务
} as const

// 定义可用的工具组
export const TOOL_GROUPS: Record<string, ToolGroupConfig> = {
	read: {
		tools: ["read_file", "search_files", "list_files", "list_code_definition_names"], // 读取相关工具
	},
	edit: {
		tools: ["write_to_file", "apply_diff", "insert_content", "search_and_replace"], // 编辑相关工具
	},
	browser: {
		tools: ["browser_action"], // 浏览器相关工具
	},
	command: {
		tools: ["execute_command"], // 命令相关工具
	},
	mcp: {
		tools: ["use_mcp_tool", "access_mcp_resource"], // MCP 相关工具
	},
	modes: {
		tools: ["switch_mode", "new_task"], // 模式相关工具
		alwaysAvailable: true, // 始终可用
	},
}

// 定义工具组类型
export type ToolGroup = keyof typeof TOOL_GROUPS

// 始终可用的工具
export const ALWAYS_AVAILABLE_TOOLS = [
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
] as const

// 工具名称类型，用于类型安全
export type ToolName = keyof typeof TOOL_DISPLAY_NAMES

// 工具辅助函数
export function getToolName(toolConfig: string | readonly [ToolName, ...any[]]): ToolName {
	// 获取工具名称
	return typeof toolConfig === "string" ? (toolConfig as ToolName) : toolConfig[0]
}

export function getToolOptions(toolConfig: string | readonly [ToolName, ...any[]]): any {
	// 获取工具选项
	return typeof toolConfig === "string" ? undefined : toolConfig[1]
}

// 在 UI 中显示组的名称
export const GROUP_DISPLAY_NAMES: Record<ToolGroup, string> = {
	read: "Read Files", // 读取文件
	edit: "Edit Files", // 编辑文件
	browser: "Use Browser", // 使用浏览器
	command: "Run Commands", // 运行命令
	mcp: "Use MCP", // 使用 MCP
}
