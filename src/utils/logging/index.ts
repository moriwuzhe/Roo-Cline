/**
 * @fileoverview Main entry point for the compact logging system
 * 紧凑型日志系统的主要入口点
 * Provides a default logger instance with Jest environment detection
 * 提供具有 Jest 环境检测的默认日志记录器实例
 */

import { CompactLogger } from "./CompactLogger"

/**
 * No-operation logger implementation for production environments
 * 生产环境的无操作日志记录器实现
 */
const noopLogger = {
	debug: () => {}, // No-op for debug level
	info: () => {}, // No-op for info level
	warn: () => {}, // No-op for warn level
	error: () => {}, // No-op for error level
	fatal: () => {}, // No-op for fatal level
	child: () => noopLogger, // Returns the same no-op logger for child loggers
	close: () => {}, // No-op for close method
}

/**
 * Default logger instance
 * 默认日志记录器实例
 * Uses CompactLogger for normal operation, switches to noop logger in Jest test environment
 * 在正常操作中使用 CompactLogger，在 Jest 测试环境中切换到 noop 日志记录器
 */
export const logger = process.env.JEST_WORKER_ID !== undefined ? new CompactLogger() : noopLogger
