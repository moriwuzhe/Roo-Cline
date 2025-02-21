import { Mode, isToolAllowedForMode, getModeConfig, ModeConfig, FileRestrictionError } from "../shared/modes"
import { ToolName } from "../shared/tool-groups"

export { isToolAllowedForMode } // 导出 isToolAllowedForMode 函数
export type { ToolName } // 导出 ToolName 类型

export function validateToolUse(
	toolName: ToolName, // 工具名称
	mode: Mode, // 模式
	customModes?: ModeConfig[], // 自定义模式
	toolRequirements?: Record<string, boolean>, // 工具需求
	toolParams?: Record<string, unknown>, // 工具参数
): void {
	if (!isToolAllowedForMode(toolName, mode, customModes ?? [], toolRequirements, toolParams)) {
		throw new Error(`Tool "${toolName}" is not allowed in ${mode} mode.`) // 如果工具不允许在当前模式下使用，抛出错误
	}
}
