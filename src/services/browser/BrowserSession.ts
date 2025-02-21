import * as vscode from "vscode" // 导入 vscode 模块
import * as fs from "fs/promises" // 导入 fs/promises 模块
import * as path from "path" // 导入 path 模块
import { Browser, Page, ScreenshotOptions, TimeoutError, launch } from "puppeteer-core" // 导入 puppeteer-core 模块中的 Browser、Page、ScreenshotOptions、TimeoutError 和 launch
// @ts-ignore
import PCR from "puppeteer-chromium-resolver" // 导入 puppeteer-chromium-resolver 模块
import pWaitFor from "p-wait-for" // 导入 p-wait-for 模块
import delay from "delay" // 导入 delay 模块
import { fileExistsAtPath } from "../../utils/fs" // 导入 fileExistsAtPath 函数
import { BrowserActionResult } from "../../shared/ExtensionMessage" // 导入 BrowserActionResult 类型

interface PCRStats {
	puppeteer: { launch: typeof launch } // 定义 puppeteer 的 launch 类型
	executablePath: string // 定义可执行文件路径
}

export class BrowserSession {
	private context: vscode.ExtensionContext // 定义 context 变量
	private browser?: Browser // 定义可选的 browser 变量
	private page?: Page // 定义可选的 page 变量
	private currentMousePosition?: string // 定义可选的 currentMousePosition 变量

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
		console.log("launch browser called") // 打印日志
		if (this.browser) {
			// throw new Error("Browser already launched")
			await this.closeBrowser() // 这可能发生在模型再次启动浏览器后之前已经使用过它
		}

