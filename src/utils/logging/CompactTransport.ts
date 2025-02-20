/**
 * @fileoverview Implementation of the compact logging transport system with file output capabilities
 * 具有文件输出功能的紧凑型日志传输系统的实现
 */

import { writeFileSync, mkdirSync } from "fs"
import { dirname } from "path"
import { CompactTransportConfig, ICompactTransport, CompactLogEntry, LogLevel, LOG_LEVELS } from "./types"

/**
 * Default configuration for the transport
 * 传输的默认配置
 */
const DEFAULT_CONFIG: CompactTransportConfig = {
	level: "debug", // Default log level is debug
	fileOutput: {
		enabled: true, // File output is enabled by default
		path: "./logs/app.log", // Default log file path
	},
}

/**
 * Determines if a log entry should be processed based on configured minimum level
 * 根据配置的最低级别确定是否应处理日志条目
 * @param configLevel - The minimum log level from configuration
 *                      配置中的最低日志级别
 * @param entryLevel - The level of the current log entry
 *                     当前日志条目的级别
 * @returns Whether the entry should be processed
 *          是否应处理该条目
 */
function isLevelEnabled(configLevel: LogLevel, entryLevel: string): boolean {
	const configIdx = LOG_LEVELS.indexOf(configLevel) // Get index of config level
	const entryIdx = LOG_LEVELS.indexOf(entryLevel as LogLevel) // Get index of entry level
	return entryIdx >= configIdx // Return true if entry level is greater than or equal to config level
}

/**
 * Implements the compact logging transport with file output support
 * 实现具有文件输出支持的紧凑型日志传输
 * @implements {ICompactTransport}
 */
export class CompactTransport implements ICompactTransport {
	private sessionStart: number // Session start timestamp
	private lastTimestamp: number // Last log entry timestamp
	private filePath?: string // Log file path
	private initialized: boolean = false // Initialization flag

	/**
	 * Creates a new CompactTransport instance
	 * 创建一个新的 CompactTransport 实例
	 * @param config - Optional transport configuration
	 *                 可选的传输配置
	 */
	constructor(readonly config: CompactTransportConfig = DEFAULT_CONFIG) {
		this.sessionStart = Date.now() // Set session start timestamp
		this.lastTimestamp = this.sessionStart // Initialize last timestamp

		if (config.fileOutput?.enabled) {
			this.filePath = config.fileOutput.path // Set file path if file output is enabled
		}
	}

	/**
	 * Ensures the log file is initialized with proper directory structure and session start marker
	 * 确保日志文件已使用适当的目录结构和会话开始标记进行初始化
	 * @private
	 * @throws {Error} If file initialization fails
	 *                 如果文件初始化失败
	 */
	private ensureInitialized(): void {
		if (this.initialized || !this.filePath) return // Return if already initialized or no file path

		try {
			mkdirSync(dirname(this.filePath), { recursive: true }) // Create directories recursively
			writeFileSync(this.filePath, "", { flag: "w" }) // Create or truncate the log file

			const sessionStart = {
				t: 0, // Initial timestamp
				l: "info", // Log level
				m: "Log session started", // Log message
				d: { timestamp: new Date(this.sessionStart).toISOString() }, // Additional data
			}
			writeFileSync(this.filePath, JSON.stringify(sessionStart) + "\n", { flag: "w" }) // Write session start marker

			this.initialized = true // Set initialized flag
		} catch (err) {
			throw new Error(`Failed to initialize log file: ${(err as Error).message}`) // Throw error if initialization fails
		}
	}

	/**
	 * Writes a log entry to configured outputs (console and/or file)
	 * 将日志条目写入配置的输出（控制台和/或文件）
	 * @param entry - The log entry to write
	 *                要写入的日志条目
	 */
	write(entry: CompactLogEntry): void {
		const deltaT = entry.t - this.lastTimestamp // Calculate delta timestamp
		this.lastTimestamp = entry.t // Update last timestamp

		const compact = {
			...entry,
			t: deltaT, // Use delta timestamp
		}

		const output = JSON.stringify(compact) + "\n" // Convert entry to JSON string

		// Write to console if level is enabled
		if (this.config.level && isLevelEnabled(this.config.level, entry.l)) {
			process.stdout.write(output) // Write to console
		}

		// Write to file if enabled
		if (this.filePath) {
			this.ensureInitialized() // Ensure file is initialized
			writeFileSync(this.filePath, output, { flag: "a" }) // Append entry to file
		}
	}

	/**
	 * Closes the transport and writes session end marker
	 * 关闭传输并写入会话结束标记
	 */
	close(): void {
		if (this.filePath && this.initialized) {
			const sessionEnd = {
				t: Date.now() - this.lastTimestamp, // Calculate delta timestamp
				l: "info", // Log level
				m: "Log session ended", // Log message
				d: { timestamp: new Date().toISOString() }, // Additional data
			}
			writeFileSync(this.filePath, JSON.stringify(sessionEnd) + "\n", { flag: "a" }) // Append session end marker to file
		}
	}
}
