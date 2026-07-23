// ==UserScript==
// @name         Auto Skip YouTube Ads (Improved)
// @namespace    https://github.com/tientq64/userscripts
// @version      8.3.0
// @description  Lets video ads play briefly, then uses YouTube's native skip button.
// @author       tientq64
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @exclude      https://studio.youtube.com/*
// @grant        none
// @license      MIT
// @run-at       document-start
// @noframes
// @homepage     https://github.com/tientq64/userscripts/tree/main/scripts/Auto-Skip-YouTube-Ads
// ==/UserScript==

interface AdState {
	video: HTMLVideoElement
	source: string
	lastVideoTime: number
	playedTimeMs: number
	skipClicked: boolean
}

const DEBUG = false
const MIN_AD_PLAY_TIME_MS = 3000
const FALLBACK_CHECK_INTERVAL_MS = 3000
const adMarkers: string[] = [
	'.ad-showing',
	'.ytp-ad-player-overlay',
	'.ytp-ad-player-overlay-layout',
	'.ytp-ad-timed-pie-countdown-container',
	'.ytp-ad-survey-questions',
	'.ytp-ad-text-overlay'
]
const skipButtonSelectors: string[] = [
	'.ytp-ad-skip-button',
	'.ytp-ad-skip-button-modern',
	'.ytp-skip-ad-button',
	'button.ytp-skip-ad-button',
	'button.ytp-ad-skip-button-slot',
	'.ytp-ad-skip-button-container button',
	'[id^="skip-button"] button'
]

let scheduled = false
let adState: AdState | null = null
let observedPlayer: Element | null = null

function log(message: string, details: Record<string, unknown> = {}): void {
	if (DEBUG) console.debug('[AutoSkipAds]', message, details)
}

function isYouTubeShorts(): boolean {
	return location.pathname.startsWith('/shorts/')
}

function hasVideoAd(): boolean {
	return adMarkers.some(selector => document.querySelector(selector) !== null)
}

function isElementVisible(element: HTMLElement): boolean {
	const style = getComputedStyle(element)
	return (
		element.isConnected &&
		element.getClientRects().length > 0 &&
		style.display !== 'none' &&
		style.visibility !== 'hidden'
	)
}

function clickSkipButton(): boolean {
	const button = document.querySelector<HTMLElement>(skipButtonSelectors.join(','))
	if (
		button === null ||
		!isElementVisible(button) ||
		button.getAttribute('aria-disabled') === 'true' ||
		(button instanceof HTMLButtonElement && button.disabled)
	) {
		return false
	}

	button.click()
	log('Clicked the skip button')
	return true
}

function resetAdState(): void {
	adState = null
}

function playAndSkipAd(): void {
	if (isYouTubeShorts() || !hasVideoAd()) {
		resetAdState()
		return
	}

	const video = document.querySelector<HTMLVideoElement>('video.html5-main-video')
	if (video === null) {
		resetAdState()
		return
	}

	const source = video.currentSrc || video.src
	const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0
	const isNewAd =
		adState === null ||
		adState.video !== video ||
		adState.source !== source ||
		currentTime + 0.25 < adState.lastVideoTime

	if (isNewAd) {
		adState = {
			video,
			source,
			lastVideoTime: currentTime,
			playedTimeMs: 0,
			skipClicked: false
		}
		log('Ad playback detected')
	}

	if (adState === null) return
	const playbackDelta = currentTime - adState.lastVideoTime
	if (playbackDelta > 0) adState.playedTimeMs += playbackDelta * 1000
	adState.lastVideoTime = currentTime

	const playedLongEnough = adState.playedTimeMs >= MIN_AD_PLAY_TIME_MS
	if (playedLongEnough && !adState.skipClicked && clickSkipButton()) {
		adState.skipClicked = true
	}
}

function run(): void {
	scheduled = false
	playAndSkipAd()
}

function scheduleRun(): void {
	if (scheduled) return

	scheduled = true
	requestAnimationFrame(run)
}

function observePlayer(): void {
	const player = document.querySelector('#movie_player')
	if (player === null || player === observedPlayer) return

	observer.disconnect()
	observer.observe(player, {
		attributes: true,
		attributeFilter: ['class', 'hidden', 'aria-disabled'],
		childList: true,
		subtree: true
	})
	observedPlayer = player
	log('Observing the YouTube player')
}

const observer = new MutationObserver(() => {
	observePlayer()
	scheduleRun()
})
observer.observe(document.documentElement, { childList: true, subtree: true })

document.addEventListener(
	'yt-navigate-start',
	() => {
		resetAdState()
		observedPlayer = null
	},
	true
)
document.addEventListener(
	'yt-navigate-finish',
	() => {
		observePlayer()
		scheduleRun()
	},
	true
)
window.setInterval(run, FALLBACK_CHECK_INTERVAL_MS)
observePlayer()
scheduleRun()
