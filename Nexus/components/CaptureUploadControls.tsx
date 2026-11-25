import { useEffect, useState } from 'react';
import { CaptureUploadView } from './session/CaptureUploadView';
import { useMediaViewer } from './MediaViewer';
import { captureUploader } from '@/services/captureUpload';
import { getMediaAssetById } from '@/services/mediaCatalog';
import { type LocalCaptureMediaAsset } from '@/types/media';

export function CaptureUploadControls({ id, disabled = false, compact = false }: { id: string; disabled?: boolean; compact?: boolean }) {
  const [asset, setAsset] = useState<LocalCaptureMediaAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const { open, viewer } = useMediaViewer(!disabled);
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = () => {
      const requested = ++revision;
      void getMediaAssetById(id).then((item) => {
        if (active && requested === revision) setAsset(item?.storage === 'local' ? item : null);
      }).catch(() => { if (active) setNotice('No se pudo leer el estado persistente del clip.'); });
    };
    const off = captureUploader.subscribe(refresh);
    void captureUploader.recover().then(refresh).catch(() => { if (active) setNotice('No se pudo revisar una subida interrumpida.'); });
    refresh();
    return () => { active = false; off(); };
  }, [id]);
  const run = (publish: boolean) => {
    setBusy(true); setNotice('');
    void (publish ? captureUploader.publish(id) : captureUploader.upload(id)).then(() => {
      setNotice('Operación finalizada. Comprueba el estado de subida del clip y los ángulos en el Controller.');
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'No se pudo completar la operación.'))
      .finally(() => setBusy(false));
  };
  if (!asset) return null;
  const uploaded = asset.upload.state === 'uploaded';
  return <><CaptureUploadView asset={asset} busy={busy} disabled={disabled} notice={notice} compact={compact}
    onUpload={() => run(uploaded)}
    onOpenRemote={() => {
      const { upload } = asset;
      if (upload.state === 'uploaded') open(asset.resourceType, async () => upload.url, true);
    }} />{viewer}</>;
}
