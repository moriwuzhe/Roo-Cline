/**
 * @fileoverview Implementation of the compact logging system's main logger class
 * 紧凑型日志系统的主要日志记录器类的实现
 */

import { ILogger, LogMeta, CompactLogEntry, LogLevel } from "./types"
import { CompactTransport } from "./CompactTransport"

/**
 * Main logger implementation providing compact, efficient logging capabilities
 * 提供紧凑、高效日志记录功能的主要日志记录器实现
 * @implements {ILogger}
 */
export class CompactLogger implements ILogger {
	private transport: CompactTransport // Transport instance for writing logs
	private parentMeta: LogMeta | undefined // Parent metadata for hierarchical logging

	/**
	 * Creates a new CompactLogger instance
	 * 创建一个新的 CompactLogger 实例
	 * @param transport - Optional custom transport instance
	 *                    可选的自定义传输实例
	 * @param parentMeta - Optional parent metadata for hierarchical logging
	 *                     可选的父级元数据，用于分层日志记录
	 */
	constructor(transport?: CompactTransport, parentMeta?: LogMeta) {
		this.transport = transport ?? new CompactTransport() // Use provided transport or create a new one
		this.parentMeta = parentMeta // Set parent metadata
	}

	/**
	 * Logs a debug level message
	 * 记录调试级别的消息
	 * @param message - The message to log
	 *                  要记录的消息
	 * @param meta - Optional metadata to include
	 *               可选的元数据
	 */
	debug(message: string, meta?: LogMeta): void {
		this.log("debug", message, this.combineMeta(meta)) // Log message with debug level
	}

	/**
	 * Logs an info level message
	 * 记录信息级别的消息
	 * @param message - The message to log
	 *                  要记录的消息
	 * @param meta - Optional metadata to include
	 *               可选的元数据
	 */
	info(message: string, meta?: LogMeta): void {
		this.log("info", message, this.combineMeta(meta)) // Log message with info level
	}

	/**
	 * Logs a warning level message
	 * 记录警告级别的消息
	 * @param message - The message to log
	 *                  要记录的消息
	 * @param meta - Optional metadata to include
	 *               可选的元数据
	 */
	warn(message: string, meta?: LogMeta): void {
		this.log("warn", message, this.combineMeta(meta)) // Log message with warn level
	}

	/**
	 * Logs an error level message
	 * 记录错误级别的消息
	 * @param message - The error message or Error object
	 *                  错误消息或错误对象
	 * @param meta - Optional metadata to include
	 *               可选的元数据
	 */
	error(message: string | Error, meta?: LogMeta): void {
		this.handleErrorLog("error", message, meta) // Handle error log
	}

	/**
	 * Logs a fatal level message
	 * 记录致命级别的消息
	 * @param message - The error message or Error object
	 *                  错误消息或错误对象
	 * @param meta - Optional metadata to include
	 *               可选的元数据
	 */
	fatal(message: string | Error, meta?: LogMeta): void {
		this.handleErrorLog("fatal", message, meta) // Handle fatal log
	}

	/**
	 * Creates a child logger inheriting this logger's metadata
	 * 创建一个继承此日志记录器元数据的子日志记录器
	 * @param meta - Additional metadata for the child logger
	 *               子日志记录器的附加元数据
	 * @returns A new logger instance with combined metadata
	 *          一个具有组合元数据的新日志记录器实例
	 */
	child(meta: LogMeta): ILogger {
		const combinedMeta = this.parentMeta ? { ...this.parentMeta, ...meta } : meta // Combine parent and child metadata
		return new CompactLogger(this.transport, combinedMeta) // Create new logger with combined metadata
	}

	/**
	 * Closes the logger and its transport
	 * 关闭日志记录器及其传输
	 */
	close(): void {
		this.transport.close() // Close the transport
	}

	/**
	 * Handles logging of error and fatal messages with special error object processing
	 * 处理错误和致命消息的日志记录，具有特殊的错误对象处理
	 * @private
	 * @param level - The log level (error or fatal)
	 *                日志级别（错误或致命）
	 * @param message - The message or Error object to log
	 *                  要记录的消息或错误对象
	 * @param meta - Optional metadata to include
	 *               可选的元数据
	 */
	private handleErrorLog(level: "error" | "fatal", message: string | Error, meta?: LogMeta): void {
		if (message instanceof Error) {
			const errorMeta: LogMeta = {
				...meta,
				ctx: meta?.ctx ?? level, // Use provided context or default to level
				error: {
					name: message.name, // Error name
					message: message.message, // Error message
					stack: message.stack, // Error stack trace
				},
			}
			this.log(level, message.message, this.combineMeta(errorMeta)) // Log error with combined metadata
		} else {
			this.log(level, message, this.combineMeta(meta)) // Log message with combined metadata
		}
	}

	/**
	 * Combines parent and current metadata with proper context handling
	 * 结合父级和当前元数据，进行适当的上下文处理
	 * @private
	 * @param meta - The current metadata to combine with parent metadata
	 *               要与父级元数据结合的当前元数据
	 * @returns Combined metadata or undefined if no metadata exists
	 *          组合的元数据，如果没有元数据则返回 undefined
	 */
	private combineMeta(meta?: LogMeta): LogMeta | undefined {
		if (!this.parentMeta) {
			return meta
		}
		if (!meta) {
			return this.parentMeta
		}
		return {
			...this.parentMeta,
			...meta,
			ctx: meta.ctx || this.parentMeta.ctx,
		}
	}

	/**
	 * Core logging function that processes and writes log entries
	 * 核心日志记录功能，处理和写入日志条目
	 * @private
	 * @param level - The log level
	 *                日志级别
	 * @param message - The message to log
	 *                  要记录的消息
	 * @param meta - Optional metadata to include
	 *               可选的元数据
	 */
	private log(level: LogLevel, message: string, meta?: LogMeta): void {
		const entry: CompactLogEntry = {
			t: Date.now(), // Timestamp
			l: level, // Log level
			m: message, // Message
			c: meta?.ctx, // Context
			d: meta ? (({ ctx, ...rest }) => (Object.keys(rest).length > 0 ? rest : undefined))(meta) : undefined, // Additional metadata
		}

		this.transport.write(entry) // Write log entry to transport
	}
}
