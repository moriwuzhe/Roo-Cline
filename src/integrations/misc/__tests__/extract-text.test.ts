import { addLineNumbers, everyLineHasLineNumbers, stripLineNumbers, truncateOutput } from "../extract-text" // 导入 extract-text 模块中的函数
import { extractTextFromFile } from '../extract-text'; // 导入 extractTextFromFile 函数
import * as fs from 'fs'; // 导入 fs 模块

// 模拟 fs 模块
jest.mock('fs');

describe("addLineNumbers", () => {
	it("should add line numbers starting from 1 by default", () => {
		const input = "line 1\nline 2\nline 3" // 输入内容
		const expected = "1 | line 1\n2 | line 2\n3 | line 3" // 预期输出
		expect(addLineNumbers(input)).toBe(expected) // 断言函数输出与预期一致
	})

	it("should add line numbers starting from specified line number", () => {
		const input = "line 1\nline 2\nline 3" // 输入内容
		const expected = "10 | line 1\n11 | line 2\n12 | line 3" // 预期输出
		expect(addLineNumbers(input, 10)).toBe(expected) // 断言函数输出与预期一致
	})

	it("should handle empty content", () => {
		expect(addLineNumbers("")).toBe("1 | ") // 断言处理空内容
		expect(addLineNumbers("", 5)).toBe("5 | ") // 断言处理空内容并指定起始行号
	})

	it("should handle single line content", () => {
		expect(addLineNumbers("single line")).toBe("1 | single line") // 断言处理单行内容
		expect(addLineNumbers("single line", 42)).toBe("42 | single line") // 断言处理单行内容并指定起始行号
	})

	it("should pad line numbers based on the highest line number", () => {
		const input = "line 1\nline 2" // 输入内容
		// 当起始行号为 99 时，最高行号将是 100，因此需要 3 个空格填充
		const expected = " 99 | line 1\n100 | line 2" // 预期输出
		expect(addLineNumbers(input, 99)).toBe(expected) // 断言函数输出与预期一致
	})
})

describe("everyLineHasLineNumbers", () => {
	it("should return true for content with line numbers", () => {
		const input = "1 | line one\n2 | line two\n3 | line three" // 输入内容
		expect(everyLineHasLineNumbers(input)).toBe(true) // 断言函数返回 true
	})

	it("should return true for content with padded line numbers", () => {
		const input = "  1 | line one\n  2 | line two\n  3 | line three" // 输入内容
		expect(everyLineHasLineNumbers(input)).toBe(true) // 断言函数返回 true
	})

	it("should return false for content without line numbers", () => {
		const input = "line one\nline two\nline three" // 输入内容
		expect(everyLineHasLineNumbers(input)).toBe(false) // 断言函数返回 false
	})

	it("should return false for mixed content", () => {
		const input = "1 | line one\nline two\n3 | line three" // 输入内容
		expect(everyLineHasLineNumbers(input)).toBe(false) // 断言函数返回 false
	})

	it("should handle empty content", () => {
		expect(everyLineHasLineNumbers("")).toBe(false) // 断言处理空内容
	})

	it("should return false for content with pipe but no line numbers", () => {
		const input = "a | b\nc | d" // 输入内容
		expect(everyLineHasLineNumbers(input)).toBe(false) // 断言函数返回 false
	})
})

