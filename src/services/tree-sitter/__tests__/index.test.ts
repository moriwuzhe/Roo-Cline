import { parseSourceCodeForDefinitionsTopLevel } from "../index"
import { listFiles } from "../../glob/list-files"
import { loadRequiredLanguageParsers } from "../languageParser"
import { fileExistsAtPath } from "../../../utils/fs"
import * as fs from "fs/promises"
import * as path from "path"

// 模拟依赖项
jest.mock("../../glob/list-files")
jest.mock("../languageParser")
jest.mock("../../../utils/fs")
jest.mock("fs/promises")

describe("Tree-sitter Service", () => {
	beforeEach(() => {
		jest.clearAllMocks()
		;(fileExistsAtPath as jest.Mock).mockResolvedValue(true)
	})

	describe("parseSourceCodeForDefinitionsTopLevel", () => {
		it("应处理不存在的目录", async () => {
			;(fileExistsAtPath as jest.Mock).mockResolvedValue(false)

			const result = await parseSourceCodeForDefinitionsTopLevel("/non/existent/path")
			expect(result).toBe("此目录不存在或您无权访问。")
		})

		it("应处理空目录", async () => {
			;(listFiles as jest.Mock).mockResolvedValue([[], new Set()])

			const result = await parseSourceCodeForDefinitionsTopLevel("/test/path")
			expect(result).toBe("未找到源代码定义。")
		})

		it("应正确解析 TypeScript 文件", async () => {
			const mockFiles = ["/test/path/file1.ts", "/test/path/file2.tsx", "/test/path/readme.md"]

			;(listFiles as jest.Mock).mockResolvedValue([mockFiles, new Set()])

			const mockParser = {
				parse: jest.fn().mockReturnValue({
					rootNode: "mockNode",
				}),
			}

			const mockQuery = {
				captures: jest.fn().mockReturnValue([
					{
						node: {
							startPosition: { row: 0 },
							endPosition: { row: 0 },
						},
						name: "name.definition",
					},
				]),
			}

			;(loadRequiredLanguageParsers as jest.Mock).mockResolvedValue({
				ts: { parser: mockParser, query: mockQuery },
				tsx: { parser: mockParser, query: mockQuery },
			})
			;(fs.readFile as jest.Mock).mockResolvedValue("export class TestClass {\n  constructor() {}\n}")

			const result = await parseSourceCodeForDefinitionsTopLevel("/test/path")

			expect(result).toContain("file1.ts")
			expect(result).toContain("file2.tsx")
			expect(result).not.toContain("readme.md")
			expect(result).toContain("export class TestClass")
		})

		it("应处理多种定义类型", async () => {
			const mockFiles = ["/test/path/file.ts"]
			;(listFiles as jest.Mock).mockResolvedValue([mockFiles, new Set()])

			const mockParser = {
				parse: jest.fn().mockReturnValue({
					rootNode: "mockNode",
				}),
			}

			const mockQuery = {
				captures: jest.fn().mockReturnValue([
					{
						node: {
							startPosition: { row: 0 },
							endPosition: { row: 0 },
						},
						name: "name.definition.class",
					},
					{
						node: {
							startPosition: { row: 2 },
							endPosition: { row: 2 },
						},
						name: "name.definition.function",
					},
				]),
			}

			;(loadRequiredLanguageParsers as jest.Mock).mockResolvedValue({
				ts: { parser: mockParser, query: mockQuery },
			})

			const fileContent = "class TestClass {\n" + "  constructor() {}\n" + "  testMethod() {}\n" + "}"

			;(fs.readFile as jest.Mock).mockResolvedValue(fileContent)

			const result = await parseSourceCodeForDefinitionsTopLevel("/test/path")

			expect(result).toContain("class TestClass")
			expect(result).toContain("testMethod()")
			expect(result).toContain("|----")
		})

		it("应优雅地处理解析错误", async () => {
			const mockFiles = ["/test/path/file.ts"]
			;(listFiles as jest.Mock).mockResolvedValue([mockFiles, new Set()])

			const mockParser = {
				parse: jest.fn().mockImplementation(() => {
					throw new Error("解析错误")
				}),
			}

			const mockQuery = {
				captures: jest.fn(),
			}

			;(loadRequiredLanguageParsers as jest.Mock).mockResolvedValue({
				ts: { parser: mockParser, query: mockQuery },
			})
			;(fs.readFile as jest.Mock).mockResolvedValue("无效代码")

			const result = await parseSourceCodeForDefinitionsTopLevel("/test/path")
			expect(result).toBe("未找到源代码定义。")
		})

		it("应尊重文件限制", async () => {
			const mockFiles = Array(100)
				.fill(0)
				.map((_, i) => `/test/path/file${i}.ts`)
			;(listFiles as jest.Mock).mockResolvedValue([mockFiles, new Set()])

			const mockParser = {
				parse: jest.fn().mockReturnValue({
					rootNode: "mockNode",
				}),
			}

			const mockQuery = {
				captures: jest.fn().mockReturnValue([]),
			}

			;(loadRequiredLanguageParsers as jest.Mock).mockResolvedValue({
				ts: { parser: mockParser, query: mockQuery },
			})

			await parseSourceCodeForDefinitionsTopLevel("/test/path")

			// 应仅处理前 50 个文件
			expect(mockParser.parse).toHaveBeenCalledTimes(50)
		})

		it("应处理各种支持的文件扩展名", async () => {
			const mockFiles = [
				"/test/path/script.js",
				"/test/path/app.py",
				"/test/path/main.rs",
				"/test/path/program.cpp",
				"/test/path/code.go",
			]

			;(listFiles as jest.Mock).mockResolvedValue([mockFiles, new Set()])

			const mockParser = {
				parse: jest.fn().mockReturnValue({
					rootNode: "mockNode",
				}),
			}

			const mockQuery = {
				captures: jest.fn().mockReturnValue([
					{
						node: {
							startPosition: { row: 0 },
							endPosition: { row: 0 },
						},
						name: "name",
					},
				]),
			}

			;(loadRequiredLanguageParsers as jest.Mock).mockResolvedValue({
				js: { parser: mockParser, query: mockQuery },
				py: { parser: mockParser, query: mockQuery },
				rs: { parser: mockParser, query: mockQuery },
				cpp: { parser: mockParser, query: mockQuery },
				go: { parser: mockParser, query: mockQuery },
			})
			;(fs.readFile as jest.Mock).mockResolvedValue("function test() {}")

			const result = await parseSourceCodeForDefinitionsTopLevel("/test/path")

			expect(result).toContain("script.js")
			expect(result).toContain("app.py")
			expect(result).toContain("main.rs")
			expect(result).toContain("program.cpp")
			expect(result).toContain("code.go")
		})

		it("应规范化输出中的路径", async () => {
			const mockFiles = ["/test/path/dir\\file.ts"]
			;(listFiles as jest.Mock).mockResolvedValue([mockFiles, new Set()])

			const mockParser = {
				parse: jest.fn().mockReturnValue({
					rootNode: "mockNode",
				}),
			}

			const mockQuery = {
				captures: jest.fn().mockReturnValue([
					{
						node: {
							startPosition: { row: 0 },
							endPosition: { row: 0 },
						},
						name: "name",
					},
				]),
			}

			;(loadRequiredLanguageParsers as jest.Mock).mockResolvedValue({
				ts: { parser: mockParser, query: mockQuery },
			})
			;(fs.readFile as jest.Mock).mockResolvedValue("class Test {}")

			const result = await parseSourceCodeForDefinitionsTopLevel("/test/path")

			// 应使用正斜杠而不是反斜杠
			expect(result).toContain("dir/file.ts")
			expect(result).not.toContain("dir\\file.ts")
		})
	})
})
