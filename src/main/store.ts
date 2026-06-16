import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

type Data = Record<string, string>

/** Minimal JSON-file settings store kept in Electron's userData dir. */
export default class Store {
  private file: string
  private data: Data = {}

  constructor(name = 'settings') {
    this.file = path.join(app.getPath('userData'), `${name}.json`)
    try {
      this.data = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      this.data = {}
    }
  }

  get(key: string): string | undefined {
    return this.data[key]
  }

  set(key: string, value: string): void {
    this.data[key] = value
    try {
      writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    } catch {
      /* best-effort persistence */
    }
  }
}
