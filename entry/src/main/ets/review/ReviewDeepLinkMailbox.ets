import { ReviewDeepLinkTarget } from './ReviewDeepLink'

export type ReviewDeepLinkListener = (target: ReviewDeepLinkTarget | null) => void

let pendingTarget: ReviewDeepLinkTarget | null = null
let hasPendingTarget: boolean = false
let activeListener: ReviewDeepLinkListener | null = null

export function publishReviewDeepLink(target: ReviewDeepLinkTarget | null): void {
  if (activeListener !== null) {
    activeListener(target)
  } else {
    pendingTarget = target
    hasPendingTarget = true
  }
}

export function subscribeReviewDeepLink(listener: ReviewDeepLinkListener): void {
  activeListener = listener
  if (hasPendingTarget) {
    const target: ReviewDeepLinkTarget | null = pendingTarget
    pendingTarget = null
    hasPendingTarget = false
    listener(target)
  }
}

export function unsubscribeReviewDeepLink(): void {
  activeListener = null
}
