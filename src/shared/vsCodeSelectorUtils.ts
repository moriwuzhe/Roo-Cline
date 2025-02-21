import { LanguageModelChatSelector } from "vscode"

// 定义选择器分隔符
export const SELECTOR_SEPARATOR = "/"

// 将 LanguageModelChatSelector 对象转换为字符串
export function stringifyVsCodeLmModelSelector(selector: LanguageModelChatSelector): string {
	// 过滤掉空值，并用分隔符连接各部分
	return [selector.vendor, selector.family, selector.version, selector.id].filter(Boolean).join(SELECTOR_SEPARATOR)
}
