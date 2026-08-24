export class Utf8StreamDecoder {
  private pending: Array<number> = []

  private invalid(): never {
    throw new Error('invalid_utf8_stream')
  }

  private continuation(value: number): boolean {
    return (value & 0xc0) === 0x80
  }

  decode(data: Uint8Array, flush: boolean): string {
    const bytes: Array<number> = this.pending.slice()
    this.pending = []
    for (let index: number = 0; index < data.length; index++) bytes.push(data[index])
    let output: string = ''
    let index: number = 0
    while (index < bytes.length) {
      const first: number = bytes[index]
      if (first <= 0x7f) {
        output += String.fromCharCode(first)
        index += 1
        continue
      }
      let needed: number = 0
      let codePoint: number = 0
      if (first >= 0xc2 && first <= 0xdf) {
        needed = 2
        codePoint = first & 0x1f
      } else if (first >= 0xe0 && first <= 0xef) {
        needed = 3
        codePoint = first & 0x0f
      } else if (first >= 0xf0 && first <= 0xf4) {
        needed = 4
        codePoint = first & 0x07
      } else {
        this.invalid()
      }
      if (index + needed > bytes.length) {
        if (flush) this.invalid()
        this.pending = bytes.slice(index)
        break
      }
      for (let offset: number = 1; offset < needed; offset++) {
        const next: number = bytes[index + offset]
        if (!this.continuation(next)) this.invalid()
        codePoint = (codePoint << 6) | (next & 0x3f)
      }
      if ((needed === 3 && codePoint < 0x800) ||
        (needed === 4 && codePoint < 0x10000) ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff) || codePoint > 0x10ffff) {
        this.invalid()
      }
      if (codePoint <= 0xffff) {
        output += String.fromCharCode(codePoint)
      } else {
        const adjusted: number = codePoint - 0x10000
        output += String.fromCharCode(0xd800 + (adjusted >> 10))
        output += String.fromCharCode(0xdc00 + (adjusted & 0x3ff))
      }
      index += needed
    }
    return output
  }
}
