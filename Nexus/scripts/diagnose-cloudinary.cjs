// Creates a synthetic 1px PNG in the configured Cloudinary product environment.
// Uses public configuration only; never uploads originals or prints credentials.
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');

async function main() {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const preset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim();
  if (!cloud || !preset) throw new Error('Faltan CLOUD_NAME/UPLOAD_PRESET públicos. Ejecuta node --env-file=.env scripts/diagnose-cloudinary.cjs');
  const requested = `nexus/diagnostic-${randomUUID()}`;
  const file = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=', 'base64');
  console.log(JSON.stringify({ preset, requested, syntheticBytes: file.length }));
  for (let attempt = 1; attempt <= 2; attempt++) {
    const form = new FormData();
    form.append('upload_preset', preset);
    form.append('public_id', requested);
    form.append('file', new Blob([file], { type: 'image/png' }), 'diagnostic.png');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/auto/upload`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(30000),
    });
    const body = await response.json();
    const preserved = typeof body.public_id === 'string' && (body.public_id === requested || body.public_id.endsWith(`/${requested}`));
    const confirmed = response.ok && typeof body.public_id === 'string' && !!body.public_id.trim() &&
      body.resource_type === 'image' && typeof body.bytes === 'number' && body.bytes > 0 &&
      typeof body.secure_url === 'string' && /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(body.secure_url);
    console.log(JSON.stringify({ attempt, status: response.status, publicId: body.public_id,
      resourceType: body.resource_type, bytes: body.bytes, existing: body.existing, identityPreserved: preserved,
      uploadConfirmed: confirmed,
      error: typeof body.error?.message === 'string' ? body.error.message : undefined }));
    if (!confirmed) { process.exitCode = 1; return; }
    // Generated IDs are valid results. Do not create another resource just to test naming.
    if (!preserved) return;
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