describe("stripLineNumbers", () => {
	it("should strip line numbers from content", () => {
		const input = "1 | line one\n2 | line two\n3 | line three" // 输入内容
		const expected = "line one\nline two\nline three" // 预期输出
		expect(stripLineNumbers(input)).toBe(expected) // 断言函数输出与预期一致
	})

	it("should strip padded line numbers", () => {
		const input = "  1 | line one\n  2 | line two\n  3 | line three" // 输入内容
		const expected = "line one\nline two\nline three" // 预期输出
		expect(stripLineNumbers(input)).toBe(expected) // 断言函数输出与预期一致
	})

	it("should handle content without line numbers", () => {
		const input = "line one\nline two\nline three" // 输入内容
		expect(stripLineNumbers(input)).toBe(input) // 断言函数输出与输入一致
	})

	it("should handle empty content", () => {
		expect(stripLineNumbers("")).toBe("") // 断言处理空内容
	})

	it("should preserve content with pipe but no line numbers", () => {
		const input = "a | b\nc | d" // 输入内容
		expect(stripLineNumbers(input)).toBe(input) // 断言函数输出与输入一致
	})

	it("should handle windows-style line endings", () => {
		const input = "1 | line one\r\n2 | line two\r\n3 | line three" // 输入内容
		const expected = "line one\r\nline two\r\nline three" // 预期输出
		expect(stripLineNumbers(input)).toBe(expected) // 断言函数输出与预期一致
	})

	it("should handle content with varying line number widths", () => {
		const input = "  1 | line one\n 10 | line two\n100 | line three" // 输入内容
		const expected = "line one\nline two\nline three" // 预期输出
		expect(stripLineNumbers(input)).toBe(expected) // 断言函数输出与预期一致
	})
})

describe("truncateOutput", () => {
	it("returns original content when no line limit provided", () => {
		const content = "line1\nline2\nline3" // 输入内容
		expect(truncateOutput(content)).toBe(content) // 断言函数输出与输入一致
	})

	it("returns original content when lines are under limit", () => {
		const content = "line1\nline2\nline3" // 输入内容
		expect(truncateOutput(content, 5)).toBe(content) // 断言函数输出与输入一致
	})

	it("truncates content with 20/80 split when over limit", () => {
		// 创建 25 行内容
		const lines = Array.from({ length: 25 }, (_, i) => `line${i + 1}`)
		const content = lines.join("\n") // 输入内容

		// 设置限制为 10 行
		const result = truncateOutput(content, 10) // 调用函数

		// 应保留：
		// - 前 2 行（10 的 20%）
		// - 最后 8 行（10 的 80%）
		// - 中间的省略指示符
		const expectedLines = [
			"line1",
			"line2",
			"",
			"[...15 lines omitted...]",
			"",
			"line18",
			"line19",
			"line20",
			"line21",
			"line22",
			"line23",
			"line24",
			"line25",
		]
		expect(result).toBe(expectedLines.join("\n")) // 断言函数输出与预期一致
	})

	it("handles empty content", () => {
		expect(truncateOutput("", 10)).toBe("") // 断言处理空内容
	})

	it("handles single line content", () => {
		expect(truncateOutput("single line", 10)).toBe("single line") // 断言处理单行内容
	})

	it("handles windows-style line endings", () => {
		// 创建带有 Windows 换行符的内容
		const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`)
		const content = lines.join("\r\n") // 输入内容

		const result = truncateOutput(content, 5) // 调用函数

		// 应保留第一行（5 的 20% = 1）和最后 4 行（5 的 80% = 4）
		// 通过 \r\n 或 \n 分割结果以规范化换行符
		const resultLines = result.split(/\r?\n/)
		const expectedLines = ["line1", "", "[...10 lines omitted...]", "", "line12", "line13", "line14", "line15"]
		expect(resultLines).toEqual(expectedLines) // 断言函数输出与预期一致
	})
})

describe('extractTextFromFile', () => {
    it('should extract text from a file', async () => {
        // 模拟文件内容
        const mockContent = 'Hello, world!';
        (fs.promises.readFile as jest.Mock).mockResolvedValue(mockContent);

        // 调用函数并断言结果
        const result = await extractTextFromFile('path/to/file.txt');
        expect(result).toBe(mockContent);
    });

    it('should throw an error if the file does not exist', async () => {
        // 模拟文件不存在的情况
        (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

        // 调用函数并断言抛出错误
        await expect(extractTextFromFile('path/to/nonexistent.txt')).rejects.toThrow('File not found');
    });
});
