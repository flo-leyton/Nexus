import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { captureUploader } from './captureUpload';
import { getMediaPlaybackUri, markCaptureExported } from './mediaCatalog';

const exportedThisRun = new Set<string>();

export function canExportToGallery() {
  // SDK 54's iOS saveToLibraryAsync decodes JPEG into UIImage. Android copies
  // the original bytes, which is required for this export.
  return Platform.OS === 'android' && Number(Platform.Version) >= 29 &&
    !!requireOptionalNativeModule('ExpoMediaLibrary');
}

export function exportCaptureToGallery(id: string) {
  if (!canExportToGallery()) return Promise.reject(new Error('Guardar en galería requiere una APK compatible.'));
  return captureUploader.withIdleOriginal(id, async (asset) => {
    if (asset.galleryExportedAt || exportedThisRun.has(id)) return 'already-exported' as const;
    const uri = await getMediaPlaybackUri(asset);
    const mediaLibrary = await import('expo-media-library');
    // SDK 54 requires the legacy write permission on API 29–32. On Android
    // 13+, adding our own media needs no request for library access.
    if (Number(Platform.Version) < 33) {
      const permission = await mediaLibrary.requestPermissionsAsync(true, []);
      if (!permission.granted) throw new Error('No se concedió permiso para guardar en la galería.');
    }
    await mediaLibrary.saveToLibraryAsync(uri);
    exportedThisRun.add(id);
    try {
      await markCaptureExported(id);
      return 'exported' as const;
    } catch {
      return 'exported-without-marker' as const;
    }
  });
}
