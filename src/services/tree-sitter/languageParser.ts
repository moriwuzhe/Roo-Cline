import * as path from "path"
import Parser from "web-tree-sitter"
import {
	javascriptQuery,
	typescriptQuery,
	pythonQuery,
	rustQuery,
	goQuery,
	cppQuery,
	cQuery,
	csharpQuery,
	rubyQuery,
	javaQuery,
	phpQuery,
	swiftQuery,
} from "./queries"

export interface LanguageParser {
	[key: string]: {
		parser: Parser
		query: Parser.Query
	}
}

// 异步加载指定语言的 WASM 文件
async function loadLanguage(langName: string) {
	return await Parser.Language.load(path.join(__dirname, `tree-sitter-${langName}.wasm`))
}

let isParserInitialized = false

// 初始化解析器，只需初始化一次
async function initializeParser() {
	if (!isParserInitialized) {
		await Parser.init()
		isParserInitialized = true
	}
}

/*
使用 tree-sitter 的 node 绑定在 vscode 扩展中存在问题，因为与 electron 不兼容。
使用 .wasm 路径的优势在于不需要为多个架构构建。

我们使用 web-tree-sitter 和 tree-sitter-wasms，它们提供了 tree-sitter 语言解析器的自动更新预构建 WASM 二进制文件。

此函数根据输入文件加载相关语言解析器的 WASM 模块：
1. 提取唯一的文件扩展名
2. 将扩展名映射到语言名称
3. 加载相应的 WASM 文件（包含语法规则）
4. 使用 WASM 模块初始化 tree-sitter 解析器

这种方法通过仅为所有相关文件加载必要的解析器来优化性能。
*/
export async function loadRequiredLanguageParsers(filesToParse: string[]): Promise<LanguageParser> {
	await initializeParser()
	const extensionsToLoad = new Set(filesToParse.map((file) => path.extname(file).toLowerCase().slice(1)))
	const parsers: LanguageParser = {}
	for (const ext of extensionsToLoad) {
		let language: Parser.Language
		let query: Parser.Query
		switch (ext) {
			case "js":
			case "jsx":
				language = await loadLanguage("javascript")
				query = language.query(javascriptQuery)
				break
			case "ts":
				language = await loadLanguage("typescript")
				query = language.query(typescriptQuery)
				break
			case "tsx":
				language = await loadLanguage("tsx")
				query = language.query(typescriptQuery)
				break
			case "py":
				language = await loadLanguage("python")
				query = language.query(pythonQuery)
				break
			case "rs":
				language = await loadLanguage("rust")
				query = language.query(rustQuery)
				break
			case "go":
				language = await loadLanguage("go")
				query = language.query(goQuery)
				break
			case "cpp":
			case "hpp":
				language = await loadLanguage("cpp")
				query = language.query(cppQuery)
				break
			case "c":
			case "h":
				language = await loadLanguage("c")
				query = language.query(cQuery)
				break
			case "cs":
				language = await loadLanguage("c_sharp")
				query = language.query(csharpQuery)
				break
			case "rb":
				language = await loadLanguage("ruby")
				query = language.query(rubyQuery)
				break
			case "java":
				language = await loadLanguage("java")
				query = language.query(javaQuery)
				break
			case "php":
				language = await loadLanguage("php")
				query = language.query(phpQuery)
				break
			case "swift":
				language = await loadLanguage("swift")
				query = language.query(swiftQuery)
				break
			default:
				throw new Error(`Unsupported language: ${ext}`)
		}
		const parser = new Parser()
		parser.setLanguage(language)
		parsers[ext] = { parser, query }
	}
	return parsers
}
