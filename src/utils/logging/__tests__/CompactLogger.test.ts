// 导入测试框架和工具
import { describe, expect, test, beforeEach, afterEach } from "@jest/globals"
import { CompactLogger } from "../CompactLogger"
import { MockTransport } from "./MockTransport"
import { LogLevel } from "../types"

// 定义 CompactLogger 测试套件
describe("CompactLogger", () => {
	let transport: MockTransport // MockTransport 实例
	let logger: CompactLogger // CompactLogger 实例

	// 每个测试前的初始化操作
	beforeEach(() => {
		transport = new MockTransport() // 创建 MockTransport 实例
		logger = new CompactLogger(transport) // 创建 CompactLogger 实例
	})

	// 每个测试后的清理操作
	afterEach(() => {
		transport.clear() // 清理 MockTransport 实例
	})

	// 日志级别相关测试
	describe("Log Levels", () => {
		const levels: LogLevel[] = ["debug", "info", "warn", "error", "fatal"] // 定义日志级别数组

		levels.forEach((level) => {
			test(`${level} level logs correctly`, () => {
				const message = `test ${level} message` // 定义测试消息
				;(logger[level] as (message: string) => void)(message) // 调用相应级别的日志方法

				expect(transport.entries.length).toBe(1) // 期望日志条目数组长度为 1
				expect(transport.entries[0]).toMatchObject({
					l: level,
					m: message,
				}) // 期望日志条目匹配测试消息
				expect(transport.entries[0].t).toBeGreaterThan(0) // 期望日志条目的时间戳大于 0
			})
		})
	})

	// 元数据处理相关测试
	describe("Metadata Handling", () => {
		test("logs with simple metadata", () => {
			const meta = { ctx: "test", userId: "123" } // 定义元数据
			logger.info("test message", meta) // 记录带有元数据的日志

			expect(transport.entries[0]).toMatchObject({
				m: "test message",
				c: "test",
				d: { userId: "123" },
			}) // 期望日志条目匹配元数据
		})

		test("handles undefined metadata", () => {
			logger.info("test message") // 记录没有元数据的日志

			expect(transport.entries[0]).toMatchObject({
				m: "test message",
			}) // 期望日志条目匹配消息
			expect(transport.entries[0].d).toBeUndefined() // 期望元数据未定义
		})

		test("strips empty metadata", () => {
			logger.info("test message", { ctx: "test" }) // 记录带有空元数据的日志

			expect(transport.entries[0]).toMatchObject({
				m: "test message",
				c: "test",
			}) // 期望日志条目匹配元数据
			expect(transport.entries[0].d).toBeUndefined() // 期望元数据未定义
		})
	})

	// 错误处理相关测试
	describe("Error Handling", () => {
		test("handles Error objects in error level", () => {
			const error = new Error("test error") // 创建错误对象
			logger.error(error) // 记录错误日志

			expect(transport.entries[0]).toMatchObject({
				l: "error",
				m: "test error",
				c: "error",
				d: {
					error: {
						name: "Error",
						message: "test error",
						stack: error.stack,
					},
				},
			}) // 期望日志条目匹配错误对象
		})

		test("handles Error objects in fatal level", () => {
			const error = new Error("test fatal") // 创建错误对象
			logger.fatal(error) // 记录致命错误日志

			expect(transport.entries[0]).toMatchObject({
				l: "fatal",
				m: "test fatal",
				c: "fatal",
				d: {
					error: {
						name: "Error",
						message: "test fatal",
						stack: error.stack,
					},
				},
			}) // 期望日志条目匹配错误对象
		})

		test("handles Error objects with custom metadata", () => {
			const error = new Error("test error") // 创建错误对象
			const meta = { ctx: "custom", userId: "123" } // 定义元数据
			logger.error(error, meta) // 记录带有元数据的错误日志

			expect(transport.entries[0]).toMatchObject({
				l: "error",
				m: "test error",
				c: "custom",
				d: {
					userId: "123",
					error: {
						name: "Error",
						message: "test error",
						stack: error.stack,
					},
				},
			}) // 期望日志条目匹配错误对象和元数据
		})
	})

	// 子日志记录器相关测试
	describe("Child Loggers", () => {
		test("creates child logger with inherited metadata", () => {
			const parentMeta = { ctx: "parent", traceId: "123" } // 定义父元数据
			const childMeta = { ctx: "child", userId: "456" } // 定义子元数据

			const parentLogger = new CompactLogger(transport, parentMeta) // 创建父日志记录器
			const childLogger = parentLogger.child(childMeta) // 创建子日志记录器

			childLogger.info("test message") // 记录子日志

			expect(transport.entries[0]).toMatchObject({
				m: "test message",
				c: "child",
				d: {
					traceId: "123",
					userId: "456",
				},
			}) // 期望日志条目匹配子元数据
		})

		test("child logger respects parent context when not overridden", () => {
			const parentLogger = new CompactLogger(transport, { ctx: "parent" }) // 创建父日志记录器
			const childLogger = parentLogger.child({ userId: "123" }) // 创建子日志记录器

			childLogger.info("test message") // 记录子日志

			expect(transport.entries[0]).toMatchObject({
				m: "test message",
				c: "parent",
				d: { userId: "123" },
			}) // 期望日志条目匹配父元数据
		})
	})

	// 生命周期相关测试
	describe("Lifecycle", () => {
		test("closes transport on logger close", () => {
			logger.close() // 关闭日志记录器
			expect(transport.closed).toBe(true) // 期望传输已关闭
		})
	})

	// 时间戳处理相关测试
	describe("Timestamp Handling", () => {
		beforeEach(() => {
			jest.useFakeTimers() // 使用假定时器
		})

		afterEach(() => {
			jest.useRealTimers() // 恢复真实定时器
		})

		test("generates increasing timestamps", () => {
			const now = Date.now()
			jest.setSystemTime(now)

			logger.info("first")
			jest.setSystemTime(now + 10)
			logger.info("second")

			expect(transport.entries[0].t).toBeLessThan(transport.entries[1].t)
		})
	})

	// 消息处理相关测试
	describe("Message Handling", () => {
		test("handles empty string messages", () => {
			logger.info("")
			expect(transport.entries[0]).toMatchObject({
				m: "",
				l: "info",
			})
		})
	})

	// 元数据边界情况相关测试
	describe("Metadata Edge Cases", () => {
		test("handles metadata with undefined values", () => {
			const meta = {
				ctx: "test",
				someField: undefined,
				validField: "value",
			}
			logger.info("test", meta)

			expect(transport.entries[0].d).toMatchObject({
				someField: undefined,
				validField: "value",
			})
		})

		test("handles metadata with null values", () => {
			logger.info("test", { ctx: "test", nullField: null })
			expect(transport.entries[0].d).toMatchObject({ nullField: null })
		})

		test("maintains metadata value types", () => {
			const meta = {
				str: "string",
				num: 123,
				bool: true,
				arr: [1, 2, 3],
				obj: { nested: true },
			}
			logger.info("test", meta)
			expect(transport.entries[0].d).toStrictEqual(meta)
		})
	})

	// 子日志记录器边界情况相关测试
	describe("Child Logger Edge Cases", () => {
		test("deeply nested child loggers maintain correct metadata inheritance", () => {
			const root = new CompactLogger(transport, { ctx: "root", rootVal: 1 })
			const child1 = root.child({ level1: "a" })
			const child2 = child1.child({ level2: "b" })
			const child3 = child2.child({ ctx: "leaf" })

			child3.info("test")

			expect(transport.entries[0]).toMatchObject({
				c: "leaf",
				d: {
					rootVal: 1,
					level1: "a",
					level2: "b",
				},
			})
		})

		test("child logger with empty metadata inherits parent metadata unchanged", () => {
			const parent = new CompactLogger(transport, { ctx: "parent", data: "value" })
			const child = parent.child({})

			child.info("test")

			expect(transport.entries[0]).toMatchObject({
				c: "parent",
				d: { data: "value" },
			})
		})
	})

	// 错误处理边界情况相关测试
	describe("Error Handling Edge Cases", () => {
		test("handles custom error types", () => {
			class CustomError extends Error {
				constructor(
					message: string,
					public code: string,
				) {
					super(message)
					this.name = "CustomError"
				}
			}

			const error = new CustomError("custom error", "ERR_CUSTOM")
			logger.error(error)

			expect(transport.entries[0]).toMatchObject({
				m: "custom error",
				d: {
					error: {
						name: "CustomError",
						message: "custom error",
						stack: error.stack,
					},
				},
			})
		})

		test("handles errors without stack traces", () => {
			const error = new Error("test")
			delete error.stack

			logger.error(error)

			expect(transport.entries[0].d).toMatchObject({
				error: {
					name: "Error",
					message: "test",
					stack: undefined,
				},
			})
		})
	})

	// 时间戳生成相关测试
	describe("Timestamp Generation", () => {
		beforeEach(() => {
			jest.useFakeTimers() // 使用假定时器
		})

		afterEach(() => {
			jest.useRealTimers() // 恢复真实定时器
		})

		test("uses current timestamp for entries", () => {
			const baseTime = 1000000000000
			jest.setSystemTime(baseTime)

			logger.info("test")
			expect(transport.entries[0].t).toBe(baseTime)
		})

		test("timestamps reflect time progression", () => {
			const baseTime = 1000000000000
			jest.setSystemTime(baseTime)

			logger.info("first")
			jest.setSystemTime(baseTime + 100)
			logger.info("second")

			expect(transport.entries).toHaveLength(2)
			expect(transport.entries[0].t).toBe(baseTime)
			expect(transport.entries[1].t).toBe(baseTime + 100)
		})
	})
})
