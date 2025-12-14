import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { USDZLoader } from 'three-usdz-loader'

export interface LoadedAsset {
  id: string
  name: string
  object: THREE.Object3D
  files: Map<string, File>
  mainFile: string
  fileType: 'usd' | 'usdz' | 'gltf' | 'glb'
  excludeFromExport?: boolean
  locked?: boolean
  disableGravity?: boolean
}

type FileType = 'usd' | 'usdz' | 'gltf' | 'glb' | null

export class AssetLoader {
  private gltfLoader: GLTFLoader
  private usdzLoader: USDZLoader | null = null

  constructor() {
    this.gltfLoader = new GLTFLoader()

    // Set up Draco decoder for compressed meshes
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
    this.gltfLoader.setDRACOLoader(dracoLoader)
  }

  private getUsdzLoader(): USDZLoader {
    if (!this.usdzLoader) {
      // Pass base path for WASM files location
      const base = import.meta.env.BASE_URL || '/'
      this.usdzLoader = new USDZLoader(base.endsWith('/') ? base.slice(0, -1) : base)
    }
    return this.usdzLoader
  }

  async loadFromFiles(files: Map<string, File>, folderName: string): Promise<LoadedAsset | null> {
    // Find the main 3D file - prioritize USD/USDZ
    let mainFile: string | null = null
    let fileType: FileType = null

    for (const [path] of files) {
      const lower = path.toLowerCase()
      if (lower.endsWith('.usdz')) {
        mainFile = path
        fileType = 'usdz'
        break
      } else if (lower.endsWith('.usd') || lower.endsWith('.usda') || lower.endsWith('.usdc')) {
        mainFile = path
        fileType = 'usd'
        break
      }
    }

    // Fall back to GLTF/GLB if no USD found
    if (!mainFile) {
      for (const [path] of files) {
        const lower = path.toLowerCase()
        if (lower.endsWith('.glb')) {
          mainFile = path
          fileType = 'glb'
          break
        } else if (lower.endsWith('.gltf')) {
          mainFile = path
          fileType = 'gltf'
          break
        }
      }
    }

    if (!mainFile || !fileType) {
      console.warn('No supported 3D file found in folder (USD, USDZ, GLTF, GLB)')
      return null
    }

    const file = files.get(mainFile)!

    try {
      let object: THREE.Object3D

      if (fileType === 'usdz' || fileType === 'usd') {
        object = await this.loadUSDZ(file)
      } else {
        const gltf = await this.loadGLTF(file, files)
        object = gltf.scene
      }

      // Enable shadows on all meshes
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      // Generate unique ID
      const id = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      return {
        id,
        name: folderName || mainFile.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Unnamed',
        object,
        files,
        mainFile,
        fileType,
      }
    } catch (error) {
      console.error(`Failed to load ${fileType.toUpperCase()}:`, error)
      return null
    }
  }

  private async loadUSDZ(file: File, translucent?: boolean): Promise<THREE.Group> {
    const loader = this.getUsdzLoader()
    const innerGroup = new THREE.Group()
    await loader.loadFile(file, innerGroup)

    // Assign a unique random color to this asset
    const color = this.generateRandomColor()
    this.applyColorToMeshes(innerGroup, color, translucent)

    // USD uses Z-up, Three.js uses Y-up
    // Rotate -90 degrees around X to convert Z-up to Y-up
    innerGroup.rotation.x = -Math.PI / 2

    // Wrap in outer group so the rotation correction is baked in
    const group = new THREE.Group()
    group.add(innerGroup)
    return group
  }

  private generateRandomColor(): THREE.Color {
    // Generate a nice saturated color using HSL
    const hue = Math.random()
    const saturation = 0.6 + Math.random() * 0.3 // 0.6-0.9
    const lightness = 0.4 + Math.random() * 0.2  // 0.4-0.6
    return new THREE.Color().setHSL(hue, saturation, lightness)
  }

  private applyColorToMeshes(object: THREE.Object3D, color: THREE.Color, translucent?: boolean): void {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.material = new THREE.MeshStandardMaterial({
          color: translucent ? 0x888888 : color,
          roughness: 0.5,
          metalness: 0.1,
          transparent: translucent,
          opacity: translucent ? 0.3 : 1,
          depthWrite: !translucent,
        })
      }
    })
  }

  async loadFromUrl(url: string, name: string, options?: { excludeFromExport?: boolean; translucent?: boolean; locked?: boolean }): Promise<LoadedAsset | null> {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const fileName = url.split('/').pop() || 'asset.usd'
      const file = new File([blob], fileName)

      const lower = fileName.toLowerCase()
      let fileType: FileType = null
      if (lower.endsWith('.usdz')) fileType = 'usdz'
      else if (lower.endsWith('.usd') || lower.endsWith('.usda') || lower.endsWith('.usdc')) fileType = 'usd'
      else if (lower.endsWith('.glb')) fileType = 'glb'
      else if (lower.endsWith('.gltf')) fileType = 'gltf'

      if (!fileType) {
        console.warn('Unsupported file type:', fileName)
        return null
      }

      let object: THREE.Object3D
      if (fileType === 'usdz' || fileType === 'usd') {
        object = await this.loadUSDZ(file, options?.translucent)
      } else {
        const files = new Map<string, File>([[fileName, file]])
        const gltf = await this.loadGLTF(file, files)
        object = gltf.scene
      }

      // Enable shadows on all meshes (skip for translucent)
      if (!options?.translucent) {
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })
      }

      const id = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      return {
        id,
        name,
        object,
        files: new Map(),
        mainFile: fileName,
        fileType,
        excludeFromExport: options?.excludeFromExport,
        locked: options?.locked,
      }
    } catch (error) {
      console.error('Failed to load asset from URL:', error)
      return null
    }
  }

  private loadGLTF(mainFile: File, allFiles: Map<string, File>): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      // Create blob URLs for all files
      const blobUrls = new Map<string, string>()

      for (const [path, file] of allFiles) {
        blobUrls.set(path, URL.createObjectURL(file))
      }

      // Custom resource loader that resolves relative paths
      const manager = new THREE.LoadingManager()

      manager.setURLModifier((url: string) => {
        // Handle relative paths in GLTF
        if (url.startsWith('blob:') || url.startsWith('data:')) {
          return url
        }

        // Try to find the file in our map
        for (const [path, blobUrl] of blobUrls) {
          const fileName = path.split('/').pop()
          if (url.endsWith(fileName!) || path.endsWith(url)) {
            return blobUrl
          }
        }

        return url
      })

      const loader = new GLTFLoader(manager)
      const dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
      loader.setDRACOLoader(dracoLoader)

      const mainUrl = URL.createObjectURL(mainFile)

      loader.load(
        mainUrl,
        (gltf) => {
          // Clean up blob URLs
          URL.revokeObjectURL(mainUrl)
          for (const url of blobUrls.values()) {
            URL.revokeObjectURL(url)
          }
          resolve(gltf)
        },
        undefined,
        (error) => {
          URL.revokeObjectURL(mainUrl)
          for (const url of blobUrls.values()) {
            URL.revokeObjectURL(url)
          }
          reject(error)
        }
      )
    })
  }
}
