export const DEVICE_FIELDS = {
  brand: 'Marca', manufacturer: 'Fabricante', model: 'Modelo', name: 'Nombre', kind: 'Tipo',
  os: 'Sistema operativo', version: 'Versión', api: 'API de Android', architecture: 'Arquitectura',
  ram: 'RAM total', storage: 'Almacenamiento total', free: 'Almacenamiento disponible', screen: 'Pantalla',
  battery: 'Batería', charging: 'Carga', network: 'Red',
  frontCamera: 'Cámara frontal', backCamera: 'Cámara trasera', flash: 'Linterna / flash', vibration: 'Vibración',
  role: 'Rol actual',
} as const;

export type DeviceInfo = Record<keyof typeof DEVICE_FIELDS, string | null>;

export function isDeviceInfo(value: unknown): value is DeviceInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(DEVICE_FIELDS).length &&
    Object.keys(DEVICE_FIELDS).every((key) => record[key] === null ||
      (typeof record[key] === 'string' && record[key].length <= 256));
}
