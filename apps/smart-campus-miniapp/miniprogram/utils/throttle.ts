// 节流和防抖工具函数
export function throttle<T extends (...args: any[]) => any>(fn: T, delay: number = 300): (...args: Parameters<T>) => void {
  let lastTime = 0
  return function (this: any, ...args: Parameters<T>): void {
    const now = Date.now()
    if (now - lastTime >= delay) {
      fn.apply(this, args)
      lastTime = now
    }
  }
}

export function throttleAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => Promise<ReturnType<T>> | undefined {
  let lastTime = 0
  let pending: Promise<ReturnType<T>> | null = null
  return function (this: any, ...args: Parameters<T>): Promise<ReturnType<T>> | undefined {
    const now = Date.now()
    if (now - lastTime >= delay && !pending) {
      lastTime = now
      pending = fn.apply(this, args)
      pending.finally(() => {
        pending = null
      })
      return pending
    }
    return undefined
  }
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number = 300): (...args: Parameters<T>) => void {
  let timer: number | null = null
  return function (this: any, ...args: Parameters<T>): void {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      fn.apply(this, args)
      timer = null
    }, delay)
  }
}

export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timer: number | null = null
  return function (this: any, ...args: Parameters<T>): Promise<ReturnType<T>> {
    return new Promise((resolve, reject) => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(async () => {
        try {
          const result = await fn.apply(this, args)
          resolve(result)
        } catch (err) {
          reject(err)
        } finally {
          timer = null
        }
      }, delay)
    })
  }
}

export function once<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T> {
  let called = false
  let result: ReturnType<T>
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    if (!called) {
      called = true
      result = fn.apply(this, args)
    }
    return result
  }
}

export function rateLimit<T extends (...args: any[]) => any>(
  fn: T,
  interval: number = 1000
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let lastTime = 0
  return function (this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
    const now = Date.now()
    if (now - lastTime >= interval) {
      lastTime = now
      return fn.apply(this, args)
    }
    return undefined
  }
}

export class CooldownExecutor<T extends (...args: any[]) => any> {
  private fn: T
  private cooldownMs: number
  private lastExecuteTime: number
  private lastResult: ReturnType<T> | undefined

  constructor(fn: T, cooldownMs: number = 30000) {
    this.fn = fn
    this.cooldownMs = cooldownMs
    this.lastExecuteTime = 0
  }

  execute(...args: Parameters<T>): ReturnType<T> | undefined {
    const now = Date.now()
    if (now - this.lastExecuteTime >= this.cooldownMs) {
      this.lastExecuteTime = now
      this.lastResult = this.fn.apply(this, args)
    }
    return this.lastResult
  }

  reset(): void {
    this.lastExecuteTime = 0
    this.lastResult = undefined
  }

  isInCooldown(): boolean {
    return Date.now() - this.lastExecuteTime < this.cooldownMs
  }

  getRemainingCooldown(): number {
    const remaining = this.cooldownMs - (Date.now() - this.lastExecuteTime)
    return Math.max(0, remaining)
  }
}

