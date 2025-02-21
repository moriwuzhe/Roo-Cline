import {
	Mode,
	modes,
	CustomModePrompts,
	PromptComponent,
	getRoleDefinition,
	defaultModeSlug,
	ModeConfig,
	getModeBySlug,
} from "../../shared/modes"
import { DiffStrategy } from "../diff/DiffStrategy"
import { McpHub } from "../../services/mcp/McpHub"
import { getToolDescriptionsForMode } from "./tools"
import * as vscode from "vscode"
import {
	getRulesSection,
	getSystemInfoSection,
	getObjectiveSection,
	getSharedToolUseSection,
	getMcpServersSection,
	getToolUseGuidelinesSection,
	getCapabilitiesSection,
	getModesSection,
	addCustomInstructions,
} from "./sections"
import fs from "fs/promises"
import path from "path"

async function generatePrompt(
	context: vscode.ExtensionContext,
	cwd: string,
	supportsComputerUse: boolean,
	mode: Mode,
	mcpHub?: McpHub,
	diffStrategy?: DiffStrategy,
	browserViewportSize?: string,
	promptComponent?: PromptComponent,
	customModeConfigs?: ModeConfig[],
	globalCustomInstructions?: string,
	preferredLanguage?: string,
	diffEnabled?: boolean,
	experiments?: Record<string, boolean>,
	enableMcpServerCreation?: boolean,
): Promise<string> {
	if (!context) {
		throw new Error("Extension context is required for generating system prompt")
	}

	// If diff is disabled, don't pass the diffStrategy
	const effectiveDiffStrategy = diffEnabled ? diffStrategy : undefined

	const [mcpServersSection, modesSection] = await Promise.all([
		getMcpServersSection(mcpHub, effectiveDiffStrategy, enableMcpServerCreation),
		getModesSection(context),
	])

	// Get the full mode config to ensure we have the role definition
	const modeConfig = getModeBySlug(mode, customModeConfigs) || modes.find((m) => m.slug === mode) || modes[0]
	const roleDefinition = promptComponent?.roleDefinition || modeConfig.roleDefinition

	const basePrompt = `${roleDefinition}

${getSharedToolUseSection()}

${getToolDescriptionsForMode(
	mode,
	cwd,
	supportsComputerUse,
	effectiveDiffStrategy,
	browserViewportSize,
	mcpHub,
	customModeConfigs,
	experiments,
)}

${getToolUseGuidelinesSection()}

${mcpServersSection}

${getCapabilitiesSection(cwd, supportsComputerUse, mcpHub, effectiveDiffStrategy)}

${modesSection}

${getRulesSection(cwd, supportsComputerUse, effectiveDiffStrategy, experiments)}

${getSystemInfoSection(cwd, mode, customModeConfigs)}

${getObjectiveSection()}

${await addCustomInstructions(promptComponent?.customInstructions || modeConfig.customInstructions || "", globalCustomInstructions || "", cwd, mode, { preferredLanguage })}`

	return basePrompt
}

// 定义一个异步函数，生成系统提示
export const SYSTEM_PROMPT = async (
	context: vscode.ExtensionContext, // VSCode 扩展上下文
	cwd: string, // 当前工作目录
	supportsComputerUse: boolean, // 是否支持计算机使用
	mcpHub?: McpHub, // 可选的 MCP Hub
	diffStrategy?: DiffStrategy, // 可选的差异策略
	browserViewportSize?: string, // 可选的浏览器视口大小
	mode: Mode = defaultModeSlug, // 模式，默认为 defaultModeSlug
	customModePrompts?: CustomModePrompts, // 可选的自定义模式提示
	customModes?: ModeConfig[], // 可选的自定义模式配置数组
	globalCustomInstructions?: string, // 可选的全局自定义指令
	preferredLanguage?: string, // 可选的首选语言
	diffEnabled?: boolean, // 是否启用差异
	experiments?: Record<string, boolean>, // 可选的实验记录
	enableMcpServerCreation?: boolean, // 是否启用 MCP 服务器创建
): Promise<string> => {
	if (!context) {
		throw new Error("Extension context is required for generating system prompt")
	}

	const getPromptComponent = (value: unknown) => {
		if (typeof value === "object" && value !== null) {
			return value as PromptComponent
		}
		return undefined
	}

	// Check if it's a custom mode
	const promptComponent = getPromptComponent(customModePrompts?.[mode])
	// Get full mode config from custom modes or fall back to built-in modes
	const currentMode = getModeBySlug(mode, customModes) || modes.find((m) => m.slug === mode) || modes[0]

	// If diff is disabled, don't pass the diffStrategy
	const effectiveDiffStrategy = diffEnabled ? diffStrategy : undefined

	return generatePrompt(
		context,
		cwd,
		supportsComputerUse,
		currentMode.slug,
		mcpHub,
		effectiveDiffStrategy,
		browserViewportSize,
		promptComponent,
		customModes,
		globalCustomInstructions,
		preferredLanguage,
		diffEnabled,
		experiments,
		enableMcpServerCreation,
	)
}
