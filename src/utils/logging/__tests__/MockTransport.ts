// 导入 CompactTransport 类
import { CompactTransport } from "../CompactTransport"
// 导入类型定义
import type { CompactLogEntry, CompactTransportConfig } from "../types"

// 定义测试配置
const TEST_CONFIG: CompactTransportConfig = {
	level: "fatal", // 日志级别为 fatal
	fileOutput: {
		enabled: false, // 禁用文件输出
		path: "", // 文件路径为空
	},
}

// 定义 MockTransport 类，继承自 CompactTransport
export class MockTransport extends CompactTransport {
	public entries: CompactLogEntry[] = [] // 存储日志条目的数组
	public closed = false // 标记传输是否已关闭

	constructor() {
		super(TEST_CONFIG) // 调用父类构造函数，传入测试配置
	}

	// 重写 write 方法，异步写入日志条目
	override async write(entry: CompactLogEntry): Promise<void> {
		this.entries.push(entry) // 将日志条目添加到 entries 数组中
	}

	// 重写 close 方法，异步关闭传输
	override async close(): Promise<void> {
		this.closed = true // 标记传输已关闭
		await super.close() // 调用父类的 close 方法
	}

	// 清除日志条目和关闭标记
	clear(): void {
		this.entries = [] // 清空 entries 数组
		this.closed = false // 重置 closed 标记
	}
}
