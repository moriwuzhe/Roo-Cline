// 支持提示类型
type PromptParams = Record<string, string | any[]>

// 生成诊断文本
const generateDiagnosticText = (diagnostics?: any[]) => {
	if (!diagnostics?.length) return ""
	return `\nCurrent problems detected:\n${diagnostics
		.map((d) => `- [${d.source || "Error"}] ${d.message}${d.code ? ` (${d.code})` : ""}`)
		.join("\n")}`
}

// 创建提示
export const createPrompt = (template: string, params: PromptParams): string => {
	let result = template
	for (const [key, value] of Object.entries(params)) {
		if (key === "diagnostics") {
			result = result.replaceAll("${diagnosticText}", generateDiagnosticText(value as any[]))
		} else {
			result = result.replaceAll(`\${${key}}`, value as string)
		}
	}

	// 将剩余的占位符替换为空字符串
	result = result.replaceAll(/\${[^}]*}/g, "")

	return result
}

// 支持提示配置接口
interface SupportPromptConfig {
	label: string // 标签
	description: string // 描述
	template: string // 模板
}

// 支持提示配置
const supportPromptConfigs: Record<string, SupportPromptConfig> = {
	ENHANCE: {
		label: "Enhance Prompt", // 增强提示
		description:
			"使用提示增强功能获取针对您的输入的定制建议或改进。这确保 Roo 理解您的意图并提供最佳响应。通过聊天中的 ✨ 图标可用。",
		template: `生成此提示的增强版本（仅回复增强提示 - 无对话、解释、引导、项目符号、占位符或周围引号）：

\${userInput}`,
	},
	EXPLAIN: {
		label: "Explain Code", // 解释代码
		description:
			"获取代码片段、函数或整个文件的详细解释。对于理解复杂代码或学习新模式非常有用。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定代码）中使用。",
		template: `解释文件路径 @/\${filePath} 中的以下代码：
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

请提供此代码的清晰简洁的解释，包括：
1. 目的和功能
2. 关键组件及其交互
3. 使用的重要模式或技术`,
	},
	FIX: {
		label: "Fix Issues", // 修复问题
		description:
			"获取帮助以识别和解决错误、错误或代码质量问题。提供逐步指导以解决问题。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定代码）中使用。",
		template: `修复文件路径 @/\${filePath} 中的以下代码中的任何问题
\${diagnosticText}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

请：
1. 解决上面列出的所有检测到的问题（如果有）
2. 识别任何其他潜在的错误或问题
3. 提供更正后的代码
4. 解释修复了什么以及为什么`,
	},
	IMPROVE: {
		label: "Improve Code", // 改进代码
		description:
			"在保持功能的同时，接收代码优化、最佳实践和架构改进的建议。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定代码）中使用。",
		template: `改进文件路径 @/\${filePath} 中的以下代码：
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

请提出以下方面的改进建议：
1. 代码可读性和可维护性
2. 性能优化
3. 最佳实践和模式
4. 错误处理和边缘情况

提供改进后的代码以及每个增强的解释。`,
	},
	ADD_TO_CONTEXT: {
		label: "Add to Context", // 添加到上下文
		description:
			"将上下文添加到您当前的任务或对话中。对于提供附加信息或澄清非常有用。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定代码）中使用。",
		template: `@/\${filePath}:
\`\`\`
\${selectedText}
\`\`\``,
	},
	TERMINAL_ADD_TO_CONTEXT: {
		label: "Add Terminal Content to Context", // 将终端内容添加到上下文
		description:
			"将终端输出添加到您当前的任务或对话中。对于提供命令输出或日志非常有用。可在终端上下文菜单（右键单击选定的终端内容）中使用。",
		template: `\${userInput}
终端输出：
\`\`\`
\${terminalContent}
\`\`\``,
	},
	TERMINAL_FIX: {
		label: "Fix Terminal Command", // 修复终端命令
		description:
			"获取帮助修复失败或需要改进的终端命令。可在终端上下文菜单（右键单击选定的终端内容）中使用。",
		template: `\${userInput}
修复此终端命令：
\`\`\`
\${terminalContent}
\`\`\`

请：
1. 识别命令中的任何问题
2. 提供更正后的命令
3. 解释修复了什么以及为什么`,
	},
	TERMINAL_EXPLAIN: {
		label: "Explain Terminal Command", // 解释终端命令
		description:
			"获取终端命令及其输出的详细解释。可在终端上下文菜单（右键单击选定的终端内容）中使用。",
		template: `\${userInput}
解释此终端命令：
\`\`\`
\${terminalContent}
\`\`\`

请提供：
1. 命令的作用
2. 每个部分/标志的解释
3. 预期的输出和行为`,
	},
} as const

// 定义支持提示类型
type SupportPromptType = keyof typeof supportPromptConfigs

// 支持提示对象
export const supportPrompt = {
	default: Object.fromEntries(Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.template])),
	get: (customSupportPrompts: Record<string, any> | undefined, type: SupportPromptType): string => {
		return customSupportPrompts?.[type] ?? supportPromptConfigs[type].template
	},
	create: (type: SupportPromptType, params: PromptParams, customSupportPrompts?: Record<string, any>): string => {
		const template = supportPrompt.get(customSupportPrompts, type)
		return createPrompt(template, params)
	},
} as const

export type { SupportPromptType }

// 为 UI 暴露标签和描述
export const supportPromptLabels = Object.fromEntries(
	Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.label]),
) as Record<SupportPromptType, string>

export const supportPromptDescriptions = Object.fromEntries(
	Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.description]),
) as Record<SupportPromptType, string>

export type CustomSupportPrompts = {
	[key: string]: string | undefined
}
