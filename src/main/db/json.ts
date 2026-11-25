/** JSON columns hold values this app wrote itself, so parsing only needs to restore the type. */
export function fromJson<T>(text: string): T {
  return JSON.parse(text) as T
}

export function toJson(value: unknown): string {
  return JSON.stringify(value)
}
