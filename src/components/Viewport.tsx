import { useRef, useEffect, useState } from 'preact/hooks'
import { useScene } from '../hooks/useScene'

interface UploadZoneProps {
  active: boolean
}

function UploadZone({ active }: UploadZoneProps) {
  return (
    <div class={`upload-zone ${active ? 'active' : ''}`}>
      <div class="upload-zone-text">Drop asset folder here</div>
      <div class="upload-zone-hint">USD, USDZ, GLTF, or GLB with textures</div>
    </div>
  )
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { initScene, assetLoader, addAsset } = useScene()
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (containerRef.current) {
      initScene(containerRef.current)
    }
  }, [initScene])

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if we're leaving the viewport entirely
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      const { clientX, clientY } = e
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragging(false)
      }
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (!assetLoader) return

    const items = e.dataTransfer?.items
    if (!items) return

    // Collect all files from dropped items
    const files = new Map<string, File>()
    let folderName = ''

    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          if (entry.isDirectory) {
            folderName = entry.name
            // Include folder name in paths to match webkitRelativePath format from file input
            await traverseDirectory(entry as FileSystemDirectoryEntry, files, folderName)
          } else if (entry.isFile) {
            const file = item.getAsFile()
            if (file) {
              files.set(file.name, file)
              if (!folderName) folderName = file.name.split('.')[0]
            }
          }
        }
      }
    }

    if (files.size > 0) {
      const asset = await assetLoader.loadFromFiles(files, folderName)
      if (asset) {
        addAsset(asset)
      }
    }
  }

  return (
    <div
      ref={containerRef}
      class="viewport"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <UploadZone active={isDragging} />
    </div>
  )
}

async function traverseDirectory(
  entry: FileSystemDirectoryEntry,
  files: Map<string, File>,
  path: string
): Promise<void> {
  const reader = entry.createReader()

  return new Promise((resolve) => {
    const readEntries = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve()
          return
        }

        for (const ent of entries) {
          const entryPath = path ? `${path}/${ent.name}` : ent.name

          if (ent.isFile) {
            const fileEntry = ent as FileSystemFileEntry
            const file = await getFile(fileEntry)
            files.set(entryPath, file)
          } else if (ent.isDirectory) {
            await traverseDirectory(ent as FileSystemDirectoryEntry, files, entryPath)
          }
        }

        // Continue reading if there are more entries
        readEntries()
      })
    }

    readEntries()
  })
}

function getFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}
