import * as vscode from "vscode" // 导入 VSCode API
import * as path from "path" // 导入路径模块

/**
 * 防止连续播放的最小间隔（以毫秒为单位）
 */
const MIN_PLAY_INTERVAL = 500

/**
 * 上次播放声音的时间戳
 */
let lastPlayedTime = 0

/**
 * 判断文件是否为 WAV 文件
 * @param filepath string 文件路径
 * @returns boolean 是否为 WAV 文件
 */
export const isWAV = (filepath: string): boolean => {
	return path.extname(filepath).toLowerCase() === ".wav" // 检查文件扩展名是否为 .wav
}

let isSoundEnabled = false // 声音是否启用的标志
let volume = 0.5 // 声音音量

/**
 * 设置声音配置
 * @param enabled boolean 是否启用声音
 */
export const setSoundEnabled = (enabled: boolean): void => {
	isSoundEnabled = enabled // 设置声音启用标志
}

/**
 * 设置声音音量
 * @param volume number 新的音量值
 */
export const setSoundVolume = (newVolume: number): void => {
	volume = newVolume // 设置新的音量值
}

/**
 * 播放声音文件
 * @param filepath string 文件路径
 * @return void
 */
export const playSound = (filepath: string): void => {
	try {
		if (!isSoundEnabled) {
			return // 如果声音未启用，则返回
		}

		if (!filepath) {
			return // 如果文件路径为空，则返回
		}

		if (!isWAV(filepath)) {
			throw new Error("Only wav files are supported.") // 如果不是 WAV 文件，则抛出错误
		}

		const currentTime = Date.now() // 获取当前时间
		if (currentTime - lastPlayedTime < MIN_PLAY_INTERVAL) {
			return // 如果在最小间隔内，则跳过播放以防止连续播放
		}

		const sound = require("sound-play") // 导入 sound-play 模块
		sound.play(filepath, volume).catch(() => {
			throw new Error("Failed to play sound effect") // 如果播放失败，则抛出错误
		})

		lastPlayedTime = currentTime // 更新上次播放时间
	} catch (error: any) {
		vscode.window.showErrorMessage(error.message) // 显示错误消息
	}
}