		const stats = await this.ensureChromiumExists() // 确保 Chromium 存在
		this.browser = await stats.puppeteer.launch({
			args: [
				"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
			],
			executablePath: stats.executablePath, // 设置可执行文件路径
			defaultViewport: (() => {
				const size = (this.context.globalState.get("browserViewportSize") as string | undefined) || "900x600" // 获取视口大小
				const [width, height] = size.split("x").map(Number) // 分割宽度和高度
				return { width, height } // 返回视口大小
			})(),
			// headless: false,
		})
		// （最新版本的 puppeteer 不会将 headless 添加到用户代理）
		this.page = await this.browser?.newPage() // 创建新页面
	}

	async closeBrowser(): Promise<BrowserActionResult> {
		if (this.browser || this.page) {
			console.log("closing browser...") // 打印日志
			await this.browser?.close().catch(() => {}) // 关闭浏览器
			this.browser = undefined // 重置浏览器变量
			this.page = undefined // 重置页面变量
			this.currentMousePosition = undefined // 重置鼠标位置变量
		}
		return {} // 返回空对象
	}

	async doAction(action: (page: Page) => Promise<void>): Promise<BrowserActionResult> {
		if (!this.page) {
			throw new Error(
				"Browser is not launched. This may occur if the browser was automatically closed by a non-`browser_action` tool.",
			) // 如果浏览器未启动，抛出错误
		}

		const logs: string[] = [] // 定义日志数组
		let lastLogTs = Date.now() // 获取当前时间戳

		const consoleListener = (msg: any) => {
			if (msg.type() === "log") {
				logs.push(msg.text()) // 如果消息类型为 log，添加到日志数组
			} else {
				logs.push(`[${msg.type()}] ${msg.text()}`) // 否则，添加带有类型的消息到日志数组
			}
			lastLogTs = Date.now() // 更新最后日志时间戳
		}

		const errorListener = (err: Error) => {
			logs.push(`[Page Error] ${err.toString()}`) // 添加页面错误到日志数组
			lastLogTs = Date.now() // 更新最后日志时间戳
		}

		// 添加监听器
		this.page.on("console", consoleListener)
		this.page.on("pageerror", errorListener)

		try {
			await action(this.page) // 执行动作
		} catch (err) {
			if (!(err instanceof TimeoutError)) {
				logs.push(`[Error] ${err.toString()}`) // 如果不是超时错误，添加到日志数组
			}
		}

		// 等待控制台不活动，带有超时
		await pWaitFor(() => Date.now() - lastLogTs >= 500, {
			timeout: 3_000,
			interval: 100,
		}).catch(() => {})

		let options: ScreenshotOptions = {
			encoding: "base64", // 设置截图编码为 base64

			// clip: {
			// 	x: 0,
			// 	y: 0,
			// 	width: 900,
			// 	height: 600,
			// },
		}

		let screenshotBase64 = await this.page.screenshot({
			...options,
			type: "webp", // 设置截图类型为 webp
			quality: ((await this.context.globalState.get("screenshotQuality")) as number | undefined) ?? 75, // 获取截图质量
		})
		let screenshot = `data:image/webp;base64,${screenshotBase64}` // 拼接截图数据 URI

		if (!screenshotBase64) {
			console.log("webp screenshot failed, trying png") // 打印日志
			screenshotBase64 = await this.page.screenshot({
				...options,
				type: "png", // 设置截图类型为 png
			})
			screenshot = `data:image/png;base64,${screenshotBase64}` // 拼接截图数据 URI
		}

		if (!screenshotBase64) {
			throw new Error("Failed to take screenshot.") // 如果截图失败，抛出错误
		}

		// this.page.removeAllListeners() <- causes the page to crash!
		this.page.off("console", consoleListener) // 移除控制台监听器
		this.page.off("pageerror", errorListener) // 移除页面错误监听器

		return {
			screenshot, // 返回截图
			logs: logs.join("\n"), // 返回日志
			currentUrl: this.page.url(), // 返回当前 URL
			currentMousePosition: this.currentMousePosition, // 返回当前鼠标位置
		}
	}

	async navigateToUrl(url: string): Promise<BrowserActionResult> {
		return this.doAction(async (page) => {
			// networkidle2 不够好，因为页面可能需要一些时间加载。我们可以假设本地运行的开发站点将在合理的时间内达到 networkidle0
			await page.goto(url, { timeout: 7_000, waitUntil: ["domcontentloaded", "networkidle2"] }) // 导航到 URL
			// await page.goto(url, { timeout: 10_000, waitUntil: "load" })
			await this.waitTillHTMLStable(page) // 以防页面加载更多资源
		})
	}

	// page.goto { waitUntil: "networkidle0" } 可能永远不会解决，而不等待可能会在 js 加载之前返回页面内容
	// https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded/61304202#61304202
	private async waitTillHTMLStable(page: Page, timeout = 5_000) {
		const checkDurationMsecs = 500 // 1000
		const maxChecks = timeout / checkDurationMsecs // 最大检查次数
		let lastHTMLSize = 0 // 上一次 HTML 大小
		let checkCounts = 1 // 检查计数
		let countStableSizeIterations = 0 // 稳定大小迭代计数
		const minStableSizeIterations = 3 // 最小稳定大小迭代次数

		while (checkCounts++ <= maxChecks) {
			let html = await page.content() // 获取页面内容
			let currentHTMLSize = html.length // 当前 HTML 大小

			// let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length)
			console.log("last: ", lastHTMLSize, " <> curr: ", currentHTMLSize) // 打印日志

			if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
				countStableSizeIterations++ // 如果大小稳定，增加计数
			} else {
				countStableSizeIterations = 0 // 重置计数
			}

			if (countStableSizeIterations >= minStableSizeIterations) {
				console.log("Page rendered fully...") // 打印日志
				break // 如果达到最小稳定大小迭代次数，跳出循环
			}

			lastHTMLSize = currentHTMLSize // 更新上一次 HTML 大小
			await delay(checkDurationMsecs) // 延迟
		}
	}

	async click(coordinate: string): Promise<BrowserActionResult> {
		const [x, y] = coordinate.split(",").map(Number) // 分割坐标
		return this.doAction(async (page) => {
			// 设置网络请求监控
			let hasNetworkActivity = false
			const requestListener = () => {
				hasNetworkActivity = true // 如果有网络活动，设置为 true
			}
			page.on("request", requestListener) // 添加请求监听器

			// 执行点击
			await page.mouse.click(x, y)
			this.currentMousePosition = coordinate // 更新当前鼠标位置

			// 小延迟以检查点击是否触发任何网络活动
			await delay(100)

			if (hasNetworkActivity) {
				// 如果检测到网络活动，等待导航/加载
				await page
					.waitForNavigation({
						waitUntil: ["domcontentloaded", "networkidle2"],
						timeout: 7000,
					})
					.catch(() => {})
				await this.waitTillHTMLStable(page) // 等待 HTML 稳定
			}

			// 清理监听器
			page.off("request", requestListener)
		})
	}

	async type(text: string): Promise<BrowserActionResult> {
		return this.doAction(async (page) => {
			await page.keyboard.type(text) // 输入文本
		})
	}

	async scrollDown(): Promise<BrowserActionResult> {
		const size = ((await this.context.globalState.get("browserViewportSize")) as string | undefined) || "900x600" // 获取视口大小
		const height = parseInt(size.split("x")[1]) // 获取高度
		return this.doAction(async (page) => {
			await page.evaluate((scrollHeight) => {
				window.scrollBy({
					top: scrollHeight,
					behavior: "auto",
				})
			}, height) // 向下滚动
			await delay(300) // 延迟
		})
	}

	async scrollUp(): Promise<BrowserActionResult> {
		const size = ((await this.context.globalState.get("browserViewportSize")) as string | undefined) || "900x600" // 获取视口大小
		const height = parseInt(size.split("x")[1]) // 获取高度
		return this.doAction(async (page) => {
			await page.evaluate((scrollHeight) => {
				window.scrollBy({
					top: -scrollHeight,
					behavior: "auto",
				})
			}, height) // 向上滚动
			await delay(300) // 延迟
		})
	}
}
