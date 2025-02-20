/**
 * @fileoverview Core type definitions for the compact logging system
 * 核心类型定义，用于紧凑型日志系统
 */

/**
 * Represents a compact log entry format optimized for storage and transmission
 * 表示优化存储和传输的紧凑日志条目格式
 */
export interface CompactLogEntry {
	/** Delta timestamp from last entry in milliseconds
	 * 从上一个条目开始的时间戳增量，以毫秒为单位
	 */
	t: number
	/** Log level identifier
	 * 日志级别标识符
	 */
	l: string
	/** Log message content
	 * 日志消息内容
	 */
	m: string
	/** Optional context identifier
	 * 可选的上下文标识符
	 */
	c?: string
	/** Optional structured data payload
	 * 可选的结构化数据负载
	 */
	d?: unknown
}

/** Available log levels in ascending order of severity
 * 按严重程度升序排列的可用日志级别
 */
export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const
/** Type representing valid log levels
 * 表示有效日志级别的类型
 */
export type LogLevel = (typeof LOG_LEVELS)[number]

/**
 * Metadata structure for log entries
 * 日志条目的元数据结构
 */
export interface LogMeta {
	/** Optional context identifier
	 * 可选的上下文标识符
	 */
	ctx?: string
	/** Additional arbitrary metadata fields
	 * 其他任意元数据字段
	 */
	[key: string]: unknown
}

/**
 * Configuration options for CompactTransport
 * CompactTransport 的配置选项
 */
export interface CompactTransportConfig {
	/** Minimum log level to process
	 * 要处理的最低日志级别
	 */
	level?: LogLevel
	/** File output configuration
	 * 文件输出配置
	 */
	fileOutput?: {
		/** Whether file output is enabled
		 * 是否启用文件输出
		 */
		enabled: boolean
		/** Path to the log file
		 * 日志文件的路径
		 */
		path: string
	}
}

/**
 * Interface for log transport implementations
 * 日志传输实现的接口
 */
export interface ICompactTransport {
	/**
	 * Writes a log entry to the transport
	 * 将日志条目写入传输
	 * @param entry - The log entry to write
	 *               要写入的日志条目
	 */
	write(entry: CompactLogEntry): void

	/**
	 * Closes the transport and performs cleanup
	 * 关闭传输并执行清理
	 */
	close(): void
}

/**
 * Interface for logger implementations
 * 日志记录器实现的接口
 */
export interface ILogger {
	/**
	 * Logs a debug message
	 * 记录调试消息
	 * @param message - The message to log
	 *                  要记录的消息
	 * @param meta - Optional metadata
	 *               可选的元数据
	 */
	debug(message: string, meta?: LogMeta): void

	/**
	 * Logs an info message
	 * 记录信息消息
	 * @param message - The message to log
	 *                  要记录的消息
	 * @param meta - Optional metadata
	 *               可选的元数据
	 */
	info(message: string, meta?: LogMeta): void

	/**
	 * Logs a warning message
	 * 记录警告消息
	 * @param message - The message to log
	 *                  要记录的消息
	 * @param meta - Optional metadata
	 *               可选的元数据
	 */
	warn(message: string, meta?: LogMeta): void

	/**
	 * Logs an error message
	 * 记录错误消息
	 * @param message - The message or error to log
	 *                  要记录的消息或错误
	 * @param meta - Optional metadata
	 *               可选的元数据
	 */
	error(message: string | Error, meta?: LogMeta): void

	/**
	 * Logs a fatal error message
	 * 记录致命错误消息
	 * @param message - The message or error to log
	 *                  要记录的消息或错误
	 * @param meta - Optional metadata
	 *               可选的元数据
	 */
	fatal(message: string | Error, meta?: LogMeta): void

	/**
	 * Creates a child logger with inherited metadata
	 * 创建一个具有继承元数据的子日志记录器
	 * @param meta - Metadata to merge with parent's metadata
	 *               要与父级元数据合并的元数据
	 * @returns A new logger instance with combined metadata
	 *          一个具有组合元数据的新日志记录器实例
	 */
	child(meta: LogMeta): ILogger

	/**
	 * Closes the logger and its transport
	 * 关闭日志记录器及其传输
	 */
	close(): void
}
