import * as vscode from "vscode" // 导入 vscode 模块
import * as fs from "fs/promises" // 导入 fs/promises 模块
import * as path from "path" // 导入 path 模块
import { Browser, Page, launch } from "puppeteer-core" // 导入 puppeteer-core 模块中的 Browser、Page 和 launch
import * as cheerio from "cheerio" // 导入 cheerio 模块
import TurndownService from "turndown" // 导入 TurndownService 模块
// @ts-ignore
import PCR from "puppeteer-chromium-resolver" // 导入 puppeteer-chromium-resolver 模块
import { fileExistsAtPath } from "../../utils/fs" // 导入 fileExistsAtPath 函数

interface PCRStats {
	puppeteer: { launch: typeof launch } // 定义 puppeteer 的 launch 类型
	executablePath: string // 定义可执行文件路径
}

export class UrlContentFetcher {
	private context: vscode.ExtensionContext // 定义 context 变量
	private browser?: Browser // 定义可选的 browser 变量
	private page?: Page // 定义可选的 page 变量

	constructor(context: vscode.ExtensionContext) {
		this.context = context // 初始化 context
	}

	private async ensureChromiumExists(): Promise<PCRStats> {
		const globalStoragePath = this.context?.globalStorageUri?.fsPath // 获取全局存储路径
		if (!globalStoragePath) {
			throw new Error("Global storage uri is invalid") // 如果全局存储路径无效，抛出错误
		}
		const puppeteerDir = path.join(globalStoragePath, "puppeteer") // 拼接 puppeteer 目录路径
		const dirExists = await fileExistsAtPath(puppeteerDir) // 检查目录是否存在
		if (!dirExists) {
			await fs.mkdir(puppeteerDir, { recursive: true }) // 如果目录不存在，创建目录
		}
		// 如果 Chromium 不存在，这将下载它到 path.join(puppeteerDir, ".chromium-browser-snapshots")
		// 如果存在，它将返回现有 Chromium 的路径
		const stats: PCRStats = await PCR({
			downloadPath: puppeteerDir,
		})
		return stats // 返回 stats
	}

	async launchBrowser(): Promise<void> {
		if (this.browser) {
			return // 如果浏览器已启动，直接返回
		}
		const stats = await this.ensureChromiumExists() // 确保 Chromium 存在
		this.browser = await stats.puppeteer.launch({
			args: [
				"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
			],
			executablePath: stats.executablePath, // 设置可执行文件路径
		})
		// （最新版本的 puppeteer 不会将 headless 添加到用户代理）
		this.page = await this.browser?.newPage() // 创建新页面
	}

	async closeBrowser(): Promise<void> {
		await this.browser?.close() // 关闭浏览器
		this.browser = undefined // 重置浏览器变量
		this.page = undefined // 重置页面变量
	}

	// 必须确保在使用此方法之前调用 launchBrowser，并在使用后调用 closeBrowser
	async urlToMarkdown(url: string): Promise<string> {
		if (!this.browser || !this.page) {
			throw new Error("Browser not initialized") // 如果浏览器未初始化，抛出错误
		}
		/*
		- networkidle2 等同于 playwright 的 networkidle，它等待直到没有超过 2 个网络连接至少 500 毫秒。
		- domcontentloaded 是基本 DOM 加载完成时
		这对于大多数文档网站应该足够了
		*/
		await this.page.goto(url, { timeout: 10_000, waitUntil: ["domcontentloaded", "networkidle2"] }) // 导航到 URL
		const content = await this.page.content() // 获取页面内容

		// 使用 cheerio 解析和清理 HTML
		const $ = cheerio.load(content)
		$("script, style, nav, footer, header").remove() // 移除不需要的标签

		// 将清理后的 HTML 转换为 Markdown
		const turndownService = new TurndownService()
		const markdown = turndownService.turndown($.html()) // 转换为 Markdown

		return markdown // 返回 Markdown 内容
	}
}
