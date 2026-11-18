import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Icon } from './Icon';

export interface RecoveryVersion {
 id: string;
 savedAt: string;
 reason: string;
 name: string;
 width: number;
 height: number;
 fps: number;
 scenes: number;
 frames: number;
 bytes: number;
 path?: string;
 missing: boolean;
}

interface RecoveryDetail extends RecoveryVersion {
 svg: string;
}

function formatRelativeTime(dateString: string): string {
 const diffMs = Math.max(0, Date.now() - new Date(dateString).getTime());
 const diffSec = Math.floor(diffMs / 1000);
 if (diffSec < 5) return 'Just now';
 if (diffSec < 60) return `${diffSec}s ago`;
 const diffMin = Math.floor(diffSec / 60);
 if (diffMin < 60) return `${diffMin}m ago`;
 const diffHour = Math.floor(diffMin / 60);
 if (diffHour < 24) return `${diffHour}h ago`;
 const diffDay = Math.floor(diffHour / 24);
 return `${diffDay}d ago`;
}

function formatReason(reason: string): string {
 if (reason === 'autosave') return 'Autosave';
 if (reason === 'replace') return 'Before replace';
 if (reason === 'before replace') return 'Before replace';
 if (reason === 'before open') return 'Before open';
 return reason;
}

export function RecoveryPreview({
 onRestore,
}: {
 onRestore: (id?: string) => Promise<unknown>;
}) {
 const [versions, setVersions] = useState<RecoveryVersion[]>([]);
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const [previewDetail, setPreviewDetail] = useState<RecoveryDetail | null>(null);
 const [previewLoading, setPreviewLoading] = useState(false);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [warning, setWarning] = useState<string | undefined>();
 const [confirmRestore, setConfirmRestore] = useState(false);
 const [confirmDelete, setConfirmDelete] = useState(false);

 const listRef = useRef<HTMLDivElement>(null);

 const loadVersions = useCallback(async () => {
  try {
   const res = await window.pteron.call('recovery.list');
   const list: RecoveryVersion[] = res?.versions ?? [];
   setVersions(list);
   setWarning(res?.warning);
   setSelectedId(prev => {
    if (prev && list.some(v => v.id === prev)) return prev;
    const firstAvailable = list.find(v => !v.missing) ?? list[0];
    return firstAvailable ? firstAvailable.id : null;
   });
  } catch (err) {
   setError((err as Error).message || String(err));
  } finally {
   setLoading(false);
  }
 }, []);

 useEffect(() => {
  void loadVersions();
 }, [loadVersions]);

 const selectedVersion = versions.find(v => v.id === selectedId);
 const isLatest = selectedVersion ? selectedVersion.id === versions[0]?.id : false;

 useEffect(() => {
  if (!selectedId) {
   setPreviewDetail(null);
   return;
  }
  const target = versions.find(v => v.id === selectedId);
  if (!target || target.missing) {
   setPreviewDetail(null);
   return;
  }
  let active = true;
  setPreviewLoading(true);
  window.pteron
   .call('recovery.read', { id: selectedId })
   .then(detail => {
    if (active) {
     setPreviewDetail(detail);
     setPreviewLoading(false);
    }
   })
   .catch(err => {
    if (active) {
     setError((err as Error).message || String(err));
     setPreviewLoading(false);
    }
   });
  return () => {
   active = false;
  };
 }, [selectedId, versions]);

 const handleKeyDown = (e: React.KeyboardEvent) => {
  if (!versions.length) return;
  const currentIndex = versions.findIndex(v => v.id === selectedId);
  if (e.key === 'ArrowDown') {
   e.preventDefault();
   const next = Math.min(versions.length - 1, currentIndex >= 0 ? currentIndex + 1 : 0);
   setSelectedId(versions[next].id);
   setConfirmRestore(false);
   setConfirmDelete(false);
  } else if (e.key === 'ArrowUp') {
   e.preventDefault();
   const prev = Math.max(0, currentIndex >= 0 ? currentIndex - 1 : 0);
   setSelectedId(versions[prev].id);
   setConfirmRestore(false);
   setConfirmDelete(false);
  } else if (e.key === 'Home') {
   e.preventDefault();
   setSelectedId(versions[0].id);
   setConfirmRestore(false);
   setConfirmDelete(false);
  } else if (e.key === 'End') {
   e.preventDefault();
   setSelectedId(versions[versions.length - 1].id);
   setConfirmRestore(false);
   setConfirmDelete(false);
  }
 };

 const handleRestore = async () => {
  if (!selectedVersion) return;
  setBusy(true);
  try {
   await onRestore(selectedVersion.id);
  } finally {
   setBusy(false);
  }
 };

 const handleDelete = async () => {
  if (!selectedVersion || isLatest) return;
  setBusy(true);
  try {
   await window.pteron.call('recovery.delete', { id: selectedVersion.id });
   setConfirmDelete(false);
   await loadVersions();
  } catch (err) {
   setError((err as Error).message || String(err));
  } finally {
   setBusy(false);
  }
 };

 return (
  <div className="recovery-preview recovery-browser" aria-busy={loading || busy}>
   {error && (
    <div role="alert" className="error recovery-error">
     <p>{error}</p>
     <Button
      variant="ghost"
      className="icon-button"
      aria-label="Dismiss error"
      title="Dismiss error"
      onClick={() => setError('')}
     >
      <Icon name="close" />
     </Button>
    </div>
   )}
   {warning && (
    <p role="status" className="recovery-warning">
     {warning}
    </p>
   )}
   {loading ? (
    <span role="status" className="recovery-loading">
     Loading recovery versions…
    </span>
   ) : versions.length === 0 ? (
    <span role="status" className="recovery-empty">
     No recovery versions
    </span>
   ) : (
    <div className="recovery-body">
     <div className="recovery-list-column">
      <div className="recovery-header-row">
       <span className="recovery-section-title">Versions</span>
       <span className="activity-pill">{versions.length}</span>
      </div>
      <div
       ref={listRef}
       className="recovery-version-list"
       role="listbox"
       aria-label="Recovery versions"
       tabIndex={0}
       onKeyDown={handleKeyDown}
      >
       {versions.map(version => {
        const isSelected = version.id === selectedId;
        return (
         <button
          key={version.id}
          role="option"
          aria-selected={isSelected}
          className={`recovery-version-item ${isSelected ? 'active' : ''}`}
          onClick={() => {
           setSelectedId(version.id);
           setConfirmRestore(false);
           setConfirmDelete(false);
          }}
          title={`${version.name} · ${new Date(version.savedAt).toLocaleString()}`}
          aria-label={`${version.name}, ${formatRelativeTime(version.savedAt)}`}
         >
          <div className="recovery-item-header">
           <strong className="recovery-item-name">{version.name}</strong>
           <time dateTime={version.savedAt} title={new Date(version.savedAt).toLocaleString()}>
            {formatRelativeTime(version.savedAt)}
           </time>
          </div>
          <div className="recovery-item-meta">
           <span>
            {version.width} × {version.height} · {version.fps} fps
           </span>
           <span>
            {version.scenes} {version.scenes === 1 ? 'scene' : 'scenes'} ·{' '}
            {(version.frames / version.fps).toFixed(2)}s
           </span>
          </div>
          <div className="recovery-item-tags">
           <span className="recovery-tag">{formatReason(version.reason)}</span>
           {version.missing && <span className="recovery-tag recovery-tag-missing">Missing</span>}
          </div>
         </button>
        );
       })}
      </div>
     </div>

     <div className="recovery-detail-column">
      {selectedVersion && (
       <>
        {previewDetail?.svg ? (
         <div className="recovery-artwork-frame">
          <img
           alt="Recovery artwork"
           src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewDetail.svg)}`}
          />
         </div>
        ) : selectedVersion.missing ? (
         <div className="recovery-artwork-frame">
          <div className="recovery-missing-notice" role="status">
           <Icon name="warning" />
           <span>Package file missing from disk</span>
          </div>
         </div>
        ) : previewLoading ? (
         <div className="recovery-artwork-frame">
          <div className="recovery-loading-notice" role="status">
           Loading artwork…
          </div>
         </div>
        ) : (
         <div className="recovery-empty-artwork" role="status">
          No artwork preview
         </div>
        )}

        <div className="recovery-detail-meta">
         <strong className="recovery-detail-name">{selectedVersion.name}</strong>
         <time
          dateTime={selectedVersion.savedAt}
          title={new Date(selectedVersion.savedAt).toLocaleString()}
         >
          {new Date(selectedVersion.savedAt).toLocaleString()}
         </time>
         <div className="recovery-detail-specs">
          <span>
           {selectedVersion.width} × {selectedVersion.height} · {selectedVersion.fps} fps
          </span>
          <span>
           {selectedVersion.scenes} {selectedVersion.scenes === 1 ? 'scene' : 'scenes'}
          </span>
          <span>{(selectedVersion.frames / selectedVersion.fps).toFixed(2)}s</span>
          <span>{(selectedVersion.bytes / 1024).toFixed(1)} KB</span>
         </div>
        </div>

        <div className="recovery-action-bar">
         {confirmRestore ? (
          <div className="recovery-confirm-inline">
           <span>Restore this version?</span>
           <Button
            variant="default"
            disabled={busy || selectedVersion.missing}
            aria-label="Confirm restore"
            title="Confirm restore"
            onClick={handleRestore}
           >
            <Icon name="check" />
            <span>Confirm</span>
           </Button>
           <Button
            variant="outline"
            disabled={busy}
            aria-label="Cancel restore"
            title="Cancel restore"
            onClick={() => setConfirmRestore(false)}
           >
            <Icon name="close" />
            <span>Cancel</span>
           </Button>
          </div>
         ) : confirmDelete ? (
          <div className="recovery-confirm-inline">
           <span>Delete this version?</span>
           <Button
            variant="default"
            className="destructive-action"
            disabled={busy}
            aria-label="Confirm delete"
            title="Confirm delete"
            onClick={handleDelete}
           >
            <Icon name="trash" />
            <span>Confirm</span>
           </Button>
           <Button
            variant="outline"
            disabled={busy}
            aria-label="Cancel delete"
            title="Cancel delete"
            onClick={() => setConfirmDelete(false)}
           >
            <Icon name="close" />
            <span>Cancel</span>
           </Button>
          </div>
         ) : (
          <div className="recovery-btn-row">
           <Button
            variant="outline"
            disabled={busy || selectedVersion.missing}
            aria-label="Restore recovery package"
            title="Restore recovery package"
            onClick={() => {
             setConfirmRestore(true);
             setConfirmDelete(false);
            }}
           >
            <Icon name="reset" />
            <span>Restore</span>
           </Button>
           <Button
            variant="outline"
            disabled={busy || isLatest}
            aria-label="Delete recovery version"
            title={isLatest ? 'Cannot delete latest snapshot' : 'Delete recovery version'}
            onClick={() => {
             setConfirmDelete(true);
             setConfirmRestore(false);
            }}
           >
            <Icon name="trash" />
            <span>Delete</span>
           </Button>
          </div>
         )}
        </div>
       </>
      )}
     </div>
    </div>
   )}
  </div>
 );
}
