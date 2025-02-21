import * as vscode from "vscode" // 导入 VS Code API
import * as path from "path" // 导入路径模块
import * as fs from "fs/promises" // 导入文件系统模块（使用 Promise 版本）
import { convertTheme } from "monaco-vscode-textmate-theme-converter/lib/cjs" // 导入主题转换器

const defaultThemes: Record<string, string> = {
	// 定义默认主题映射
	"Default Dark Modern": "dark_modern",
	"Dark+": "dark_plus",
	"Default Dark+": "dark_plus",
	"Dark (Visual Studio)": "dark_vs",
	"Visual Studio Dark": "dark_vs",
	"Dark High Contrast": "hc_black",
	"Default High Contrast": "hc_black",
	"Light High Contrast": "hc_light",
	"Default High Contrast Light": "hc_light",
	"Default Light Modern": "light_modern",
	"Light+": "light_plus",
	"Default Light+": "light_plus",
	"Light (Visual Studio)": "light_vs",
	"Visual Studio Light": "light_vs",
}

function parseThemeString(themeString: string | undefined): any {
	// 解析主题字符串
	themeString = themeString
		?.split("\n") // 按行分割字符串
		.filter((line) => {
			return !line.trim().startsWith("//") // 过滤掉注释行
		})
		.join("\n") // 重新合并字符串
	return JSON.parse(themeString ?? "{}") // 解析 JSON 字符串
}

export async function getTheme() {
	let currentTheme = undefined // 当前主题初始化为 undefined
	const colorTheme = vscode.workspace.getConfiguration("workbench").get<string>("colorTheme") || "Default Dark Modern" // 获取当前颜色主题

	try {
		for (let i = vscode.extensions.all.length - 1; i >= 0; i--) {
			// 遍历所有扩展
			if (currentTheme) {
				break // 如果找到当前主题，跳出循环
			}
			const extension = vscode.extensions.all[i] // 获取扩展
			if (extension.packageJSON?.contributes?.themes?.length > 0) {
				// 检查扩展是否贡献了主题
				for (const theme of extension.packageJSON.contributes.themes) {
					if (theme.label === colorTheme) {
						// 如果主题标签匹配
						const themePath = path.join(extension.extensionPath, theme.path) // 获取主题路径
						currentTheme = await fs.readFile(themePath, "utf-8") // 读取主题文件
						break // 跳出循环
					}
				}
			}
		}

		if (currentTheme === undefined && defaultThemes[colorTheme]) {
			// 如果未找到当前主题且存在默认主题
			const filename = `${defaultThemes[colorTheme]}.json` // 获取默认主题文件名
			currentTheme = await fs.readFile(
				path.join(getExtensionUri().fsPath, "src", "integrations", "theme", "default-themes", filename),
				"utf-8",
			) // 读取默认主题文件
		}

		// 去除主题中的注释
		let parsed = parseThemeString(currentTheme)

		if (parsed.include) {
			// 如果主题包含其他主题
			const includeThemeString = await fs.readFile(
				path.join(getExtensionUri().fsPath, "src", "integrations", "theme", "default-themes", parsed.include),
				"utf-8",
			) // 读取包含的主题文件
			const includeTheme = parseThemeString(includeThemeString) // 解析包含的主题
			parsed = mergeJson(parsed, includeTheme) // 合并主题
		}

		const converted = convertTheme(parsed) // 转换主题

		converted.base = (
			["vs", "hc-black"].includes(converted.base)
				? converted.base
				: colorTheme.includes("Light")
					? "vs"
					: "vs-dark"
		) as any // 设置基础主题

		return converted // 返回转换后的主题
	} catch (e) {
		console.log("Error loading color theme: ", e) // 捕获错误并打印
	}
	return undefined // 返回 undefined
}

type JsonObject = { [key: string]: any } // 定义 JSON 对象类型
export function mergeJson(
	first: JsonObject,
	second: JsonObject,
	mergeBehavior?: "merge" | "overwrite",
	mergeKeys?: { [key: string]: (a: any, b: any) => boolean },
): any {
	const copyOfFirst = JSON.parse(JSON.stringify(first)) // 深拷贝第一个对象

	try {
		for (const key in second) {
			// 遍历第二个对象的键
			const secondValue = second[key] // 获取第二个对象的值

			if (!(key in copyOfFirst) || mergeBehavior === "overwrite") {
				// 如果第一个对象中不存在该键或合并行为为覆盖
				copyOfFirst[key] = secondValue // 直接赋值
				continue // 跳过本次循环
			}

			const firstValue = copyOfFirst[key] // 获取第一个对象的值
			if (Array.isArray(secondValue) && Array.isArray(firstValue)) {
				// 如果两个值都是数组
				if (mergeKeys?.[key]) {
					// 如果存在合并键
					const keptFromFirst: any[] = [] // 保留第一个对象中的值
					firstValue.forEach((item: any) => {
						if (!secondValue.some((item2: any) => mergeKeys[key](item, item2))) {
							keptFromFirst.push(item) // 保留不匹配的值
						}
					})
					copyOfFirst[key] = [...keptFromFirst, ...secondValue] // 合并数组
				} else {
					copyOfFirst[key] = [...firstValue, ...secondValue] // 直接合并数组
				}
			} else if (typeof secondValue === "object" && typeof firstValue === "object") {
				// 如果两个值都是对象
				copyOfFirst[key] = mergeJson(firstValue, secondValue, mergeBehavior) // 递归合并对象
			} else {
				// 其他类型（布尔值、数字、字符串）
				copyOfFirst[key] = secondValue // 直接赋值
			}
		}
		return copyOfFirst // 返回合并后的对象
	} catch (e) {
		console.error("Error merging JSON", e, copyOfFirst, second) // 捕获错误并打印
		return {
			...copyOfFirst,
			...second,
		} // 返回合并后的对象
	}
}

function getExtensionUri(): vscode.Uri {
	return vscode.extensions.getExtension("rooveterinaryinc.roo-cline")!.extensionUri // 获取扩展 URI
}
