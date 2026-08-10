// ==UserScript==
// @name         Auto Skip YouTube Ads (Improved)
// @namespace    https://github.com/tientq64/userscripts
// @version      8.4.0
// @description  Lets video ads start, then reveals and presses YouTube's native skip button.
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

;(() => {
    const runtimeMarker = 'data-auto-skip-youtube-ads-running'
    const root = document.documentElement
    if (root.hasAttribute(runtimeMarker)) {
        console.debug('[AutoSkipAds]', 'Ignored duplicate Safari injection')
        return
    }
    root.setAttribute(runtimeMarker, '8.4.0')

    const DEBUG = true
    const MIN_AD_PLAY_TIME_MS = 2000
    const SKIP_RETRY_INTERVAL_MS = 250
    const FALLBACK_CHECK_INTERVAL_MS = 250
    const adMarkers = [
        '.ad-showing',
        '.ytp-ad-player-overlay',
        '.ytp-ad-player-overlay-layout',
        '.ytp-ad-timed-pie-countdown-container',
        '.ytp-ad-survey-questions',
        '.ytp-ad-text-overlay'
    ]
    const skipButtonSelectors = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        'button.ytp-skip-ad-button',
        'button.ytp-ad-skip-button-slot',
        '.ytp-ad-skip-button-container button',
        '[id^="skip-button"] button'
    ]

    let scheduled = false
    let adState = null
    let observedPlayer = null

    function log(message, details = {}) {
        if (DEBUG) console.debug('[AutoSkipAds]', message, details)
    }

    function isYouTubeShorts() {
        return location.pathname.startsWith('/shorts/')
    }

    function hasVideoAd() {
        return adMarkers.some((selector) => document.querySelector(selector) !== null)
    }

    function clickSkipButton() {
        const button = document.querySelector(skipButtonSelectors.join(','))
        if (button === null || !button.isConnected) return false

        // YouTube often creates its native skip control before making it visible.
        // After the grace period, expose that existing control and invoke its own
        // click handler. If the player still considers the ad unskippable, the
        // click is harmless and will be retried instead of touching video time.
        button.hidden = false
        button.removeAttribute('hidden')
        button.removeAttribute('aria-disabled')
        if (button instanceof HTMLButtonElement) button.disabled = false
        button.style.setProperty('display', '', 'important')
        button.style.setProperty('visibility', 'visible', 'important')
        button.style.setProperty('opacity', '1', 'important')
        button.style.setProperty('pointer-events', 'auto', 'important')

        button.click()
        log('Pressed the native skip button')
        return true
    }

    function resetAdState() {
        adState = null
    }

    function playAndSkipAd() {
        if (isYouTubeShorts() || !hasVideoAd()) {
            resetAdState()
            return
        }

        const video = document.querySelector('video.html5-main-video')
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
                lastSkipAttemptMs: 0
            }
            log('Ad playback detected')
        }

        if (adState === null) return
        const playbackDelta = currentTime - adState.lastVideoTime
        if (playbackDelta > 0) adState.playedTimeMs += playbackDelta * 1000
        adState.lastVideoTime = currentTime

        const playedLongEnough = adState.playedTimeMs >= MIN_AD_PLAY_TIME_MS
        const now = performance.now()
        if (playedLongEnough && now - adState.lastSkipAttemptMs >= SKIP_RETRY_INTERVAL_MS) {
            adState.lastSkipAttemptMs = now
            clickSkipButton()
        }
    }

    function run() {
        scheduled = false
        playAndSkipAd()
    }

    function scheduleRun() {
        if (scheduled) return

        scheduled = true
        requestAnimationFrame(run)
    }

    function observePlayer() {
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

    document.addEventListener('timeupdate', scheduleRun, true)
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
    log('Started', {
        version: root.getAttribute(runtimeMarker),
        host: location.hostname,
        minAdPlayTimeMs: MIN_AD_PLAY_TIME_MS
    })
    observePlayer()
    scheduleRun()
})()
