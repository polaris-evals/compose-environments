import { useScene } from '../hooks/useScene'

export function AssetPanel() {
  const { assets, selectedAsset, selectAsset, removeAsset, isRandomizeMode } = useScene()

  return (
    <div class="panel">
      <div class="panel-header">Assets</div>
      <div class="panel-content">
        {assets.length === 0 ? (
          <div class="empty-state">
            <p>No assets loaded</p>
            <p style={{ marginTop: '8px', fontSize: '11px' }}>
              Drag & drop a folder or click "Add Asset"
            </p>
          </div>
        ) : (
          <div class="asset-list">
            {assets.map((asset) => {
              const isDisabled = asset.locked || isRandomizeMode
              return (
                <div
                  key={asset.id}
                  class={`asset-item ${selectedAsset?.id === asset.id ? 'selected' : ''} ${isDisabled ? 'locked' : ''}`}
                  onClick={() => !isDisabled && selectAsset(asset)}
                >
                  <span class="asset-item-name">{asset.name}{asset.locked ? ' (locked)' : ''}</span>
                  {!asset.locked && !isRandomizeMode && (
                    <button
                      class="asset-item-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeAsset(asset.id)
                      }}
                    >
                      x
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
