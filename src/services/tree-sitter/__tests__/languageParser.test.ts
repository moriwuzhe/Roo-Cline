import { loadRequiredLanguageParsers } from "../languageParser"
import Parser from "web-tree-sitter"

// 模拟 web-tree-sitter
const mockSetLanguage = jest.fn()
jest.mock("web-tree-sitter", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => ({
			setLanguage: mockSetLanguage,
		})),
	}
})

// 为 Parser 模拟添加静态方法
const ParserMock = Parser as jest.MockedClass<typeof Parser>
ParserMock.init = jest.fn().mockResolvedValue(undefined)
ParserMock.Language = {
	load: jest.fn().mockResolvedValue({
		query: jest.fn().mockReturnValue("mockQuery"),
	}),
	prototype: {}, // 添加所需的 prototype 属性
} as unknown as typeof Parser.Language

describe("Language Parser", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("loadRequiredLanguageParsers", () => {
		it("应只初始化解析器一次", async () => {
			const files = ["test.js", "test2.js"]
			await loadRequiredLanguageParsers(files)
			await loadRequiredLanguageParsers(files)

			expect(ParserMock.init).toHaveBeenCalledTimes(1)
		})

		it("应为 .js 和 .jsx 文件加载 JavaScript 解析器", async () => {
			const files = ["test.js", "test.jsx"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(
				expect.stringContaining("tree-sitter-javascript.wasm"),
			)
			expect(parsers.js).toBeDefined()
			expect(parsers.jsx).toBeDefined()
			expect(parsers.js.query).toBeDefined()
			expect(parsers.jsx.query).toBeDefined()
		})

		it("应为 .ts 和 .tsx 文件加载 TypeScript 解析器", async () => {
			const files = ["test.ts", "test.tsx"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(
				expect.stringContaining("tree-sitter-typescript.wasm"),
			)
			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-tsx.wasm"))
			expect(parsers.ts).toBeDefined()
			expect(parsers.tsx).toBeDefined()
		})

		it("应为 .py 文件加载 Python 解析器", async () => {
			const files = ["test.py"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-python.wasm"))
			expect(parsers.py).toBeDefined()
		})

		it("应根据需要加载多个语言解析器", async () => {
			const files = ["test.js", "test.py", "test.rs", "test.go"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledTimes(4)
			expect(parsers.js).toBeDefined()
			expect(parsers.py).toBeDefined()
			expect(parsers.rs).toBeDefined()
			expect(parsers.go).toBeDefined()
		})

		it("应正确处理 C/C++ 文件", async () => {
			const files = ["test.c", "test.h", "test.cpp", "test.hpp"]
			const parsers = await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-c.wasm"))
			expect(ParserMock.Language.load).toHaveBeenCalledWith(expect.stringContaining("tree-sitter-cpp.wasm"))
			expect(parsers.c).toBeDefined()
			expect(parsers.h).toBeDefined()
			expect(parsers.cpp).toBeDefined()
			expect(parsers.hpp).toBeDefined()
		})

		it("应为不支持的文件扩展名抛出错误", async () => {
			const files = ["test.unsupported"]

			await expect(loadRequiredLanguageParsers(files)).rejects.toThrow("Unsupported language: unsupported")
		})

		it("应为多个文件仅加载每种语言一次", async () => {
			const files = ["test1.js", "test2.js", "test3.js"]
			await loadRequiredLanguageParsers(files)

			expect(ParserMock.Language.load).toHaveBeenCalledTimes(1)
			expect(ParserMock.Language.load).toHaveBeenCalledWith(
				expect.stringContaining("tree-sitter-javascript.wasm"),
			)
		})

		it("应为每个解析器实例设置语言", async () => {
			const files = ["test.js", "test.py"]
			await loadRequiredLanguageParsers(files)

			expect(mockSetLanguage).toHaveBeenCalledTimes(2)
		})
	})
})
