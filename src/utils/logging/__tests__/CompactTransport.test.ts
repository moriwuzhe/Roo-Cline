// 导入测试框架和工具
import { describe, expect, test, beforeEach, afterEach } from "@jest/globals"
import { CompactTransport } from "../CompactTransport"
import fs from "fs"
import path from "path"

// 定义 CompactTransport 测试套件
describe("CompactTransport", () => {
	const testDir = "./test-logs" // 测试日志目录
	const testLogPath = path.join(testDir, "test.log") // 测试日志文件路径
	let transport: CompactTransport // CompactTransport 实例
	const originalWrite = process.stdout.write // 保存原始的 stdout.write 方法

	// 清理测试日志文件和目录
	const cleanupTestLogs = () => {
		const rmDirRecursive = (dirPath: string) => {
			if (fs.existsSync(dirPath)) {
				fs.readdirSync(dirPath).forEach((file) => {
					const curPath = path.join(dirPath, file)
					if (fs.lstatSync(curPath).isDirectory()) {
						// 递归删除目录
						rmDirRecursive(curPath)
					} else {
						// 删除文件
						fs.unlinkSync(curPath)
					}
				})
				// 删除空目录
				fs.rmdirSync(dirPath)
			}
		}

		try {
			rmDirRecursive(testDir)
		} catch (err) {
			console.error("Cleanup error:", err)
		}
	}

	// 每个测试前的初始化操作
	beforeEach(() => {
		process.stdout.write = () => true // 重写 stdout.write 方法
		cleanupTestLogs() // 清理测试日志
		fs.mkdirSync(testDir, { recursive: true }) // 创建测试日志目录

		transport = new CompactTransport({
			level: "fatal", // 日志级别为 fatal
			fileOutput: {
				enabled: true, // 启用文件输出
				path: testLogPath, // 设置日志文件路径
			},
		})
	})

	// 每个测试后的清理操作
	afterEach(() => {
		process.stdout.write = originalWrite // 恢复原始的 stdout.write 方法
		transport.close() // 关闭传输
		cleanupTestLogs() // 清理测试日志
	})

	// 文件处理相关测试
	describe("File Handling", () => {
		test("creates new log file on initialization", () => {
			const entry = {
				t: Date.now(), // 当前时间戳
				l: "info", // 日志级别为 info
				m: "test message", // 日志消息
			}

			transport.write(entry) // 写入日志条目

			const fileContent = fs.readFileSync(testLogPath, "utf-8") // 读取日志文件内容
			const lines = fileContent.trim().split("\n") // 按行分割日志内容

			expect(lines.length).toBe(2) // 期望日志文件有两行
			expect(JSON.parse(lines[0])).toMatchObject({
				l: "info",
				m: "Log session started",
			}) // 期望第一行是会话开始日志
			expect(JSON.parse(lines[1])).toMatchObject({
				l: "info",
				m: "test message",
			}) // 期望第二行是测试消息日志
		})

		test("appends entries after initialization", () => {
			transport.write({
				t: Date.now(),
				l: "info",
				m: "first",
			}) // 写入第一条日志

			transport.write({
				t: Date.now(),
				l: "info",
				m: "second",
			}) // 写入第二条日志

			const fileContent = fs.readFileSync(testLogPath, "utf-8") // 读取日志文件内容
			const lines = fileContent.trim().split("\n") // 按行分割日志内容

			expect(lines.length).toBe(3) // 期望日志文件有三行
			expect(JSON.parse(lines[1])).toMatchObject({ m: "first" }) // 期望第二行是第一条日志
			expect(JSON.parse(lines[2])).toMatchObject({ m: "second" }) // 期望第三行是第二条日志
		})

		test("writes session end marker on close", () => {
			transport.write({
				t: Date.now(),
				l: "info",
				m: "test",
			}) // 写入测试日志

			transport.close() // 关闭传输

			const fileContent = fs.readFileSync(testLogPath, "utf-8") // 读取日志文件内容
			const lines = fileContent.trim().split("\n") // 按行分割日志内容
			const lastLine = JSON.parse(lines[lines.length - 1]) // 获取最后一行

			expect(lastLine).toMatchObject({
				l: "info",
				m: "Log session ended",
			}) // 期望最后一行是会话结束日志
		})
	})

	// 文件系统边界情况测试
	describe("File System Edge Cases", () => {
		test("handles file path with deep directories", () => {
			const deepDir = path.join(testDir, "deep/nested/path") // 深层目录路径
			const deepPath = path.join(deepDir, "test.log") // 深层日志文件路径
			const deepTransport = new CompactTransport({
				fileOutput: { enabled: true, path: deepPath },
			}) // 创建深层目录的传输实例

			try {
				deepTransport.write({
					t: Date.now(),
					l: "info",
					m: "test",
				}) // 写入测试日志

				expect(fs.existsSync(deepPath)).toBeTruthy() // 期望日志文件存在
			} finally {
				deepTransport.close() // 关闭传输
				// 清理深层目录结构
				const rmDirRecursive = (dirPath: string) => {
					if (fs.existsSync(dirPath)) {
						fs.readdirSync(dirPath).forEach((file) => {
							const curPath = path.join(dirPath, file)
							if (fs.lstatSync(curPath).isDirectory()) {
								rmDirRecursive(curPath)
							} else {
								fs.unlinkSync(curPath)
							}
						})
						fs.rmdirSync(dirPath)
					}
				}
				rmDirRecursive(path.join(testDir, "deep"))
			}
		})

		test("handles concurrent writes", async () => {
			const entries = Array(100)
				.fill(null)
				.map((_, i) => ({
					t: Date.now(),
					l: "info",
					m: `test ${i}`,
				})) // 创建 100 条测试日志条目

			await Promise.all(entries.map((entry) => Promise.resolve(transport.write(entry)))) // 并发写入日志条目

			const fileContent = fs.readFileSync(testLogPath, "utf-8") // 读取日志文件内容
			const lines = fileContent.trim().split("\n") // 按行分割日志内容
			// +1 表示会话开始行
			expect(lines.length).toBe(entries.length + 1) // 期望日志文件行数为条目数加一
		})
	})

	// 时间戳转换测试
	describe("Delta Timestamp Conversion", () => {
		let output: string[] = [] // 存储输出的数组

		beforeEach(() => {
			output = [] // 初始化输出数组
			jest.useFakeTimers() // 使用假定时器
			const baseTime = 1000000000000 // 基准时间
			jest.setSystemTime(baseTime) // 设置系统时间为基准时间

			process.stdout.write = (str: string): boolean => {
				output.push(str) // 将输出添加到数组中
				return true
			}
		})

		afterEach(() => {
			jest.useRealTimers() // 恢复真实定时器
		})

		test("converts absolute timestamps to deltas", () => {
			const baseTime = Date.now() // 使用当前假定时间
			const transport = new CompactTransport({
				level: "info",
				fileOutput: { enabled: false, path: "null" },
			}) // 创建传输实例

			transport.write({
				t: baseTime,
				l: "info",
				m: "first",
			}) // 写入第一条日志

			transport.write({
				t: baseTime + 100,
				l: "info",
				m: "second",
			}) // 写入第二条日志

			const entries = output.map((str) => JSON.parse(str)) // 解析输出为日志条目
			expect(entries[0].t).toBe(0) // 期望第一条日志的时间戳为 0
			expect(entries[1].t).toBe(100) // 期望第二条日志的时间戳为 100
		})
	})
})
