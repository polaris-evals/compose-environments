import JSZip from 'jszip'
import * as THREE from 'three'
import { AssetLoader, LoadedAsset } from '../scene/AssetLoader'
import { SavedCondition } from '../hooks/useScene'

interface AssetConfig {
  id: string
  name: string
  mainFile: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  disableGravity?: boolean
}

interface SceneConfig {
  version: number
  assets: AssetConfig[]
}

interface InitialConditionsPose {
  [assetName: string]: number[] // [x, y, z, qx, qy, qz, qw]
}

interface InitialConditionsFile {
  instruction?: string
  poses: InitialConditionsPose[]
}

export interface ImportResult {
  success: boolean
  assets: LoadedAsset[]
  savedConditions: SavedCondition[]
  instruction: string
  error?: string
}

export async function importScene(
  zipFile: File,
  assetLoader: AssetLoader
): Promise<ImportResult> {
  console.log('[Import] Starting import of:', zipFile.name)

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(zipFile)
    console.log('[Import] ZIP loaded, files:', Object.keys(zip.files))
  } catch (e) {
    const msg = `Failed to read ZIP file: ${e instanceof Error ? e.message : String(e)}`
    console.error('[Import]', msg)
    return { success: false, assets: [], savedConditions: [], instruction: '', error: msg }
  }

  // Try to read scene.json first (new format)
  const configFile = zip.file('scene.json')
  let assets: LoadedAsset[]

  try {
    if (configFile) {
      console.log('[Import] Found scene.json, using new format')
      assets = await importFromSceneJson(zip, configFile, assetLoader)
    } else {
      // Fall back to discovering assets from folder structure (legacy format)
      console.log('[Import] No scene.json, using folder structure')
      assets = await importFromFolderStructure(zip, assetLoader)
    }
    console.log('[Import] Loaded assets:', assets.map(a => a.name))
  } catch (e) {
    const msg = `Failed to load assets: ${e instanceof Error ? e.message : String(e)}`
    console.error('[Import]', msg)
    return { success: false, assets: [], savedConditions: [], instruction: '', error: msg }
  }

  if (assets.length === 0) {
    const msg = 'No assets found in ZIP. Expected assets/ folder with USD, USDZ, GLTF, or GLB files.'
    console.warn('[Import]', msg)
    return { success: false, assets: [], savedConditions: [], instruction: '', error: msg }
  }

  // Load initial conditions if present
  const { savedConditions, instruction } = await loadInitialConditions(zip, assets)
  console.log('[Import] Import complete:', assets.length, 'assets,', savedConditions.length, 'conditions')

  return { success: true, assets, savedConditions, instruction }
}

async function loadInitialConditions(
  zip: JSZip,
  assets: LoadedAsset[]
): Promise<{ savedConditions: SavedCondition[]; instruction: string }> {
  const initialConditionsFile = zip.file('initial_conditions.json')
  if (!initialConditionsFile) {
    return { savedConditions: [], instruction: '' }
  }

  try {
    const content = await initialConditionsFile.async('text')
    const data: InitialConditionsFile = JSON.parse(content)

    const savedConditions: SavedCondition[] = []

    // Convert each pose to SavedCondition format
    for (const poseData of data.poses) {
      const poses = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>()

      for (const [usdName, values] of Object.entries(poseData)) {
        // Find matching asset by USD-sanitized name
        const asset = assets.find(a => a.name.replace(/[^a-zA-Z0-9_]/g, '_') === usdName)
        if (!asset) continue

        // values: [x, y, z, qx, qy, qz, qw] in USD coordinates (Z-up)
        // Convert back to Three.js (Y-up)
        const usdX = values[0]
        const usdY = values[1]
        const usdZ = values[2]
        const usdQx = values[3]
        const usdQy = values[4]
        const usdQz = values[5]
        const usdQw = values[6]

        // Position: Three_X = USD_X, Three_Y = USD_Z, Three_Z = -USD_Y
        const position = new THREE.Vector3(usdX, usdZ, -usdY)

        // Quaternion: reverse the coordinate conversion
        // USD (w, x, y, z) came from Three.js as (w, x, -z, y)
        // So to reverse: Three.x = USD.x, Three.y = USD.z, Three.z = -USD.y
        const quaternion = new THREE.Quaternion(usdQx, usdQz, -usdQy, usdQw)

        poses.set(asset.id, { position, quaternion })
      }

      if (poses.size > 0) {
        savedConditions.push({ poses })
      }
    }

    return {
      savedConditions,
      instruction: data.instruction || ''
    }
  } catch {
    return { savedConditions: [], instruction: '' }
  }
}

