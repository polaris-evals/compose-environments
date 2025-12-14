/// <reference types="vite/client" />

declare module 'three-usdz-loader' {
  import { Group } from 'three'

  export interface USDZInstance {
    getGroup(): Group
    update(seconds: number): void
    clear(): void
  }

  export class USDZLoader {
    constructor(dependenciesDirectory?: string)
    loadFile(file: File, targetGroup: Group): Promise<USDZInstance>
  }
}

declare namespace preact.JSX {
  interface HTMLAttributes<RefType extends EventTarget = EventTarget> {
    webkitdirectory?: string
  }
}

interface FileSystemEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
}

interface FileSystemFileEntry extends FileSystemEntry {
  file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader(): FileSystemDirectoryReader
}

interface FileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: Error) => void
  ): void
}

interface DataTransferItem {
  webkitGetAsEntry?(): FileSystemEntry | null
}
