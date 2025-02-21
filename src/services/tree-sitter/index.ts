import * as fs from "fs/promises" // 导入 fs 模块以使用文件系统的 promise API
import * as path from "path" // 导入 path 模块以处理和转换文件路径
import { listFiles } from "../glob/list-files" // 导入 listFiles 函数以列出目录中的文件
import { LanguageParser, loadRequiredLanguageParsers } from "./languageParser" // 导入 LanguageParser 类型和 loadRequiredLanguageParsers 函数
import { fileExistsAtPath } from "../../utils/fs" // 导入 fileExistsAtPath 函数以检查文件是否存在

// TODO: 实现缓存行为，以避免重复分析项目中的新任务。
export async function parseSourceCodeForDefinitionsTopLevel(dirPath: string): Promise<string> {
	// 检查路径是否存在
	const dirExists = await fileExistsAtPath(path.resolve(dirPath)) // 检查目录路径是否存在
	if (!dirExists) {
		return "此目录不存在或您无权访问。" // 如果目录不存在或无权限访问，返回错误信息
	}

	// 获取顶层的所有文件（不包括被 git 忽略的文件）
	const [allFiles, _] = await listFiles(dirPath, false, 200) // 获取目录下的所有文件，最多 200 个

	let result = "" // 初始化结果字符串

	// 分离需要解析的文件和剩余的文件
	const { filesToParse, remainingFiles } = separateFiles(allFiles) // 分离需要解析的文件和剩余的文件

	const languageParsers = await loadRequiredLanguageParsers(filesToParse) // 加载所需的语言解析器

	// 解析我们有语言解析器的特定文件
	for (const file of filesToParse) {
		const definitions = await parseFile(file, languageParsers) // 解析文件以获取定义
		if (definitions) {
			result += `${path.relative(dirPath, file).toPosix()}\n${definitions}\n` // 将定义添加到结果字符串中
		}
	}

	return result ? result : "未找到源代码定义。" // 返回结果字符串或未找到定义的消息
}

// 分离文件，将需要解析的文件与剩余文件分开
function separateFiles(allFiles: string[]): { filesToParse: string[]; remainingFiles: string[] } {
	const extensions = [
		"js",
		"jsx",
		"ts",
		"tsx",
		"py",
		// Rust
		"rs",
		"go",
		// C
		"c",
		"h",
		// C++
		"cpp",
		"hpp",
		// C#
		"cs",
		// Ruby
		"rb",
		"java",
		"php",
		"swift",
	].map((e) => `.${e}`) // 定义需要解析的文件扩展名
	const filesToParse = allFiles.filter((file) => extensions.includes(path.extname(file))).slice(0, 50) // 过滤出需要解析的文件，最多 50 个
	const remainingFiles = allFiles.filter((file) => !filesToParse.includes(file)) // 获取剩余的文件
	return { filesToParse, remainingFiles } // 返回需要解析的文件和剩余的文件
}

/*
使用 tree-sitter 解析文件

1. 使用适当的语言语法（定义语言组件如何组合以创建有效程序的规则集）将文件内容解析为 AST（抽象语法树）。
2. 使用语言特定的查询字符串创建查询，并对 AST 的根节点运行它以捕获特定的语法元素。
    - 我们使用标签查询来识别程序中的命名实体，然后使用语法捕获来标记实体及其名称。一个显著的例子是 GitHub 的基于搜索的代码导航。
	- 我们的自定义标签查询基于 tree-sitter 的默认标签查询，但进行了修改，仅捕获定义。
3. 按文件中的位置对捕获进行排序，输出定义的名称，并通过添加 "|----\n" 格式化捕获部分之间的间隙。

这种方法使我们能够专注于代码中最相关的部分（由我们的语言特定查询定义），并提供简洁但信息丰富的文件结构和关键元素视图。
*/
async function parseFile(filePath: string, languageParsers: LanguageParser): Promise<string | undefined> {
	const fileContent = await fs.readFile(filePath, "utf8") // 读取文件内容
	const ext = path.extname(filePath).toLowerCase().slice(1) // 获取文件扩展名

	const { parser, query } = languageParsers[ext] || {} // 获取对应语言的解析器和查询
	if (!parser || !query) {
		return `不支持的文件类型: ${filePath}` // 如果不支持该文件类型，返回错误信息
	}

	let formattedOutput = "" // 初始化格式化输出字符串

	try {
		// 将文件内容解析为抽象语法树（AST），AST 是代码的树状表示
		const tree = parser.parse(fileContent)

		// 将查询应用于 AST 并获取捕获
		// 捕获是与我们的查询模式匹配的 AST 的特定部分，每个捕获代表我们感兴趣的 AST 中的一个节点。
		const captures = query.captures(tree.rootNode)

		// 按开始位置对捕获进行排序
		captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row)

		// 将文件内容拆分为单独的行
		const lines = fileContent.split("\n")

		// 跟踪我们处理的最后一行
		let lastLine = -1

		captures.forEach((capture) => {
			const { node, name } = capture
			// 获取当前 AST 节点的开始和结束行
			const startLine = node.startPosition.row
			const endLine = node.endPosition.row

			// 如果捕获之间有间隙，则添加分隔符
			if (lastLine !== -1 && startLine > lastLine + 1) {
				formattedOutput += "|----\n"
			}
			// 仅添加定义的第一行
			if (name.includes("name") && lines[startLine]) {
				formattedOutput += `│${lines[startLine]}\n`
			}

			lastLine = endLine
		})
	} catch (error) {
		console.log(`解析文件时出错: ${error}\n`) // 捕获解析错误并输出错误信息
	}

	if (formattedOutput.length > 0) {
		return `|----\n${formattedOutput}|----\n` // 返回格式化输出
	}
	return undefined // 如果没有捕获到定义，返回 undefined
}