async function importFromSceneJson(
  zip: JSZip,
  configFile: JSZip.JSZipObject,
  assetLoader: AssetLoader
): Promise<LoadedAsset[]> {
  const configText = await configFile.async('text')
  const config: SceneConfig = JSON.parse(configText)

  const loadedAssets: LoadedAsset[] = []

  for (const assetConfig of config.assets) {
    const asset = await loadAssetFromZip(zip, assetConfig.name, assetLoader)
    if (asset) {
      // Apply saved transform
      asset.object.position.set(
        assetConfig.position.x,
        assetConfig.position.y,
        assetConfig.position.z
      )
      asset.object.rotation.set(
        assetConfig.rotation.x,
        assetConfig.rotation.y,
        assetConfig.rotation.z
      )
      asset.object.scale.set(
        assetConfig.scale.x,
        assetConfig.scale.y,
        assetConfig.scale.z
      )
      // Restore physics properties
      asset.disableGravity = assetConfig.disableGravity || false
      loadedAssets.push(asset)
    }
  }

  return loadedAssets
}

interface UsdTransform {
  translate: { x: number; y: number; z: number }
  orient: { w: number; x: number; y: number; z: number } | null
  rotate: { x: number; y: number; z: number } | null  // Legacy rotateXYZ support
  scale: { x: number; y: number; z: number }
  kinematic: boolean
}

async function importFromFolderStructure(
  zip: JSZip,
  assetLoader: AssetLoader
): Promise<LoadedAsset[]> {
  // Try to find a USD scene file at root level (scene.usda, scene.usd, or any .usd/.usda file)
  let usdaFile = zip.file('scene.usda') || zip.file('scene.usd')

  // If not found, look for any USD file at root level
  if (!usdaFile) {
    for (const [path, entry] of Object.entries(zip.files)) {
      if (!path.includes('/') && (path.endsWith('.usd') || path.endsWith('.usda'))) {
        usdaFile = entry
        console.log('[Import] Found USD scene file:', path)
        break
      }
    }
  }

  const transforms = new Map<string, UsdTransform>()

  if (usdaFile) {
    const usdaContent = await usdaFile.async('text')
    // Check if it's binary USD (crate format) - starts with "PXR-USDC"
    if (usdaContent.startsWith('PXR-USDC')) {
      console.warn('[Import] Binary USD (crate) format detected - will try initial_conditions.json for transforms')
    } else {
      parseUsdaTransforms(usdaContent, transforms)
      console.log('[Import] Parsed transforms for:', [...transforms.keys()])
    }
  }

  // If no transforms from USD, try to get first pose from initial_conditions.json
  if (transforms.size === 0) {
    const initialConditionsFile = zip.file('initial_conditions.json')
    if (initialConditionsFile) {
      try {
        const content = await initialConditionsFile.async('text')
        const data: InitialConditionsFile = JSON.parse(content)
        if (data.poses && data.poses.length > 0) {
          const firstPose = data.poses[0]
          for (const [name, values] of Object.entries(firstPose)) {
            // values: [x, y, z, qx, qy, qz, qw] in USD coordinates (Z-up)
            transforms.set(name, {
              translate: { x: values[0], y: values[1], z: values[2] },
              orient: { x: values[3], y: values[4], z: values[5], w: values[6] },
              rotate: null,
              scale: { x: 1, y: 1, z: 1 },
              kinematic: false,
            })
          }
          console.log('[Import] Using first pose from initial_conditions.json for transforms:', [...transforms.keys()])
        }
      } catch (e) {
        console.warn('[Import] Failed to parse initial_conditions.json:', e)
      }
    }
  }

  // Discover asset folders under assets/
  const assetNames = new Set<string>()

  zip.forEach((relativePath) => {
    if (relativePath.startsWith('assets/')) {
      const parts = relativePath.slice('assets/'.length).split('/')
      if (parts[0] && parts[0].length > 0) {
        assetNames.add(parts[0])
      }
    }
  })

  const loadedAssets: LoadedAsset[] = []

  for (const assetName of assetNames) {
    const asset = await loadAssetFromZip(zip, assetName, assetLoader)
    if (asset) {
      // Apply transform from USD if available
      // USD names have special chars replaced with underscores
      const usdName = assetName.replace(/[^a-zA-Z0-9_]/g, '_')
      const transform = transforms.get(usdName)

      if (transform) {
        // Convert from USD (Z-up) back to Three.js (Y-up)
        // USD: X=forward, Y=left, Z=up -> Three.js: X=right, Y=up, Z=forward
        // Mapping: Three_X = USD_X, Three_Y = USD_Z, Three_Z = -USD_Y
        asset.object.position.set(
          transform.translate.x,
          transform.translate.z,
          -transform.translate.y
        )

        // Handle orientation (quaternion) or legacy rotateXYZ
        if (transform.orient) {
          // Convert quaternion from USD (Z-up) to Three.js (Y-up)
          // USD (w, x, y, z) came from Three.js as (w, x, -z, y)
          // So to reverse: Three.x = USD.x, Three.y = USD.z, Three.z = -USD.y
          const threeQuat = new THREE.Quaternion(
            transform.orient.x,
            transform.orient.z,
            -transform.orient.y,
            transform.orient.w
          )
          asset.object.quaternion.copy(threeQuat)
        } else if (transform.rotate) {
          // Legacy rotateXYZ: Convert rotation from degrees to radians
          // Same coordinate swap for rotation
          asset.object.rotation.set(
            transform.rotate.x * (Math.PI / 180),
            transform.rotate.z * (Math.PI / 180),
            -transform.rotate.y * (Math.PI / 180)
          )
        }

        asset.object.scale.set(
          transform.scale.x,
          transform.scale.z,
          transform.scale.y
        )
        asset.disableGravity = transform.kinematic
      }

      loadedAssets.push(asset)
    }
  }

  return loadedAssets
}

