import JSZip from 'jszip'
import * as THREE from 'three'
import { LoadedAsset } from '../scene/AssetLoader'
import { SavedCondition } from '../hooks/useScene'

export interface ExportResult {
  success: boolean
  error?: string
}

interface InitialConditionsPose {
  [assetName: string]: number[] // [x, y, z, qx, qy, qz, qw]
}

interface InitialConditions {
  instruction: string
  poses: InitialConditionsPose[]
}

export async function exportScene(
  assets: LoadedAsset[],
  savedConditions: SavedCondition[] = [],
  instruction: string = ''
): Promise<ExportResult> {
  // Check if instruction is provided
  if (!instruction.trim()) {
    return {
      success: false,
      error: 'Please enter an instruction before exporting.'
    }
  }

  // Filter out assets marked as excludeFromExport
  const exportableAssets = assets.filter(a => !a.excludeFromExport)

  // Check if at least one asset has gravity disabled
  const hasKinematicAsset = exportableAssets.some(a => a.disableGravity)
  if (!hasKinematicAsset) {
    return {
      success: false,
      error: 'At least one asset must have gravity disabled (kinematic) before exporting.'
    }
  }

  const zip = new JSZip()
  const assetsFolder = zip.folder('assets')

  // Build USD scene file content
  let usdContent = `#usda 1.0
(
    defaultPrim = "World"
    metersPerUnit = 1
    upAxis = "Z"
)

def Xform "World"
{
`

  for (const asset of exportableAssets) {
    // Get transform values (convert Y-up back to Z-up for USD)
    const pos = asset.object.position
    const quat = asset.object.quaternion
    const scl = asset.object.scale

    // Convert quaternion from Three.js (Y-up) to USD (Z-up)
    // The position mapping is: USD = (Three.x, -Three.z, Three.y)
    // For quaternion, we need to swap y↔z and negate the new y component
    // Quaternion (w, x, y, z) in Three.js becomes (w, x, -z, y) in USD
    const usdQuat = new THREE.Quaternion(quat.x, -quat.z, quat.y, quat.w)

    // Sanitize asset name for USD (no spaces, special chars)
    const usdName = asset.name.replace(/[^a-zA-Z0-9_]/g, '_')

    // Find the main file's relative path in the assets folder
    const mainFileName = asset.mainFile.split('/').pop() || asset.mainFile

    // Add reference to the asset in USD
    // Convert from Three.js (Y-up) to USD (Z-up, Y-left):
    // Three.js: X=right, Y=up, Z=forward
    // USD:      X=forward, Y=left, Z=up
    // Mapping: USD_X = Three_X, USD_Y = -Three_Z, USD_Z = Three_Y
    // Note: Assumes referenced USD files already have PhysicsRigidBodyAPI applied
    usdContent += `
    def Xform "${usdName}" (
        prepend references = @./assets/${asset.name}/${mainFileName}@
    )
    {
        double3 xformOp:translate = (${pos.x}, ${-pos.z}, ${pos.y})
        quatd xformOp:orient = (${usdQuat.w}, ${usdQuat.x}, ${usdQuat.y}, ${usdQuat.z})
        float3 xformOp:scale = (${scl.x}, ${scl.z}, ${scl.y})
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient", "xformOp:scale"]
    }
`

    // Add asset files to zip
    if (assetsFolder) {
      const assetSubfolder = assetsFolder.folder(asset.name)
      if (assetSubfolder) {
        for (const [path, file] of asset.files) {
          // Preserve folder structure within asset, remove top-level folder name
          const relativePath = path.includes('/') ? path.split('/').slice(1).join('/') : path
          assetSubfolder.file(relativePath, file)
        }
      }
    }
  }

  usdContent += `}
`

  // Add the main USD scene file
  zip.file('scene.usda', usdContent)

  // Generate scene.json for re-importing into the composer (Three.js coordinates)
  const sceneJson = {
    version: 1,
    assets: exportableAssets.map(asset => ({
      id: asset.id,
      name: asset.name,
      mainFile: asset.mainFile,
      position: {
        x: asset.object.position.x,
        y: asset.object.position.y,
        z: asset.object.position.z,
      },
      rotation: {
        x: asset.object.rotation.x,
        y: asset.object.rotation.y,
        z: asset.object.rotation.z,
      },
      scale: {
        x: asset.object.scale.x,
        y: asset.object.scale.y,
        z: asset.object.scale.z,
      },
      disableGravity: asset.disableGravity || false,
    })),
  }
  zip.file('scene.json', JSON.stringify(sceneJson, null, 2))

  // Generate initial_conditions.json for dynamic (non-kinematic) assets
  const dynamicAssets = exportableAssets.filter(a => !a.disableGravity)
  if (dynamicAssets.length > 0) {
    const poses: InitialConditionsPose[] = []

    // Helper to convert a pose map to InitialConditionsPose
    const convertPoseToExport = (poseMap: Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>, assetList: LoadedAsset[]): InitialConditionsPose => {
      const pose: InitialConditionsPose = {}

      for (const asset of assetList) {
        const saved = poseMap.get(asset.id)
        if (saved) {
          const pos = saved.position
          const quat = saved.quaternion

          // Convert from Three.js (Y-up) to USD (Z-up)
          // Quaternion (w, x, y, z) in Three.js becomes (w, x, -z, y) in USD
          const usdName = asset.name.replace(/[^a-zA-Z0-9_]/g, '_')
          pose[usdName] = [
            pos.x,
            -pos.z,
            pos.y,
            quat.x,
            -quat.z,
            quat.y,
            quat.w,
          ]
        }
      }
      return pose
    }

    // Add all saved conditions
    for (const condition of savedConditions) {
      const pose = convertPoseToExport(condition.poses, dynamicAssets)
      if (Object.keys(pose).length > 0) {
        poses.push(pose)
      }
    }

    // If no saved conditions, use current scene state as the only pose
    if (poses.length === 0) {
      const pose: InitialConditionsPose = {}

      for (const asset of dynamicAssets) {
        const pos = asset.object.position
        const quat = asset.object.quaternion

        // Convert from Three.js (Y-up) to USD (Z-up)
        // Quaternion (w, x, y, z) in Three.js becomes (w, x, -z, y) in USD
        const usdName = asset.name.replace(/[^a-zA-Z0-9_]/g, '_')
        pose[usdName] = [
          pos.x,
          -pos.z,
          pos.y,
          quat.x,
          -quat.z,
          quat.y,
          quat.w,
        ]
      }
      poses.push(pose)
    }

    const initialConditions: InitialConditions = {
      instruction: instruction.trim(),
      poses
    }
    zip.file('initial_conditions.json', JSON.stringify(initialConditions, null, 2))
  }

  // Generate and download
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, 'scene.zip')

  return { success: true }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