function parseUsdaTransforms(content: string, transforms: Map<string, UsdTransform>): void {
  // Split by def Xform to get each block
  const blocks = content.split(/def Xform "/)

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]

    // Extract name (everything before the closing quote)
    const nameEnd = block.indexOf('"')
    if (nameEnd === -1) continue
    const name = block.substring(0, nameEnd)

    // Skip the World xform
    if (name === 'World') continue

    const transform: UsdTransform = {
      translate: { x: 0, y: 0, z: 0 },
      orient: null,
      rotate: null,
      scale: { x: 1, y: 1, z: 1 },
      kinematic: false,
    }

    // Parse translate: double3 xformOp:translate = (x, y, z)
    const translateMatch = block.match(/xformOp:translate\s*=\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/)
    if (translateMatch) {
      transform.translate.x = parseFloat(translateMatch[1])
      transform.translate.y = parseFloat(translateMatch[2])
      transform.translate.z = parseFloat(translateMatch[3])
    }

    // Parse orient: quatd xformOp:orient = (w, x, y, z)
    const orientMatch = block.match(/xformOp:orient\s*=\s*\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/)
    if (orientMatch) {
      transform.orient = {
        w: parseFloat(orientMatch[1]),
        x: parseFloat(orientMatch[2]),
        y: parseFloat(orientMatch[3]),
        z: parseFloat(orientMatch[4]),
      }
    }

    // Parse rotate (legacy): float3 xformOp:rotateXYZ = (x, y, z)
    const rotateMatch = block.match(/xformOp:rotateXYZ\s*=\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/)
    if (rotateMatch) {
      transform.rotate = {
        x: parseFloat(rotateMatch[1]),
        y: parseFloat(rotateMatch[2]),
        z: parseFloat(rotateMatch[3]),
      }
    }

    // Parse scale: float3 xformOp:scale = (x, y, z)
    const scaleMatch = block.match(/xformOp:scale\s*=\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/)
    if (scaleMatch) {
      transform.scale.x = parseFloat(scaleMatch[1])
      transform.scale.y = parseFloat(scaleMatch[2])
      transform.scale.z = parseFloat(scaleMatch[3])
    }

    // Parse kinematic: bool physics:kinematicEnabled = true/false
    const kinematicMatch = block.match(/physics:kinematicEnabled\s*=\s*(true|false)/)
    if (kinematicMatch) {
      transform.kinematic = kinematicMatch[1] === 'true'
    }

    transforms.set(name, transform)
  }
}

async function loadAssetFromZip(
  zip: JSZip,
  assetName: string,
  assetLoader: AssetLoader
): Promise<LoadedAsset | null> {
  console.log('[Import] Loading asset:', assetName)
  const files = new Map<string, File>()
  const assetPath = `assets/${assetName}/`

  // Collect all files for this asset
  const filePromises: Promise<void>[] = []
  zip.forEach((relativePath, zipEntry) => {
    if (relativePath.startsWith(assetPath) && !zipEntry.dir) {
      const filePath = relativePath.slice(assetPath.length)
      const promise = zipEntry.async('blob').then((blob) => {
        const fileName = filePath.split('/').pop() || filePath
        const file = new File([blob], fileName, { type: getMimeType(fileName) })
        // Store with assetName prefix to match the original folder structure
        // This ensures GLTF texture references resolve correctly
        const keyPath = `${assetName}/${filePath}`
        files.set(keyPath, file)
      })
      filePromises.push(promise)
    }
  })

  await Promise.all(filePromises)

  if (files.size === 0) {
    console.warn('[Import] No files found for asset:', assetName)
    return null
  }

  console.log('[Import] Found', files.size, 'files for', assetName, ':', [...files.keys()])
  const asset = await assetLoader.loadFromFiles(files, assetName)
  if (!asset) {
    console.warn('[Import] AssetLoader returned null for:', assetName)
  }
  return asset
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    gltf: 'model/gltf+json',
    glb: 'model/gltf-binary',
    bin: 'application/octet-stream',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    usd: 'model/vnd.usd',
    usda: 'model/vnd.usd',
    usdc: 'model/vnd.usd',
    usdz: 'model/vnd.usdz+zip',
  }
  return mimeTypes[ext || ''] || 'application/octet-stream'
}
